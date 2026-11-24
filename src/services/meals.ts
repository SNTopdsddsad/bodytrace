/**
 * 饮食记录服务：负责 meal_entry 表的增删改查和每日汇总。
 *
 * “服务层”是专门放业务逻辑的地方：页面（展示）和 API（给 app 调）都调用
 * 这里的函数，保证两边行为完全一致，规则只写一遍。
 */
import { and, asc, eq, getTableColumns, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { food, mealEntry } from "@/db/schema";
import { MEAL_ORDER, MEAL_LABELS, ZERO_MACRO, addMacro, round1, scaleMacro } from "@/lib/nutrition";
import type { MacroLike, MealType } from "@/lib/nutrition";
import { getGoals } from "./goals";
import type { MealEntry } from "@/db/schema";
import type { MealPhotoDto } from "@/lib/meal-photo";
import { getPhotosForDay } from "./meal-photos";
import { mealSlotSchema } from "./meal-slot";

const { nutritionBasis, ...entryColumns } = getTableColumns(mealEntry);

function snapshot({ calories, protein, carbs, fat }: MacroLike, grams: number) {
  return { calories, protein, carbs, fat, grams };
}

const mealCreateByFoodSchema = mealSlotSchema.extend({
  foodId: z.string().uuid(),
  grams: z.number().min(1).max(5000),
});

/** 一次性快照记餐：不先写入个人食物库，按每 100g 营养基准折算并保存快照。 */
const mealCreateSnapshotSchema = mealSlotSchema.extend({
  foodId: z.null().optional(),
  name: z.string().trim().min(1).max(100),
  grams: z.number().min(1).max(5000),
  calories: z.number().min(0).max(2000),
  protein: z.number().min(0).max(200).default(0),
  carbs: z.number().min(0).max(200).default(0),
  fat: z.number().min(0).max(200).default(0),
});

/** API 入参校验：支持按个人食物库 foodId 记餐，或直接提交一次性每 100g 营养快照。 */
export const mealCreateSchema = z.union([
  mealCreateByFoodSchema,
  mealCreateSnapshotSchema,
]);

export const mealPatchSchema = z.object({
  grams: z.number().min(1).max(5000),
});

/** 添加一条饮食记录：按食物库或一次性每 100g 营养基准折算 → 存快照。 */
export async function addEntry(
  userId: string,
  input: z.infer<typeof mealCreateSchema>,
): Promise<MealEntry | null> {
  let foodId: string | null = null;
  let name: string;
  let basis: MacroLike;

  if (typeof input.foodId === "string") {
    // 只能吃自己食物库里的东西（同时校验归属和数据存在）
    const [f] = await db
      .select()
      .from(food)
      .where(and(eq(food.id, input.foodId), eq(food.userId, userId)));
    if (!f) return null;
    foodId = f.id;
    name = f.name;
    basis = f;
  } else {
    name = input.name;
    basis = {
      calories: input.calories,
      protein: input.protein,
      carbs: input.carbs,
      fat: input.fat,
    };
  }

  const macro = scaleMacro(basis, input.grams);
  const row = await db.transaction(async (tx) => {
    const [{ id }] = await tx
      .insert(mealEntry)
      .values({
        userId,
        date: input.date,
        mealType: input.mealType,
        foodId,
        name,
        grams: input.grams,
        nutritionBasis: snapshot(basis, 100),
        // 存写入时刻的快照：以后食物库改了/删了，历史记录不变
        calories: macro.calories,
        protein: macro.protein,
        carbs: macro.carbs,
        fat: macro.fat,
      })
      .$returningId();
    const [row] = await tx.select(entryColumns).from(mealEntry).where(and(eq(mealEntry.id, id), eq(mealEntry.userId, userId)));
    return row;
  });
  return row ?? null;
}

/** 修改某条记录的克数：营养值从固定基准折算（对已删食物的记录同样有效）。 */
export async function updateEntryGrams(
  userId: string,
  id: string,
  grams: number,
): Promise<MealEntry | null> {
  const row = await db.transaction(async (tx) => {
    const [entry] = await tx
      .select({ ...entryColumns, nutritionBasis })
      .from(mealEntry)
      .where(and(eq(mealEntry.id, id), eq(mealEntry.userId, userId)))
      .for("update");
    if (!entry) return null;

    // 旧记录首次修改时固定已有的克数和营养值，食物可能早已变更或删除。
    const basis = entry.nutritionBasis ?? snapshot(entry, entry.grams);
    await tx
      .update(mealEntry)
      .set({
        grams,
        nutritionBasis: basis,
        ...scaleMacro(basis, grams, basis.grams),
      })
      .where(and(eq(mealEntry.id, id), eq(mealEntry.userId, userId)));
    const [row] = await tx.select(entryColumns).from(mealEntry).where(and(eq(mealEntry.id, id), eq(mealEntry.userId, userId)));
    return row ?? null;
  });
  return row;
}

export async function deleteEntry(userId: string, id: string) {
  const [result] = await db.delete(mealEntry)
    .where(and(eq(mealEntry.id, id), eq(mealEntry.userId, userId)));
  return result.affectedRows > 0;
}

/** 某一天的全部记录，按创建顺序排列。 */
export async function getDayEntries(
  userId: string,
  date: string,
): Promise<MealEntry[]> {
  const entries = await db
    .select(entryColumns)
    .from(mealEntry)
    .where(and(eq(mealEntry.userId, userId), eq(mealEntry.date, date)))
    .orderBy(asc(mealEntry.createdAt));
  return entries;
}

export type DaySummary = {
  date: string;
  /** 按餐次分组的记录 */
  byMeal: { mealType: MealType; label: string; entries: MealEntry[]; photos: MealPhotoDto[] }[];
  /** 全天合计 */
  totals: MacroLike;
  goals: { calories: number; protein: number; carbs: number; fat: number };
  /** 固定为 base：目标只取每日目标。字段保留，兼容按原契约读取的客户端。 */
  goalSource: "base";
};

/** 页面首页用的“某天汇总”：记录 + 合计 + 目标一次拿全（目标取每日目标）。 */
export async function getDaySummary(userId: string, date: string): Promise<DaySummary> {
  const [entries, goals, photos] = await Promise.all([
    getDayEntries(userId, date),
    getGoals(userId),
    getPhotosForDay(userId, date),
  ]);

  const totals = entries.reduce((acc, e) => addMacro(acc, e), ZERO_MACRO);

  const byMeal = MEAL_ORDER.map((mealType) => ({
    mealType,
    label: MEAL_LABELS[mealType],
    entries: entries.filter((e) => e.mealType === mealType),
    photos: photos.get(mealType) ?? [],
  }));

  return {
    date,
    byMeal,
    totals,
    goals,
    goalSource: "base",
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
