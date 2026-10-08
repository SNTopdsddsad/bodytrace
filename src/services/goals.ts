/**
 * 每日目标服务：每个用户一行数据，没设置过就用默认值。
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { dailyGoal } from "@/db/schema";

export const DEFAULT_GOALS = { calories: 2000, protein: 120, carbs: 220, fat: 60 };

export const goalsSchema = z.object({
  calories: z.number().int().min(500).max(8000),
  protein: z.number().int().min(0).max(600),
  carbs: z.number().int().min(0).max(1200),
  fat: z.number().int().min(0).max(500),
});

export type Goals = { calories: number; protein: number; carbs: number; fat: number };

export async function getGoals(userId: string): Promise<Goals> {
  const [row] = await db.select().from(dailyGoal).where(eq(dailyGoal.userId, userId));
  // 没设置过：返回默认值（不写库，等用户真的保存才落一行）
  if (!row) return { ...DEFAULT_GOALS };
  const { calories, protein, carbs, fat } = row;
  return { calories, protein, carbs, fat };
}

export async function upsertGoals(userId: string, input: z.infer<typeof goalsSchema>) {
  // upsert = 存在就更新，不存在就插入（以 userId 为准）
  await db
    .insert(dailyGoal)
    .values({ userId, ...input, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: dailyGoal.userId,
      set: { ...input, updatedAt: new Date() },
    });
  return input;
}
