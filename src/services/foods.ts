import { and, asc, desc, eq, like, max, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { food, foodReference, mealEntry } from "@/db/schema";

export const foodInputSchema = z.object({
  name: z.string().trim().min(1).max(100),
  brand: z.string().trim().max(50).optional().nullable(),
  calories: z.number().min(0).max(2000),
  protein: z.number().min(0).max(200).default(0),
  carbs: z.number().min(0).max(200).default(0),
  fat: z.number().min(0).max(200).default(0),
  servingGrams: z.number().min(1).max(5000).optional().nullable(),
});

export const foodPatchSchema = foodInputSchema.partial().extend({
  // PATCH 没有提交的字段保持原值，不能沿用新建表单的零值默认项。
  protein: foodInputSchema.shape.protein.removeDefault().optional(),
  carbs: foodInputSchema.shape.carbs.removeDefault().optional(),
  fat: foodInputSchema.shape.fat.removeDefault().optional(),
  isFavorite: z.boolean().optional(),
});

export async function listFoods(userId: string, q?: string, favorite?: boolean) {
  const conditions = [eq(food.userId, userId)];
  if (q) conditions.push(like(sql`lower(${food.name})`, `%${q.toLowerCase()}%`));
  if (favorite) conditions.push(eq(food.isFavorite, true));
  return db
    .select()
    .from(food)
    .where(and(...conditions))
    .orderBy(desc(food.isFavorite), asc(food.name));
}

export async function listFavorites(userId: string) {
  return db
    .select()
    .from(food)
    .where(and(eq(food.userId, userId), eq(food.isFavorite, true)))
    .orderBy(asc(food.name))
    .limit(30);
}

/** 最近吃过的食物：按最近一次记录时间倒序去重。 */
export async function listRecentFoods(userId: string, limit = 12) {
  // 先在全部记录中按食物聚合，再限制食物数量，避免重复记录挤掉其他食物。
  const recent = db
    .select({ foodId: mealEntry.foodId, lastAt: max(mealEntry.createdAt).as("last_at") })
    .from(mealEntry)
    .where(eq(mealEntry.userId, userId))
    .groupBy(mealEntry.foodId)
    .as("recent");
  const rows = await db
    .select({ food })
    .from(recent)
    .innerJoin(food, and(eq(recent.foodId, food.id), eq(food.userId, userId)))
    .orderBy(desc(recent.lastAt), asc(food.id))
    .limit(limit);
  return rows.map(row => row.food);
}

export async function createFood(userId: string, input: z.infer<typeof foodInputSchema>) {
  return db.transaction(async (tx) => {
    const [{ id }] = await tx
      .insert(food)
      .values({
        userId,
        name: input.name,
        brand: input.brand ?? null,
        calories: input.calories,
        protein: input.protein,
        carbs: input.carbs,
        fat: input.fat,
        servingGrams: input.servingGrams ?? null,
      })
      .$returningId();
    const [row] = await tx.select().from(food).where(and(eq(food.id, id), eq(food.userId, userId)));
    return row;
  });
}

export async function updateFood(
  userId: string,
  id: string,
  patch: z.infer<typeof foodPatchSchema>,
) {
  return db.transaction(async (tx) => {
    await tx
      .update(food)
      .set({ ...patch, updatedAt: new Date() })
      .where(and(eq(food.id, id), eq(food.userId, userId)));
    const [row] = await tx.select().from(food).where(and(eq(food.id, id), eq(food.userId, userId)));
    return row ?? null;
  });
}

export async function deleteFood(userId: string, id: string) {
  const [result] = await db
    .delete(food)
    .where(and(eq(food.id, id), eq(food.userId, userId)));
  return result.affectedRows > 0;
}

/**
 * 搜索官方食物参考库（《中国食物成分表》1677 种）。
 * 只读公共数据，返回前 limit 条，按名称排序。
 */
export async function searchFoodReference(q: string, limit = 20) {
  return db
    .select()
    .from(foodReference)
    .where(like(sql`lower(${foodReference.name})`, `%${q.toLowerCase()}%`))
    .orderBy(asc(foodReference.name))
    .limit(limit);
}
