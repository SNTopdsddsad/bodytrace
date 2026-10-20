/**
 * 饮食计划服务：每用户至多一条计划（一周七天各带目标 + 各餐的食物项）。
 * 纯类型与纯函数在 lib/plan.ts，这里只做数据库读写与食物归属校验。
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { dietPlan, dietPlanDay, dietPlanItem, food } from "@/db/schema";
import { isValidDateStr } from "@/lib/date";
import { MEAL_ORDER, scaleMacro } from "@/lib/nutrition";
import type { PlanItem, WeeklyPlan } from "@/lib/plan";

const macroRange = {
  calories: z.number().int().min(500).max(8000),
  protein: z.number().int().min(0).max(600),
  carbs: z.number().int().min(0).max(1200),
  fat: z.number().int().min(0).max(500),
};

/**
 * 一项计划食物，两种写法：
 * - foodId 为 uuid：引用食物库里的食物，名称以食物库为准；
 * - foodId 为 null：保留一条已失效的行（食物已删除，只剩名称与克数），
 *   必须带该项在 GET 响应里的 id，服务端据此找回原来的 name。
 */
const planItemFields = {
  weekday: z.number().int().min(0).max(6),
  mealType: z.enum(MEAL_ORDER),
  grams: z.number().min(1).max(5000),
};

const planItemSchema = z.union(
  [
    // 引用食物库里的食物：id 是新增行，可以不带
    z.object({ ...planItemFields, foodId: z.string().uuid(), id: z.string().uuid().optional() }),
    // 保留一条失效行：必须带 GET 响应里的那一行 id，服务端据此找回原名称
    z.object({ ...planItemFields, foodId: z.null(), id: z.string().uuid() }),
  ],
  { error: "食物项格式不正确；食物已删除的项要带上它在计划里的 id 才能保留" },
);

export const planSchema = z.object({
  startDate: z.string().refine(isValidDateStr, "日期格式应为 YYYY-MM-DD"),
  isActive: z.boolean(),
  weekdays: z
    .array(z.object({ ...macroRange }))
    .length(7, "一周必须有 7 天的安排"),
  items: z.array(planItemSchema).max(400, "计划里最多 400 项食物"),
});

export type PlanInput = z.infer<typeof planSchema>;
export type PlanItemInput = z.infer<typeof planItemSchema>;

/** 计划里的食物不存在或不属于当前用户：整单拒绝，Route Handler 转 400。 */
export class PlanFoodNotOwned extends Error {}

/** 请求里要保留的失效行对不上当前计划的失效行（id 缺失或不属于本人计划）：整单拒绝，Route Handler 转 400。 */
export class PlanStaleItem extends Error {}

/**
 * 读取计划：七天目标 + 食物项。
 * 食物项通过 left join 食物库取当前每 100g 数值，再按克数实时折算（不存快照）；
 * 食物已删除或不可见时营养字段返回 null，name 与 grams 照常返回。
 */
export async function getPlan(userId: string): Promise<WeeklyPlan | null> {
  const [plan] = await db.select().from(dietPlan).where(eq(dietPlan.userId, userId));
  if (!plan) return null;

  const [days, rows] = await Promise.all([
    db
      .select({
        weekday: dietPlanDay.weekday,
        calories: dietPlanDay.calories,
        protein: dietPlanDay.protein,
        carbs: dietPlanDay.carbs,
        fat: dietPlanDay.fat,
      })
      .from(dietPlanDay)
      .where(eq(dietPlanDay.planId, plan.id))
      .orderBy(asc(dietPlanDay.weekday)),
    db
      .select({
        id: dietPlanItem.id,
        weekday: dietPlanItem.weekday,
        mealType: dietPlanItem.mealType,
        foodId: dietPlanItem.foodId,
        name: dietPlanItem.name,
        grams: dietPlanItem.grams,
        foodCalories: food.calories,
        foodProtein: food.protein,
        foodCarbs: food.carbs,
        foodFat: food.fat,
      })
      .from(dietPlanItem)
      .leftJoin(food, and(eq(food.id, dietPlanItem.foodId), eq(food.userId, userId)))
      .where(eq(dietPlanItem.planId, plan.id))
      // meal_type 是 ENUM，MySQL 按定义顺序（早/午/晚/加餐）排序，与 MEAL_ORDER 一致
      // position 是保存时按提交数组顺序写入的同餐内序号；created_at 只作兜底
      // （同一条多行 INSERT 的 CURRENT_TIMESTAMP(3) 取值相同，单靠它无法稳定排序）
      .orderBy(
        asc(dietPlanItem.weekday),
        asc(dietPlanItem.mealType),
        asc(dietPlanItem.position),
        asc(dietPlanItem.createdAt),
      ),
  ]);
  if (days.length !== 7) return null;

  const items: PlanItem[] = rows.map((row) => {
    // left join 没命中（foodId 为 null 或食物已删）：整行营养列都是 null
    const per100g =
      row.foodCalories !== null &&
      row.foodProtein !== null &&
      row.foodCarbs !== null &&
      row.foodFat !== null
        ? {
            calories: row.foodCalories,
            protein: row.foodProtein,
            carbs: row.foodCarbs,
            fat: row.foodFat,
          }
        : null;
    const macro = per100g === null ? null : scaleMacro(per100g, row.grams);
    return {
      id: row.id,
      weekday: row.weekday,
      mealType: row.mealType,
      foodId: row.foodId,
      name: row.name,
      grams: row.grams,
      per100g,
      calories: macro ? macro.calories : null,
      protein: macro ? macro.protein : null,
      carbs: macro ? macro.carbs : null,
      fat: macro ? macro.fat : null,
    };
  });

  return {
    startDate: plan.startDate,
    isActive: plan.isActive,
    weekdays: days.map(({ calories, protein, carbs, fat }) => ({ calories, protein, carbs, fat })),
    items,
  };
}

