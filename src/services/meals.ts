/**
 * 饮食记录服务：负责 meal_entry 表的增删改查和每日汇总。
 *
 * “服务层”是专门放业务逻辑的地方：页面（展示）和 API（给 app 调）都调用
 * 这里的函数，保证两边行为完全一致，规则只写一遍。
 */
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { food, mealEntry, mealPhoto } from "@/db/schema";
import { MEAL_ORDER, MEAL_LABELS, ZERO_MACRO, addMacro, round1, scaleMacro } from "@/lib/nutrition";
import type { MacroLike, MealType } from "@/lib/nutrition";
import { getGoalsForDate } from "./goals";
import { isValidDateStr, todayStr } from "@/lib/date";
import {
  deletePhotoObjectsBestEffort,
  getPhotosForEntries,
  getPhotosForEntry,
} from "./meal-photos";
import type { MealEntryWithPhotos } from "./meal-photos";

/** API 入参校验：zod 会先验证数据形状，不合法直接报错，脏数据进不了数据库。 */
export const mealCreateSchema = z.object({
  date: z
    .string()
    .refine(isValidDateStr, "日期格式应为 YYYY-MM-DD")
    .refine((d) => d <= todayStr(), "不能记录未来日期"),
  mealType: z.enum(MEAL_ORDER),
  foodId: z.string().uuid(),
  grams: z.number().min(1).max(5000),
});

export const mealPatchSchema = z.object({
  grams: z.number().min(1).max(5000),
});

/** 添加一条饮食记录：查食物 → 按克数折算营养 → 存快照。 */
export async function addEntry(
  userId: string,
  input: z.infer<typeof mealCreateSchema>,
): Promise<MealEntryWithPhotos | null> {
  // 只能吃自己食物库里的东西（同时校验归属和数据存在）
  const [f] = await db
    .select()
    .from(food)
    .where(and(eq(food.id, input.foodId), eq(food.userId, userId)));
  if (!f) return null;

  const macro = scaleMacro(f, input.grams);
  const row = await db.transaction(async (tx) => {
    const [{ id }] = await tx
      .insert(mealEntry)
      .values({
        userId,
        date: input.date,
        mealType: input.mealType,
        foodId: f.id,
        name: f.name,
        grams: input.grams,
        // 存写入时刻的快照：以后食物库改了/删了，历史记录不变
        calories: macro.calories,
        protein: macro.protein,
        carbs: macro.carbs,
        fat: macro.fat,
      })
      .$returningId();
    const [row] = await tx.select().from(mealEntry).where(and(eq(mealEntry.id, id), eq(mealEntry.userId, userId)));
    return row;
  });
  return row ? { ...row, photos: [] } : null;
}

/** 修改某条记录的克数：营养值按新旧克数比例缩放（对已删食物的记录同样有效）。 */
export async function updateEntryGrams(
  userId: string,
  id: string,
  grams: number,
): Promise<MealEntryWithPhotos | null> {
  const row = await db.transaction(async (tx) => {
    const [entry] = await tx
      .select()
      .from(mealEntry)
      .where(and(eq(mealEntry.id, id), eq(mealEntry.userId, userId)))
      .for("update");
    if (!entry) return null;

    const k = grams / entry.grams;
    await tx
      .update(mealEntry)
      .set({
        grams,
        calories: round1(entry.calories * k),
        protein: round1(entry.protein * k),
        carbs: round1(entry.carbs * k),
        fat: round1(entry.fat * k),
      })
      .where(and(eq(mealEntry.id, id), eq(mealEntry.userId, userId)));
    const [row] = await tx.select().from(mealEntry).where(and(eq(mealEntry.id, id), eq(mealEntry.userId, userId)));
    return row ?? null;
  });
  if (!row) return null;
  return { ...row, photos: await getPhotosForEntry(userId, id) };
}

