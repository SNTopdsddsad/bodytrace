/**
 * 饮食计划的共享类型与纯函数（客户端/服务端都可安全引用）。
 * 数据库读写见 services/plan.ts。
 *
 * 计划是「按天手写」的：每天有四个目标数值，每天的三餐各挂具体食物与克数。
 * 计划项不存营养快照，摄入热量与宏量按食物库当前值实时折算（见 services/plan.ts）。
 */
import { addMacro, round1, ZERO_MACRO } from "@/lib/nutrition";
import type { MacroLike, MealType } from "@/lib/nutrition";

/** 一周七天（下标 0=周一 … 6=周日）某一天的目标安排。 */
export type PlanWeekday = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

/** 计划里的一个食物项；食物已删除或不可见时四个营养字段为 null，name 与 grams 仍然可用。 */
export type PlanItem = {
  id: string;
  weekday: number;
  mealType: MealType;
  foodId: string | null;
  name: string;
  grams: number;
  /** 食物库当前每 100g 原始营养，用于编辑克数；不能从舍入后的合计反推。 */
  per100g: MacroLike | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

export type WeeklyPlan = {
  startDate: string;
  isActive: boolean;
  weekdays: PlanWeekday[];
  items: PlanItem[];
};

export const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

/** YYYY-MM-DD → 周几（0=周一 … 6=周日）。日期串按 UTC 解析，与 lib/date 保持一致。 */
export function mondayIndex(dateStr: string): number {
  return (new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export type MacroGoals = { calories: number; protein: number; carbs: number; fat: number };

/**
 * 某天生效的目标：计划启用且日期不早于起始日 → 按周几取计划目标（fromPlan）；
 * 否则回落 daily_goal。纯函数，方便趋势页一次取计划后逐天计算。
 */
export function resolveDayGoals(
  plan: WeeklyPlan | null,
  base: MacroGoals,
  date: string,
): { goals: MacroGoals; fromPlan: boolean } {
  if (plan && plan.isActive && date >= plan.startDate) {
    const day = plan.weekdays[mondayIndex(date)];
    if (day) {
      return {
        goals: { calories: day.calories, protein: day.protein, carbs: day.carbs, fat: day.fat },
        fromPlan: true,
      };
    }
  }
  return { goals: base, fromPlan: false };
}

/** 某一天的计划项，保持服务层给出的顺序（按餐次、再按添加顺序）。 */
export function planItemsForDay(items: PlanItem[], weekday: number): PlanItem[] {
  return items.filter((item) => item.weekday === weekday);
}

/**
 * 汇总某一天计划项的热量与三大营养素。
 * 营养为空的项（食物已删除，见 PlanItem 注释）不计入合计，只通过 missing 报数量，
 * 由调用方在界面上标注失效；折算复用 lib/nutrition 的 addMacro / round1。
 */
export function summarizePlanDay(
  items: PlanItem[],
  weekday: number,
): { totals: MacroGoals; missing: number } {
  let totals: MacroLike = { ...ZERO_MACRO };
  let missing = 0;
  for (const item of planItemsForDay(items, weekday)) {
    if (item.calories === null || item.protein === null || item.carbs === null || item.fat === null) {
      missing += 1;
      continue;
    }
    totals = addMacro(totals, {
      calories: item.calories,
      protein: item.protein,
      carbs: item.carbs,
      fat: item.fat,
    });
  }
  return {
    totals: {
      calories: round1(totals.calories),
      protein: round1(totals.protein),
      carbs: round1(totals.carbs),
      fat: round1(totals.fat),
    },
    missing,
  };
}
