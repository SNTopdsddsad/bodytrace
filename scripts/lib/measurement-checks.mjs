import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** 调用方提供隔离应用；只创建和清理本轮唯一邮箱的合成账号。 */
export async function runMeasurementChecks({ base, pool, stop }) {
  const emails = [];
  let passed = 0;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const yesterdayDate = new Date(`${today}T00:00:00Z`);
  yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
  const yesterday = yesterdayDate.toISOString().slice(0, 10);
  const check = (name, condition) => { assert(condition, name); passed++; console.log(`✓ ${name}`); };
  async function api(user, path, method = "GET", body, origin = base) {
    const response = await fetch(base + path, { method, headers: { "Content-Type": "application/json", Origin: origin, Cookie: user?.cookie ?? "" }, ...(body === undefined ? {} : { body: JSON.stringify(body) }), redirect: "manual", signal: AbortSignal.timeout(45_000) });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { /* 页面使用 text 核对。 */ }
    return { status: response.status, json, text, response };
  }
  async function signup() {
    const email = `measurement_${randomUUID()}@bodytrace.dev`;
    emails.push(email);
    const result = await api(null, "/api/auth/sign-up/email", "POST", { name: "身体指标合成测试", email, password: "MeasurementTest2026!" });
    assert.equal(result.status, 200);
    const id = result.json.user.id;
    const [[stored]] = await pool.execute("SELECT id FROM bodytrace_user WHERE id = ? AND email = ?", [id, email]);
    assert(stored, "应用与清理连接必须指向同一个数据库");
    return { id, cookie: result.response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
  }
  const create = (user, measurement, requestId = randomUUID()) => api(user, "/api/v1/measurements", "POST", { requestId, measurement });
  try {
    const a = await signup();
    const b = await signup();
    check("未登录无法读取指标", (await api(null, "/api/v1/measurements")).status === 401);
    const profile = { gender: null, heightCm: 175, weightKg: 80, targetWeightKg: 70 };
    assert.equal((await api(a, "/api/v1/profile", "PUT", profile)).status, 200);
    const initial = (await api(a, "/api/v1/measurements?range=all")).json;
    check("旧资料体重保留作参考，不伪造历史", initial.entries.length === 0 && initial.legacyWeightKg === 80 && initial.latest.weight === null);

    const requestId = randomUUID();
    const input = { kind: "weight", date: yesterday, time: "08:15", value: "79.5", note: "晨起 🍃" };
    const first = await create(a, input, requestId);
    assert.equal(first.status, 201);
    const entry = first.json.entry;
    check("体重精度、日期、时间和中文备注保存正确", entry.value === "79.50" && entry.date === yesterday && entry.time === "08:15" && entry.note === "晨起 🍃");
    const repeated = await create(a, input, requestId);
    check("同一次提交重试返回同一记录", repeated.status === 200 && repeated.json.entry.id === entry.id);
    check("同一提交编号不能用于其他数值", (await create(a, { ...input, value: "70" }, requestId)).status === 409);
    const later = await create(a, { ...input, time: "20:00", value: "79.8" });
    const newest = await create(a, { ...input, date: today, time: "08:00", value: "79.2" });
    assert.equal(later.status, 201);
    assert.equal(newest.status, 201);
    assert.equal((await create(a, { kind: "bodyFat", date: today, value: "20.5" })).status, 201);
    const pressure = await create(a, { kind: "bloodPressure", date: today, period: "morning", systolic: 120, diastolic: 80 });
    assert.equal((await create(a, { kind: "bloodPressure", date: yesterday, period: "evening", systolic: 115, diastolic: 75 })).status, 201);
    assert.equal((await create(a, { kind: "bloodPressure", date: yesterday, period: "morning", systolic: 122, diastolic: 78 })).status, 201);
    check("血压成对保存数值并记录晨间/夜间时段，未知测量时间保持空值", pressure.status === 201 && pressure.json.entry.time === null && pressure.json.entry.value === null && pressure.json.entry.period === "morning");
    check("不完整血压被拒绝", (await create(a, { kind: "bloodPressure", date: today, period: "morning", systolic: 120 })).status === 400);
    check("缺少晨间/夜间时段的血压被拒绝", (await create(a, { kind: "bloodPressure", date: today, systolic: 120, diastolic: 80 })).status === 400);
    check("体重记录不接受血压时段", (await create(a, { ...input, period: "morning" })).status === 400);
    check("无效日历日期被拒绝", (await create(a, { ...input, date: "2026-02-30" })).status === 400);
    check("伪造 Origin 的写入被拒绝", (await api(a, "/api/v1/measurements", "POST", { requestId: randomUUID(), measurement: input }, "https://evil.example.com")).status === 401);

    const dashboard = (await api(a, "/api/v1/measurements?range=all")).json;
    check("三个指标的最新值独立解析，同日多次测量全部保留", dashboard.entries.length === 7 && dashboard.latest.weight.value === "79.20" && dashboard.latest.bodyFat.value === "20.50" && dashboard.latest.bloodPressure.systolic === 120 && dashboard.latest.bloodPressure.period === "morning");
    check("血压与上一次同时段比较，夜间记录不混入晨间变化", dashboard.previous.bloodPressure.systolic === 122 && dashboard.previous.bloodPressure.diastolic === 78);
    check("个人资料使用最新体重", (await api(a, "/api/v1/profile")).json.profile.weightKg === 79.2);
    check("旧资料接口不能覆盖测量体重", (await api(a, "/api/v1/profile", "PUT", { ...profile, weightKg: 81 })).status === 409);
    check("另一账号的列表不包含他人指标", (await api(b, "/api/v1/measurements?range=all")).json.entries.length === 0);
    check("另一账号无法读取记录详情", (await api(b, `/api/v1/measurements/${entry.id}`)).status === 404);
    check("另一账号无法修改记录", (await api(b, `/api/v1/measurements/${entry.id}`, "PATCH", { version: 1, measurement: input })).status === 404);
    check("另一账号无法删除记录", (await api(b, `/api/v1/measurements/${entry.id}`, "DELETE", { version: 1 })).status === 404);

    const changedInput = { ...input, date: today, time: "09:00", value: "78.9" };
    const changed = await api(a, `/api/v1/measurements/${entry.id}`, "PATCH", { version: 1, measurement: changedInput });
    check("修改记录更新版本和最新体重", changed.status === 200 && changed.json.entry.version === 2 && (await api(a, "/api/v1/profile")).json.profile.weightKg === 78.9);
    check("丢失响应后的同内容编辑重试可确认成功", (await api(a, `/api/v1/measurements/${entry.id}`, "PATCH", { version: 1, measurement: changedInput })).status === 200);
    check("旧版本编辑不能覆盖新内容", (await api(a, `/api/v1/measurements/${entry.id}`, "PATCH", { version: 1, measurement: { ...changedInput, value: "77" } })).status === 409);
    assert.equal((await api(a, `/api/v1/measurements/${entry.id}`, "DELETE", { version: 2 })).status, 200);
    check("删除重试不产生其他变更", (await api(a, `/api/v1/measurements/${entry.id}`, "DELETE", { version: 2 })).status === 200);
    check("删除后详情不可读且最新体重回退", (await api(a, `/api/v1/measurements/${entry.id}`)).status === 404 && (await api(a, "/api/v1/profile")).json.profile.weightKg === 79.2);
    check("重试旧新增请求不会复活已删记录", (await create(a, input, requestId)).status === 409);

    // 迁移前的未标记血压（无时段、无时间）可读取，编辑补选时段后照常维护。
    const legacyId = randomUUID();
    await pool.execute("INSERT INTO bodytrace_measurement (id, user_id, kind, date, time_zone, systolic, diastolic, request_id) VALUES (?, ?, 'bloodPressure', ?, 'Asia/Shanghai', 118, 76, ?)", [legacyId, a.id, yesterday, randomUUID()]);
    check("未标记时段的旧血压可读取且时段为空", (await api(a, `/api/v1/measurements/${legacyId}`)).json.entry.period === null);
    const relabeled = await api(a, `/api/v1/measurements/${legacyId}`, "PATCH", { version: 1, measurement: { kind: "bloodPressure", date: yesterday, period: "evening", systolic: 118, diastolic: 76, time: null, note: null } });
    check("编辑可为未标记血压补选时段", relabeled.status === 200 && relabeled.json.entry.period === "evening" && relabeled.json.entry.version === 2);
    assert.equal((await api(a, `/api/v1/measurements/${legacyId}`, "DELETE", { version: 2 })).status, 200);

    for (const remaining of (await api(a, "/api/v1/measurements?range=all")).json.entries.filter(row => row.kind === "weight")) {
      assert.equal((await api(a, `/api/v1/measurements/${remaining.id}`, "DELETE", { version: remaining.version })).status, 200);
    }
    check("删除全部体重后保留原资料参考，血压和体脂不受影响", (await api(a, "/api/v1/profile")).json.profile.weightKg === 80 && (await api(a, "/api/v1/measurements?range=all")).json.entries.length === 4);
    check("身体变化页面可正常读取", (await api(a, "/measurements")).status === 200);
    console.log(`${passed} 项身体指标集成检查通过。`);
  } finally {
    if (stop) await stop();
    for (const email of emails) await pool.execute("DELETE FROM bodytrace_user WHERE email = ?", [email]);
  }
}
