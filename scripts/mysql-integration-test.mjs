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
  await api(a, `/api/v1/foods/${food.id}`, "PATCH", { calories: 999 });
  await api(a, `/api/v1/foods/${food.id}`, "DELETE");
  const resized = await api(a, `/api/v1/meals/${entry.id}`, "PATCH", { grams: 300 });
  check("删除食物保留快照并可改克数", resized.json.entry.foodId === null && resized.json.entry.calories === 300 && resized.json.entry.protein === 30);

  const profile = { gender: null, heightCm: 175.5, weightKg: 80.4, targetWeightKg: null };
  await api(a, "/api/v1/profile", "PUT", { ...profile, weightKg: 81 });
  await api(a, "/api/v1/profile", "PUT", profile);
  check("资料 upsert 保留小数和空值", JSON.stringify((await api(a, "/api/v1/profile")).json.profile) === JSON.stringify(profile));
  const goals = { calories: 2200, protein: 140, carbs: 230, fat: 70 };
  await api(a, "/api/v1/goals", "PUT", { ...goals, calories: 2000 });
  await api(a, "/api/v1/goals", "PUT", goals);
  check("目标 upsert 正确更新", (await api(a, "/api/v1/goals")).json.goals.calories === 2200);

  const plan = { startDate: today, isActive: true, weekdays: Array.from({ length: 7 }, () => ({ dayType: "medium", ...goals })) };
  assert.equal((await api(a, "/api/v1/plan", "PUT", plan)).status, 200);
  const [[before]] = await pool.execute("SELECT id FROM bodytrace_diet_plan WHERE user_id = ?", [a.id]);
  plan.weekdays = plan.weekdays.map(day => ({ ...day, calories: 2400 }));
  assert.equal((await api(a, "/api/v1/plan", "PUT", plan)).status, 200);
  const [after] = await pool.execute("SELECT id FROM bodytrace_diet_plan WHERE user_id = ?", [a.id]);
  check("计划 upsert 保留原 ID 且没有重复计划", after.length === 1 && after[0].id === before.id);
  check("计划七天被正确替换", (await api(a, "/api/v1/plan")).json.plan.weekdays.every(day => day.calories === 2400));
  const summary = (await api(a, `/api/v1/summary?date=${today}`)).json;
  check("汇总读取计划目标和历史快照", summary.goalSource === "plan" && summary.goals.calories === 2400 && summary.totals.calories === 300);
  await api(a, "/api/v1/plan", "DELETE");
  const [[dayCount]] = await pool.execute("SELECT COUNT(*) AS count FROM bodytrace_diet_plan_day WHERE plan_id = ?", [before.id]);
  check("删除计划级联清理日目标", (await api(a, "/api/v1/plan")).json.plan === null && dayCount.count === 0);

  check("公共食物参考库搜索正常", (await api(a, `/api/v1/foods/reference?q=${encodeURIComponent("鸡蛋")}`)).json.foods.length > 0);
  for (const path of ["/", "/diary", "/foods", "/trends", "/goals", "/plan", "/profile"]) {
    check(`${path} 页面正常渲染`, (await api(a, path)).status === 200);
  }
  check("删除记录成功", (await api(a, `/api/v1/meals/${entry.id}`, "DELETE")).status === 200);
  check("重复删除返回不存在", (await api(a, `/api/v1/meals/${entry.id}`, "DELETE")).status === 404);
  console.log(`\n${passed} 项 MySQL 集成检查通过。`);
} finally {
  // 先停止应用，避免超时请求在清理后迟到写入；按预先记录的合成邮箱清理。
  try { await stop(); } finally {
    try {
      for (const email of createdEmails) await pool.execute("DELETE FROM bodytrace_user WHERE email = ?", [email]);
    } finally { await pool.end(); }
  }
}
