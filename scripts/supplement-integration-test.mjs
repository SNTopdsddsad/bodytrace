import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { startLocalTestApp } from "./lib/local-test-app.mjs";

const { base, pool, stop } = await startLocalTestApp();
const emails = [];
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
const yesterdayDate = new Date(`${today}T00:00:00Z`);
yesterdayDate.setUTCDate(yesterdayDate.getUTCDate() - 1);
const yesterday = yesterdayDate.toISOString().slice(0, 10);
const tomorrowDate = new Date(`${today}T00:00:00Z`);
tomorrowDate.setUTCDate(tomorrowDate.getUTCDate() + 1);
const tomorrow = tomorrowDate.toISOString().slice(0, 10);
let passed = 0;

function check(name, condition) {
  assert(condition, name);
  passed += 1;
  console.log(`✓ ${name}`);
}

async function api(user, path, method = "GET", body, origin = base) {
  const response = await fetch(base + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      Origin: origin,
      Cookie: user?.cookie ?? "",
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: "manual",
    signal: AbortSignal.timeout(45_000),
  });
  const text = await response.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    /* HTML 页面响应保留 text。 */
  }
  return { status: response.status, json, text, response };
}

async function signup() {
  const email = `supplement_${randomUUID()}@bodytrace.dev`;
  emails.push(email);
  const result = await api(null, "/api/auth/sign-up/email", "POST", {
    name: "补剂集成合成测试",
    email,
    password: "SupplementTest2026!",
  });
  assert.equal(result.status, 200);
  const id = result.json.user.id;
  return {
    id,
    cookie: result.response.headers
      .getSetCookie()
      .map((value) => value.split(";")[0])
      .join("; "),
  };
}

