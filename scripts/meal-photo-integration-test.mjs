import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import sharp from "sharp";
import { checkMealPhotoMigration } from "./lib/meal-photo-migration-check.mjs";
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
function upload(owner, mealType, requestId, content = bytes, day = date) {
  const form = new FormData();
  form.append("file", new Blob([content], { type: "image/avif" }), "synthetic.avif");
  form.append("date", day);
  form.append("mealType", mealType);
  if (requestId !== undefined) form.append("requestId", requestId);
  return request(owner, "/api/v1/meal-photos", "POST", form);
}
const lookup = (owner, requestId) => request(owner, `/api/v1/meal-photos?requestId=${requestId}`);
const objectCount = async () => (await readdir(photoStorageDirectory).catch(error => { if (error.code === "ENOENT") return []; throw error; })).length;
try {
  await checkMealPhotoMigration(pool);
  const a = await signup(), b = await signup();
  const requestId = randomUUID();
  assert.equal((await lookup(null, requestId)).status, 401);
  assert.equal((await upload(null, "breakfast", requestId)).status, 401);
  assert.equal((await request(null, `/api/v1/meal-photos/${randomUUID()}`, "DELETE")).status, 401);
  assert.equal((await request(a, "/api/v1/meal-photos")).status, 400);
  assert.equal((await lookup(a, "invalid-id")).status, 400);
  assert.equal((await upload(a, "breakfast", "invalid-id")).status, 400);
  assert.equal((await upload(a, "invalid", randomUUID())).status, 400);
  for (const invalid of ["2026-02-30", "2026-2-01", "9999-01-01"])
    assert.equal((await upload(a, "breakfast", randomUUID(), bytes, invalid)).status, 400);
  assert.equal((await upload(a, "breakfast", randomUUID(), new Uint8Array())).status, 400);
  assert.equal((await upload(a, "breakfast", randomUUID(), new Uint8Array(8 * 1024 * 1024 + 1))).status, 413);
  assert.equal((await upload(a, "breakfast", randomUUID(), new TextEncoder().encode("broken"))).status, 400);
  assert.deepEqual((await lookup(a, requestId)).json, { photo: null });

  // 首张照片没有任何食物父行；同编号并发仍只生成一条数据、一套 COS 对象。
  const concurrent = await Promise.all(Array.from({ length: 4 }, () => upload(a, "breakfast", requestId)));
  assert.equal(concurrent.filter(result => result.status === 201).length, 1);
  assert.ok(concurrent.every(result => [200, 201].includes(result.status)));
  const first = concurrent[0].json.photo;
  assert.equal(first.date, date);
  assert.equal(first.mealType, "breakfast");
  assert.ok(concurrent.every(result => result.json.photo.id === first.id));
  assert.equal(await objectCount(), 2);
  assert.equal((await lookup(a, requestId)).json.photo.id, first.id);
  assert.deepEqual((await lookup(b, requestId)).json, { photo: null });
  assert.equal((await upload(a, "breakfast", requestId, otherBytes)).status, 409);
  assert.equal((await upload(a, "lunch", requestId)).status, 409);
  assert.equal((await upload(a, "breakfast", requestId, bytes, "2000-01-01")).status, 409);
  assert.equal((await upload(b, "breakfast", requestId)).status, 201, "不同用户可用相同编号");
  const capacity = await Promise.all(Array.from({ length: 8 }, () => upload(a, "breakfast", randomUUID())));
  assert.equal(capacity.filter(result => result.status === 201).length, 5);
  assert.equal(capacity.filter(result => result.status === 400).length, 3);
  assert.equal((await upload(a, "breakfast", requestId)).status, 200, "满六张仍能重放");
  assert.equal((await request(b, `/api/v1/meal-photos/${first.id}`, "DELETE")).status, 404);
  assert.equal((await request(a, `/api/v1/meal-photos/${first.id}`, "DELETE")).status, 200);
  assert.equal((await request(a, `/api/v1/meal-photos/${first.id}`, "DELETE")).status, 404);
  assert.equal((await lookup(a, requestId)).status, 409);
  assert.equal((await upload(a, "breakfast", requestId)).status, 409);
  const replacement = await upload(a, "breakfast", randomUUID());
  assert.equal(replacement.status, 201);
  assert.equal(replacement.json.photo.position, 6, "删除后不复用排序值");
  const aEntry = await entry(a);
  await request(a, `/api/v1/meals/${aEntry}`, "DELETE");
  const meals = await request(a, `/api/v1/meals?date=${date}`);
  assert.equal(meals.json.entries.length, 0);
  assert.equal(meals.json.photos.length, 6);
  const summary = await request(a, `/api/v1/summary?date=${date}`);
  assert.equal(summary.json.byMeal.find(group => group.mealType === "breakfast").photos.length, 6);
  assert.equal(summary.json.totals.calories, 0);
  const lunchRequest = randomUUID();
  const lunch = await upload(a, "lunch", lunchRequest);
  assert.equal(lunch.status, 201, "换餐独立配额");
  assert.equal((await upload(a, "lunch")).status, 201, "兼容无编号上传");
  const profile = await fetch(base + "/profile", { headers: { Cookie: a.cookie } });
  assert.equal(profile.status, 200);
  assert.match(await profile.text(), /8.*张照片/);
  const [replayDuringDelete, removed] = await Promise.all([
    upload(a, "lunch", lunchRequest),
    request(a, `/api/v1/meal-photos/${lunch.json.photo.id}`, "DELETE"),
  ]);
  assert.ok([200, 409].includes(replayDuringDelete.status));
  assert.equal(removed.status, 200);
  assert.equal((await lookup(a, lunchRequest)).status, 409, "并发重放不能使已删除照片复活");
  const cleared = await request(a, "/api/v1/records", "DELETE");
  assert.equal(cleared.status, 200);
  assert.equal(cleared.json.cleared.mealPhotos, 9, "清空计数包含删除标记");
  assert.equal(await objectCount(), 2, "只保留另一个用户的对象");
  const [[remaining]] = await pool.execute("SELECT COUNT(*) AS total FROM bodytrace_meal_photo WHERE user_id = ?", [a.id]);
  assert.equal(remaining.total, 0);
  assert.equal((await request(a, "/api/v1/records", "DELETE")).json.cleared.mealPhotos, 0);
  assert.equal((await upload(a, "breakfast", requestId)).status, 201, "硬清空释放编号，旧请求可以重新创建（已约定的边界）");

  // 并发清空/上传允许上传排在清空之后，但不得误删仍有引用的对象或漏清已删除对象。
  await Promise.all([upload(a, "dinner", randomUUID()), request(a, "/api/v1/records", "DELETE")]);
  const [live] = await pool.execute("SELECT object_key, thumb_key FROM bodytrace_meal_photo WHERE deleted_at IS NULL AND user_id IN (?, ?)", [a.id, b.id]);
  assert.equal(await objectCount(), live.length * 2);
  await request(a, "/api/v1/records", "DELETE");
  assert.equal(await objectCount(), 2);
  console.log("照片集成检查通过：迁移、空餐、校验、并发幂等与配额、归属、删除独立性、硬清空及旧请求边界。");
} finally {
  try { await stop(); } finally {
    try { for (const email of emails) await pool.execute("DELETE FROM bodytrace_user WHERE email = ?", [email]); }
    finally { await pool.end(); }
  }
}
