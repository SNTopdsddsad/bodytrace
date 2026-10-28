import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as training from "../src/lib/training.ts";

const MAX_BYTES = 256 * 1024;
const requestId = "12000000-0000-4000-8000-000000000001";
const recordId = "12000000-0000-4000-8000-000000000002";
const base = "http://localhost:3001/api/v1/training-records";
const payload = changes => ({
  title: "合成训练 🏃", date: "2026-10-27", time: "08:30", mode: "manual", status: "inProgress",
  startedAt: null, durationMinutes: null, note: null, items: [], ...changes,
});

function load(path, modules, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, {
    exports, Response, URL, Uint8Array, TextDecoder, Intl, console, ...globals,
    require: name => {
      if (!(name in modules)) throw new Error(`缺少测试依赖 ${name}`);
      return modules[name];
    },
  });
  return exports;
}

function app({ loggedIn = true, timeZone = "Asia/Shanghai", result = {}, conflict = false } = {}) {
  let now = "2026-10-27T00:30:00.000Z";
  class ClockDate extends Date { constructor(value = now) { super(value); } }
  const calls = [];
  const auth = load("../src/lib/api-auth.ts", {
    "react": { cache: callback => callback },
    "next/headers": { headers: async () => new Headers() },
    "@/lib/auth": { auth: { api: { getSession: async () => loggedIn ? { user: { id: "owner-from-session" } } : null } } },
  }, { process: { env: { BETTER_AUTH_URL: "http://localhost:3001" } } });
  const request = load("../src/app/api/v1/training-records/request.ts", { "@/lib/training": training }, {
    Date: ClockDate, process: { env: { APP_TIMEZONE: timeZone } },
  });
  class TrainingConflict extends Error {}
  const invoke = (name, fallback) => async (...args) => {
    calls.push({ name, args });
    if (conflict) throw new TrainingConflict("合成版本冲突");
    return Object.hasOwn(result, name) ? result[name] : fallback;
  };
  const services = {
    TrainingConflict,
    listTrainingRecords: invoke("list", []),
    getTrainingByRequestId: invoke("request", null),
    getTrainingRecord: invoke("get", null),
    createTrainingRecord: invoke("create", { created: true, entry: { id: recordId } }),
    updateTrainingRecord: invoke("update", { id: recordId }),
    deleteTrainingRecord: invoke("delete", true),
  };
  const modules = { zod: { z }, "@/lib/training": training, "@/lib/api-auth": auth, "@/services/training": services, "./request": request, "../request": request };
  return {
    collection: load("../src/app/api/v1/training-records/route.ts", modules),
    single: load("../src/app/api/v1/training-records/[id]/route.ts", modules),
    clock: load("../src/app/api/v1/training-records/clock/route.ts", modules, { Date: ClockDate }),
    ...request, calls, setNow: value => { now = value; },
  };
}

function write(method, body, origin = "http://localhost:3001") {
  return new Request(base, { method, headers: { Origin: origin, "Content-Type": "application/json" }, body: JSON.stringify(body) });
}
const params = id => ({ params: Promise.resolve({ id }) });

test("时钟接口每次读取服务端 UTC 样本、禁止缓存，并校验会话和初始账号", async () => {
  const current = app();
  const request = new Request(`${base}/clock`, { headers: { "X-BodyTrace-User": "owner-from-session" } });
  const first = await current.clock.GET(request);
  assert.equal(first.status, 200);
  assert.equal(first.headers.get("Cache-Control"), "private, no-store");
  assert.deepEqual(await first.json(), { serverNow: "2026-10-27T00:30:00.000Z" });
  current.setNow("2026-10-27T00:30:02.000Z");
  assert.deepEqual(await (await current.clock.GET(request)).json(), { serverNow: "2026-10-27T00:30:02.000Z" });
  assert.equal((await app({ loggedIn: false }).clock.GET(request)).status, 401);
  assert.equal((await current.clock.GET(new Request(`${base}/clock`, { headers: { "X-BodyTrace-User": "old-user" } }))).status, 401);
  assert.equal(current.calls.length, 0, "校时不查询或改写业务记录");
});