try {
  const a = await signup();
  const b = await signup();

  check("未登录无法读取补剂面板", (await api(null, "/api/v1/supplements")).status === 401);
  check("非法日期查询返回 400", (await api(a, "/api/v1/supplements?date=2026-02-30")).status === 400);

  // 1. 新增多时段（不同份数）补剂 + 复方规格补剂 + 按需补剂
  const magRes = await api(a, "/api/v1/supplements", "POST", {
    name: "甘氨酸镁 💊",
    defaultQuantity: 1,
    unit: "粒",
    spec: "200mg",
    mode: "scheduled",
    schedule: [
      { slot: "bedtime", quantity: 2 },
      { slot: "breakfast", quantity: 1 },
    ],
    weekdays: null,
    note: "早晚分服",
  });
  assert.equal(magRes.status, 201);
  const mag = magRes.json.supplement;
  check(
    "多时段补剂按规范顺序保存且支持 emoji 与不同时段份数",
    mag.name === "甘氨酸镁 💊" &&
      mag.schedule.length === 2 &&
      mag.schedule[0].slot === "breakfast" &&
      mag.schedule[0].quantity === 1 &&
      mag.schedule[1].slot === "bedtime" &&
      mag.schedule[1].quantity === 2,
  );

  const dkRes = await api(a, "/api/v1/supplements", "POST", {
    name: "维生素 D3 + K2",
    defaultQuantity: 1,
    unit: "粒",
    spec: "D3 2000IU + K2 100mcg",
    mode: "scheduled",
    schedule: [{ slot: "breakfast", quantity: 1 }],
  });
  assert.equal(dkRes.status, 201);
  const dk = dkRes.json.supplement;

  const vcRes = await api(a, "/api/v1/supplements", "POST", {
    name: "复合维生素",
    defaultQuantity: 1,
    unit: "片",
    mode: "asNeeded",
    schedule: [],
  });
  assert.equal(vcRes.status, 201);
  const vc = vcRes.json.supplement;
  check("极简补剂允许省略规格说明直接保存", vc.spec === null && vc.mode === "asNeeded");

  check(
    "伪造 Origin 的写请求被拒绝",
    (
      await api(
        a,
        "/api/v1/supplements",
        "POST",
        { name: "恶意", defaultQuantity: 1, unit: "粒", mode: "asNeeded", schedule: [] },
        "https://evil.example.com",
      )
    ).status === 401,
  );

  // 2. 单条打卡幂等、冲突与未来日期校验
  const reqId1 = randomUUID();
  const intakePayload = {
    supplementId: mag.id,
    date: yesterday,
    slot: "bedtime",
    takenTime: "22:30",
    note: "助眠",
  };
  const firstTake = await api(a, "/api/v1/supplements/intakes", "POST", {
    requestId: reqId1,
    intake: intakePayload,
  });
  assert.equal(firstTake.status, 201);
  const entry1 = firstTake.json.entry;
  check(
    "按补剂库打卡自动套用对应时段份数（睡前 2 粒）并保存快照",
    entry1.quantity === 2 &&
      entry1.unit === "粒" &&
      entry1.spec === "200mg" &&
      entry1.name === "甘氨酸镁 💊" &&
      entry1.date === yesterday,
  );

  const replayTake = await api(a, "/api/v1/supplements/intakes", "POST", {
    requestId: reqId1,
    intake: intakePayload,
  });
  check("相同 requestId 重试幂等返回同一条记录（200）", replayTake.status === 200 && replayTake.json.entry.id === entry1.id);

  const conflictTake = await api(a, "/api/v1/supplements/intakes", "POST", {
    requestId: reqId1,
    intake: { ...intakePayload, quantity: 3 },
  });
  check("相同 requestId 提交不同内容返回 409", conflictTake.status === 409);

  check(
    "未来日期打卡被拒绝",
    (
      await api(a, "/api/v1/supplements/intakes", "POST", {
        requestId: randomUUID(),
        intake: { ...intakePayload, date: tomorrow },
      })
    ).status === 400,
  );

  // 3. 批量“本时段全服”与幂等重放
  const batchItems = [
    {
      requestId: randomUUID(),
      intake: { supplementId: mag.id, date: today, slot: "breakfast", takenTime: "08:15", note: null },
    },
    {
      requestId: randomUUID(),
      intake: { supplementId: dk.id, date: today, slot: "breakfast", takenTime: "08:15", note: null },
    },
  ];
  const batchFirst = await api(a, "/api/v1/supplements/intakes/batch", "POST", { items: batchItems });
  assert.equal(batchFirst.status, 201);
  assert.equal(batchFirst.json.entries.length, 2);
  const batchReplay = await api(a, "/api/v1/supplements/intakes/batch", "POST", { items: batchItems });
  check(
    "本时段全服单事务写入且支持幂等重放",
    batchReplay.status === 200 &&
      batchReplay.json.entries[0].id === batchFirst.json.entries[0].id &&
      batchReplay.json.entries[1].id === batchFirst.json.entries[1].id,
  );

  // 4. 临时记录（不进补剂库）
  const adhocRes = await api(a, "/api/v1/supplements/intakes", "POST", {
    requestId: randomUUID(),
    intake: {
      supplementId: null,
      date: today,
      slot: "anytime",
      name: "电解质粉",
      quantity: 1,
      unit: "袋",
      spec: null,
      takenTime: "15:20",
      note: "出汗补水",
    },
  });
  check("临时记录保存成功且标记 isAdhoc", adhocRes.status === 201 && adhocRes.json.entry.isAdhoc === true && adhocRes.json.entry.supplementId === null);

  // 5. 乐观锁修改与丢失响应重试、软删除防复活
  const updatedPayload = { date: yesterday, slot: "bedtime", quantity: 1.5, takenTime: "23:00", note: "减半尝试" };
  const patched = await api(a, `/api/v1/supplements/intakes/${entry1.id}`, "PATCH", {
    version: 1,
    intake: updatedPayload,
  });
  check("修改单次记录递增 version 并更新数量与备注", patched.status === 200 && patched.json.entry.version === 2 && patched.json.entry.quantity === 1.5);
  check(
    "丢失响应后的同内容 PATCH 重试安全返回成功",
    (await api(a, `/api/v1/supplements/intakes/${entry1.id}`, "PATCH", { version: 1, intake: updatedPayload })).status === 200,
  );
  check(
    "旧版本修改不同内容返回 409",
    (
      await api(a, `/api/v1/supplements/intakes/${entry1.id}`, "PATCH", {
        version: 1,
        intake: { ...updatedPayload, quantity: 3 },
      })
    ).status === 409,
  );

  const deleted1 = await api(a, `/api/v1/supplements/intakes/${entry1.id}`, "DELETE", { version: 2 });
  const deletedRetry = await api(a, `/api/v1/supplements/intakes/${entry1.id}`, "DELETE", { version: 2 });
  check("软删除及同版本重试返回 200", deleted1.status === 200 && deletedRetry.status === 200);
  check(
    "重放已删记录的旧 requestId 返回 409 不复活",
    (await api(a, "/api/v1/supplements/intakes", "POST", { requestId: reqId1, intake: intakePayload })).status === 409,
  );

  // 6. 账号严格隔离
  check("另一账号补剂面板不包含他人数据", (await api(b, "/api/v1/supplements")).json.supplements.length === 0);
  check("另一账号无法修改他人补剂", (await api(b, `/api/v1/supplements/${mag.id}`, "PATCH", { name: "偷改" })).status === 404);
  check("另一账号无法删除他人补剂", (await api(b, `/api/v1/supplements/${mag.id}`, "DELETE")).status === 404);
  check(
    "另一账号无法引用他人补剂打卡",
    (
      await api(b, "/api/v1/supplements/intakes", "POST", {
        requestId: randomUUID(),
        intake: { supplementId: mag.id, date: today, slot: "breakfast" },
      })
    ).status === 404,
  );
  const breakfastIntakeId = batchFirst.json.entries[0].id;
  check(
    "另一账号无法修改他人服用记录",
    (
      await api(b, `/api/v1/supplements/intakes/${breakfastIntakeId}`, "PATCH", {
        version: 1,
        intake: updatedPayload,
      })
    ).status === 404,
  );
  check(
    "另一账号无法删除他人服用记录",
    (await api(b, `/api/v1/supplements/intakes/${breakfastIntakeId}`, "DELETE", { version: 1 })).status === 404,
  );

  // 7. 修改/暂停/删除补剂库条目不回写历史快照
  assert.equal((await api(a, `/api/v1/supplements/${mag.id}`, "PATCH", { name: "新镁品牌", defaultQuantity: 4, spec: "500mg" })).status, 200);
  assert.equal((await api(a, `/api/v1/supplements/${mag.id}`, "PATCH", { status: "paused" })).status, 200);
  assert.equal((await api(a, `/api/v1/supplements/${dk.id}`, "DELETE")).status, 200);
  const dashAfter = (await api(a, `/api/v1/supplements?date=${today}`)).json;
  const magSnap = dashAfter.intakes.find((row) => row.id === batchFirst.json.entries[0].id);
  const dkSnap = dashAfter.intakes.find((row) => row.id === batchFirst.json.entries[1].id);
  check(
    "改名/暂停/删除补剂后历史服用快照完好保留",
    magSnap.name === "甘氨酸镁 💊" &&
      magSnap.quantity === 1 &&
      magSnap.spec === "200mg" &&
      dkSnap.supplementId === null &&
      dkSnap.name === "维生素 D3 + K2" &&
      dkSnap.spec === "D3 2000IU + K2 100mcg",
  );

  // 8. 一键清空：清空补剂服用日志（含软删行），保留个人补剂库
  const clearRes = await api(a, "/api/v1/records", "DELETE");
  assert.equal(clearRes.status, 200);
  const dashCleared = (await api(a, `/api/v1/supplements?date=${today}`)).json;
  check(
    "一键清空清除全部补剂服用日志（含软删）且保留个人补剂库",
    clearRes.json.cleared.supplementIntakes === 4 &&
      dashCleared.intakes.length === 0 &&
      dashCleared.supplements.length === 2,
  );

  // 9. 页面 SSR 渲染检查
  check("/supplements 独立页面正常渲染", (await api(a, "/supplements")).status === 200);
  check("/supplements?date= 历史日期正常渲染", (await api(a, `/supplements?date=${yesterday}`)).status === 200);
  check("未登录访问 /supplements 重定向登录页", (await api(null, "/supplements")).status === 307);

  const createPlan = { requestId: randomUUID(), name: "幂等测试", defaultQuantity: 1, unit: "粒", mode: "asNeeded" };
  const planPath = "/api/v1/supplements";
  const createResults = await Promise.all(Array.from({ length: 4 }, () => api(b, planPath, "POST", createPlan)));
  assert.deepEqual(createResults.map(r => r.status).sort(), [200, 200, 200, 201]);
  const planId = createResults[0].json.supplement.id;
  check("并发创建同一补剂只写一项", createResults.every(r => r.json.supplement.id === planId));
  assert.equal((await api(b, planPath, "POST", { ...createPlan, unit: "片" })).status, 409);
  const otherOwner = await api(a, planPath, "POST", createPlan);
  check("不同账号相同建库请求编号彼此独立", otherOwner.status === 201 && otherOwner.json.supplement.id !== planId);
  assert.equal((await api(b, `${planPath}/${planId}`, "PATCH", { name: "更新后的补剂" })).status, 200);
  assert.equal((await api(b, planPath, "POST", createPlan)).json.supplement.name, "更新后的补剂");
  assert.equal((await api(b, `${planPath}/${planId}`, "DELETE")).status, 200);
  check("删除补剂后重放建库请求不会重新建档", (await api(b, planPath, "POST", createPlan)).status === 409);

  const intakePath = planPath + "/intakes";
  const once = { requestId: randomUUID(), intake: { date: today, name: "并发测试", quantity: 1, unit: "粒" } };
  const replayResults = await Promise.all(Array.from({ length: 4 }, () => api(b, intakePath, "POST", once)));
  assert.deepEqual(replayResults.map(r => r.status).sort(), [200, 200, 200, 201]);
  check("并发打卡重放返回同一个记录", new Set(replayResults.map(r => r.json.entry.id)).size === 1);
  const overlap = { ...once, requestId: randomUUID() };
  const [single, batch] = await Promise.all([
    api(b, intakePath, "POST", overlap),
    api(b, intakePath + "/batch", "POST", { items: [overlap, { ...once, requestId: randomUUID() }] }),
  ]);
  check("批量与单条并发重放共享同一记录", [200, 201].includes(single.status) &&
    batch.status === 201 && batch.json.entries[0].id === single.json.entry.id);
  check("极小正数在 API 层返回 400", (await api(b, planPath, "POST", { ...createPlan, defaultQuantity: 1e-10 })).status === 400);

  console.log(`\n${passed} 项补剂集成检查通过。`);
} finally {
  try {
    await stop();
  } finally {
    try {
      for (const email of emails) {
        await pool.execute("DELETE FROM bodytrace_user WHERE email = ?", [email]);
      }
    } finally {
      await pool.end();
    }
  }
}
