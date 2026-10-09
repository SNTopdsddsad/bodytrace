import { Flame } from "lucide-react";

export function NutritionRing({ consumed, goal, size = 192, inverse = false }: {
  consumed: number;
  goal: number;
  size?: number;
  inverse?: boolean;
}) {
  const remaining = Math.round(goal - consumed);
  const pct = goal > 0 ? Math.max(0, Math.min(consumed / goal, 1)) : 0;
  const over = consumed > goal;
  const stroke = 10;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`已摄入 ${Math.round(consumed)} 千卡，目标 ${goal} 千卡，${over ? "超过" : "剩余"} ${Math.abs(remaining)} 千卡`}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} stroke={inverse ? "#ffffff26" : "var(--muted)"} />
        {pct > 0 && <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${c * pct} ${c}`} stroke={over ? (inverse ? "#f4b4a6" : "var(--destructive)") : (inverse ? "var(--brand-light)" : "var(--primary)")} />}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <Flame className={`mb-1.5 size-5 ${inverse ? "text-(--brand-light)" : "text-primary"}`} strokeWidth={1.6} aria-hidden />
        <span className={`text-4xl font-semibold tracking-tight tabular-nums ${over ? (inverse ? "text-[#f4b4a6]" : "text-destructive") : ""}`}>{Math.abs(remaining).toLocaleString("zh-CN")}</span>
        <span className={`mt-1 text-xs ${inverse ? "text-white/65" : "text-muted-foreground"}`}>{over ? "千卡 · 超出目标" : "千卡 · 剩余热量"}</span>
      </div>
    </div>
  );
}
