/**
 * 饮食照片孤儿清理：对比 MySQL 里的对象 key 和 COS 当前前缀下的对象。
 *
 * 默认只报告，不删除；确认后加 --apply 才删除“COS 有、数据库没有有效照片引用，
 * 且上传时间超过 24 小时”的对象。数据库有、COS 没有的 key 也会报告，
 * 表示照片文件丢失，需要人工判断，脚本不会自动补文件。
 *
 * 用法：
 *   node scripts/cleanup-meal-photos.mjs
 *   node scripts/cleanup-meal-photos.mjs --apply
 *
 * 需要 COS 的 List 权限；测试和生产请分别确认 COS_UPLOAD_PATH_PREFIX。
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/mysql2";
import { isNull } from "drizzle-orm";
import { createMySqlPool } from "../src/db/connection.ts";
import * as schema from "../src/db/schema.ts";
import { mealPhoto } from "../src/db/schema.ts";
import { deleteMealPhotoObjects, listMealPhotoObjects } from "../src/lib/cos.ts";

const apply = process.argv.includes("--apply");
const MIN_AGE_MS = 24 * 60 * 60 * 1000;

const pool = createMySqlPool(1);
const db = drizzle(pool, { schema, mode: "default" });

try {
  const rows = await db
    .select({ objectKey: mealPhoto.objectKey, thumbKey: mealPhoto.thumbKey })
    .from(mealPhoto)
    .where(isNull(mealPhoto.deletedAt));
  const known = new Set(rows.flatMap((row) => [row.objectKey, row.thumbKey]));

  const objects = await listMealPhotoObjects();
  const objectKeys = new Set(objects.map((object) => object.key));
  const now = Date.now();
  const orphans = objects.filter(
    (object) => !known.has(object.key) && now - object.lastModified.getTime() > MIN_AGE_MS,
  );
  const missing = [...known].filter((key) => !objectKeys.has(key));

  console.log(`数据库照片对象：${known.size}`);
  console.log(`COS 当前前缀对象：${objects.length}`);
  console.log(`可清理的孤儿对象（超过 24 小时）：${orphans.length}`);
  console.log(`数据库有但 COS 缺失的对象：${missing.length}`);

  if (orphans.length > 0) {
    console.log("孤儿对象示例：");
    for (const object of orphans.slice(0, 5)) console.log(`  ${object.key}`);
  }
  if (missing.length > 0) {
    console.log("缺失对象示例（不会自动修复）：");
    for (const key of missing.slice(0, 5)) console.log(`  ${key}`);
  }

  if (!apply) {
    console.log("当前是 dry-run；确认后加 --apply 删除孤儿对象。");
  } else if (orphans.length > 0) {
    await deleteMealPhotoObjects(orphans.map((object) => object.key));
    console.log(`已删除 ${orphans.length} 个孤儿对象。`);
  } else {
    console.log("没有需要删除的孤儿对象。");
  }
} finally {
  await pool.end();
}
