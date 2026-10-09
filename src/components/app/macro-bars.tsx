const MACROS = [
  { key: "protein", label: "蛋白质", barColor: "bg-chart-2", dotColor: "bg-chart-2" },
  { key: "carbs", label: "碳水化合物", barColor: "bg-chart-3", dotColor: "bg-chart-3" },
  { key: "fat", label: "脂肪", barColor: "bg-chart-4", dotColor: "bg-chart-4" },
] as const;

export function MacroBars({ totals, goals, compact = false }: {
  totals: { protein: number; carbs: number; fat: number };
  goals: { protein: number; carbs: number; fat: number };
  compact?: boolean;
}) {
  return (
    <div className={compact ? "space-y-3" : "space-y-5"}>
      {MACROS.map((m) => {
        const current = Math.round(totals[m.key]);
        const goal = goals[m.key];
        const pct = goal > 0 ? Math.max(0, Math.min((current / goal) * 100, 100)) : 0;
        return (
          <div key={m.key}>
            <div className={`${compact ? "mb-1.5" : "mb-2.5"} flex items-baseline justify-between gap-3 text-sm`}>
              <span className="flex items-center gap-2"><span className={`size-2 rounded-full ${m.dotColor}`} aria-hidden />{m.label}</span>
              <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground"><span className="text-sm font-semibold text-foreground">{current}</span> / {goal} g</span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-full bg-muted" role="progressbar" aria-label={m.label} aria-valuenow={current} aria-valuemin={0} aria-valuemax={Math.max(goal, current)} aria-valuetext={`${current} / ${goal} 克`}>
              <div className={`h-full rounded-full ${m.barColor} transition-[width] duration-500`} style={{ width: `${pct}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}
