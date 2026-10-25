import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import * as dates from "../src/lib/date.ts";
import { MEAL_ORDER } from "../src/lib/nutrition.ts";
import { MEAL_PHOTO_MAX_BYTES } from "../src/lib/meal-photo.ts";

function load(path, modules, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText, { exports, Response, URL, File, console, ...globals, require: name => {
    if (!(name in modules)) throw new Error(`缺少依赖 ${name}`);
    return modules[name];
  } });
  return exports;
}
const slot = load("../src/services/meal-slot.ts", { zod: { z }, "@/lib/date": dates, "@/lib/nutrition": { MEAL_ORDER } });
const id = "158205a4-fb05-4e2d-b1dd-d85134cbad28";
function routes({ loggedIn = true, result = { ok: true, photo: { id }, created: true }, thrown = false } = {}) {
  const calls = [];
  const auth = load("../src/lib/api-auth.ts", {
    "next/headers": { headers: async () => new Headers() },
    "@/lib/auth": { auth: { api: { getSession: async () => loggedIn ? { user: { id: "owner" } } : null } } },
  }, { process: { env: { BETTER_AUTH_URL: "http://localhost:3001" } } });
  const modules = { zod: { z }, "@/lib/api-auth": auth, "@/services/meal-slot": slot,
    "@/lib/meal-photo": { MEAL_PHOTO_MAX_BYTES },
    "@/services/meal-photos": {
      addMealPhoto: async (...args) => { calls.push(args); if (thrown) throw new Error("模拟存储结果未知"); return result; },
      getMealPhotoRequest: async (...args) => { calls.push(args); if (thrown) throw new Error("模拟核对失败"); return result; },
      removeMealPhoto: async (...args) => { calls.push(args); return result.ok; },
    },
  };
  return {
    ...load("../src/app/api/v1/meal-photos/route.ts", modules),
    ...load("../src/app/api/v1/meal-photos/[photoId]/route.ts", modules), calls,
  };
}
function post(fields = {}, origin = "http://localhost:3001", bytes = new Uint8Array([1])) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ date: "2026-01-01", mealType: "lunch", requestId: id, ...fields })) {
    if (value !== null) form.set(key, value);
  }
  if (bytes !== null) form.set("file", new Blob([bytes]), "synthetic.webp");
  return new Request("http://localhost:3001/api/v1/meal-photos", { method: "POST", headers: { Origin: origin }, body: form });
}
test("新照片路由保留真实会话与 Origin 守卫，校验失败不触发服务", async () => {
  const anonymous = routes({ loggedIn: false });
  assert.equal((await anonymous.POST(post())).status, 401);
  assert.equal((await anonymous.GET(new Request(`http://localhost:3001/api/v1/meal-photos?requestId=${id}`))).status, 401);
  assert.equal((await anonymous.DELETE(new Request("http://localhost:3001"), { params: Promise.resolve({ photoId: id }) })).status, 401);
  assert.equal(anonymous.calls.length, 0);
  const app = routes();
  assert.equal((await app.POST(post({}, "https://untrusted.invalid"))).status, 401);
  for (const fields of [{date:null}, {date:"2026-02-30"}, {date:"9999-01-01"}, {mealType:"invalid"}, {requestId:"invalid"}])
    assert.equal((await app.POST(post(fields))).status, 400);
  assert.equal((await app.POST(post({}, undefined, null))).status, 400);
  assert.equal((await app.POST(post({}, undefined, new Uint8Array()))).status, 400);
  assert.equal((await app.POST(post({}, undefined, new Uint8Array(MEAL_PHOTO_MAX_BYTES + 1)))).status, 413);
  assert.equal((await app.DELETE(new Request("http://localhost:3001"), { params: Promise.resolve({photoId:"invalid"}) })).status, 400);
  assert.equal(app.calls.length, 0);
});
test("POST 从会话取得归属，并准确映射创建、重放、冲突与存储状态", async () => {
  const app = routes();
  assert.equal((await app.POST(post({ userId: "attacker" }))).status, 201);
  assert.equal(app.calls[0][0], "owner");
  assert.equal(app.calls[0][1].date, "2026-01-01");
  assert.equal(app.calls[0][1].mealType, "lunch");
  assert.ok(!("userId" in app.calls[0][1]));
  assert.equal(app.calls[0][3], id);
  assert.equal((await routes({result:{ok:true,photo:{id},created:false}}).POST(post())).status, 200);
  for (const [reason,status] of [["limit",400],["invalid_image",400],["conflict",409],["storage_unconfigured",503],["storage_failed",502]]) {
    const response = await routes({result:{ok:false,reason,message:"合成错误"}}).POST(post());
    assert.equal(response.status,status);
    assert.deepEqual(await response.json(),{error:"合成错误"});
  }
  const unknown = await routes({thrown:true}).POST(post());
  assert.equal(unknown.status,502);
  assert.match((await unknown.json()).error,/核对/);
});
test("GET 只按本人编号核对，DELETE 只接受照片编号", async () => {
  const app = routes({result:{ok:true,photo:null}});
  assert.equal((await app.GET(new Request("http://localhost:3001/api/v1/meal-photos"))).status,400);
  const response = await app.GET(new Request(`http://localhost:3001/api/v1/meal-photos?requestId=${id}`));
  assert.deepEqual(await response.json(),{photo:null});
  assert.deepEqual(app.calls[0],["owner",id]);
  assert.equal((await routes({result:{ok:false,message:"已删除"}}).GET(new Request(`http://localhost:3001/api/v1/meal-photos?requestId=${id}`))).status,409);
  assert.equal((await routes({thrown:true}).GET(new Request(`http://localhost:3001/api/v1/meal-photos?requestId=${id}`))).status,502);
  assert.equal((await app.DELETE(new Request("http://localhost:3001",{method:"DELETE"}),{params:Promise.resolve({photoId:id})})).status,200);
  assert.deepEqual(app.calls.at(-1),["owner",id]);
  assert.equal((await routes({result:{ok:false}}).DELETE(new Request("http://localhost:3001"),{params:Promise.resolve({photoId:id})})).status,404);
});
