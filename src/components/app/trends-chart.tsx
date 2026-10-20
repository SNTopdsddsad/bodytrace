"use client";

/**
 * 30 天趋势图：柱子 = 每日热量（左轴），折线 = 每日蛋白质（右轴），
 * 虚线折线 = 每天生效的热量目标（有生效计划时按天变化）。
 * Recharts 只能在客户端跑，所以标了 "use client"。
 */
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { date: string; calories: number; protein: number; carbs: number; fat: number; goalCalories: number };

export function TrendsChart({ data }: { data: Point[] }) {
  const chartData = data.map((d) => ({
    // x 轴只显示 月/日
    label: d.date.slice(5).replace("-", "/"),
    热量: Math.round(d.calories),
    蛋白质: Math.round(d.protein),
    热量目标: Math.round(d.goalCalories),
  }));

  return (
    <div className="h-64 w-full min-w-0 sm:h-80">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 5" vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} interval="preserveStartEnd" axisLine={false} tickLine={false} tickMargin={12} />
          {/* 左轴：热量 */}
          <YAxis yAxisId="cal" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          {/* 右轴：蛋白质 */}
          <YAxis yAxisId="pro" orientation="right" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            contentStyle={{ border: "1px solid var(--border)", borderRadius: 12, background: "var(--card)", fontSize: 12, color: "var(--foreground)" }}
            formatter={(value, name) =>
              name === "蛋白质" ? [`${value} g`, name] : [`${value} 千卡`, name]
            }
          />
          <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 12, paddingTop: 16 }} />
          <Bar yAxisId="cal" dataKey="热量" fill="var(--chart-1)" radius={[4, 4, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          <Line
            yAxisId="pro"
            type="monotone"
            dataKey="蛋白质"
            stroke="var(--chart-2)"
            strokeWidth={2}
            dot={false}
            isAnimationActive={false}
          />
          {/* 每天生效的目标：有生效计划时是按天变化的折线，平时是水平线 */}
          <Line
            yAxisId="cal"
            type="stepAfter"
            dataKey="热量目标"
            stroke="var(--chart-3)"
            strokeWidth={1.5}
            strokeDasharray="6 4"
            dot={false}
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
