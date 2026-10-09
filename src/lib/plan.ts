/**
 * 碳循环计划的共享类型与纯函数（客户端/服务端都可安全引用）。
 * 数据库读写见 services/plan.ts。
 */
export type DayType = "high" | "medium" | "low";

export const DAY_TYPE_LABELS: Record<DayType, string> = {
  high: "高碳日",
  medium: "中碳日",
  low: "低碳日",
};

/** 一周七天（下标 0=周一 … 6=周日）某一天的目标安排。 */
export type PlanWeekday = {
  dayType: DayType;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type CarbCyclePlan = {
  startDate: string;
  isActive: boolean;
  weekdays: PlanWeekday[];
};

export const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;

/** YYYY-MM-DD → 周几（0=周一 … 6=周日）。日期串按 UTC 解析，与 lib/date 保持一致。 */
export function mondayIndex(dateStr: string): number {
  return (new Date(`${dateStr}T00:00:00Z`).getUTCDay() + 6) % 7;
}

export type MacroGoals = { calories: number; protein: number; carbs: number; fat: number };

/**
 * 某天生效的目标：计划启用且日期不早于起始日 → 按周几取计划目标；否则回落 daily_goal。
 * 纯函数，方便趋势页一次取计划后逐天计算。
 */
export function resolveDayGoals(
  plan: CarbCyclePlan | null,
  base: MacroGoals,
  date: string,
): { goals: MacroGoals; dayType: DayType | null } {
  if (plan && plan.isActive && date >= plan.startDate) {
    const day = plan.weekdays[mondayIndex(date)];
    if (day) {
      return {
        goals: { calories: day.calories, protein: day.protein, carbs: day.carbs, fat: day.fat },
        dayType: day.dayType,
      };
    }
  }
  return { goals: base, dayType: null };
}

/** 常用排布模板：数组下标 0=周一。 */
export const PLAN_TEMPLATES: { id: string; name: string; description: string; days: DayType[] }[] = [
  {
    id: "mwf",
    name: "训练日高碳",
    description: "周一/三/五高碳，二/四/六低碳，周日中碳。适合一周练三练。",
    days: ["high", "low", "high", "low", "high", "low", "medium"],
  },
  {
    id: "alternate",
    name: "高低交替",
    description: "高低碳隔天交替，周末两天连续低碳。",
    days: ["high", "low", "high", "low", "high", "low", "low"],
  },
  {
    id: "weekend",
    name: "工作日低碳",
    description: "周一至周五低碳，周六日高碳。适合周末聚餐多、工作日好控制。",
    days: ["low", "low", "low", "low", "low", "high", "high"],
  },
];

/**
 * 从基准目标推导每种日型的默认目标：
 * 蛋白不变；高碳日碳水 ×1.5、脂肪 ×0.5；低碳日碳水 ×0.5、脂肪 ×1.3；中碳日=基准。
 * 热量按宏量重算（蛋白×4 + 碳水×4 + 脂肪×9），保证四个数自洽。
 */
export function deriveTargets(base: MacroGoals): Record<DayType, MacroGoals> {
  const build = (carbs: number, fat: number) => {
    const c = Math.round(carbs);
    const f = Math.round(fat);
    return {
      calories: Math.round(base.protein * 4 + c * 4 + f * 9),
      protein: base.protein,
      carbs: c,
      fat: f,
    };
  };
  return {
    high: build(base.carbs * 1.5, base.fat * 0.5),
    medium: build(base.carbs, base.fat),
    low: build(base.carbs * 0.5, base.fat * 1.3),
  };
}
