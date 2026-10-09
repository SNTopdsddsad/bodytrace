// 需要本地 npm run dev；只修改本脚本创建的临时账号，结束后清理。
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import dotenv from "dotenv";
import postgres from "postgres";

dotenv.config({ quiet: true });
const base = process.env.SMOKE_BASE_URL ?? "http://localhost:3000";
const databaseURL = new URL(process.env.DATABASE_URL);
const localHosts = ["localhost", "127.0.0.1", "[::1]"];
assert(localHosts.includes(new URL(base).hostname), "测试仅允许本地应用");
assert(localHosts.includes(databaseURL.hostname), "测试仅允许本地数据库");

const sql = postgres(process.env.DATABASE_URL, { max: 1 });
const email = `password_reset_${Date.now()}@bodytrace.dev`;
const oldPassword = "ResetTestBefore2026!";
const newPassword = "ResetTestAfter2026!";
let userId;
let cookie = "";
let passed = 0;

function check(name, condition) {
  assert(condition, name);
  passed++;
  console.log(`✓ ${name}`);
}

async function api(path, body, headers = {}) {
  const response = await fetch(base + path, {
    method: body === undefined ? "GET" : "POST",
    headers: { "Content-Type": "application/json", Origin: base, Cookie: cookie, ...headers },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
  });
  const text = await response.text();
  let json = null;
  try { json = JSON.parse(text); } catch { /* 页面不是 JSON。 */ }
  return { response, json, text };
}

async function requestReset() {
  return api("/api/auth/request-password-reset", { email, redirectTo: "/reset-password" });
}

async function latestToken() {
  const [record] = await sql`
    select identifier, expires_at from verification
    where value = ${userId} and identifier like 'reset-password:%'
    order by created_at desc limit 1
  `;
  assert(record, "临时账号应有重置令牌");
  return { token: record.identifier.slice("reset-password:".length), expiresAt: record.expires_at };
}

try {
  const page = await api("/forgot-password");
  assert(page.text.includes("当前为本地调试模式"), "请先运行 npm run dev，生产模式不开放本地找回渠道");

  const signup = await api("/api/auth/sign-up/email", { name: "密码重置测试", email, password: oldPassword });
  assert.equal(signup.response.status, 200);
  userId = signup.json.user.id;
  cookie = signup.response.headers.getSetCookie().map((value) => value.split(";")[0]).join("; ");

  const requested = await requestReset();
  check("提交重置申请，不返回链接或令牌", requested.response.status === 200 && requested.json.status && !requested.json.token && !requested.json.url);
  const first = await latestToken();
  const lifetime = (new Date(first.expiresAt).getTime() - Date.now()) / 1000;
  check("重置链接有效期为 15 分钟", lifetime > 870 && lifetime <= 900);

  const unknown = await api("/api/auth/request-password-reset", { email: `unknown_${Date.now()}@bodytrace.dev`, redirectTo: "/reset-password" });
  check("未注册邮箱返回相同响应", unknown.response.status === requested.response.status && JSON.stringify(unknown.json) === JSON.stringify(requested.json));

  const invalid = await api("/api/auth/reset-password", { token: "not-a-valid-token", newPassword });
  check("无效令牌不能改密", invalid.response.status === 400 && invalid.json.code === "INVALID_TOKEN");

  // 单独准备过期令牌，保留首次申请的有效链接以验证改密后的整体作废。
  const expiredToken = randomUUID();
  await sql`insert into verification (id, identifier, value, expires_at)
    values (${randomUUID()}, ${`reset-password:${expiredToken}`}, ${userId}, now() - interval '1 minute')`;
  const callback = await api(`/api/auth/reset-password/${expiredToken}?callbackURL=${encodeURIComponent(base + "/reset-password")}`);
  const location = new URL(callback.response.headers.get("location"), base);
  check("过期链接跳到失效页面", callback.response.status === 302 && location.searchParams.get("error") === "INVALID_TOKEN");
  const expired = await api("/api/auth/reset-password", { token: expiredToken, newPassword });
  check("过期令牌不能改密", expired.response.status === 400 && expired.json.code === "INVALID_TOKEN");

  const again = await requestReset();
  assert.equal(again.response.status, 200);
  const valid = await latestToken();
  assert.notEqual(valid.token, first.token);
  const validCallback = await api(`/api/auth/reset-password/${valid.token}?callbackURL=${encodeURIComponent("/reset-password")}`);
  const validLocation = new URL(validCallback.response.headers.get("location"), base);
  check("有效链接跳到重置表单", validCallback.response.status === 302 && validLocation.pathname === "/reset-password" && validLocation.searchParams.get("token") === valid.token);
  const form = await api(`/reset-password?token=${valid.token}`);
  check("有效令牌显示新密码表单", form.response.status === 200 && form.text.includes("确认新密码"));
  const tooShort = await api("/api/auth/reset-password", { token: valid.token, newPassword: "short" });
  check("短密码被拒绝，令牌仍可用", tooShort.response.status === 400);

  const reset = await api("/api/auth/reset-password", { token: valid.token, newPassword });
  check("有效令牌可以重置密码", reset.response.status === 200 && reset.json.status);
  const session = await api("/api/auth/get-session");
  check("原登录会话失效", session.response.status === 200 && !session.json?.session);
  const replay = await api("/api/auth/reset-password", { token: valid.token, newPassword: oldPassword });
  check("令牌不能重复使用", replay.response.status === 400 && replay.json.code === "INVALID_TOKEN");
  const previous = await api("/api/auth/reset-password", { token: first.token, newPassword: oldPassword });
  check("改密后此前申请的其他链接不能再次改密", previous.response.status === 400 && previous.json.code === "INVALID_TOKEN");
  const previousForm = await api(`/reset-password?token=${first.token}`);
  check("此前申请的其他链接也显示失效页面", previousForm.text.includes("重置链接已失效"));
  const usedForm = await api(`/reset-password?token=${valid.token}`);
  check("已用链接显示失效提示", usedForm.text.includes("重置链接已失效"));

  const oldLogin = await api("/api/auth/sign-in/email", { email, password: oldPassword });
  check("旧密码不能登录", oldLogin.response.status === 401);
  const newLogin = await api("/api/auth/sign-in/email", { email, password: newPassword });
  check("新密码可以登录", newLogin.response.status === 200 && newLogin.json.user.id === userId);
  const limited = await requestReset();
  check("频繁申请受到限流", limited.response.status === 429);
  const spoofedStatuses = [];
  for (let attempt = 1; attempt <= 4; attempt++) {
    const spoofed = await api("/api/auth/request-password-reset", { email, redirectTo: "/reset-password" }, {
      "X-Forwarded-For": `198.51.100.${attempt}`,
      "X-Real-IP": `203.0.113.${attempt}`,
      "Forwarded": `for=198.51.100.${attempt}`,
      "X-Bodytrace-Client-IP": `192.0.2.${attempt}`,
    });
    spoofedStatuses.push(spoofed.response.status);
  }
  check("更换伪造的转发 IP 头不能绕过限流", spoofedStatuses.every((status) => status === 429));
  console.log(`\n${passed} 项密码重置检查通过。`);
} finally {
  if (userId) {
    await sql`delete from verification where value = ${userId} and identifier like 'reset-password:%'`;
    await sql`delete from "user" where id = ${userId} and email = ${email}`;
  }
  await sql.end();
}
