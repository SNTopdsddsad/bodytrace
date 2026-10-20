/**
 * 趋势服务：最近 N 天每天的营养合计，供图表展示。
 * 有饮食计划时附带每天生效的热量目标，图上画成按天目标线。
 */
import { shiftDate, todayStr } from "@/lib/date";
import { resolveDayGoals } from "@/lib/plan";
import { getDailyTotals } from "./meals";
import { getGoals } from "./goals";
import { getPlan } from "./plan";

export type TrendPoint = {
  date: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  /** 当天生效的热量目标（计划内日期按当天计划目标，否则每日目标） */
  goalCalories: number;
};

export async function getTrends(userId: string, days = 30): Promise<TrendPoint[]> {
  const today = todayStr();
  const from = shiftDate(today, -(days - 1));

  const [totals, base, plan] = await Promise.all([
    getDailyTotals(userId, from, today),
    getGoals(userId),
    getPlan(userId),
  ]);
  const byDate = new Map(totals.map((t) => [t.date, t]));

  // 没有记录的日期补 0，图表曲线才不会断档跳日期
  const result: TrendPoint[] = [];
  for (let i = 0; i < days; i++) {
    const d = shiftDate(from, i);
    const t = byDate.get(d);
    result.push({
      date: d,
      calories: t?.calories ?? 0,
      protein: t?.protein ?? 0,
      carbs: t?.carbs ?? 0,
      fat: t?.fat ?? 0,
      goalCalories: resolveDayGoals(plan, base, d).goals.calories,
    });
  }
  return result;
}
