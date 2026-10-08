"use client";

/**
 * 30 天趋势图：柱子 = 每日热量（左轴），折线 = 每日蛋白质（右轴），
 * 红色虚线 = 热量目标。Recharts 只能在客户端跑，所以标了 "use client"。
 */
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { date: string; calories: number; protein: number; carbs: number; fat: number };

export function TrendsChart({ data, calorieGoal }: { data: Point[]; calorieGoal: number }) {
  const chartData = data.map((d) => ({
    // x 轴只显示 月/日
    label: d.date.slice(5).replace("-", "/"),
    热量: Math.round(d.calories),
    蛋白质: Math.round(d.protein),
  }));

  return (
    <div className="h-80 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={chartData} margin={{ top: 8, right: 4, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e4e4e7" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
          {/* 左轴：热量 */}
          <YAxis yAxisId="cal" tick={{ fontSize: 11 }} />
          {/* 右轴：蛋白质 */}
          <YAxis yAxisId="pro" orientation="right" tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value, name) =>
              name === "热量" ? [`${value} 千卡`, name] : [`${value} g`, name]
            }
          />
          <Legend />
          {/* 目标参考线 */}
          <ReferenceLine
            yAxisId="cal"
            y={calorieGoal}
            stroke="#ef4444"
            strokeDasharray="6 4"
            label={{ value: `目标 ${calorieGoal}`, position: "insideTopRight", fontSize: 11 }}
          />
          <Bar yAxisId="cal" dataKey="热量" fill="#a1a1aa" radius={[3, 3, 0, 0]} />
          <Line
            yAxisId="pro"
            type="monotone"
            dataKey="蛋白质"
            stroke="#0ea5e9"
            strokeWidth={2}
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
