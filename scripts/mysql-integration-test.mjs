// 本地 MySQL 集成验证；只创建合成账号，结束后按记录的 ID 清理。
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startLocalTestApp } from "./lib/local-test-app.mjs";

const { base, pool, stop } = await startLocalTestApp();
const createdEmails = [];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
let passed = 0;

function check(name, condition) {
  assert(condition, name);
  passed++;
  console.log(`✓ ${name}`);
}

async function api(user, path, method = "GET", body) {
  const response = await fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", Origin: base, Cookie: user?.cookie ?? "" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { /* 页面响应保留 HTML。 */ }
  return { response, status: response.status, json, text };
}

async function uploadPhoto(user) {
  const form = new FormData();
  form.append("date", today);
  form.append("mealType", "breakfast");
  form.append("file", new Blob([Buffer.from("not-a-real-image")], { type: "image/jpeg" }), "test.jpg");
  const response = await fetch(`${base}/api/v1/meal-photos`, {
    method: "POST",
    headers: { Origin: base, Cookie: user?.cookie ?? "" },
    body: form,
    redirect: "manual",
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  let json;
  try { json = JSON.parse(text); } catch { /* 页面响应保留 HTML。 */ }
  return { response, status: response.status, json, text };
}

async function signup() {
  const email = `mysql_${randomUUID()}@bodytrace.dev`;
  createdEmails.push(email);
  const result = await api(null, "/api/auth/sign-up/email", "POST", {
    name: "MySQL 合成测试", email, password: "MySqlTest2026!",
  });
  assert.equal(result.status, 200);
  const id = result.json.user.id;
  return { id, cookie: result.response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
}

try {
  const a = await signup();
  const b = await signup();
  check("两个账号注册且预置食物可读", (await api(a, "/api/v1/foods")).json.foods.length === 24);

  const created = await api(a, "/api/v1/foods", "POST", {
    name: "MySQL 🍚 合成食物", calories: 100, protein: 10, carbs: 20, fat: 5, servingGrams: 80,
  });
  const food = created.json.food;
  check("创建返回完整记录和应用生成的 UUID", created.status === 201 && /^[0-9a-f-]{36}$/.test(food.id));
  check("utf8mb4 中文和 emoji 完整保存", food.name === "MySQL 🍚 合成食物");
  check("不区分大小写搜索保持可用", (await api(a, "/api/v1/foods?q=mysql")).json.foods.some(row => row.id === food.id));
  check("另一账号无法修改食物", (await api(b, `/api/v1/foods/${food.id}`, "PATCH", { calories: 1 })).status === 404);
  check("另一账号无法删除食物", (await api(b, `/api/v1/foods/${food.id}`, "DELETE")).status === 404);
  check("另一账号无法使用他人食物记餐", (await api(b, "/api/v1/meals", "POST", {
    date: today, mealType: "breakfast", foodId: food.id, grams: 100,
  })).status === 404);

  for (const date of ["2026-02-30", "2026-04-31", "1900-02-29"]) {
    assert.equal((await api(a, `/api/v1/meals?date=${date}`)).status, 400);
    assert.equal((await api(a, `/api/v1/summary?date=${date}`)).status, 400);
    assert.equal((await api(a, "/api/v1/meals", "POST", { date, mealType: "breakfast", foodId: food.id, grams: 100 })).status, 400);
  }
  assert.equal((await api(a, "/api/v1/meals?date=2024-02-29")).status, 200);
  check("饮食查询、汇总与新增拒绝不存在的日历日期，真实闰日可查询", true);

  await api(a, `/api/v1/foods/${food.id}`, "PATCH", { isFavorite: true });
  const sameUpdate = await api(a, `/api/v1/foods/${food.id}`, "PATCH", { isFavorite: true });
  check("重复更新同值仍返回记录和布尔值", sameUpdate.status === 200 && sameUpdate.json.food.isFavorite === true);
  const recorded = await api(a, "/api/v1/meals", "POST", { date: today, mealType: "breakfast", foodId: food.id, grams: 200 });
  const entry = recorded.json.entry;
  assert.deepEqual({ status: recorded.status, date: entry.date, calories: entry.calories, protein: entry.protein }, {
    status: 201, date: today, calories: 200, protein: 20,
  });
  check("日期字符串及营养快照正确", recorded.status === 201 && entry.date === today && entry.calories === 200 && entry.protein === 20);
  check("日期时间按 UTC 返回", Math.abs(Date.parse(entry.createdAt) - Date.now()) < 60_000);
  check("食物记录不再附带照片", !("photos" in entry));
  check("当天照片独立返回空数组", (await api(a, `/api/v1/meals?date=${today}`)).json.photos.length === 0);
  check("测试环境未配置 COS 时照片上传返回 503", (await uploadPhoto(a)).status === 503);
  check("未登录不能上传照片", (await uploadPhoto(null)).status === 401);
  check("删除不存在的照片返回 404", (await api(a, `/api/v1/meal-photos/${randomUUID()}`, "DELETE")).status === 404);
  await api(a, `/api/v1/foods/${food.id}`, "PATCH", { calories: 999 });
  await api(a, `/api/v1/foods/${food.id}`, "DELETE");
  const resized = await api(a, `/api/v1/meals/${entry.id}`, "PATCH", { grams: 300 });
  check("删除食物保留快照并可改克数", resized.json.entry.foodId === null && resized.json.entry.calories === 300 && resized.json.entry.protein === 30);

  // 用单独的合成账号构造超过 200 条重复记录，不影响其他快照与清空数量的断言。
  const recentOwner = await signup();
  const recentFoods = (await api(recentOwner, "/api/v1/foods")).json.foods
    .slice(0, 14).sort((left, right) => left.id.localeCompare(right.id));
  const now = Date.now();
  const recentRows = [
    ...recentFoods.slice(0, 13).map((row, index) => ({ row, at: new Date(now - (index <= 2 ? 1 : index) * 60_000) })),
    ...Array.from({ length: 201 }, () => ({ row: recentFoods[0], at: new Date(now) })),
  ].map(({ row, at }) => [randomUUID(), recentOwner.id, today, "breakfast", row.id, row.name, 100, row.calories, row.protein, row.carbs, row.fat, at]);
  await pool.execute(
    `INSERT INTO bodytrace_meal_entry (id, user_id, date, meal_type, food_id, name, grams, calories, protein, carbs, fat, created_at) VALUES ${recentRows.map(() => "(?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)").join(", ")}`,
    recentRows.flat(),
  );
  const recentResult = await api(recentOwner, "/api/v1/foods/recents");
  assert.equal(recentResult.status, 200);
  assert.deepEqual(recentResult.json.foods.map(row => row.id), recentFoods.slice(0, 12).map(row => row.id));
  check("最近食物先去重再取 12 种，超过 200 条重复记录不挤掉其他食物，同时间按 ID 稳定排序", true);
  check("最近食物只包含本人的已食用食物", recentResult.json.foods.every(row => row.userId === recentOwner.id) &&
    !(await api(b, "/api/v1/foods/recents")).json.foods.length);
  assert.equal((await api(null, "/api/v1/foods/recents")).status, 401);
  assert.equal((await api(recentOwner, `/api/v1/foods/${recentFoods[0].id}`, "DELETE")).status, 200);
  assert.deepEqual((await api(recentOwner, "/api/v1/foods/recents")).json.foods.map(row => row.id), recentFoods.slice(1, 13).map(row => row.id));
  check("最近食物排除已删食物，并从更早记录补足 12 种", true);

  const profile = { gender: null, heightCm: 175.5, weightKg: 80.4, targetWeightKg: null };
  await api(a, "/api/v1/profile", "PUT", { ...profile, weightKg: 81 });
  await api(a, "/api/v1/profile", "PUT", profile);
  check("资料 upsert 保留小数和空值", JSON.stringify((await api(a, "/api/v1/profile")).json.profile) === JSON.stringify(profile));
  assert.equal((await api(a, "/api/v1/profile", "PUT", { heightCm: 180 })).status, 400);
  assert.deepEqual((await api(a, "/api/v1/profile")).json.profile, profile);
  check("资料 PUT 缺少必填字段时拒绝请求并保留旧资料", true);
  const goals = { calories: 2200, protein: 140, carbs: 230, fat: 70 };
  await api(a, "/api/v1/goals", "PUT", { ...goals, calories: 2000 });
  await api(a, "/api/v1/goals", "PUT", goals);
  check("目标 upsert 正确更新", (await api(a, "/api/v1/goals")).json.goals.calories === 2200);

  // 饮食计划已取消：接口移除后，库里即使留有启用中的历史计划，目标也只取每日目标。
  check("饮食计划接口已移除", (await api(a, "/api/v1/plan")).status === 404);
  const planId = randomUUID();
  await pool.execute(
    "INSERT INTO bodytrace_diet_plan (id, user_id, start_date, is_active) VALUES (?, ?, ?, ?)",
    [planId, a.id, "2020-01-01", true],
  );
  for (let weekday = 0; weekday < 7; weekday++) {
    await pool.execute(
      "INSERT INTO bodytrace_diet_plan_day (id, plan_id, weekday, calories, protein, carbs, fat) VALUES (?, ?, ?, 1500, 90, 160, 45)",
      [randomUUID(), planId, weekday],
    );
  }
  const legacyPlanSummary = (await api(a, `/api/v1/summary?date=${today}`)).json;
  check("留有历史计划时汇总仍按每日目标", legacyPlanSummary.goalSource === "base" && legacyPlanSummary.goals.calories === 2200 && legacyPlanSummary.totals.calories === 300);
  const legacyPlanTrends = (await api(a, "/api/v1/trends?days=7")).json.trends;
  check("趋势目标线不读取历史计划", legacyPlanTrends.length === 7 && legacyPlanTrends.every(point => point.goalCalories === 2200));

  check("公共食物参考库搜索正常", (await api(a, `/api/v1/foods/reference?q=${encodeURIComponent("鸡蛋")}`)).json.foods.length > 0);
  for (const path of ["/", "/diary", "/foods", "/trends", "/goals", "/profile"]) {
    check(`${path} 页面正常渲染`, (await api(a, path)).status === 200);
  }
  check("删除记录成功", (await api(a, `/api/v1/meals/${entry.id}`, "DELETE")).status === 200);
  check("重复删除返回不存在", (await api(a, `/api/v1/meals/${entry.id}`, "DELETE")).status === 404);

  // 一键清空：重新记一笔餐和一条测量，验证清空范围、账号隔离与硬删除。
  assert.equal((await api(a, "/api/v1/measurements", "POST", { requestId: randomUUID(), measurement: { kind: "weight", date: today, value: "80.1" } })).status, 201);
  const presetFoodId = (await api(a, "/api/v1/foods")).json.foods[0].id;
  assert.equal((await api(a, "/api/v1/meals", "POST", { date: today, mealType: "lunch", foodId: presetFoodId, grams: 150 })).status, 201);
  assert.equal((await api(b, "/api/v1/measurements", "POST", { requestId: randomUUID(), measurement: { kind: "bodyFat", date: today, value: "18.5" } })).status, 201);
  check("未登录不能一键清空", (await api(null, "/api/v1/records", "DELETE")).status === 401);
  const cleared = (await api(a, "/api/v1/records", "DELETE")).json;
  check("一键清空返回三类删除数量", cleared.ok === true && cleared.cleared.mealEntries === 1 && cleared.cleared.measurements === 1 && cleared.cleared.mealPhotos === 0);
  check("清空后当日饮食与全部指标为空", (await api(a, `/api/v1/meals?date=${today}`)).json.entries.length === 0 && (await api(a, "/api/v1/measurements?range=all")).json.entries.length === 0);
  check("清空保留目标与个人资料", (await api(a, "/api/v1/goals")).json.goals.calories === 2200 && (await api(a, "/api/v1/profile")).json.profile.heightCm === 175.5);
  check("清空只影响本人记录", (await api(b, "/api/v1/measurements?range=all")).json.entries.length === 1);
  const [[mealLeft]] = await pool.execute("SELECT COUNT(*) AS count FROM bodytrace_meal_entry WHERE user_id = ?", [a.id]);
  const [[measureLeft]] = await pool.execute("SELECT COUNT(*) AS count FROM bodytrace_measurement WHERE user_id = ?", [a.id]);
  check("清空为硬删除，软删除测量行一并移除", mealLeft.count === 0 && measureLeft.count === 0);
  const repeat = (await api(a, "/api/v1/records", "DELETE")).json;
  check("重复清空成功且数量为零", repeat.ok === true && repeat.cleared.mealEntries === 0 && repeat.cleared.measurements === 0 && repeat.cleared.mealPhotos === 0);
  check("清空后个人资料页正常渲染", (await api(a, "/profile")).status === 200);
  console.log(`\n${passed} 项 MySQL 集成检查通过。`);
} finally {
  // 先停止应用，避免超时请求在清理后迟到写入；按预先记录的合成邮箱清理。
  try { await stop(); } finally {
    try {
      for (const email of createdEmails) await pool.execute("DELETE FROM bodytrace_user WHERE email = ?", [email]);
    } finally { await pool.end(); }
  }
}
