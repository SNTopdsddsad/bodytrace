/**
 * 趋势服务：最近 N 天每天的营养合计，供图表展示。
 */
import { shiftDate, todayStr } from "@/lib/date";
import { getDailyTotals } from "./meals";

export async function getTrends(userId: string, days = 30) {
  const today = todayStr();
  const from = shiftDate(today, -(days - 1));

  const totals = await getDailyTotals(userId, from, today);
  const byDate = new Map(totals.map((t) => [t.date, t]));

  // 没有记录的日期补 0，图表曲线才不会断档跳日期
  const result: { date: string; calories: number; protein: number; carbs: number; fat: number }[] =
    [];
  for (let i = 0; i < days; i++) {
    const d = shiftDate(from, i);
    const t = byDate.get(d);
    result.push({
      date: d,
      calories: t?.calories ?? 0,
      protein: t?.protein ?? 0,
      carbs: t?.carbs ?? 0,
      fat: t?.fat ?? 0,
    });
  }
  return result;
}
