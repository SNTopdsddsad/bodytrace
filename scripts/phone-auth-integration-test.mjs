// 手机号认证集成验证：仅在隔离副本使用短信 mock，验证码不写入测试输出。
import assert from "node:assert/strict";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { startLocalTestApp } from "./lib/local-test-app.mjs";

let passed = 0;

function check(name, condition) {
  assert(condition, name);
  passed++;
  console.log(`✓ ${name}`);
}

async function withPhoneApp(runChecks, smsSettings = { codeLength: 6, expireMinutes: 5, rateLimitSeconds: 60 }) {
  const app = await startLocalTestApp({ smsMock: true, smsSettings });
  const phones = new Set();
  const emails = new Set();
  const hmac = value => createHmac("sha256", app.smsRateLimitSecret).update(value).digest("hex");
  const digest = value => hmac(value).slice(0, 56);
  const sourceKey = `ip:${digest("shared")}`;
  const phoneKey = phone => `phone:${digest(phone)}`;
  const challengeKey = phone => `sms-login:${hmac(`phone:${phone}`)}`;
  const captureKey = phone => `sms-test:${phone}`;

  async function api(user, path, method = "GET", body, extraHeaders = {}) {
    const response = await fetch(app.base + path, {
      method,
      headers: { "Content-Type": "application/json", Origin: app.base, Cookie: user?.cookie ?? "", ...extraHeaders },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "manual",
      signal: AbortSignal.timeout(45_000),
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { /* 页面响应只用于 HTML 检查。 */ }
    return { response, status: response.status, json, text };
  }

  async function newPhone() {
    for (let attempt = 0; attempt < 20; attempt++) {
      const phone = `+86199${String(randomInt(100_000_000)).padStart(8, "0")}`;
      if (phones.has(phone)) continue;
      const [[existingUser]] = await app.pool.execute("SELECT COUNT(*) AS count FROM bodytrace_user WHERE phone_number = ?", [phone]);
      const [[existingCode]] = await app.pool.execute("SELECT COUNT(*) AS count FROM bodytrace_verification WHERE identifier IN (?, ?, ?)", [phone, challengeKey(phone), captureKey(phone)]);
      if (existingUser.count === 0 && existingCode.count === 0) {
        phones.add(phone);
        return phone;
      }
    }
    throw new Error("无法分配未占用的合成手机号");
  }

  async function readOtp(phone) {
    const [rows] = await app.pool.execute("SELECT id, identifier, value, expires_at FROM bodytrace_verification WHERE id = ?", [challengeKey(phone)]);
    assert(rows.length === 1, "当前合成手机号应只有一条有效验证码记录");
    const [[capture]] = await app.pool.execute("SELECT value FROM bodytrace_verification WHERE id = ?", [captureKey(phone)]);
    assert(capture, "隔离短信替身应捕获本次实际发送的合成验证码");
    const code = capture.value;
    assert(new RegExp(`^[0-9]{${smsSettings.codeLength}}$`).test(code), `验证码必须为 ${smsSettings.codeLength} 位数字`);
    const value = JSON.parse(rows[0].value);
    assert.equal(value.codeHash, hmac(`code:${phone}:${code}`), "实际认证记录应保存发送验证码的带密钥摘要");
    assert(Number.isInteger(value.attempts) && value.attempts >= 0 && value.attempts <= 3, "实际认证记录应保存有效的错误次数");
    assert(!rows[0].id.includes(phone) && !rows[0].identifier.includes(phone), "实际认证记录键不得包含明文手机号");
    assert(!Object.values(value).includes(code), "实际认证记录不得包含明文验证码");
    const [[raw]] = await app.pool.execute("SELECT COUNT(*) AS count FROM bodytrace_verification WHERE identifier = ?", [phone]);
    assert.equal(raw.count, 0, "插件生成的原始手机号明文验证码记录应已清理");
    return { id: rows[0].id, value: rows[0].value, code, attempts: value.attempts, expiresAt: rows[0].expires_at };
  }

  async function resetSourceWindow() {
    await app.pool.execute("UPDATE bodytrace_sms_rate_limit SET window_started_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 2 MINUTE), next_allowed_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE id = ?", [sourceKey]);
  }

  async function releaseCooldown(phone) {
    await app.pool.execute("UPDATE bodytrace_sms_rate_limit SET next_allowed_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND) WHERE id = ?", [phoneKey(phone)]);
  }

  async function sendOtp(phone, input = phone) {
    await resetSourceWindow();
    const result = await api(null, "/api/auth/phone-number/send-otp", "POST", { phoneNumber: input });
    assert.equal(result.status, 200, "合成手机号应成功提交验证码发送");
    return readOtp(phone);
  }

  function signedIn(result) {
    assert.equal(result.status, 200, "验证码验证应成功");
    assert(result.json?.user?.id, "验证成功应返回真实账号");
    const cookie = result.response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ");
    assert(cookie, "验证成功应写入登录 cookie");
    return { id: result.json.user.id, cookie };
  }

  try {
    await runChecks({ ...app, api, newPhone, readOtp, sendOtp, signedIn, releaseCooldown, resetSourceWindow, sourceKey, phoneKey, challengeKey, emails });
  } finally {
    // 先停止自己的服务器，避免迟到请求在清理后重新写入账号。
    try { await app.stop(); } finally {
      try {
        for (const phone of phones) {
          await app.pool.execute("DELETE FROM bodytrace_user WHERE phone_number = ?", [phone]);
          await app.pool.execute("DELETE FROM bodytrace_verification WHERE identifier IN (?, ?, ?)", [phone, challengeKey(phone), captureKey(phone)]);
        }
        for (const email of emails) await app.pool.execute("DELETE FROM bodytrace_user WHERE email = ?", [email]);
        for (const key of [sourceKey, ...Array.from(phones, phoneKey)]) {
          await app.pool.execute("DELETE FROM bodytrace_sms_rate_limit WHERE id = ?", [key]);
        }
      } finally { await app.pool.end(); }
    }
  }
}

await withPhoneApp(async ({ pool, api, newPhone, readOtp, sendOtp, signedIn, releaseCooldown, challengeKey, emails }) => {
  const email = `phone_legacy_${randomUUID()}@bodytrace.dev`;
  const password = "PhoneLegacy2026!";
  emails.add(email);
  const emailSignup = await api(null, "/api/auth/sign-up/email", "POST", { name: "旧邮箱合成账号", email, password });
  const legacy = signedIn(emailSignup);
  const phone = await newPhone();

  check("拒绝非中国大陆手机号", (await api(null, "/api/auth/phone-number/send-otp", "POST", { phoneNumber: "+85212345678" })).status === 400);
  check("验证入口同样拒绝非法手机号", (await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: "123", code: "123456" })).status === 400);

  const firstOtp = await sendOtp(phone, ` ${phone.slice(3)} `);
  const [[normalized]] = await pool.execute("SELECT COUNT(*) AS count FROM bodytrace_verification WHERE id = ?", [challengeKey(phone)]);
  check("发送入口将首尾空格和 11 位号码归一为 +86", normalized.count === 1);
  check("生产验证码记录仅保存带密钥摘要，手机号与明文验证码均不入认证记录", Boolean(firstOtp.id.startsWith("sms-login:")));
  for (const code of ["12345", "abcdef"]) {
    check("拒绝非 6 位数字验证码且保留原码", (await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: phone, code })).status === 400 && (await readOtp(phone)).value === firstOtp.value);
  }
  check("验证码入口不开放手机号绑定", (await api(legacy, "/api/auth/phone-number/verify", "POST", { phoneNumber: phone, code: firstOtp.code, updatePhoneNumber: true })).status === 400);
  check("验证码入口拒绝额外用户字段", (await api(legacy, "/api/auth/phone-number/verify", "POST", { phoneNumber: phone, code: firstOtp.code, name: "不应写入" })).status === 400);
  check("跨站 Origin 不能发送验证码", (await api(null, "/api/auth/phone-number/send-otp", "POST", { phoneNumber: phone }, { Origin: "https://attacker.invalid" })).status === 403);
  check("跨站 Origin 不能消费验证码", (await api(legacy, "/api/auth/phone-number/verify", "POST", { phoneNumber: phone, code: firstOtp.code }, { Origin: "https://attacker.invalid" })).status === 403);

  const repeatedSend = await api(null, "/api/auth/phone-number/send-otp", "POST", { phoneNumber: phone.slice(3) });
  assert.equal(repeatedSend.status, 429, "冷却期内再次发送应返回 429");
  check("冷却期内再次发送返回 429", true);
  check("冷却拒绝保留重试时间", Number(repeatedSend.response.headers.get("retry-after")) > 0);
  check("被拒绝的发送请求不会作废正在填写的原码", (await readOtp(phone)).value === firstOtp.value);

  const registered = await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: phone, code: firstOtp.code });
  const mobile = signedIn(registered);
  check("首次验证码验证自动注册已验证手机号", registered.json.user.phoneNumber === phone && registered.json.user.phoneNumberVerified === true);
  const initialFoods = await api(mobile, "/api/v1/foods");
  check("手机号新用户预置 24 条常用食物", initialFoods.status === 200 && initialFoods.json.foods.length === 24);
  check("已经消费的验证码不能重放", (await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: phone, code: firstOtp.code })).status === 400);

  await releaseCooldown(phone);
  const loginOtp = await sendOtp(phone);
  const loggedInAgain = signedIn(await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: phone.slice(3), code: loginOtp.code }));
  check("再次验证 11 位号码登录相同账号且不重复预置食物", loggedInAgain.id === mobile.id && (await api(loggedInAgain, "/api/v1/foods")).json.foods.length === 24);

  const wrongPhone = await newPhone();
  const wrongOtp = await sendOtp(wrongPhone);
  const wrongCode = wrongOtp.code === "000000" ? "111111" : "000000";
  for (let attempt = 0; attempt < 3; attempt++) {
    assert.equal((await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: wrongPhone, code: wrongCode })).status, 400, "错误验证码应被拒绝");
  }
  check("连续错误 3 次后正确验证码也不能登录", (await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: wrongPhone, code: wrongOtp.code })).status >= 400);
  const [[wrongUser]] = await pool.execute("SELECT COUNT(*) AS count FROM bodytrace_user WHERE phone_number = ?", [wrongPhone]);
  check("失败验证不会创建手机号账号", wrongUser.count === 0);

  const expiredPhone = await newPhone();
  const expiredOtp = await sendOtp(expiredPhone);
  await pool.execute("UPDATE bodytrace_verification SET expires_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 MINUTE) WHERE id = ?", [challengeKey(expiredPhone)]);
  check("过期验证码不能登录", (await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: expiredPhone, code: expiredOtp.code })).status === 400);

  const resentPhone = await newPhone();
  const oldOtp = await sendOtp(resentPhone);
  const resentWrongCode = oldOtp.code === "000000" ? "111111" : "000000";
  assert.equal((await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: resentPhone, code: resentWrongCode })).status, 400);
  assert.equal((await readOtp(resentPhone)).attempts, 1, "重发前应持久化旧验证码的错误次数");
  await releaseCooldown(resentPhone);
  const replacementOtp = await sendOtp(resentPhone);
  check("重发原子替换固定主键的唯一验证码记录并清零旧错误次数", replacementOtp.id === oldOtp.id && replacementOtp.attempts === 0 && (replacementOtp.code === oldOtp.code || replacementOtp.value !== oldOtp.value));
  // 两个随机验证码可能恰巧相同；此时通过旧错误次数已清零验证替换语义。
  if (replacementOtp.code !== oldOtp.code) {
    check("重发后旧验证码不能登录", (await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: resentPhone, code: oldOtp.code })).status === 400);
  }
  signedIn(await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: resentPhone, code: replacementOtp.code }));
  check("重发后的新验证码可以正常登录", true);

  const concurrentPhone = await newPhone();
  const concurrentOtp = await sendOtp(concurrentPhone);
  const concurrent = await Promise.all([
    api(legacy, "/api/auth/phone-number/verify", "POST", { phoneNumber: concurrentPhone, code: concurrentOtp.code }),
    api(legacy, "/api/auth/phone-number/verify", "POST", { phoneNumber: concurrentPhone, code: concurrentOtp.code }),
  ]);
  check("同一验证码并发验证只能一次成功", concurrent.filter(result => result.status === 200).length === 1 && concurrent.filter(result => result.status === 400).length === 1);
  const newPhoneUser = signedIn(concurrent.find(result => result.status === 200));
  const [[legacyRow]] = await pool.execute("SELECT phone_number FROM bodytrace_user WHERE id = ?", [legacy.id]);
  const legacySession = await api(legacy, "/api/auth/get-session?disableCookieCache=true");
  check("有旧邮箱会话时手机号注册仍创建独立账号，不自动合并或绑定", newPhoneUser.id !== legacy.id && legacyRow.phone_number === null && legacySession.json.user.id === legacy.id);
  const emailLogin = signedIn(await api(null, "/api/auth/sign-in/email", "POST", { email, password }));
  check("原邮箱密码仍能登录原账号", emailLogin.id === legacy.id);

  check("邮箱资料修改不能抢占手机号", (await api(legacy, "/api/auth/update-user", "POST", { phoneNumber: concurrentPhone, phoneNumberVerified: true })).status === 400);
  for (const path of ["/api/auth/sign-in/phone-number", "/api/auth/phone-number/request-password-reset", "/api/auth/phone-number/reset-password"]) {
    check("未开放的手机密码入口保持不可用", (await api(null, path, "POST", { phoneNumber: phone, password, otp: "123456", newPassword: password })).status === 404);
  }

  const createdFood = await api(mobile, "/api/v1/foods", "POST", { name: "手机号隔离合成食物", calories: 120, protein: 5, carbs: 15, fat: 3 });
  assert.equal(createdFood.status, 201);
  const foodId = createdFood.json.food.id;
  check("旧邮箱和其他手机号账号不能看到新账号的私人食物", !(await api(legacy, "/api/v1/foods")).json.foods.some(food => food.id === foodId) && !(await api(newPhoneUser, "/api/v1/foods")).json.foods.some(food => food.id === foodId));
  check("旧邮箱不能修改或删除手机号账号的私人食物", (await api(legacy, `/api/v1/foods/${foodId}`, "PATCH", { calories: 1 })).status === 404 && (await api(legacy, `/api/v1/foods/${foodId}`, "DELETE")).status === 404);
  const profilePage = await api(mobile, "/profile");
  const masked = `${phone.slice(3, 6)}****${phone.slice(-4)}`;
  check("手机号个人资料页显示脱敏号码且不展示合成邮箱", profilePage.status === 200 && profilePage.text.includes(masked) && !profilePage.text.includes(phone) && !profilePage.text.includes("@phone.bodytrace.invalid"));
});

