import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import sharp from "sharp";
import { startLocalTestApp } from "./lib/local-test-app.mjs";

const emails = [];
const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Shanghai" }).format(new Date());
const bytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#336699" } }).avif().toBuffer();
const otherBytes = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#ffffff" } }).png().toBuffer();
const { base, pool, stop, photoStorageDirectory } = await startLocalTestApp({ photoStorageMock: true });
async function request(owner, path, method = "GET", body) {
  const form = body instanceof FormData;
  const response = await fetch(base + path, {
    method, headers: { Origin: base, Cookie: owner?.cookie ?? "", ...(form ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: form ? body : JSON.stringify(body) }),
    signal: AbortSignal.timeout(45_000),
  });
  const json = await response.json();
  return { status: response.status, json, response };
}
async function signup() {
  const email = `photos_${randomUUID()}@bodytrace.dev`; emails.push(email);
  const result = await request(null, "/api/auth/sign-up/email", "POST", { email, name: "照片合成测试", password: "PhotoTest2026!" });
  assert.equal(result.status, 200);
  return { id: result.json.user.id, cookie: result.response.headers.getSetCookie().map(value => value.split(";")[0]).join("; ") };
}
async function entry(owner) {
  const foods = await request(owner, "/api/v1/foods");
  const result = await request(owner, "/api/v1/meals", "POST", { date, mealType: "breakfast", foodId: foods.json.foods[0].id, grams: 100 });
  assert.equal(result.status, 201);
  return result.json.entry.id;
}
function upload(owner, entryId, requestId, content = bytes) {
  const form = new FormData();
  form.append("file", new Blob([content], { type: "image/avif" }), "synthetic.avif");
  if (requestId !== undefined) form.append("requestId", requestId);
  return request(owner, `/api/v1/meals/${entryId}/photos`, "POST", form);
}
const lookup = (owner, entryId, requestId) => request(owner, `/api/v1/meals/${entryId}/photos?requestId=${requestId}`);
const objectCount = async () => (await readdir(photoStorageDirectory).catch(error => { if (error.code === "ENOENT") return []; throw error; })).length;
try {
  const a = await signup(), b = await signup();
  const aEntry = await entry(a), anotherEntry = await entry(a), bEntry = await entry(b);
  const requestId = randomUUID();
  assert.equal((await lookup(null, aEntry, requestId)).status, 401);
  assert.equal((await upload(null, aEntry, requestId)).status, 401);
  assert.equal((await lookup(b, aEntry, requestId)).status, 404);
  assert.equal((await upload(b, aEntry, requestId)).status, 404);
  assert.equal((await upload(a, aEntry, "invalid-id")).status, 400);
  assert.deepEqual((await lookup(a, aEntry, requestId)).json, { photo: null });

  const concurrent = await Promise.all(Array.from({ length: 4 }, () => upload(a, aEntry, requestId)));
  assert.equal(concurrent.filter(result => result.status === 201).length, 1);
  assert.ok(concurrent.every(result => [200, 201].includes(result.status)));
  const first = concurrent[0].json.photo;
  assert.ok(concurrent.every(result => result.json.photo.id === first.id));
  assert.equal(await objectCount(), 2, "并发重试只保留一套主图与缩略图");
  assert.equal((await lookup(a, aEntry, requestId)).json.photo.id, first.id);
  assert.equal((await upload(a, aEntry, requestId, otherBytes)).status, 409);
  assert.equal((await upload(a, anotherEntry, requestId)).status, 409);
  assert.equal((await upload(b, bEntry, requestId)).status, 201, "不同用户可以独立使用相同请求编号");

  for (let i = 0; i < 5; i++) assert.equal((await upload(a, aEntry, randomUUID())).status, 201);
  assert.equal((await upload(a, aEntry, randomUUID())).status, 400);
  assert.equal((await upload(a, aEntry, requestId)).status, 200, "满六张后成功请求仍能重放");
  assert.equal((await request(b, `/api/v1/meals/${aEntry}/photos/${first.id}`, "DELETE")).status, 404);
  assert.equal((await request(a, `/api/v1/meals/${aEntry}/photos/${first.id}`, "DELETE")).status, 200);
  assert.equal((await lookup(a, aEntry, requestId)).status, 409);
  assert.equal((await upload(a, aEntry, requestId)).status, 409, "删除后旧请求不能复活照片");
  assert.equal((await upload(a, aEntry, randomUUID())).status, 201, "删除释放可见照片配额");
  const meals = await request(a, `/api/v1/meals?date=${date}`);
  assert.equal(meals.json.entries.find(row => row.id === aEntry).photos.length, 6);
  assert.equal((await upload(a, anotherEntry)).status, 201, "兼容不携带 requestId 的旧客户端");
  assert.equal((await upload(a, anotherEntry)).status, 201);
  assert.equal((await request(a, `/api/v1/meals/${aEntry}`, "DELETE")).status, 200);
  const [[remaining]] = await pool.execute("SELECT COUNT(*) AS total FROM bodytrace_meal_photo WHERE entry_id = ?", [aEntry]);
  assert.equal(remaining.total, 0, "记录删除连同照片幂等标记一并级联清理");
  assert.equal((await request(a, "/api/v1/records", "DELETE")).status, 200);
  assert.equal(await objectCount(), 2, "清空本人记录只保留其他用户的照片对象");
  console.log("照片集成检查通过：归属、AVIF、并发幂等、冲突、配额、删除重放、旧客户端和清空。");
} finally {
  try { await stop(); } finally {
    try { for (const email of emails) await pool.execute("DELETE FROM bodytrace_user WHERE email = ?", [email]); }
    finally { await pool.end(); }
  }
}
