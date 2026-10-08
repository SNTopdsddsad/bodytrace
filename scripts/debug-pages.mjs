// 快速验证各页面渲染：登录 → 逐页请求，检查状态码和关键内容
const BASE = "http://localhost:3000";
let cookie = "";

async function login() {
  const email = `page_${Date.now()}@bodytrace.dev`;
  const res = await fetch(BASE + "/api/auth/sign-up/email", {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: BASE },
    body: JSON.stringify({ name: "页面测试", email, password: "password123" }),
  });
  cookie = (res.headers.getSetCookie?.() ?? []).map((c) => c.split(";")[0]).join("; ");
}

// 先记一笔，让页面有数据可渲染
async function addMeal() {
  const foods = await (await fetch(BASE + "/api/v1/foods", { headers: { Cookie: cookie } })).json();
  const f = foods.foods.find((x) => x.name.includes("鸡蛋"));
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  await fetch(BASE + "/api/v1/meals", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie, Origin: BASE },
    body: JSON.stringify({ date: today, mealType: "breakfast", foodId: f.id, grams: 100 }),
  });
}

const pages = [
  ["/", "今日概览"],
  ["/diary", "饮食日记"],
  ["/foods", "食物库"],
  ["/trends", "趋势"],
  ["/goals", "目标设置"],
];

await login();
await addMeal();
let ok = true;
for (const [path, keyword] of pages) {
  const res = await fetch(BASE + path, { headers: { Cookie: cookie } });
  const html = await res.text();
  const hit = res.status === 200 && html.includes(keyword);
  if (!hit) ok = false;
  console.log(`${hit ? "✓" : "✗"} ${path} — ${res.status}${hit ? "" : "（内容异常）"}`);
}
// 未登录应被弹回登录页
const anon = await fetch(BASE + "/", { redirect: "manual" });
console.log(`${anon.status === 302 || anon.status === 307 ? "✓" : "✗"} 未登录访问 / 被重定向（${anon.status}）`);
process.exit(ok ? 0 : 1);
