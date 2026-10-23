import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { MEAL_PHOTO_MAX, MEAL_PHOTO_MAX_BYTES } from "../src/lib/meal-photo.ts";

const source = ts.transpileModule(readFileSync(new URL("../src/services/meal-photos.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const file = new File(["synthetic-photo"], "photo.webp", { type: "image/webp" });
const hash = createHash("sha256").update("synthetic-photo").digest("hex");
const row = { id: "photo-a", userId: "user-a", entryId: "entry-a", requestId: "request-a", contentHash: hash, deletedAt: null,
  objectKey: "main.webp", thumbKey: "thumb.webp", width: 80, height: 60, position: 0 };

function service(photos = [row]) {
  const table = keys => Object.fromEntries(keys.map(key => [key, key]));
  const mealEntry = table(["id", "userId"]);
  const mealPhoto = table(Object.keys(row));
  const entries = [{ id: "entry-a", userId: "user-a" }, { id: "entry-b", userId: "user-a" }];
  let reads = 0;
  const db = { select() {
    reads++;
    let records = [];
    const query = {
      from(target) { records = target === mealEntry ? entries : photos; return query; },
      where(predicate) { records = records.filter(predicate); return query; },
      orderBy() { return query; }, limit(n) { records = records.slice(0, n); return query; },
      then(resolve, reject) { return Promise.resolve(records).then(resolve, reject); },
    };
    return query;
  } };
  const unexpected = () => { throw new Error("重放不应处理图片、查询配额或写入 COS"); };
  const exports = {};
  vm.runInNewContext(source, { exports, Buffer, Error, console,
    require: name => {
      if (name === "node:crypto") return { createHash };
      if (name === "drizzle-orm") return {
        eq: (key, value) => item => item[key] === value,
        isNull: key => item => item[key] == null,
        inArray: (key, values) => item => values.includes(item[key]),
        and: (...predicates) => item => predicates.every(predicate => predicate(item)),
        asc: key => key, count: unexpected,
      };
      if (name === "@/db") return { db };
      if (name === "@/db/schema") return { mealEntry, mealPhoto };
      if (name === "@/lib/meal-photo") return { MEAL_PHOTO_MAX, MEAL_PHOTO_MAX_BYTES };
      if (name === "@/lib/cos") return { getMealPhotoUrl: async key => `https://photos.invalid/${key}`,
        isPhotoStorageConfigured: unexpected, buildMealPhotoKeys: unexpected, putMealPhotoObjects: unexpected };
      if (name === "@/lib/meal-photo-image") return { processMealPhoto: unexpected };
      throw new Error(name);
    },
  });
  return { ...exports, reads: () => reads };
}

test("满六张后的成功重放在配额检查、转码和存储操作之前返回原照片", async () => {
  const app = service([row, ...Array.from({ length: 5 }, (_, i) => ({ ...row, id: `other-${i}`, requestId: `other-${i}` }))]);
  const result = await app.addMealPhoto("user-a", "entry-a", file, "request-a");
  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.photo.id, "photo-a");
  assert.equal(app.reads(), 2);
});

test("同编号不同文件、不同记录以及已删除照片均拒绝重放", async () => {
  for (const [record, entryId] of [
    [{ ...row, contentHash: "different" }, "entry-a"],
    [row, "entry-b"],
    [{ ...row, deletedAt: new Date() }, "entry-a"],
  ]) {
    const result = await service([record]).addMealPhoto("user-a", entryId, file, "request-a");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "conflict");
  }
});

test("核对上传结果区分未落库、已删除、已完成和他人记录", async () => {
  const app = service();
  assert.equal((await app.getMealPhotoRequest("user-a", "entry-a", "missing")).photo, null);
  assert.equal((await app.getMealPhotoRequest("user-a", "entry-a", "request-a")).photo.id, "photo-a");
  assert.equal((await app.getMealPhotoRequest("user-b", "entry-a", "request-a")).reason, "entry_not_found");
  assert.equal((await service([{ ...row, deletedAt: new Date() }]).getMealPhotoRequest("user-a", "entry-a", "request-a")).reason, "conflict");
});

test("日记照片读取排除删除标记与其他账号照片", async () => {
  const app = service([row, { ...row, id: "deleted", deletedAt: new Date() }, { ...row, id: "foreign", userId: "user-b" }]);
  const photos = await app.getPhotosForEntries("user-a", ["entry-a"]);
  assert.deepEqual(Array.from(photos.get("entry-a"), photo => photo.id), ["photo-a"]);
});
