import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { withRequestTimeout } from "../src/lib/request-timeout.ts";
import { MEAL_PHOTO_MAX_BYTES } from "../src/lib/meal-photo.ts";

const apiExports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/api-client.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: apiExports, Error, fetch: (...args) => globalThis.fetch(...args) });
const { api, apiForm, ApiError } = apiExports;

const exports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/lib/meal-photo-client.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, {
  exports, Error, FormData, AbortSignal,
  require: name => {
    if (name === "./api-client") return { api, apiForm, ApiError };
    if (name === "./request-timeout") return { withRequestTimeout };
    if (name === "./meal-photo") return { MEAL_PHOTO_MAX_BYTES };
    throw new Error(name);
  },
});
const { uploadMealPhoto } = exports;
const requestId = "158205a4-fb05-4e2d-b1dd-d85134cbad28";
const file = new File(["synthetic"], "photo.webp", { type: "image/webp" });
const photo = { date: "2026-01-01", mealType: "breakfast", id: "photo-id", url: "/main", thumbUrl: "/thumb", width: 80, height: 60, position: 0 };

test("上传前先核对 requestId，POST 携带原文件和相同编号", async t => {
  const calls = [];
  t.mock.method(globalThis, "fetch", async (url, init) => {
    calls.push({ url, init });
    if (calls.length === 1) return Response.json({ photo: null });
    return Response.json({ photo }, { status: 201 });
  });
  assert.deepEqual(await uploadMealPhoto({ date: "2026-01-01", mealType: "breakfast" }, file, requestId), photo);
  assert.equal(calls.length, 2);
  assert.ok(calls[0].url.endsWith(`?requestId=${requestId}`));
  assert.equal(calls[1].init.body.get("requestId"), requestId);
  assert.equal(calls[1].url, "/api/v1/meal-photos");
  assert.equal(calls[1].init.body.get("date"), "2026-01-01");
  assert.equal(calls[1].init.body.get("mealType"), "breakfast");
  assert.equal(await calls[1].init.body.get("file").text(), "synthetic");
});

test("服务端已保存但响应丢失时只查询确认，不再次 POST", async t => {
  let committed = false;
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    if (init.method === "POST") { posts++; committed = true; throw new TypeError("network lost"); }
    return Response.json({ photo: committed ? photo : null });
  });
  assert.deepEqual(await uploadMealPhoto({ date: "2026-01-01", mealType: "breakfast" }, file, requestId), photo);
  assert.deepEqual(await uploadMealPhoto({ date: "2026-01-01", mealType: "breakfast" }, file, requestId), photo);
  assert.equal(posts, 1);
});

test("服务端尚未确认时保留失败；下一次重试先查询成功结果", async t => {
  let committed = false;
  let posts = 0;
  t.mock.method(globalThis, "fetch", async (_url, init) => {
    if (init.method === "POST") { posts++; throw new TypeError("network lost"); }
    return Response.json({ photo: committed ? photo : null });
  });
  await assert.rejects(uploadMealPhoto({ date: "2026-01-01", mealType: "breakfast" }, file, requestId), /network lost/);
  committed = true;
  assert.deepEqual(await uploadMealPhoto({ date: "2026-01-01", mealType: "breakfast" }, file, requestId), photo);
  assert.equal(posts, 1);
});

test("查询失败、已删除冲突或损坏响应不能触发上传", async t => {
  for (const response of [
    () => Response.json({ error: "查询失败" }, { status: 502 }),
    () => Response.json({ error: "这张照片已删除" }, { status: 409 }),
    () => new Response("broken", { status: 200 }),
  ]) {
    let posts = 0;
    t.mock.method(globalThis, "fetch", async (_url, init) => { if (init.method === "POST") posts++; return response(); });
    await assert.rejects(uploadMealPhoto({ date: "2026-01-01", mealType: "breakfast" }, file, requestId));
    assert.equal(posts, 0);
  }
});

test("关闭操作取消后，不再查询或发送后续上传", async t => {
  const controller = new AbortController();
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; controller.abort(); return Response.json({ photo: null }); });
  await assert.rejects(uploadMealPhoto({ date: "2026-01-01", mealType: "breakfast" }, file, requestId, controller.signal));
  assert.equal(calls, 1);
});


test("请求编号核对到其他日期或餐次时拒绝复用，也不继续 POST", async t => {
  for (const other of [{ ...photo, date: "2026-01-02" }, { ...photo, mealType: "dinner" }]) {
    let posts = 0;
    t.mock.method(globalThis, "fetch", async (_url, init) => { if (init.method === "POST") posts++; return Response.json({ photo: other }); });
    await assert.rejects(uploadMealPhoto({ date: photo.date, mealType: photo.mealType }, file, requestId), /其他餐次/);
    assert.equal(posts, 0);
  }
});
