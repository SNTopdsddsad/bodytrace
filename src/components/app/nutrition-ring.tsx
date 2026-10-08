/**
 * 热量环：SVG 圆环进度条，展示“已摄入 vs 目标”。
 * 进度用翡翠绿→蓝绿的渐变描边；超标时变红色。
 * 纯展示组件（不依赖浏览器交互），所以不需要 "use client"。
 */
export function NutritionRing({
  consumed,
  goal,
  size = 176,
}: {
  consumed: number;
  goal: number;
  size?: number;
}) {
  const remaining = Math.round(goal - consumed);
  const pct = goal > 0 ? Math.min(consumed / goal, 1) : 0;
  const over = consumed > goal;

  // 圆环几何：周长 = 2πr，进度用虚线段长度控制
  const stroke = 14;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <defs>
          {/* 渐变要定义在 <defs> 里，再通过 id 引用 */}
          <linearGradient id="ring-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#10b981" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
        </defs>
        {/* 底轨（浅灰环） */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        {/* 进度环：虚线长度 = 周长 × 比例 */}
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          stroke={over ? undefined : "url(#ring-gradient)"}
          className={over ? "stroke-destructive" : undefined}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`text-4xl font-bold tabular-nums ${over ? "text-destructive" : ""}`}>
          {Math.abs(remaining)}
        </span>
        <span className="text-sm text-muted-foreground">
          {over ? "千卡已超" : "千卡还能吃"}
        </span>
        <span className="mt-1 text-xs tabular-nums text-muted-foreground">
          {Math.round(consumed)} / {goal} 千卡
        </span>
      </div>
    </div>
  );
}
