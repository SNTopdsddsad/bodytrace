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

async function uploadPhoto(user, entryId) {
  const form = new FormData();
  form.append("file", new Blob([Buffer.from("not-a-real-image")], { type: "image/jpeg" }), "test.jpg");
  const response = await fetch(`${base}/api/v1/meals/${entryId}/photos`, {
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
  check("新记录的 photos 是空数组", Array.isArray(entry.photos) && entry.photos.length === 0);
  check("测试环境未配置 COS 时照片上传返回 503", (await uploadPhoto(a, entry.id)).status === 503);
  check("不能给他人的饮食记录上传照片", (await uploadPhoto(b, entry.id)).status === 404);
  check("删除不存在的照片返回 404", (await api(a, `/api/v1/meals/${entry.id}/photos/${randomUUID()}`, "DELETE")).status === 404);
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
  const goals = { calories: 2200, protein: 140, carbs: 230, fat: 70 };
  await api(a, "/api/v1/goals", "PUT", { ...goals, calories: 2000 });
  await api(a, "/api/v1/goals", "PUT", goals);
  check("目标 upsert 正确更新", (await api(a, "/api/v1/goals")).json.goals.calories === 2200);

  const plan = { startDate: today, isActive: true, weekdays: Array.from({ length: 7 }, () => ({ ...goals })), items: [] };
  check("未登录不能读取或保存计划", (await api(null, "/api/v1/plan")).status === 401 && (await api(null, "/api/v1/plan", "PUT", plan)).status === 401);
  const initialPlan = await api(a, "/api/v1/plan", "PUT", plan);
  assert.equal(initialPlan.status, 200);
  for (const startDate of ["2026-02-30", "2026-04-31", "1900-02-29"]) {
    assert.equal((await api(a, "/api/v1/plan", "PUT", { ...plan, startDate })).status, 400);
  }
  assert.deepEqual((await api(a, "/api/v1/plan")).json.plan, initialPlan.json.plan);
  check("计划拒绝不存在的起始日，旧计划保持不变", true);
  const [[before]] = await pool.execute("SELECT id FROM bodytrace_diet_plan WHERE user_id = ?", [a.id]);
  const per100g = { calories: 46, protein: 3.4, carbs: 4.8, fat: 1.5 };
  const planFoodResult = await api(a, "/api/v1/foods", "POST", { name: "计划 🥛 合成食物", ...per100g });
  assert.equal(planFoodResult.status, 201);
  const planFood = planFoodResult.json.food;
  plan.items = [
    { weekday: 0, mealType: "breakfast", foodId: planFood.id, grams: 1 },
    { weekday: 6, mealType: "dinner", foodId: planFood.id, grams: 100 },
  ];
  const savedPlan = await api(a, "/api/v1/plan", "PUT", plan);
  assert.equal(savedPlan.status, 200);
  assert.deepEqual(savedPlan.json.plan.items[0], {
    id: savedPlan.json.plan.items[0].id, ...plan.items[0], name: planFood.name, per100g,
    calories: 0.5, protein: 0, carbs: 0, fat: 0,
  });
  assert.deepEqual((await api(a, "/api/v1/plan")).json.plan, savedPlan.json.plan);
  check("计划保存与读取同时返回原始每 100g 营养和小份量舍入结果", true);

  plan.weekdays = plan.weekdays.map(day => ({ ...day, calories: 2400 }));
  plan.items[0].grams = 100;
  const resizedPlan = await api(a, "/api/v1/plan", "PUT", plan);
  assert.equal(resizedPlan.status, 200);
  assert.deepEqual(resizedPlan.json.plan.items[0], {
    id: resizedPlan.json.plan.items[0].id, ...plan.items[0], name: planFood.name, per100g, ...per100g,
  });
  check("1g 改回 100g 后营养不丢失精度", true);
  const [after] = await pool.execute("SELECT id FROM bodytrace_diet_plan WHERE user_id = ?", [a.id]);
  check("计划 upsert 保留原 ID 且没有重复计划", after.length === 1 && after[0].id === before.id);
  check("计划七天被正确替换", (await api(a, "/api/v1/plan")).json.plan.weekdays.every(day => day.calories === 2400));
  const [[itemCount]] = await pool.execute("SELECT COUNT(*) AS count FROM bodytrace_diet_plan_item WHERE plan_id = ?", [before.id]);
  check("整体替换食物项没有累计旧行", itemCount.count === 2);
  check("其他账号读不到本人计划", (await api(b, "/api/v1/plan")).json.plan === null);
  check("其他账号不能用本人的食物创建计划", (await api(b, "/api/v1/plan", "PUT", plan)).status === 400 && (await api(b, "/api/v1/plan")).json.plan === null);
  const foreignFoodId = (await api(b, "/api/v1/foods")).json.foods[0].id;
  const invalidPlan = {
    ...plan,
    weekdays: plan.weekdays.map(day => ({ ...day, calories: 1800 })),
    items: [...plan.items, { weekday: 1, mealType: "lunch", foodId: foreignFoodId, grams: 100 }],
  };
  assert.equal((await api(a, "/api/v1/plan", "PUT", invalidPlan)).status, 400);
  assert.deepEqual((await api(a, "/api/v1/plan")).json.plan, resizedPlan.json.plan);
  check("混入他人食物时整单拒绝，旧目标与食物项保持不变", true);

  assert.equal((await api(a, `/api/v1/foods/${planFood.id}`, "PATCH", { protein: 6.8 })).status, 200);
  const updatedItems = (await api(a, "/api/v1/plan")).json.plan.items;
  check("食物库改值后计划读取最新营养", updatedItems.every(item => item.protein === 6.8 && item.per100g.protein === 6.8));
  assert.equal((await api(a, `/api/v1/foods/${planFood.id}`, "DELETE")).status, 200);
  const deletedFoodPlan = (await api(a, "/api/v1/plan")).json.plan;
  check("食物删除保留计划项的名称和克数，营养为空", deletedFoodPlan.items.length === 2 && deletedFoodPlan.items.every(item =>
    item.name === planFood.name && item.grams === 100 && item.foodId === null && item.per100g === null &&
    item.calories === null && item.protein === null && item.carbs === null && item.fat === null));
  assert.equal((await api(a, "/api/v1/plan", "PUT", plan)).status, 400);
  assert.deepEqual((await api(a, "/api/v1/plan")).json.plan, deletedFoodPlan);
  check("引用已删除食物时不改写旧计划", true);
  const ownFoodId = (await api(a, "/api/v1/foods")).json.foods[0].id;
  plan.items = [{ weekday: 1, mealType: "lunch", foodId: ownFoodId, grams: 100 }];
  const repairedPlan = await api(a, "/api/v1/plan", "PUT", plan);
  check("可移除失效行并换成有效食物", repairedPlan.status === 200 && repairedPlan.json.plan.items.length === 1 && repairedPlan.json.plan.items[0].foodId === ownFoodId);

  // 同一餐内三条不同食物：保存后 GET 顺序必须等于提交数组顺序，且重复保存顺序不变。
  // created_at 在同一条多行 INSERT 里取值相同，只能靠 position 列固定顺序。
  const sameMealFoods = [];
  for (const [name, calories] of [["顺序 A 燕麦", 100], ["顺序 B 鸡蛋", 200], ["顺序 C 牛奶", 300]]) {
    const createdSameMeal = await api(a, "/api/v1/foods", "POST", {
      name, calories, protein: 1, carbs: 1, fat: 1, servingGrams: 100,
    });
    assert.equal(createdSameMeal.status, 201);
    sameMealFoods.push(createdSameMeal.json.food);
  }
  const submittedItems = sameMealFoods.map(row => ({ weekday: 1, mealType: "lunch", foodId: row.id, grams: 100 }));
  const submittedOrder = submittedItems.map(item => item.foodId);
  plan.items = submittedItems;
  const firstOrderSave = await api(a, "/api/v1/plan", "PUT", plan);
  assert.equal(firstOrderSave.status, 200);
  const firstOrder = firstOrderSave.json.plan.items.map(item => item.foodId);
  const secondOrderSave = await api(a, "/api/v1/plan", "PUT", plan);
  assert.equal(secondOrderSave.status, 200);
  const secondOrder = secondOrderSave.json.plan.items.map(item => item.foodId);
  const rereadOrder = (await api(a, "/api/v1/plan")).json.plan.items.map(item => item.foodId);
  const [positionRows] = await pool.execute(
    "SELECT position, name FROM bodytrace_diet_plan_item WHERE plan_id = ? ORDER BY position",
    [before.id],
  );
  console.log("  同餐落库顺序：", positionRows.map(row => `${row.position}=${row.name}`).join(" "));
  check("同一餐内三条食物的 GET 顺序等于提交顺序，重复保存后顺序不变",
    JSON.stringify(firstOrder) === JSON.stringify(submittedOrder) &&
    JSON.stringify(secondOrder) === JSON.stringify(submittedOrder) &&
    JSON.stringify(rereadOrder) === JSON.stringify(submittedOrder));
  check("position 按提交数组顺序连续落库",
    JSON.stringify(positionRows.map(row => row.position)) === JSON.stringify([0, 1, 2]));
  const summary = (await api(a, `/api/v1/summary?date=${today}`)).json;
  check("汇总读取计划目标和历史快照", summary.goalSource === "plan" && summary.goals.calories === 2400 && summary.totals.calories === 300);
  await api(a, "/api/v1/plan", "DELETE");
  const [[dayCount]] = await pool.execute("SELECT COUNT(*) AS count FROM bodytrace_diet_plan_day WHERE plan_id = ?", [before.id]);
  const [[remainingItems]] = await pool.execute("SELECT COUNT(*) AS count FROM bodytrace_diet_plan_item WHERE plan_id = ?", [before.id]);
  check("删除计划级联清理日目标与食物项", (await api(a, "/api/v1/plan")).json.plan === null && dayCount.count === 0 && remainingItems.count === 0);

  check("公共食物参考库搜索正常", (await api(a, `/api/v1/foods/reference?q=${encodeURIComponent("鸡蛋")}`)).json.foods.length > 0);
  for (const path of ["/", "/diary", "/foods", "/trends", "/goals", "/plan", "/profile"]) {
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
  check("一键清空返回两类删除数量", cleared.ok === true && cleared.cleared.mealEntries === 1 && cleared.cleared.measurements === 1);
  check("清空后当日饮食与全部指标为空", (await api(a, `/api/v1/meals?date=${today}`)).json.entries.length === 0 && (await api(a, "/api/v1/measurements?range=all")).json.entries.length === 0);
  check("清空保留目标与个人资料", (await api(a, "/api/v1/goals")).json.goals.calories === 2200 && (await api(a, "/api/v1/profile")).json.profile.heightCm === 175.5);
  check("清空只影响本人记录", (await api(b, "/api/v1/measurements?range=all")).json.entries.length === 1);
  const [[mealLeft]] = await pool.execute("SELECT COUNT(*) AS count FROM bodytrace_meal_entry WHERE user_id = ?", [a.id]);
  const [[measureLeft]] = await pool.execute("SELECT COUNT(*) AS count FROM bodytrace_measurement WHERE user_id = ?", [a.id]);
  check("清空为硬删除，软删除测量行一并移除", mealLeft.count === 0 && measureLeft.count === 0);
  const repeat = (await api(a, "/api/v1/records", "DELETE")).json;
  check("重复清空成功且数量为零", repeat.ok === true && repeat.cleared.mealEntries === 0 && repeat.cleared.measurements === 0);
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
