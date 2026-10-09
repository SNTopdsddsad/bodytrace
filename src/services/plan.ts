/**
 * 碳循环计划服务：每用户至多一条计划（一周七天各带日型与目标）。
 * 纯类型/文案/推导公式在 lib/plan.ts，这里只做数据库读写。
 */
import { asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { dietPlan, dietPlanDay } from "@/db/schema";
import { isValidDateStr } from "@/lib/date";
import type { CarbCyclePlan } from "@/lib/plan";

const macroRange = {
  calories: z.number().int().min(500).max(8000),
  protein: z.number().int().min(0).max(600),
  carbs: z.number().int().min(0).max(1200),
  fat: z.number().int().min(0).max(500),
};

export const planSchema = z.object({
  startDate: z.string().refine(isValidDateStr, "日期格式应为 YYYY-MM-DD"),
  isActive: z.boolean(),
  weekdays: z
    .array(
      z.object({
        dayType: z.enum(["high", "medium", "low"]),
        ...macroRange,
      }),
    )
    .length(7, "一周必须有 7 天的安排"),
});

export type PlanInput = z.infer<typeof planSchema>;

export async function getPlan(userId: string): Promise<CarbCyclePlan | null> {
  const [plan] = await db.select().from(dietPlan).where(eq(dietPlan.userId, userId));
  if (!plan) return null;
  const days = await db
    .select({
      weekday: dietPlanDay.weekday,
      dayType: dietPlanDay.dayType,
      calories: dietPlanDay.calories,
      protein: dietPlanDay.protein,
      carbs: dietPlanDay.carbs,
      fat: dietPlanDay.fat,
    })
    .from(dietPlanDay)
    .where(eq(dietPlanDay.planId, plan.id))
    .orderBy(asc(dietPlanDay.weekday));
  if (days.length !== 7) return null;
  return { startDate: plan.startDate, isActive: plan.isActive, weekdays: days };
}

/** 整体保存（全量替换七天）：计划行 upsert，七天先删后插，放在一个事务里。 */
export async function savePlan(userId: string, input: PlanInput) {
  await db.transaction(async (tx) => {
    const [plan] = await tx
      .insert(dietPlan)
      .values({ userId, startDate: input.startDate, isActive: input.isActive, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: dietPlan.userId,
        set: { startDate: input.startDate, isActive: input.isActive, updatedAt: new Date() },
      })
      .returning({ id: dietPlan.id });

    await tx.delete(dietPlanDay).where(eq(dietPlanDay.planId, plan.id));
    await tx.insert(dietPlanDay).values(
      input.weekdays.map((day, weekday) => ({ planId: plan.id, weekday, ...day })),
    );
  });
  return input;
}

export async function deletePlan(userId: string) {
  // diet_plan_day 对 plan 是级联删除，不用单独清
  await db.delete(dietPlan).where(eq(dietPlan.userId, userId));
}
