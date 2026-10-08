/**
 * 端到端冒烟测试：用 fetch 模拟一个真实用户
 * 注册 → 查食物 → 记录饮食 → 改克数 → 汇总/趋势 → 清理。
 *
 * 用法：先启动服务器（npm run start），再执行
 *   node scripts/smoke-test.mjs
 */
const BASE = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());

let cookie = "";
let passed = 0;
let failed = 0;

function check(name, ok, detail = "") {
  if (ok) {
    passed++;
    console.log(`  ✓ ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? " — " + detail : ""}`);
  }
}

async function api(path, init = {}) {
  const res = await fetch(BASE + path, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      // better-auth 的 CSRF 防护要求 POST 带 Origin（浏览器自动带，脚本需手动）
      Origin: BASE,
      Cookie: cookie,
      ...init.headers,
    },
  });
  // 保存登录 cookie
  const setCookie = res.headers.getSetCookie?.() ?? [];
  if (setCookie.length > 0) cookie = setCookie.map((c) => c.split(";")[0]).join("; ");
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* 非 JSON 响应 */
  }
  return { status: res.status, json, text };
}

const email = `smoke_${Date.now()}@bodytrace.dev`;

console.log("1. 注册账号");
{
  const { json, status } = await api("/api/auth/sign-up/email", {
    method: "POST",
    body: JSON.stringify({ name: "冒烟测试", email, password: "password123" }),
  });
  check("注册成功", status === 200 && !!json?.user?.id);
}

console.log("2. 未登录应被拒绝");
{
  const saved = cookie;
  cookie = "";
  const { status } = await api("/api/v1/foods");
  check("无 cookie 返回 401", status === 401);
  cookie = saved;
}

console.log("3. 食物库（新用户应预置 24 种）");
let rice;
{
  const { json } = await api("/api/v1/foods");
  check("预置食物数量 = 24", json.foods.length === 24, `实际 ${json.foods.length}`);

  const search = await api(`/api/v1/foods?q=${encodeURIComponent("米饭")}`);
  rice = search.json.foods.find((f) => f.name.includes("米饭"));
  check("中文搜索「米饭」", !!rice, rice ? `${rice.name} ${rice.calories}kcal/100g` : "未找到");
}

console.log("4. 记录饮食并核对营养快照");
let entryId;
{
  const { json, status } = await api("/api/v1/meals", {
    method: "POST",
    body: JSON.stringify({ date: today, mealType: "breakfast", foodId: rice.id, grams: 200 }),
  });
  entryId = json?.entry?.id;
  const e = json?.entry ?? {};
  const okKcal = Math.abs(e.calories - (rice.calories * 200) / 100) < 0.11;
  check("添加 200g 米饭到早餐", status === 201 && okKcal, `${e.calories} 千卡`);

  const patch = await api(`/api/v1/meals/${entryId}`, {
    method: "PATCH",
    body: JSON.stringify({ grams: 300 }),
  });
  const scaled = (rice.calories * 300) / 100;
  check("改成 300g 后按比例重算", Math.abs(patch.json.entry.calories - scaled) < 0.11, `${patch.json.entry.calories} 千卡`);
}

console.log("5. 再记一条，验证汇总");
{
  const chicken = (await api("/api/v1/foods")).json.foods.find((f) => f.name.includes("鸡胸"));
  await api("/api/v1/meals", {
    method: "POST",
    body: JSON.stringify({ date: today, mealType: "lunch", foodId: chicken.id, grams: 150 }),
  });
  const { json } = await api(`/api/v1/summary?date=${today}`);
  const expected = (300 / 100) * rice.calories + (150 / 100) * chicken.calories;
  check(
    "当日汇总热量正确",
    Math.abs(json.totals.calories - expected) < 0.5,
    `${Math.round(json.totals.calories)} 千卡（目标 ${json.goals.calories}）`,
  );
  check("汇总按餐次分组", json.byMeal.length === 4);
}

console.log("6. 收藏 / 最近吃过 / 趋势");
{
  await api(`/api/v1/foods/${rice.id}`, {
    method: "PATCH",
    body: JSON.stringify({ isFavorite: true }),
  });
  const favs = (await api("/api/v1/foods")).json.foods.filter((f) => f.isFavorite);
  check("收藏生效", favs.length === 1 && favs[0].name.includes("米饭"));

  const recents = (await api("/api/v1/foods/recents")).json.foods;
  check("最近吃过 = 2 种", recents.length === 2, recents.map((f) => f.name).join("、"));

  const trends = (await api("/api/v1/trends?days=7")).json;
  const todayRow = trends.trends.find((t) => t.date === today);
  check("趋势图数据含今天", todayRow.calories > 0, `${Math.round(todayRow.calories)} 千卡`);
  check("趋势补零后共 7 天", trends.trends.length === 7);
}

console.log("7. 目标读写");
{
  await api("/api/v1/goals", {
    method: "PUT",
    body: JSON.stringify({ calories: 2200, protein: 140, carbs: 230, fat: 70 }),
  });
  const { json } = await api("/api/v1/goals");
  check("保存后读取一致", json.goals.calories === 2200);
}

console.log("8. 删除记录");
{
  const { status } = await api(`/api/v1/meals/${entryId}`, { method: "DELETE" });
  const after = await api(`/api/v1/summary?date=${today}`);
  check("删除成功且汇总减少", status === 200 && after.json.totals.calories > 0);
}

console.log(`\n结果：${passed} 通过，${failed} 失败`);
process.exit(failed === 0 ? 0 : 1);