// 新副本使用另一套测试密钥和独立的内存限流窗口，单独检查数据库额度边界。
await withPhoneApp(async ({ pool, api, newPhone, sourceKey, phoneKey, challengeKey }) => {
  const phone = await newPhone();
  async function setBucket(id, count) {
    await pool.execute("INSERT INTO bodytrace_sms_rate_limit (id, window_started_at, count, next_allowed_at) VALUES (?, UTC_TIMESTAMP(3), ?, DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND)) ON DUPLICATE KEY UPDATE window_started_at = UTC_TIMESTAMP(3), count = VALUES(count), next_allowed_at = DATE_SUB(UTC_TIMESTAMP(3), INTERVAL 1 SECOND)", [id, count]);
  }
  await setBucket(sourceKey, 5);
  const sourceLimited = await api(null, "/api/auth/phone-number/send-otp", "POST", { phoneNumber: phone }, { "X-Forwarded-For": "203.0.113.10", "X-Real-IP": "203.0.113.11" });
  check("来源 60 秒额度耗尽后伪造 IP 头也不能绕过", sourceLimited.status === 429 && sourceLimited.json?.code === "SMS_RATE_LIMITED");
  const [[sourceCount]] = await pool.execute("SELECT count FROM bodytrace_sms_rate_limit WHERE id = ?", [sourceKey]);
  check("来源限流拒绝时不会继续增加已耗尽额度", sourceCount.count === 5);
  await setBucket(sourceKey, 0);
  await setBucket(phoneKey(phone), 10);
  const phoneLimited = await api(null, "/api/auth/phone-number/send-otp", "POST", { phoneNumber: phone });
  check("同一手机号每天 10 次额度到达后拒绝发送", phoneLimited.status === 429 && phoneLimited.json?.code === "SMS_RATE_LIMITED");
  const [[rolledBackSource]] = await pool.execute("SELECT count FROM bodytrace_sms_rate_limit WHERE id = ?", [sourceKey]);
  check("手机号限流拒绝时回滚本次来源额度占用", rolledBackSource.count === 0);
  const [[otpCount]] = await pool.execute("SELECT COUNT(*) AS count FROM bodytrace_verification WHERE identifier IN (?, ?, ?)", [phone, challengeKey(phone), `sms-test:${phone}`]);
  check("额度拒绝的发送不会生成验证码", otpCount.count === 0);
});

