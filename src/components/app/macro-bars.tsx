/**
 * 三大宏量营养素进度条：蛋白质 / 碳水 / 脂肪。
 */
const MACROS = [
  { key: "protein", label: "蛋白质", barColor: "bg-sky-500" },
  { key: "carbs", label: "碳水", barColor: "bg-amber-500" },
  { key: "fat", label: "脂肪", barColor: "bg-rose-500" },
] as const;

export function MacroBars({
  totals,
  goals,
}: {
  totals: { protein: number; carbs: number; fat: number };
  goals: { protein: number; carbs: number; fat: number };
}) {
  return (
    <div className="space-y-4">
      {MACROS.map((m) => {
        const current = Math.round(totals[m.key]);
        const goal = goals[m.key];
        const pct = goal > 0 ? Math.min((current / goal) * 100, 100) : 0;
        return (
          <div key={m.key}>
            <div className="mb-1 flex items-baseline justify-between text-sm">
              <span>{m.label}</span>
              <span className="tabular-nums text-muted-foreground">
                <span className="font-medium text-foreground">{current}</span> / {goal} g
              </span>
            </div>
            {/* 进度条：底层灰条 + 按百分比宽度的彩色条 */}
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className={`h-full rounded-full ${m.barColor} transition-all`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
