import { and, asc, desc, eq, ilike } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { food, mealEntry } from "@/db/schema";

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
  isFavorite: z.boolean().optional(),
});

export async function listFoods(userId: string, q?: string) {
  const where = q
    ? and(eq(food.userId, userId), ilike(food.name, `%${q}%`))
    : eq(food.userId, userId);
  return db.select().from(food).where(where).orderBy(desc(food.isFavorite), asc(food.name));
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
  const rows = await db
    .select({ food, lastAt: mealEntry.createdAt })
    .from(mealEntry)
    .innerJoin(food, eq(mealEntry.foodId, food.id))
    .where(eq(mealEntry.userId, userId))
    .orderBy(desc(mealEntry.createdAt))
    .limit(200);

  const seen = new Set<string>();
  const result: (typeof food.$inferSelect)[] = [];
  for (const row of rows) {
    if (!seen.has(row.food.id)) {
      seen.add(row.food.id);
      result.push(row.food);
      if (result.length >= limit) break;
    }
  }
  return result;
}

export async function createFood(userId: string, input: z.infer<typeof foodInputSchema>) {
  const [row] = await db
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
    .returning();
  return row;
}

export async function updateFood(
  userId: string,
  id: string,
  patch: z.infer<typeof foodPatchSchema>,
) {
  const [row] = await db
    .update(food)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(food.id, id), eq(food.userId, userId)))
    .returning();
  return row ?? null;
}

export async function deleteFood(userId: string, id: string) {
  const [row] = await db
    .delete(food)
    .where(and(eq(food.id, id), eq(food.userId, userId)))
    .returning({ id: food.id });
  return row != null;
}
