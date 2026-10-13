"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { bloodPressureChart, measurementChart, measurementUnit } from "@/lib/measurements";
import type { Measurement, MeasurementKind } from "@/lib/measurements";

export function MeasurementChart({ entries, kind }: { entries: Measurement[]; kind: MeasurementKind }) {
  const rows = kind === "bloodPressure" ? bloodPressureChart(entries) : measurementChart(entries, kind);
  const data = rows.map(row => ({ ...row, x: Date.parse(`${row.date}T00:00:00Z`) }));
  const dateLabel = (value: number) => new Date(value).toISOString().slice(0, 10);
  const line = { type: "linear" as const, strokeWidth: 2, dot: { r: 3 }, connectNulls: false, isAnimationActive: false };

  return (
    <div className="h-64 min-w-0 sm:h-72" role="img" aria-label={`身体指标趋势，单位 ${measurementUnit(kind)}。完整数值见下方历史记录。`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={data} margin={{ top: 12, right: 12, bottom: 8, left: 0 }} accessibilityLayer>
          <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="x" type="number" scale="time" domain={["dataMin", "dataMax"]} tickFormatter={value => dateLabel(value).slice(5)} minTickGap={32} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <YAxis width={48} domain={["auto", "auto"]} tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
          <Tooltip labelFormatter={value => dateLabel(Number(value))} formatter={(value, name) => [`${value} ${measurementUnit(kind)}`, name]} contentStyle={{ borderRadius: 12, border: "1px solid var(--border)", background: "var(--card)", color: "var(--foreground)", fontSize: 12 }} />
          {kind === "bloodPressure" ? <>
            <Line {...line} dataKey="morningSystolic" name="晨间·收缩压" stroke="var(--chart-2)" />
            <Line {...line} dataKey="morningDiastolic" name="晨间·舒张压" stroke="var(--chart-4)" />
            <Line {...line} dataKey="eveningSystolic" name="夜间·收缩压" stroke="var(--chart-2)" strokeDasharray="6 3" />
            <Line {...line} dataKey="eveningDiastolic" name="夜间·舒张压" stroke="var(--chart-4)" strokeDasharray="6 3" />
          </> : <Line {...line} dataKey="value" name={kind === "weight" ? "体重" : "体脂率"} stroke="var(--chart-2)" />}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