export async function deleteEntry(userId: string, id: string) {
  const photos = await db.transaction(async (tx) => {
    const [entry] = await tx
      .select({ id: mealEntry.id })
      .from(mealEntry)
      .where(and(eq(mealEntry.id, id), eq(mealEntry.userId, userId)))
      .for("update");
    if (!entry) return null;

    const rows = await tx
      .select({ objectKey: mealPhoto.objectKey, thumbKey: mealPhoto.thumbKey })
      .from(mealPhoto)
      .where(eq(mealPhoto.entryId, id));

    // 照片行随 meal_entry 外键级联删除，COS 对象在事务提交后清理。
    await tx.delete(mealEntry).where(and(eq(mealEntry.id, id), eq(mealEntry.userId, userId)));
    return rows;
  });

  if (!photos) return false;
  await deletePhotoObjectsBestEffort(photos.flatMap((row) => [row.objectKey, row.thumbKey]));
  return true;
}

/** 某一天的全部记录，按创建顺序排列，并附带每条的图片。 */
export async function getDayEntries(
  userId: string,
  date: string,
): Promise<MealEntryWithPhotos[]> {
  const entries = await db
    .select()
    .from(mealEntry)
    .where(and(eq(mealEntry.userId, userId), eq(mealEntry.date, date)))
    .orderBy(asc(mealEntry.createdAt));
  const photos = await getPhotosForEntries(userId, entries.map((entry) => entry.id));
  return entries.map((entry) => ({ ...entry, photos: photos.get(entry.id) ?? [] }));
}

/** 单条记录 + 图片，供 PATCH/上传后的响应复用。 */
export async function getEntryWithPhotos(
  userId: string,
  id: string,
): Promise<MealEntryWithPhotos | null> {
  const [entry] = await db
    .select()
    .from(mealEntry)
    .where(and(eq(mealEntry.id, id), eq(mealEntry.userId, userId)))
    .limit(1);
  if (!entry) return null;
  return { ...entry, photos: await getPhotosForEntry(userId, id) };
}

export type DaySummary = {
  date: string;
  /** 按餐次分组的记录 */
  byMeal: { mealType: MealType; label: string; entries: MealEntryWithPhotos[] }[];
  /** 全天合计 */
  totals: MacroLike;
  goals: { calories: number; protein: number; carbs: number; fat: number };
  /** 生效目标的来源：plan = 计划的当天目标，base = 每日目标兜底 */
  goalSource: "plan" | "base";
};

/** 页面首页用的“某天汇总”：记录 + 合计 + 目标一次拿全（目标按日期走计划）。 */
export async function getDaySummary(userId: string, date: string): Promise<DaySummary> {
  const [entries, goalsForDate] = await Promise.all([
    getDayEntries(userId, date),
    getGoalsForDate(userId, date),
  ]);

  const totals = entries.reduce((acc, e) => addMacro(acc, e), ZERO_MACRO);

  const byMeal = MEAL_ORDER.map((mealType) => ({
    mealType,
    label: MEAL_LABELS[mealType],
    entries: entries.filter((e) => e.mealType === mealType),
  }));

  return {
    date,
    byMeal,
    totals,
    goals: goalsForDate.goals,
    goalSource: goalsForDate.source,
  };
}

/** 按天聚合营养合计（趋势图用），只返回有记录的日期。 */
export async function getDailyTotals(userId: string, fromDate: string, toDate: string) {
  const rows = await db
    .select({
      date: mealEntry.date,
      calories: sql<number>`sum(${mealEntry.calories})`,
      protein: sql<number>`sum(${mealEntry.protein})`,
      carbs: sql<number>`sum(${mealEntry.carbs})`,
      fat: sql<number>`sum(${mealEntry.fat})`,
    })
    .from(mealEntry)
    .where(
      and(
        eq(mealEntry.userId, userId),
        gte(mealEntry.date, fromDate),
        lte(mealEntry.date, toDate),
      ),
    )
    .groupBy(mealEntry.date);

  // 聚合结果统一转成数字，保持现有 API 的数值契约。
  return rows.map((r) => ({
    date: r.date,
    calories: round1(Number(r.calories)),
    protein: round1(Number(r.protein)),
    carbs: round1(Number(r.carbs)),
    fat: round1(Number(r.fat)),
  }));
}