/** 取已查到的名称；查不到说明引用对不上（别人的食物 / 别的计划的失效行），按调用方给出的错误整单拒绝。 */
function requireName(from: Map<string, string>, id: string, missing: Error): string {
  const name = from.get(id);
  if (name === undefined) throw missing;
  return name;
}

/**
 * 整体保存（全量替换七天目标与食物项），一个事务里完成：
 * 计划行 upsert → 校验失效行 → 删并重插 7 天目标 → 删并重插食物项。
 * 写入前先一次性校验所有 foodId 都属于自己的食物库，有一项不属于就整单拒绝，不留部分写入。
 * foodId 为 null 的项表示「保留一条已失效的行」：只接受当前计划里 id 对得上、food_id 为空的既有行，
 * 名称沿用那一行原来的值（客户端不传名）。
 */
export async function savePlan(userId: string, input: PlanInput) {
  const foodIds = [
    ...new Set(input.items.flatMap((item) => (item.foodId === null ? [] : [item.foodId]))),
  ];

  await db.transaction(async (tx) => {
    // 单次 inArray 查齐所有食物，同时拿到名称（归属 + 存在性一次校验）
    const owned =
      foodIds.length === 0
        ? []
        : await tx
            .select({ id: food.id, name: food.name })
            .from(food)
            .where(and(eq(food.userId, userId), inArray(food.id, foodIds)));
    const nameById = new Map(owned.map((row) => [row.id, row.name]));
    if (owned.length !== foodIds.length) {
      throw new PlanFoodNotOwned("计划中的食物不存在或不属于当前用户，请刷新食物库后重试");
    }

    await tx
      .insert(dietPlan)
      .values({ userId, startDate: input.startDate, isActive: input.isActive, updatedAt: new Date() })
      .onDuplicateKeyUpdate({
        set: { startDate: input.startDate, isActive: input.isActive, updatedAt: new Date() },
      });
    const [plan] = await tx.select({ id: dietPlan.id }).from(dietPlan).where(eq(dietPlan.userId, userId));

    // 失效行（foodId 为 null）的 id 只能在 plan upsert 之后校验：这些 id 必须属于本计划的行。
    // 删除重建前先把既有失效行的名称读出来，名称仍以数据库里那一份为准。
    const staleIds = [
      ...new Set(input.items.flatMap((item) => (item.foodId === null ? [item.id] : []))),
    ];
    const staleNameById = new Map<string, string>();
    if (staleIds.length > 0) {
      const stale = await tx
        .select({ id: dietPlanItem.id, name: dietPlanItem.name })
        .from(dietPlanItem)
        .where(
          and(
            eq(dietPlanItem.planId, plan.id),
            inArray(dietPlanItem.id, staleIds),
            isNull(dietPlanItem.foodId),
          ),
        );
      for (const row of stale) staleNameById.set(row.id, row.name);
    }

    // 先把每项要写入的名称定下来：这一步会拒绝「foodId 为 null 的 id 对不上当前计划的失效行」，
    // 仍在删除旧行之前，整单拒绝时事务回滚、旧计划不被改写。
    const itemNames = input.items.map((item) =>
      item.foodId === null
        ? requireName(
            staleNameById,
            item.id,
            new PlanStaleItem("要保留的失效食物项在当前计划里不存在，请刷新页面后重试"),
          )
        : requireName(
            nameById,
            item.foodId,
            new PlanFoodNotOwned("计划中的食物不存在或不属于当前用户，请刷新食物库后重试"),
          ),
    );

    await tx.delete(dietPlanDay).where(eq(dietPlanDay.planId, plan.id));
    await tx.insert(dietPlanDay).values(
      input.weekdays.map((day, weekday) => ({ planId: plan.id, weekday, ...day })),
    );

    await tx.delete(dietPlanItem).where(eq(dietPlanItem.planId, plan.id));
    if (input.items.length > 0) {
      await tx.insert(dietPlanItem).values(
        input.items.map((item, index) => ({
          planId: plan.id,
          weekday: item.weekday,
          mealType: item.mealType,
          foodId: item.foodId,
          // 名称以食物库为准；失效行沿用当前计划里那一行原来的名称（planItemSchema 不允许客户端传 name）
          name: itemNames[index],
          grams: item.grams,
          // 显示顺序完全由提交数组顺序决定，客户端不需要（也不能）传 position
          position: index,
        })),
      );
    }
  });
  return getPlan(userId);
}

export async function deletePlan(userId: string) {
  // bodytrace_diet_plan_day / bodytrace_diet_plan_item 对 plan 都是级联删除，不用单独清
  await db.delete(dietPlan).where(eq(dietPlan.userId, userId));
}
