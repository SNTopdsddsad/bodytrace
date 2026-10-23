/**
 * 饮食照片服务：照片元数据在 MySQL，文件在 COS。
 *
 * 上传顺序是“处理图片 → 传 COS → 写数据库”；确认未入库时回删刚上传的对象。
 * 提交结果未知时保留对象并核对请求编号，不能误删已提交照片。
 * 删除记录时数据库行靠外键级联删除，COS 对象在事务提交后尽力清理，
 * 失败不会让已经完成的删除接口返回错误（由清理脚本兜底）。
 */
import { createHash } from "node:crypto";
import { and, asc, count, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { mealEntry, mealPhoto } from "@/db/schema";
import {
  buildMealPhotoKeys,
  deleteMealPhotoObjects,
  getMealPhotoUrl,
  isPhotoStorageConfigured,
  PhotoStorageError,
  putMealPhotoObjects,
} from "@/lib/cos";
import { processMealPhoto, MealPhotoImageError } from "@/lib/meal-photo-image";
import type { ProcessedMealPhoto } from "@/lib/meal-photo-image";
import { MEAL_PHOTO_MAX, MEAL_PHOTO_MAX_BYTES } from "@/lib/meal-photo";
import type { MealPhotoDto } from "@/lib/meal-photo";
import type { MealEntry } from "@/db/schema";

export type { MealPhotoDto } from "@/lib/meal-photo";

export type MealEntryWithPhotos = MealEntry & { photos: MealPhotoDto[] };

export type AddMealPhotoResult =
  | { ok: true; photo: MealPhotoDto; created: boolean }
  | {
      ok: false;
      reason: "entry_not_found" | "limit" | "invalid_image" | "storage_unconfigured" | "storage_failed" | "conflict";
      message: string;
    };

type PhotoRow = typeof mealPhoto.$inferSelect;

async function toPhotoDto(row: PhotoRow): Promise<MealPhotoDto> {
  const [url, thumbUrl] = await Promise.all([
    getMealPhotoUrl(row.objectKey),
    getMealPhotoUrl(row.thumbKey),
  ]);
  return {
    id: row.id,
    url,
    thumbUrl,
    width: row.width,
    height: row.height,
    position: row.position,
  };
}

/**
 * 批量取多条记录的图片。地址生成失败（例如 COS 配置被移除）时降级为无图，
 * 不能让整页日记因为照片存储不可用而 500。
 */
export async function getPhotosForEntries(
  userId: string,
  entryIds: string[],
): Promise<Map<string, MealPhotoDto[]>> {
  const result = new Map<string, MealPhotoDto[]>();
  if (entryIds.length === 0) return result;

  const rows = await db
    .select()
    .from(mealPhoto)
    .where(and(eq(mealPhoto.userId, userId), inArray(mealPhoto.entryId, entryIds), isNull(mealPhoto.deletedAt)))
    .orderBy(asc(mealPhoto.entryId), asc(mealPhoto.position));

  for (const row of rows) {
    try {
      const dto = await toPhotoDto(row);
      const list = result.get(row.entryId) ?? [];
      list.push(dto);
      result.set(row.entryId, list);
    } catch (error) {
      console.error("[BodyTrace] 无法生成饮食照片地址", error);
    }
  }
  return result;
}

export async function getPhotosForEntry(userId: string, entryId: string): Promise<MealPhotoDto[]> {
  return (await getPhotosForEntries(userId, [entryId])).get(entryId) ?? [];
}

/** 清空记录前先取 key，事务提交后再删对象。 */
export async function getPhotoKeysForUser(
  userId: string,
): Promise<{ objectKey: string; thumbKey: string }[]> {
  return db
    .select({ objectKey: mealPhoto.objectKey, thumbKey: mealPhoto.thumbKey })
    .from(mealPhoto)
    .where(eq(mealPhoto.userId, userId));
}

export async function deletePhotoObjectsBestEffort(keys: string[]): Promise<void> {
  try {
    await deleteMealPhotoObjects(keys);
  } catch (error) {
    console.error("[BodyTrace] 饮食照片对象清理失败，留待清理脚本处理", error);
  }
}

/** 上传前先确认记录归属，避免为别人的记录解析/处理文件。 */
export async function entryBelongsToUser(userId: string, entryId: string): Promise<boolean> {
  const [entry] = await db
    .select({ id: mealEntry.id })
    .from(mealEntry)
    .where(and(eq(mealEntry.id, entryId), eq(mealEntry.userId, userId)))
    .limit(1);
  return Boolean(entry);
}

class PhotoAbort extends Error {
  constructor(
    readonly reason: "entry_not_found" | "limit" | "conflict",
    message: string,
  ) {
    super(message);
    this.name = "PhotoAbort";
  }
}

function validateReplay(row: PhotoRow, entryId: string, contentHash?: string) {
  if (row.entryId !== entryId || (contentHash !== undefined && row.contentHash !== contentHash)) {
    throw new PhotoAbort("conflict", "本次上传编号已用于其他内容，请重新选择照片");
  }
  if (row.deletedAt) {
    throw new PhotoAbort("conflict", "这张照片已删除，请重新选择照片");
  }
}

async function findRequest(userId: string, requestId: string) {
  const [row] = await db.select().from(mealPhoto)
    .where(and(eq(mealPhoto.userId, userId), eq(mealPhoto.requestId, requestId)));
  return row;
}

/** 查询结果只在本人记录内可见；未落库返回 null，删除/编号冲突返回 409。 */
export async function getMealPhotoRequest(userId: string, entryId: string, requestId: string) {
  if (!(await entryBelongsToUser(userId, entryId))) {
    return { ok: false, reason: "entry_not_found", message: "记录不存在" } as const;
  }
  try {
    const row = await findRequest(userId, requestId);
    if (!row) return { ok: true, photo: null } as const;
    validateReplay(row, entryId);
    return { ok: true, photo: await toPhotoDto(row) } as const;
  } catch (error) {
    if (error instanceof PhotoAbort) {
      return { ok: false, reason: error.reason, message: error.message } as const;
    }
    throw error;
  }
}

/** 提交结果未知时先核对引用；数据库不可读则留给孤儿清理，不能误删已提交的对象。 */
async function cleanupUnusedUpload(userId: string, keys: { objectKey: string; thumbKey: string }) {
  try {
    const [stored] = await db.select({ id: mealPhoto.id }).from(mealPhoto)
      .where(and(eq(mealPhoto.userId, userId), eq(mealPhoto.objectKey, keys.objectKey)));
    if (!stored) await deletePhotoObjectsBestEffort([keys.objectKey, keys.thumbKey]);
  } catch (error) {
    console.error("[BodyTrace] 暂无法确认照片对象引用，留待清理脚本处理", error);
  }
}

export async function addMealPhoto(
  userId: string,
  entryId: string,
  file: File,
  requestId?: string,
): Promise<AddMealPhotoResult> {
  if (file.size === 0 || file.size > MEAL_PHOTO_MAX_BYTES) {
    return { ok: false, reason: "invalid_image", message: file.size === 0 ? "请选择一张照片" : "照片不能超过 8 MB" };
  }
  if (!(await entryBelongsToUser(userId, entryId))) {
    return { ok: false, reason: "entry_not_found", message: "记录不存在" };
  }

  const input = Buffer.from(await file.arrayBuffer());
  const contentHash = createHash("sha256").update(input).digest("hex");
  // 重放检查必须在数量限制、图片处理和 COS 上传之前，满六张也能重试成功请求。
  if (requestId) {
    const existing = await findRequest(userId, requestId);
    if (existing) {
      try {
        validateReplay(existing, entryId, contentHash);
        return { ok: true, photo: await toPhotoDto(existing), created: false };
      } catch (error) {
        if (error instanceof PhotoAbort) return { ok: false, reason: error.reason, message: error.message };
        throw error;
      }
    }
  }

  const [existing] = await db.select({ value: count() }).from(mealPhoto)
    .where(and(eq(mealPhoto.entryId, entryId), isNull(mealPhoto.deletedAt)));
  if ((existing?.value ?? 0) >= MEAL_PHOTO_MAX) {
    return { ok: false, reason: "limit", message: `每条记录最多 ${MEAL_PHOTO_MAX} 张照片` };
  }
  if (!isPhotoStorageConfigured()) {
    return { ok: false, reason: "storage_unconfigured", message: "照片功能尚未配置" };
  }

  let processed: ProcessedMealPhoto;
  try {
    processed = await processMealPhoto(input);
  } catch (error) {
    return {
      ok: false, reason: "invalid_image",
      message: error instanceof MealPhotoImageError ? error.message : "无法读取这张照片，请换一张再试",
    };
  }

  const keys = buildMealPhotoKeys();
  try {
    await putMealPhotoObjects(keys, processed.main, processed.thumb);
  } catch (error) {
    return {
      ok: false, reason: "storage_failed",
      message: error instanceof PhotoStorageError ? error.message : "照片上传失败，请稍后重试",
    };
  }

  let saved: { row: PhotoRow; created: boolean };
  try {
    saved = await db.transaction(async (tx) => {
      // 同一记录的上传、删除串行；唯一约束同时保护同用户跨记录重用编号。
      const [locked] = await tx.select({ id: mealEntry.id }).from(mealEntry)
        .where(and(eq(mealEntry.id, entryId), eq(mealEntry.userId, userId))).for("update");
      if (!locked) throw new PhotoAbort("entry_not_found", "记录不存在");
      if (requestId) {
        const [replay] = await tx.select().from(mealPhoto)
          .where(and(eq(mealPhoto.userId, userId), eq(mealPhoto.requestId, requestId))).for("update");
        if (replay) {
          validateReplay(replay, entryId, contentHash);
          return { row: replay, created: false };
        }
      }
      const [aggregate] = await tx.select({
        total: count(sql`case when ${mealPhoto.deletedAt} is null then 1 end`),
        maxPosition: sql`coalesce(max(${mealPhoto.position}), -1)`.mapWith(Number),
      }).from(mealPhoto).where(eq(mealPhoto.entryId, entryId));
      if ((aggregate?.total ?? 0) >= MEAL_PHOTO_MAX) {
        throw new PhotoAbort("limit", `每条记录最多 ${MEAL_PHOTO_MAX} 张照片`);
      }
      const [{ id }] = await tx.insert(mealPhoto).values({
        userId, entryId, requestId: requestId ?? null, contentHash,
        objectKey: keys.objectKey, thumbKey: keys.thumbKey,
        mimeType: processed.mimeType, byteSize: processed.byteSize,
        width: processed.width, height: processed.height,
        position: (aggregate?.maxPosition ?? -1) + 1,
      }).$returningId();
      const [row] = await tx.select().from(mealPhoto).where(eq(mealPhoto.id, id));
      return { row, created: true };
    });
  } catch (error) {
    await cleanupUnusedUpload(userId, keys);
    if (error instanceof PhotoAbort) return { ok: false, reason: error.reason, message: error.message };
    // 唯一键竞争或 COMMIT 响应丢失：再次核对已提交的请求，不能盲目重建。
    if (requestId) {
      try {
        const replay = await findRequest(userId, requestId);
        if (replay) {
          validateReplay(replay, entryId, contentHash);
          return { ok: true, photo: await toPhotoDto(replay), created: false };
        }
      } catch (replayError) {
        if (replayError instanceof PhotoAbort) return { ok: false, reason: replayError.reason, message: replayError.message };
      }
    }
    console.error("[BodyTrace] 饮食照片写库结果待核对", error);
    return { ok: false, reason: "storage_failed", message: "照片保存结果尚未确认，请重试核对" };
  }
  if (!saved.created) await cleanupUnusedUpload(userId, keys);
  // 地址生成失败不撤销已提交的照片；客户端可通过 requestId 重新读取。
  return { ok: true, photo: await toPhotoDto(saved.row), created: saved.created };
}

export async function removeMealPhoto(
  userId: string,
  entryId: string,
  photoId: string,
): Promise<boolean> {
  const row = await db.transaction(async (tx) => {
    const [entry] = await tx
      .select({ id: mealEntry.id })
      .from(mealEntry)
      .where(and(eq(mealEntry.id, entryId), eq(mealEntry.userId, userId)))
      .for("update");
    if (!entry) return null;

    const [photo] = await tx
      .select()
      .from(mealPhoto)
      .where(
        and(
          eq(mealPhoto.id, photoId),
          eq(mealPhoto.entryId, entryId),
          eq(mealPhoto.userId, userId),
          isNull(mealPhoto.deletedAt),
        ),
      )
      .for("update");
    if (!photo) return null;

    await tx
      .update(mealPhoto)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(mealPhoto.id, photoId),
          eq(mealPhoto.entryId, entryId),
          eq(mealPhoto.userId, userId),
          isNull(mealPhoto.deletedAt),
        ),
      );
    return photo;
  });

  if (!row) return false;
  await deletePhotoObjectsBestEffort([row.objectKey, row.thumbKey]);
  return true;
}