function streamRequest(bytes, { length, chunkSize = 8191 } = {}) {
  let offset = 0;
  let cancelled = false;
  const stream = new ReadableStream({
    pull(controller) {
      if (offset === bytes.length) { controller.close(); return; }
      const end = Math.min(offset + chunkSize, bytes.length);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  return {
    request: new Request(base, { method: "POST", duplex: "half", body: stream, headers: length === undefined ? {} : { "Content-Length": String(length) } }),
    wasCancelled: () => cancelled,
  };
}

test("真实分块流允许恰好 256 KiB，超过上限会取消读取；不能信任伪造的小 Content-Length", async () => {
  const { readTrainingBody } = app();
  const exact = new TextEncoder().encode("{}" + " ".repeat(MAX_BYTES - 2));
  const accepted = await readTrainingBody(streamRequest(exact).request);
  assert.equal(accepted.ok, true);
  assert.deepEqual(JSON.parse(JSON.stringify(accepted.body)), {});
  const oversized = new Uint8Array(MAX_BYTES + 1).fill(32);
  for (const length of [undefined, 1]) {
    const input = streamRequest(oversized, { length });
    const result = await readTrainingBody(input.request);
    assert.equal(result.ok, false);
    assert.equal(result.response.status, 413);
    assert.equal(input.wasCancelled(), true);
    assert.equal(input.request.body.locked, false);
  }
});

test("请求体按 UTF-8 字节计数，拒绝非法 UTF-8、坏 JSON 与流读取失败", async () => {
  const { readTrainingBody } = app();
  const valid = new TextEncoder().encode(JSON.stringify({ title: "训练 🏃" }));
  const accepted = await readTrainingBody(streamRequest(valid, { chunkSize: 1 }).request);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.body.title, "训练 🏃", "跨分块的中文和 emoji 不能损坏");
  for (const bytes of [new Uint8Array([34, 255, 34]), new TextEncoder().encode("{broken"), new Uint8Array()]) {
    const result = await readTrainingBody(streamRequest(bytes).request);
    assert.equal(result.ok, false);
    assert.equal(result.response.status, 400);
  }
  const unicode = streamRequest(new TextEncoder().encode(JSON.stringify({ text: "中".repeat(90000) })));
  assert.equal((await readTrainingBody(unicode.request)).response.status, 413);
  const broken = new Request(base, { method: "POST", duplex: "half", body: new ReadableStream({ start(controller) { controller.error(new Error("连接中断")); } }) });
  assert.equal((await readTrainingBody(broken)).response.status, 400);
  assert.equal(broken.body.locked, false);
});

test("实际会话与 Origin 守卫在读取和写入前生效，归属只能来自会话", async () => {
  const anonymous = app({ loggedIn: false });
  assert.equal((await anonymous.collection.GET(new Request(base))).status, 401);
  assert.equal((await anonymous.collection.POST(write("POST", { requestId, training: payload() }))).status, 401);
  assert.equal((await anonymous.single.GET(new Request(base), params(recordId))).status, 401);
  assert.equal((await anonymous.single.PATCH(write("PATCH", { version: 1, training: payload() }), params(recordId))).status, 401);
  assert.equal((await anonymous.single.DELETE(write("DELETE", { version: 1 }), params(recordId))).status, 401);
  assert.equal(anonymous.calls.length, 0);
  const current = app();
  assert.equal((await current.collection.POST(write("POST", { requestId, training: payload() }, "https://untrusted.invalid"))).status, 401);
  for (const body of [{ requestId, training: payload(), userId: "other-user" }, { requestId, training: payload({ userId: "other-user" }) }]) {
    assert.equal((await current.collection.POST(write("POST", body))).status, 400);
  }
  assert.equal(current.calls.length, 0);
  assert.equal((await current.collection.POST(write("POST", { requestId, training: payload() }))).status, 201);
  assert.equal(current.calls[0].args[0], "owner-from-session");
});

test("查询参数必须有效；requestId 查询独立于列表并保留不存在与删除冲突区别", async () => {
  const current = app();
  for (const query of ["range=365", "kind=unknown", "status=done", "requestId=bad", "userId=another-user", "range="]) {
    assert.equal((await current.collection.GET(new Request(`${base}?${query}`))).status, 400, query);
  }
  assert.equal(current.calls.length, 0);
  assert.equal((await current.collection.GET(new Request(base))).status, 200);
  assert.deepEqual(JSON.parse(JSON.stringify(current.calls[0])), { name: "list", args: ["owner-from-session", { range: "30", kind: "all", status: "all" }] });
  const response = await current.collection.GET(new Request(`${base}?requestId=${requestId}&range=7`));
  assert.deepEqual(await response.json(), { entry: null });
  assert.deepEqual(current.calls[1], { name: "request", args: ["owner-from-session", requestId] });
  assert.equal((await app({ conflict: true }).collection.GET(new Request(`${base}?requestId=${requestId}`))).status, 409);
});

test("所有训练读写可核对初始账号，旧标签页的账号头不能改变资源归属", async () => {
  const current = app();
  const routes = expectedUserId => {
    const withAccount = request => { request.headers.set("X-BodyTrace-User", expectedUserId); return request; };
    return [
      () => current.collection.GET(withAccount(new Request(base))),
      () => current.collection.GET(withAccount(new Request(`${base}?requestId=${requestId}`))),
      () => current.single.GET(withAccount(new Request(base)), params(recordId)),
      () => current.collection.POST(withAccount(write("POST", { requestId, training: payload() }))),
      () => current.single.PATCH(withAccount(write("PATCH", { version: 1, training: payload() })), params(recordId)),
      () => current.single.DELETE(withAccount(write("DELETE", { version: 1 })), params(recordId)),
    ];
  };
  for (const expectedUserId of ["previous-user", ""]) {
    for (const run of routes(expectedUserId)) {
      const response = await run();
      assert.equal(response.status, 401);
      assert.deepEqual(await response.json(), { error: "账号已切换，请重新打开训练记录" });
    }
  }
  assert.equal(current.calls.length, 0, "账号不一致时不能查询或修改任何业务资源");
  for (const run of routes("owner-from-session")) assert.notEqual((await run()).status, 401);
  assert.equal(current.calls.length, 6);
  assert.ok(current.calls.every(call => call.args[0] === "owner-from-session"));
  const anonymous = app({ loggedIn: false });
  const spoofed = new Request(base, { headers: { "X-BodyTrace-User": "owner-from-session" } });
  assert.equal((await anonymous.collection.GET(spoofed)).status, 401);
  assert.equal(anonymous.calls.length, 0, "账号头本身不能证明登录或授予资源访问权");
});

test("写入参数和路由 ID 校验先于服务调用，返回真实创建、重试、缺失和冲突状态", async () => {
  const current = app();
  for (const body of [null, {}, { requestId, training: payload({ date: "2026-02-30" }) }, { requestId, training: payload({ status: "completed" }) }]) {
    assert.equal((await current.collection.POST(write("POST", body))).status, 400);
  }
  assert.equal((await current.single.GET(new Request(base), params("bad"))).status, 400);
  assert.equal((await current.single.PATCH(write("PATCH", { version: 0, training: payload() }), params(recordId))).status, 400);
  assert.equal((await current.single.DELETE(write("DELETE", { version: 1, userId: "other" }), params(recordId))).status, 400);
  assert.equal(current.calls.length, 0);
  assert.equal((await app({ result: { create: { created: false, entry: { id: recordId } } } }).collection.POST(write("POST", { requestId, training: payload() }))).status, 200);
  assert.equal((await app({ conflict: true }).collection.POST(write("POST", { requestId, training: payload() }))).status, 409);
  assert.equal((await current.single.GET(new Request(base), params(recordId))).status, 404);
  assert.equal((await app({ result: { update: null } }).single.PATCH(write("PATCH", { version: 1, training: payload() }), params(recordId))).status, 404);
  assert.equal((await app({ conflict: true }).single.PATCH(write("PATCH", { version: 1, training: payload() }), params(recordId))).status, 409);
  assert.equal((await app({ result: { delete: false } }).single.DELETE(write("DELETE", { version: 1 }), params(recordId))).status, 404);
  assert.equal((await app({ conflict: true }).single.DELETE(write("DELETE", { version: 1 }), params(recordId))).status, 409);
});

test("服务端每次按应用时区取当前时间，跨午夜和时区不受宿主机本地日期影响", () => {
  const shanghai = app();
  shanghai.setNow("2026-10-26T16:00:00.000Z");
  assert.equal(shanghai.currentTrainingSchemas().payload.safeParse(payload({ time: "00:00" })).success, true);
  assert.equal(shanghai.currentTrainingSchemas().payload.safeParse(payload({ time: "00:01" })).success, false);
  shanghai.setNow("2026-10-26T16:01:00.000Z");
  assert.equal(shanghai.currentTrainingSchemas().payload.safeParse(payload({ time: "00:01" })).success, true, "新请求不能沿用上次捕获的分钟");
  assert.equal(shanghai.currentTrainingSchemas().payload.safeParse(payload({ mode: "live", time: "00:01", startedAt: "2026-10-27T00:01:00+08:00" })).success, true);
  assert.equal(shanghai.currentTrainingSchemas().payload.safeParse(payload({ mode: "live", time: "00:01", startedAt: "2026-10-26T16:01:00.001Z" })).success, false);
  const losAngeles = app({ timeZone: "America/Los_Angeles" });
  losAngeles.setNow("2026-10-27T00:30:00.000Z");
  assert.equal(losAngeles.currentTrainingSchemas().payload.safeParse(payload({ date: "2026-10-26", time: "17:30" })).success, true);
  assert.equal(losAngeles.currentTrainingSchemas().payload.safeParse(payload({ date: "2026-10-27", time: null })).success, false);
});