await withPhoneApp(async ({ pool, api, newPhone, readOtp, sendOtp, signedIn, resetSourceWindow, sourceKey, phoneKey, challengeKey }) => {
  const loginPage = await api(null, "/login");
  assert.equal(loginPage.status, 200);
  const codeInput = loginPage.text.match(/<input\b[^>]*\bid="login-code"[^>]*>/)?.[0] ?? "";
  const pageText = loginPage.text.replace(/<!--[\s\S]*?-->/g, "");
  check("登录页按配置显示 4 位验证码输入提示", codeInput.includes('placeholder="4 位验证码"'));
  check("登录页验证码长度和格式采用 4 位配置", /\bmaxlength="4"/i.test(codeInput) && codeInput.includes('pattern="[0-9]{4}"'));
  check("登录页按配置显示 2 分钟有效期", pageText.includes("验证码 2 分钟内有效。"));

  const phone = await newPhone();
  const otp = await sendOtp(phone);
  check("自定义配置生成 4 位数字验证码", /^[0-9]{4}$/.test(otp.code));
  const [[expiry]] = await pool.execute("SELECT TIMESTAMPDIFF(MICROSECOND, UTC_TIMESTAMP(3), expires_at) / 1000 AS remaining_ms FROM bodytrace_verification WHERE id = ?", [challengeKey(phone)]);
  check("自定义配置将验证码有效期写为约 120 秒", Number(expiry.remaining_ms) > 110_000 && Number(expiry.remaining_ms) <= 120_100);
  const [[cooldown]] = await pool.execute("SELECT TIMESTAMPDIFF(MICROSECOND, UTC_TIMESTAMP(3), next_allowed_at) / 1000 AS remaining_ms FROM bodytrace_sms_rate_limit WHERE id = ?", [phoneKey(phone)]);
  check("自定义配置将同号重发间隔写为约 15 秒", Number(cooldown.remaining_ms) > 5_000 && Number(cooldown.remaining_ms) <= 15_100);
  const rejected = await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: phone, code: "123456" });
  check("4 位配置拒绝 6 位验证码且不消耗原码", rejected.status === 400 && (await readOtp(phone)).value === otp.value);
  signedIn(await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: phone, code: otp.code }));
  check("自定义配置的正确 4 位验证码可以注册登录", true);

  const concurrentPhone = await newPhone();
  await resetSourceWindow();
  const concurrent = await Promise.all([
    api(null, "/api/auth/phone-number/send-otp", "POST", { phoneNumber: concurrentPhone }),
    api(null, "/api/auth/phone-number/send-otp", "POST", { phoneNumber: concurrentPhone }),
  ]);
  check("自定义重发间隔下并发发送同一号码仅一次成功", concurrent.filter(result => result.status === 200).length === 1 && concurrent.filter(result => result.status === 429).length === 1);
  await readOtp(concurrentPhone);
  const [[reservedPhone]] = await pool.execute("SELECT count FROM bodytrace_sms_rate_limit WHERE id = ?", [phoneKey(concurrentPhone)]);
  const [[reservedSource]] = await pool.execute("SELECT count FROM bodytrace_sms_rate_limit WHERE id = ?", [sourceKey]);
  check("并发被拒请求不重复占用号码或来源额度", reservedPhone.count === 1 && reservedSource.count === 1);
}, { codeLength: 4, expireMinutes: 2, rateLimitSeconds: 15 });

