import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

/** 只通过隔离应用创建合成账号；退出时停止自己的应用并删除本轮账号。 */
export async function runTrainingChecks({ base, pool, stop }) {
  const emails = [];
  let passed = 0;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
  const shift = days => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + days);
    return date.toISOString().slice(0, 10);
  };
  const yesterday = shift(-1);
  const check = (name, condition) => { assert(condition, name); passed++; console.log(`✓ ${name}`); };
  async function api(owner, path, method = "GET", body, origin = base) {
    const response = await fetch(base + path, {
      method, headers: { "Content-Type": "application/json", Origin: origin, Cookie: owner?.cookie ?? "" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      redirect: "manual", signal: AbortSignal.timeout(45_000),
    });
    const text = await response.text();
    let json;
    try { json = JSON.parse(text); } catch { /* 页面另用 text 验证。 */ }
    return { status: response.status, json, text, response };
  }
  async function signup() {
    const email = `training_${randomUUID()}@bodytrace.dev`;
    emails.push(email);
    const result = await api(null, "/api/auth/sign-up/email", "POST", {
      name: "训练合成测试", email, password: "TrainingTest2026!",
    });
    assert.equal(result.status, 200, "合成账号应成功创建");
    const id = result.json.user.id;
    const [[stored]] = await pool.execute("SELECT id FROM bodytrace_user WHERE id = ? AND email = ?", [id, email]);
    assert(stored, "应用与清理连接必须指向同一个测试数据库");
    return { id, cookie: result.response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
  }
  const workout = (changes = {}) => ({
    title: "晚间混合训练 🏋️", date: yesterday, time: "18:30", mode: "manual", status: "inProgress",
    startedAt: null, durationMinutes: null, note: "先力量，再跑步 🏃", items: [], ...changes,
  });
  const strength = () => ({
    id: randomUUID(), kind: "strength", name: "杠铃深蹲", mode: "weighted",
    sets: [
      { id: randomUUID(), weightKg: 42.5, reps: 8, durationSeconds: null, completed: true },
      { id: randomUUID(), weightKg: null, reps: null, durationSeconds: null, completed: false },
    ],
  });
  const cardio = () => ({ id: randomUUID(), kind: "cardio", name: "跑步", durationMinutes: 20, distanceKm: 2.75, completed: true });
  const create = (owner, training, requestId = randomUUID()) => api(owner, "/api/v1/training-records", "POST", { requestId, training });
  const all = owner => api(owner, "/api/v1/training-records?range=all&kind=all&status=all");

  try {
    const a = await signup();
    const b = await signup();
    const input = workout({ items: [strength(), cardio()] });
    const requestId = randomUUID();
    check("未登录不能读取或新增训练", (await all(null)).status === 401 && (await create(null, input)).status === 401);
    check("训练空列表如实返回", (await all(a)).json.entries.length === 0);
    check("未知提交编号查询为空", (await api(a, `/api/v1/training-records?requestId=${requestId}`)).json.entry === null);
    for (const query of ["range=invalid", "kind=invalid", "status=invalid", "requestId=invalid"]) {
      assert.equal((await api(a, `/api/v1/training-records?${query}`)).status, 400, query);
    }
    check("非法筛选与请求编号被拒绝", true);
    check("无效日期与未来日期被拒绝", (await create(a, { ...input, date: "2026-02-30" })).status === 400 && (await create(a, { ...input, date: shift(1) })).status === 400);
    check("超过请求体上限时明确拒绝，不能部分写入", (await create(a, { ...input, note: "x".repeat(300_000) })).status === 413);
    check("没有完成内容不能完成整场训练", (await create(a, workout({ status: "completed" }))).status === 400);
    const incomplete = strength();
    incomplete.sets[0].reps = null;
    check("已完成组缺少次数时服务端拒绝保存", (await create(a, workout({ items: [incomplete] }))).status === 400);
    check("伪造归属和 Origin 不能写入", (await create(a, { ...input, userId: b.id })).status === 400 && (await api(a, "/api/v1/training-records", "POST", { requestId, training: input }, "https://evil.example.com")).status === 401);

    const first = await create(a, input, requestId);
    assert.equal(first.status, 201);
    const entry = first.json.entry;
    check("混合项目、中文与 emoji、日期时间及精度往返一致", entry.title === input.title && entry.note === input.note && entry.date === yesterday && entry.time === "18:30" && entry.timeZone === "Asia/Shanghai" && entry.items[0].sets[0].weightKg === 42.5 && entry.items[1].distanceKm === 2.75);
    assert.deepEqual(entry.items, input.items, "项目顺序、组编号与未知值应完整保存");
    check("新训练从版本 1 开始，未填整场时长保持空值", entry.version === 1 && entry.durationMinutes === null);
    check("详情可找回同一训练", (await api(a, `/api/v1/training-records/${entry.id}`)).json.entry.id === entry.id);
    const repeat = await create(a, input, requestId);
    check("同请求同内容重试返回原记录", repeat.status === 200 && repeat.json.entry.id === entry.id);
    check("同请求不同内容返回冲突", (await create(a, { ...input, title: "不同训练" }, requestId)).status === 409);
    check("请求编号可核对保存结果", (await api(a, `/api/v1/training-records?requestId=${requestId}`)).json.entry.id === entry.id);

    const concurrentId = randomUUID();
    const concurrentInput = workout({ title: "并发重复提交", items: [strength()] });
    const concurrent = await Promise.all([create(a, concurrentInput, concurrentId), create(a, concurrentInput, concurrentId)]);
    check("并发重复提交只产生一条训练", concurrent.filter(result => result.status === 201).length === 1 && concurrent.every(result => [200, 201].includes(result.status)) && concurrent[0].json.entry.id === concurrent[1].json.entry.id);

    check("另一账号的列表与请求查询不泄露训练", (await all(b)).json.entries.length === 0 && (await api(b, `/api/v1/training-records?requestId=${requestId}`)).json.entry === null);
    const detailPath = `/api/v1/training-records/${entry.id}`;
    check("另一账号不能读改删训练", (await api(b, detailPath)).status === 404 && (await api(b, detailPath, "PATCH", { version: 1, training: input })).status === 404 && (await api(b, detailPath, "DELETE", { version: 1 })).status === 404);
    check("未登录不能读详情或编辑删除", (await api(null, detailPath)).status === 401 && (await api(null, detailPath, "PATCH", { version: 1, training: input })).status === 401 && (await api(null, detailPath, "DELETE", { version: 1 })).status === 401);
    check("不存在与非法编号处理明确", (await api(a, `/api/v1/training-records/${randomUUID()}`)).status === 404 && (await api(a, "/api/v1/training-records/not-a-uuid")).status === 400);
    const otherOwner = await create(b, input, requestId);
    check("幂等编号按用户隔离", otherOwner.status === 201 && otherOwner.json.entry.id !== entry.id);

    const changedInput = {
      ...input, title: "已完成混合训练 💪", status: "completed", durationMinutes: 65,
      items: [input.items[1], { ...input.items[0], sets: [{ ...input.items[0].sets[0], reps: 10 }] }],
    };
    const changed = await api(a, detailPath, "PATCH", { version: 1, training: changedInput });
    assert.equal(changed.status, 200);
    check("编辑完成训练并更新版本", changed.json.entry.status === "completed" && changed.json.entry.durationMinutes === 65 && changed.json.entry.version === 2);
    assert.deepEqual(changed.json.entry.items, changedInput.items, "重排项目和删组后按最新内容读取");
    check("编辑响应丢失后可重放同一次修改", (await api(a, detailPath, "PATCH", { version: 1, training: changedInput })).status === 200);
    check("旧版本编辑和删除不能覆盖新内容", (await api(a, detailPath, "PATCH", { version: 1, training: { ...changedInput, note: "过期修改" } })).status === 409 && (await api(a, detailPath, "DELETE", { version: 1 })).status === 409);
    check("旧新增请求不能把已编辑训练改回旧内容", (await create(a, input, requestId)).status === 409 && (await api(a, detailPath)).json.entry.version === 2);
    check("无效完成操作不改变已保存训练", (await api(a, detailPath, "PATCH", { version: 2, training: { ...changedInput, items: [] } })).status === 400 && (await api(a, detailPath)).json.entry.items.length === 2);

    const strengthOnly = await create(a, workout({ title: "纯力量", status: "completed", items: [strength()] }));
    const cardioOnly = await create(a, workout({ title: "纯有氧", status: "completed", items: [cardio()] }));
    const old = await create(a, workout({ title: "历史补录", date: shift(-100) }));
    assert.equal(strengthOnly.status, 201);
    assert.equal(cardioOnly.status, 201);
    assert.equal(old.status, 201);
    const liveInput = workout({ title: "进行中的现场记录", mode: "live", startedAt: `${yesterday}T10:30:00.000Z` });
    const live = await create(a, liveInput);
    assert.equal(live.status, 201);
    const livePath = `/api/v1/training-records/${live.json.entry.id}`;
    check("现场开始时刻不可被后续编辑替换", (await api(a, livePath, "PATCH", { version: 1, training: { ...liveInput, startedAt: `${yesterday}T09:30:00.000Z` } })).status === 409);
    check("现场与补录模式不可被后续编辑切换", (await api(a, livePath, "PATCH", { version: 1, training: { ...liveInput, mode: "manual", startedAt: null } })).status === 409);
    const listed = (await all(a)).json.entries;
    check("同日多场训练分别保留，历史补录可在全部范围找到", listed.length === 6 && listed.some(row => row.id === old.json.entry.id));
    const recent = await api(a, "/api/v1/training-records?range=7");
    check("近七天过滤排除更早训练", recent.json.entries.length === 5 && recent.json.entries.every(row => row.id !== old.json.entry.id));
    const mixed = await api(a, "/api/v1/training-records?range=all&kind=mixed&status=completed");
    check("混合与完成状态可组合筛选", mixed.json.entries.length === 1 && mixed.json.entries[0].id === entry.id);
    const onlyStrength = await api(a, "/api/v1/training-records?range=all&kind=strength");
    check("纯力量筛选不混入混合训练", onlyStrength.json.entries.length === 2 && onlyStrength.json.entries.every(row => row.id !== entry.id));
    const onlyCardio = await api(a, "/api/v1/training-records?range=all&kind=cardio");
    check("纯有氧筛选返回对应训练", onlyCardio.json.entries.length === 1 && onlyCardio.json.entries[0].id === cardioOnly.json.entry.id);
    check("进行中筛选不包含已完成训练", (await api(a, "/api/v1/training-records?range=all&status=inProgress")).json.entries.length === 3);
    const page = await api(a, "/training?range=all");
    check("训练页面能渲染已保存训练", page.status === 200 && page.text.includes("已完成混合训练"));

    check("删除训练成功且同次删除可重试", (await api(a, detailPath, "DELETE", { version: 2 })).status === 200 && (await api(a, detailPath, "DELETE", { version: 2 })).status === 200);
    check("删除后列表与详情不再返回训练", (await api(a, detailPath)).status === 404 && !(await all(a)).json.entries.some(row => row.id === entry.id));
    check("已删除编号查询与新增重放不能复活记录", (await api(a, `/api/v1/training-records?requestId=${requestId}`)).status === 409 && (await create(a, input, requestId)).status === 409);

    const profile = { gender: null, heightCm: 175, weightKg: 80, targetWeightKg: 75 };
    assert.equal((await api(a, "/api/v1/profile", "PUT", profile)).status, 200);
    assert.equal((await api(a, "/api/v1/goals", "PUT", { calories: 2200, protein: 120, carbs: 250, fat: 60 })).status, 200);
    const foodsBefore = (await api(a, "/api/v1/foods")).json.foods;
    assert(foodsBefore.length > 0);
    assert.equal((await api(a, "/api/v1/meals", "POST", { date: yesterday, mealType: "dinner", foodId: foodsBefore[0].id, grams: 100 })).status, 201);
    assert.equal((await api(a, "/api/v1/measurements", "POST", { requestId: randomUUID(), measurement: { kind: "weight", date: yesterday, value: "79.5" } })).status, 201);
    check("未登录不能清空训练", (await api(null, "/api/v1/records", "DELETE")).status === 401);
    const cleared = await api(a, "/api/v1/records", "DELETE");
    check("清空返回训练硬删除数量并包含删除标记", cleared.status === 200 && cleared.json.cleared.trainingRecords === 6 && cleared.json.cleared.mealEntries === 1 && cleared.json.cleared.measurements === 1 && cleared.json.cleared.mealPhotos === 0);
    const [[remaining]] = await pool.execute("SELECT COUNT(*) AS total FROM bodytrace_training_record WHERE user_id = ?", [a.id]);
    check("清空后本人训练表与列表均为空", remaining.total === 0 && (await all(a)).json.entries.length === 0);
    check("清空保留食物库、目标与资料", (await api(a, "/api/v1/foods")).json.foods.length === foodsBefore.length && (await api(a, "/api/v1/goals")).json.goals.calories === 2200 && (await api(a, "/api/v1/profile")).json.profile.heightCm === 175);
    check("清空不影响另一账号训练", (await all(b)).json.entries.length === 1 && (await api(b, `/api/v1/training-records/${otherOwner.json.entry.id}`)).status === 200);
    check("重复清空返回零条训练", (await api(a, "/api/v1/records", "DELETE")).json.cleared.trainingRecords === 0);
    check("硬清空释放编号，旧队列必须由客户端丢弃", (await create(a, input, requestId)).status === 201);
    assert.equal((await api(a, "/api/v1/records", "DELETE")).status, 200);
    console.log(`${passed} 项训练记录集成检查通过。`);
  } finally {
    try {
      if (stop) await stop();
    } finally {
      for (const email of emails) await pool.execute("DELETE FROM bodytrace_user WHERE email = ?", [email]);
    }
  }
}
