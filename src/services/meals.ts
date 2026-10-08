/**
 * 饮食记录服务：负责 meal_entry 表的增删改查和每日汇总。
 *
 * “服务层”是专门放业务逻辑的地方：页面（展示）和 API（给 app 调）都调用
 * 这里的函数，保证两边行为完全一致，规则只写一遍。
 */
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { food, mealEntry } from "@/db/schema";
import { MEAL_ORDER, MEAL_LABELS, ZERO_MACRO, addMacro, round1, scaleMacro } from "@/lib/nutrition";
import type { MacroLike, MealType } from "@/lib/nutrition";
import { getGoals } from "./goals";
import { isValidDateStr } from "@/lib/date";

/** API 入参校验：zod 会先验证数据形状，不合法直接报错，脏数据进不了数据库。 */
export const mealCreateSchema = z.object({
  date: z.string().refine(isValidDateStr, "日期格式应为 YYYY-MM-DD"),
  mealType: z.enum(MEAL_ORDER),
  foodId: z.string().uuid(),
  grams: z.number().min(1).max(5000),
});

export const mealPatchSchema = z.object({
  grams: z.number().min(1).max(5000),
});

/** 添加一条饮食记录：查食物 → 按克数折算营养 → 存快照。 */
export async function addEntry(userId: string, input: z.infer<typeof mealCreateSchema>) {
  // 只能吃自己食物库里的东西（同时校验归属和数据存在）
  const [f] = await db
    .select()
    .from(food)
    .where(and(eq(food.id, input.foodId), eq(food.userId, userId)));
  if (!f) return null;

  const macro = scaleMacro(f, input.grams);
  const [row] = await db
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
    .returning();
  return row;
}

/** 修改某条记录的克数：营养值按新旧克数比例缩放（对已删食物的记录同样有效）。 */
export async function updateEntryGrams(
  userId: string,
  id: string,
  grams: number,
) {
  const [entry] = await db
    .select()
    .from(mealEntry)
    .where(and(eq(mealEntry.id, id), eq(mealEntry.userId, userId)));
  if (!entry) return null;

  const k = grams / entry.grams;
  const [row] = await db
    .update(mealEntry)
    .set({
      grams,
      calories: round1(entry.calories * k),
      protein: round1(entry.protein * k),
      carbs: round1(entry.carbs * k),
      fat: round1(entry.fat * k),
    })
    .where(and(eq(mealEntry.id, id), eq(mealEntry.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteEntry(userId: string, id: string) {
  const [row] = await db
    .delete(mealEntry)
    .where(and(eq(mealEntry.id, id), eq(mealEntry.userId, userId)))
    .returning({ id: mealEntry.id });
  return row != null;
}

/** 某一天的全部记录，按创建顺序排列。 */
export async function getDayEntries(userId: string, date: string) {
  return db
    .select()
    .from(mealEntry)
    .where(and(eq(mealEntry.userId, userId), eq(mealEntry.date, date)))
    .orderBy(asc(mealEntry.createdAt));
}

export type DaySummary = {
  date: string;
  /** 按餐次分组的记录 */
  byMeal: { mealType: MealType; label: string; entries: Awaited<ReturnType<typeof getDayEntries>> }[];
  /** 全天合计 */
  totals: MacroLike;
  goals: { calories: number; protein: number; carbs: number; fat: number };
};

/** 页面首页用的“某天汇总”：记录 + 合计 + 目标一次拿全。 */
export async function getDaySummary(userId: string, date: string): Promise<DaySummary> {
  const [entries, goals] = await Promise.all([
    getDayEntries(userId, date),
    getGoals(userId),
  ]);

  const totals = entries.reduce((acc, e) => addMacro(acc, e), ZERO_MACRO);

  const byMeal = MEAL_ORDER.map((mealType) => ({
    mealType,
    label: MEAL_LABELS[mealType],
    entries: entries.filter((e) => e.mealType === mealType),
  }));

  return { date, byMeal, totals, goals };
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

  // sum() 出来可能是字符串（Postgres 数值类型的习惯），统一转成数字
  return rows.map((r) => ({
    date: r.date,
    calories: round1(Number(r.calories)),
    protein: round1(Number(r.protein)),
    carbs: round1(Number(r.carbs)),
    fat: round1(Number(r.fat)),
  }));
}
