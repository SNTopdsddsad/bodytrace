/**
 * 趋势页：最近 30 天的热量/蛋白质走势 + 几个汇总数字。
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendsChart } from "@/components/app/trends-chart";
import { getSession } from "@/lib/api-auth";
import { getGoals } from "@/services/goals";
import { getTrends } from "@/services/trends";

export default async function TrendsPage() {
  const session = await getSession();
  const userId = session!.user.id;

  const [trends, goals] = await Promise.all([getTrends(userId, 30), getGoals(userId)]);

  // 只统计有记录的天，避免用 0 拉低平均
  const recorded = trends.filter((d) => d.calories > 0);
  const avg = (pick: (d: (typeof trends)[number]) => number) =>
    recorded.length === 0 ? 0 : Math.round(recorded.reduce((s, d) => s + pick(d), 0) / recorded.length);

  const stats = [
    { label: "日均热量", value: avg((d) => d.calories), unit: "千卡" },
    { label: "日均蛋白质", value: avg((d) => d.protein), unit: "克" },
    { label: "有记录天数", value: recorded.length, unit: `/${trends.length} 天` },
  ];

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">趋势</h1>
        <p className="text-sm text-muted-foreground">最近 30 天</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {stats.map((s) => (
          <Card key={s.label}>
            <CardContent className="py-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">
                {s.value}
                <span className="ml-1 text-xs font-normal text-muted-foreground">{s.unit}</span>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">热量 & 蛋白质</CardTitle>
        </CardHeader>
        <CardContent className="pb-4">
          {recorded.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              还没有记录，先去日记页记几笔吧
            </p>
          ) : (
            <TrendsChart data={trends} calorieGoal={goals.calories} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}