// 只锁本轮合成号码的挑战主键，观察真实 SQL 排队，强制覆盖重发与错码校验的两种交错。
await withPhoneApp(async ({ pool, api, newPhone, readOtp, sendOtp, signedIn, releaseCooldown, resetSourceWindow, challengeKey }) => {
  async function waitForBlockedStatement(connection, key, pattern) {
    const deadline = Date.now() + 10_000;
    while (Date.now() < deadline) {
      // 当前测试与应用使用同一个数据库账号，只查看本账号正在等待的 SQL。
      const [processes] = await connection.query("SHOW FULL PROCESSLIST");
      if (processes.some(process => typeof process.Info === "string" && process.Info.includes(key) && pattern.test(process.Info))) return;
      await delay(20);
    }
    assert.fail("预期认证操作应在本轮合成挑战的行锁上排队");
  }

  for (const [round, resendFirst] of [false, true, false].entries()) {
    const phone = await newPhone();
    const oldOtp = await sendOtp(phone);
    const initialWrongCode = oldOtp.code === "000000" ? "111111" : "000000";
    for (let attempt = 0; attempt < 2; attempt++) {
      assert.equal((await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: phone, code: initialWrongCode })).status, 400);
    }
    assert.equal((await readOtp(phone)).attempts, 2, "交错前旧码应已消耗两次错误机会");
    await releaseCooldown(phone);
    await resetSourceWindow();

    const connection = await pool.getConnection();
    const requests = [];
    let resendRequest;
    let wrongRequest;
    let queuedCode = initialWrongCode;
    const startRequest = (path, body) => {
      const request = api(null, path, "POST", body);
      // 行锁观察失败时仍会在 finally 等待所有请求，防止迟到写入越过清理边界。
      request.catch(() => {});
      requests.push(request);
      return request;
    };
    try {
      await connection.query("SET TRANSACTION ISOLATION LEVEL READ COMMITTED");
      await connection.beginTransaction();
      await connection.execute("SELECT id FROM bodytrace_verification WHERE id = ? FOR UPDATE", [challengeKey(phone)]);
      if (resendFirst) {
        resendRequest = startRequest("/api/auth/phone-number/send-otp", { phoneNumber: phone });
        await waitForBlockedStatement(connection, challengeKey(phone), /\binsert\s+into\b/i);
        // 供应商尚未被调用；仅测试侧读取插件临时值，以避开随机新码恰等于预选错码的情况。
        const [[raw]] = await connection.execute("SELECT value FROM bodytrace_verification WHERE identifier = ?", [phone]);
        assert(raw, "排队的重发应已生成新的合成验证码");
        const generatedCode = raw.value.split(":")[0];
        queuedCode = ["000000", "111111", "222222"].find(code => code !== oldOtp.code && code !== generatedCode);
        wrongRequest = startRequest("/api/auth/phone-number/verify", { phoneNumber: phone, code: queuedCode });
        await waitForBlockedStatement(connection, challengeKey(phone), /\bfor\s+update\b/i);
      } else {
        wrongRequest = startRequest("/api/auth/phone-number/verify", { phoneNumber: phone, code: queuedCode });
        await waitForBlockedStatement(connection, challengeKey(phone), /\bfor\s+update\b/i);
        resendRequest = startRequest("/api/auth/phone-number/send-otp", { phoneNumber: phone });
        await waitForBlockedStatement(connection, challengeKey(phone), /\binsert\s+into\b/i);
      }
      await connection.commit();
      const [wrong, resent] = await Promise.all([wrongRequest, resendRequest]);
      assert.equal(wrong.status, 400, "交错中的错误验证码应被拒绝");
      assert.equal(resent.status, 200, "交错中的重发应成功");
    } finally {
      try { await connection.rollback(); } finally { connection.release(); }
      await Promise.allSettled(requests);
    }

    const replacement = await readOtp(phone);
    const [[challengeCount]] = await pool.execute("SELECT COUNT(*) AS count FROM bodytrace_verification WHERE identifier = ?", [challengeKey(phone)]);
    check(`并发回归 ${round + 1}：重发与错码交错后只有一条新挑战，旧状态不会回写`, challengeCount.count === 1 && replacement.attempts === (resendFirst ? 1 : 0));
    if (oldOtp.code !== replacement.code) {
      const oldResult = await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: phone, code: oldOtp.code });
      check(`并发回归 ${round + 1}：交错后旧验证码不能登录`, oldResult.status === 400 && oldResult.json?.code === "INVALID_OTP");
    }
    const wrongCode = replacement.code === "000000" ? "111111" : "000000";
    for (let attempts = (await readOtp(phone)).attempts; attempts < 2; attempts++) {
      assert.equal((await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: phone, code: wrongCode })).status, 400);
    }
    assert.equal((await readOtp(phone)).attempts, 2, "新码只累计重发后的错误次数，不能继承旧码计数");
    signedIn(await api(null, "/api/auth/phone-number/verify", "POST", { phoneNumber: phone, code: replacement.code }));
    check(`并发回归 ${round + 1}：新码保留独立错误预算并可正常登录`, true);
  }
});

console.log(`\n${passed} 项手机号认证集成检查通过（隔离短信 mock，无真实短信发送）。`);
