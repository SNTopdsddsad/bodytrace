import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { z } from "zod";
import { MEAL_ORDER } from "../src/lib/nutrition.ts";
import * as dates from "../src/lib/date.ts";
import { MEAL_PHOTO_MAX, MEAL_PHOTO_MAX_BYTES } from "../src/lib/meal-photo.ts";

const source = ts.transpileModule(readFileSync(new URL("../src/services/meal-photos.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;
const slotExports = {};
vm.runInNewContext(ts.transpileModule(readFileSync(new URL("../src/services/meal-slot.ts", import.meta.url), "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText, { exports: slotExports, require: name => {
  if (name === "zod") return { z };
  if (name === "@/lib/date") return dates;
  if (name === "@/lib/nutrition") return { MEAL_ORDER };
  throw new Error(name);
} });
const file = new File(["synthetic-photo"], "photo.webp", { type: "image/webp" });
const hash = createHash("sha256").update("synthetic-photo").digest("hex");
const row = { id: "photo-a", userId: "user-a", date: "2026-01-01", mealType: "breakfast", requestId: "request-a", contentHash: hash, deletedAt: null,
  objectKey: "main.webp", thumbKey: "thumb.webp", width: 80, height: 60, position: 0 };

function service(photos = [row], urlForKey = async key => `https://photos.invalid/${key}`) {
  const table = keys => Object.fromEntries(keys.map(key => [key, key]));
  const user = table(["id"]);
  const mealPhoto = table(Object.keys(row));
  let reads = 0;
  const db = { select() {
    reads++;
    let records = [];
    const query = {
      from(target) { records = target === user ? [{id: "user-a"}] : photos; return query; },
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
      if (name === "./meal-slot") return slotExports;
      if (name === "@/db") return { db };
      if (name === "@/db/schema") return { user, mealPhoto };
      if (name === "@/lib/meal-photo") return { MEAL_PHOTO_MAX, MEAL_PHOTO_MAX_BYTES };
      if (name === "@/lib/cos") return { getMealPhotoUrl: urlForKey,
        isPhotoStorageConfigured: unexpected, buildMealPhotoKeys: unexpected, putMealPhotoObjects: unexpected };
      if (name === "@/lib/meal-photo-image") return { processMealPhoto: unexpected };
      throw new Error(name);
    },
  });
  return { ...exports, reads: () => reads };
}

test("满六张后的成功重放在配额检查、转码和存储操作之前返回原照片", async () => {
  const app = service([row, ...Array.from({ length: 5 }, (_, i) => ({ ...row, id: `other-${i}`, requestId: `other-${i}` }))]);
  const result = await app.addMealPhoto("user-a", { date: row.date, mealType: row.mealType }, file, "request-a");
  assert.equal(result.ok, true);
  assert.equal(result.created, false);
  assert.equal(result.photo.id, "photo-a");
  assert.equal(app.reads(), 1);
});

test("同编号不同文件、不同日期或餐次以及已删除照片均拒绝重放", async () => {
  for (const [record, slot] of [
    [{ ...row, contentHash: "different" }, { date: row.date, mealType: row.mealType }],
    [row, { date: row.date, mealType: "lunch" }],
    [row, { date: "2026-01-02", mealType: row.mealType }],
    [{ ...row, deletedAt: new Date() }, { date: row.date, mealType: row.mealType }],
  ]) {
    const result = await service([record]).addMealPhoto("user-a", slot, file, "request-a");
    assert.equal(result.ok, false);
    assert.equal(result.reason, "conflict");
  }
});

test("核对上传结果区分未落库、已删除、已完成和他人记录", async () => {
  const app = service();
  assert.equal((await app.getMealPhotoRequest("user-a", "missing")).photo, null);
  assert.equal((await app.getMealPhotoRequest("user-a", "request-a")).photo.id, "photo-a");
  assert.equal((await app.getMealPhotoRequest("user-b", "request-a")).photo, null);
  assert.equal((await service([{ ...row, deletedAt: new Date() }]).getMealPhotoRequest("user-a", "request-a")).reason, "conflict");
});

test("日记照片读取排除删除标记与其他账号照片", async () => {
  const app = service([row, { ...row, id: "deleted", deletedAt: new Date() }, { ...row, id: "foreign", userId: "user-b" }, { ...row, id: "other-day", date: "2026-01-02" }]);
  const photos = await app.getPhotosForDay("user-a", row.date);
  assert.deepEqual(Array.from(photos.get("breakfast"), photo => photo.id), ["photo-a"]);
});


test("非法餐次和未来日期在读取数据库、处理图片前被拒绝", async () => {
  for (const slot of [
    { date: "2026-02-30", mealType: "breakfast" },
    { date: "2026-1-01", mealType: "breakfast" },
    { date: "9999-01-01", mealType: "breakfast" },
    { date: "2026-01-01", mealType: "invalid" },
  ]) {
    const app = service();
    assert.equal((await app.addMealPhoto("user-a", slot, file, "request-a")).reason, "invalid_slot");
    assert.equal(app.reads(), 0);
  }
});

test("单张地址失败不影响当天其他照片，核对失败不能当作未上传", async () => {
  const app = service([row, { ...row, id: "broken", objectKey: "broken" }], async key => {
    if (key === "broken") throw new Error("模拟地址失败");
    return `https://photos.invalid/${key}`;
  });
  assert.deepEqual(Array.from((await app.getPhotosForDay("user-a", row.date)).get("breakfast"), p => p.id), ["photo-a"]);
  const broken = service([row], async () => { throw new Error("模拟地址失败"); });
  await assert.rejects(broken.getMealPhotoRequest("user-a", row.requestId), /模拟地址失败/);
});

function uncertainService(reads) {
  const removed = [], uploaded = [];
  const table = keys => Object.fromEntries(keys.map(key => [key, key]));
  const db = {
    select() {
      const query = {
        from() { return query; }, where() { return query; },
        then(resolve, reject) {
          const value = reads.shift();
          return (value instanceof Error ? Promise.reject(value) : Promise.resolve(value)).then(resolve, reject);
        },
      };
      return query;
    },
    async transaction() { throw new Error("模拟 COMMIT 结果丢失"); },
  };
  const exports = {};
  vm.runInNewContext(source, { exports, Buffer, Error, console: { error() {} }, require: name => {
    if (name === "node:crypto") return { createHash };
    if (name === "drizzle-orm") return { eq() {}, and() {}, isNull() {}, count() {} };
    if (name === "@/db") return { db };
    if (name === "@/db/schema") return { mealPhoto: table(Object.keys(row)), user: table(["id"]) };
    if (name === "./meal-slot") return slotExports;
    if (name === "@/lib/meal-photo") return { MEAL_PHOTO_MAX, MEAL_PHOTO_MAX_BYTES };
    if (name === "@/lib/meal-photo-image") return { processMealPhoto: async () => ({ main:Buffer.from("main"),thumb:Buffer.from("thumb"),width:80,height:60,mimeType:"image/webp",byteSize:9 }) };
    if (name === "@/lib/cos") return {
      isPhotoStorageConfigured: () => true,
      buildMealPhotoKeys: () => ({objectKey:row.objectKey,thumbKey:row.thumbKey}),
      putMealPhotoObjects: async keys => uploaded.push(keys),
      deleteMealPhotoObjects: async keys => removed.push(...keys),
      getMealPhotoUrl: async key => `https://photos.invalid/${key}`,
    };
    throw new Error(name);
  } });
  return { ...exports, removed, uploaded };
}

test("COMMIT 响应丢失但已经入库时保留对象并返回原照片", async () => {
  const app = uncertainService([[], [{value:0}], [{id:row.id}], [row]]);
  const result = await app.addMealPhoto("user-a", {date:row.date,mealType:row.mealType}, file, row.requestId);
  assert.equal(result.ok, true);
  assert.equal(result.photo.id, row.id);
  assert.equal(result.created, false);
  assert.equal(app.uploaded.length, 1);
  assert.equal(app.removed.length, 0);
});

test("提交未知且数据库不可读时保留对象；确认无引用才清理", async () => {
  const unreadable = uncertainService([[], [{value:0}], new Error("读失败"), new Error("读失败")]);
  const result = await unreadable.addMealPhoto("user-a", {date:row.date,mealType:row.mealType}, file, row.requestId);
  assert.equal(result.reason, "storage_failed");
  assert.equal(unreadable.removed.length, 0);
  const missing = uncertainService([[], [{value:0}], [], []]);
  assert.equal((await missing.addMealPhoto("user-a", {date:row.date,mealType:row.mealType}, file, row.requestId)).reason, "storage_failed");
  assert.deepEqual(missing.removed, [row.objectKey,row.thumbKey]);
});
