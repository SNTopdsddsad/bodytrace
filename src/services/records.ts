/**
 * 记录清空服务：跨饮食记录与身体指标的一键清空与计数。
 *
 * 清空只删除“用户记录的数据”，食物库、目标、计划和个人资料等配置不动；
 * 两个表的删除放在同一事务里，避免清一半失败留下不一致状态。
 */
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { mealEntry, measurement } from "@/db/schema";
import { deletePhotoObjectsBestEffort, getPhotoKeysForUser } from "./meal-photos";

export type RecordCounts = { mealEntries: number; measurements: number };

/** 当前用户可见的记录数量（身体指标不含已软删除的行），供清空确认展示。 */
export async function getRecordCounts(userId: string): Promise<RecordCounts> {
  const [meals, measurements] = await Promise.all([
    db.select({ value: count() }).from(mealEntry).where(eq(mealEntry.userId, userId)),
    db
      .select({ value: count() })
      .from(measurement)
      .where(and(eq(measurement.userId, userId), isNull(measurement.deletedAt))),
  ]);
  return { mealEntries: meals[0]?.value ?? 0, measurements: measurements[0]?.value ?? 0 };
}

/**
 * 一键清空：硬删除当前用户全部饮食记录与身体指标，
 * 包括此前软删除的测量行（真正移除数据，请求编号等唯一键一并释放）。
 */
export async function clearAllRecords(userId: string): Promise<RecordCounts> {
  // 先取 COS key；事务失败时对象仍然有用，不能提前删除。
  const photoKeys = await getPhotoKeysForUser(userId);
  const cleared = await db.transaction(async (tx) => {
    const [mealsResult] = await tx.delete(mealEntry).where(eq(mealEntry.userId, userId));
    const [measurementsResult] = await tx.delete(measurement).where(eq(measurement.userId, userId));
    return { mealEntries: mealsResult.affectedRows, measurements: measurementsResult.affectedRows };
  });
  await deletePhotoObjectsBestEffort(photoKeys.flatMap((row) => [row.objectKey, row.thumbKey]));
  return cleared;
}
