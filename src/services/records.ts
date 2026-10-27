/**
 * 记录清空服务：饮食、照片、身体指标与训练的一键清空与计数。
 *
 * 清空只删除“用户记录的数据”，食物库、目标、计划和个人资料等配置不动；
 * 四类数据的删除放在同一事务里，避免清一半失败留下不一致状态。
 */
import { and, count, eq, isNull } from "drizzle-orm";
import { db } from "@/db";
import { mealEntry, mealPhoto, measurement, trainingRecord, user } from "@/db/schema";
import { deletePhotoObjectsBestEffort } from "./meal-photos";

export type RecordCounts = { mealEntries: number; measurements: number; mealPhotos: number; trainingRecords: number };

/** 当前用户可见数量（排除指标、照片和训练删除标记），供清空确认展示。 */
export async function getRecordCounts(userId: string): Promise<RecordCounts> {
  const [meals, measurements, photos, training] = await Promise.all([
    db.select({ value: count() }).from(mealEntry).where(eq(mealEntry.userId, userId)),
    db
      .select({ value: count() })
      .from(measurement)
      .where(and(eq(measurement.userId, userId), isNull(measurement.deletedAt))),
    db.select({ value: count() }).from(mealPhoto)
      .where(and(eq(mealPhoto.userId, userId), isNull(mealPhoto.deletedAt))),
    db.select({ value: count() }).from(trainingRecord)
      .where(and(eq(trainingRecord.userId, userId), isNull(trainingRecord.deletedAt))),
  ]);
  return { mealEntries: meals[0]?.value ?? 0, measurements: measurements[0]?.value ?? 0, mealPhotos: photos[0]?.value ?? 0, trainingRecords: training[0]?.value ?? 0 };
}

/**
 * 一键清空：硬删除当前用户全部饮食、餐次照片、身体指标与训练，
 * 包括此前软删除的行；返回数量包含标记，请求编号等唯一键一并释放。
 */
export async function clearAllRecords(userId: string): Promise<RecordCounts> {
  const { cleared, photoKeys } = await db.transaction(async (tx) => {
    // 与上传、照片删除统一先锁用户；在同一事务里取 key 和删除，避免遗漏并发照片。
    const [owner] = await tx.select({ id: user.id }).from(user)
      .where(eq(user.id, userId)).for("update");
    if (!owner) return { cleared: { mealEntries: 0, measurements: 0, mealPhotos: 0, trainingRecords: 0 }, photoKeys: [] };
    const photoKeys = await tx.select({ objectKey: mealPhoto.objectKey, thumbKey: mealPhoto.thumbKey })
      .from(mealPhoto).where(eq(mealPhoto.userId, userId)).for("update");
    const [photosResult] = await tx.delete(mealPhoto).where(eq(mealPhoto.userId, userId));
    const [mealsResult] = await tx.delete(mealEntry).where(eq(mealEntry.userId, userId));
    const [measurementsResult] = await tx.delete(measurement).where(eq(measurement.userId, userId));
    const [trainingResult] = await tx.delete(trainingRecord).where(eq(trainingRecord.userId, userId));
    return {
      cleared: { mealEntries: mealsResult.affectedRows, measurements: measurementsResult.affectedRows, mealPhotos: photosResult.affectedRows, trainingRecords: trainingResult.affectedRows },
      photoKeys,
    };
  });
  await deletePhotoObjectsBestEffort(photoKeys.flatMap((row) => [row.objectKey, row.thumbKey]));
  return cleared;
}
