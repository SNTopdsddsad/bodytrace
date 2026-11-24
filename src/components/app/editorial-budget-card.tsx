"use client";

import NumberFlow, { NumberFlowGroup } from "@number-flow/react";
import { Pencil } from "lucide-react";
import { motion } from "motion/react";
import type { Goals } from "@/services/goals";
import type { MacroLike } from "@/lib/nutrition";
import { SOFT_SPRING, TAP_SPRING } from "./motion-provider";

const MACROS = [
  { key: "protein", label: "蛋白质 (Protein)", barClass: "bg-chart-1", dotClass: "bg-chart-1" },
  { key: "carbs", label: "碳水 (Carbs)", barClass: "bg-chart-2", dotClass: "bg-chart-2" },
  { key: "fat", label: "脂肪 (Fat)", barClass: "bg-chart-3", dotClass: "bg-chart-3" },
] as const;

export function EditorialBudgetCard({
  date,
  totals,
  goals,
  onEditGoals,
}: {
  date: string;
  totals: MacroLike;
  goals: Goals;
  onEditGoals: () => void;
}) {
  const eatenCalories = Math.round(totals.calories);
  const diff = goals.calories - eatenCalories;
  const pct = goals.calories > 0 ? Math.min(100, Math.round((eatenCalories / goals.calories) * 100)) : 0;

  return (
    <section
      aria-labelledby="editorial-budget-title"
      className="space-y-4 rounded-2xl border bg-card p-5 shadow-[0_2px_12px_-8px_#233e2e26]"
    >
      <div className="flex items-center justify-between gap-2">
        <span
          id="editorial-budget-title"
          className="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
        >
          今日热量预算
        </span>
        <motion.button
          type="button"
          whileHover={{ scale: 1.03 }}
          whileTap={{ scale: 0.95 }}
          transition={TAP_SPRING}
          onClick={onEditGoals}
          className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-secondary/75 px-2.5 py-0.5 font-mono text-xs font-medium text-primary transition-colors hover:bg-secondary"
          title="点击修改每日基础目标"
        >
          <span>Base {goals.calories} kcal</span>
          <Pencil className="size-3" aria-hidden />
        </motion.button>
      </div>

      <NumberFlowGroup>
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{diff >= 0 ? "剩余可安心享用" : "已超出每日预算"}</span>
            <span className="font-mono">{date}</span>
          </div>

          <div className="mt-1 flex items-baseline gap-2">
            <span
              className={`font-mono text-4xl font-bold tracking-tight tabular-nums ${
                diff < 0 ? "text-destructive" : "text-primary"
              }`}
            >
              <NumberFlow value={Math.abs(diff)} />
            </span>
            <span className="text-xs text-muted-foreground">kcal</span>
          </div>

          <div
            className="mt-3 h-3.5 w-full overflow-hidden rounded-full border bg-background p-0.5"
            role="progressbar"
            aria-label="今日热量进度"
            aria-valuenow={eatenCalories}
            aria-valuemin={0}
            aria-valuemax={Math.max(goals.calories, eatenCalories)}
            aria-valuetext={`${eatenCalories} / ${goals.calories} 千卡`}
          >
            <motion.div
              initial={false}
              animate={{ width: `${pct}%` }}
              transition={SOFT_SPRING}
              className={`h-full rounded-full ${
                diff < 0 ? "bg-destructive" : "bg-primary"
              }`}
            />
          </div>

          <div className="mt-1.5 flex justify-between font-mono text-xs tabular-nums text-muted-foreground">
            <span>
              已吃{" "}
              <strong className="text-foreground">
                <NumberFlow value={eatenCalories} />
              </strong>{" "}
              kcal
            </span>
            <span>
              <NumberFlow value={pct} suffix="%" />
            </span>
          </div>
        </div>

        <div className="space-y-2.5 border-t pt-3 text-xs">
          {MACROS.map((macro) => {
            const current = Math.round(totals[macro.key]);
            const goal = goals[macro.key];
            const barPct = goal > 0 ? Math.min(100, Math.round((current / goal) * 100)) : 0;

            return (
              <div key={macro.key}>
                <div className="mb-1 flex justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 font-medium">
                    <span className={`size-2 rounded-full ${macro.dotClass}`} aria-hidden />
                    {macro.label}
                  </span>
                  <span className="font-mono tabular-nums">
                    <strong>
                      <NumberFlow value={current} />
                    </strong>{" "}
                    / {goal}g
                  </span>
                </div>
                <div
                  className="h-2 w-full overflow-hidden rounded-full bg-background"
                  role="progressbar"
                  aria-label={macro.label}
                  aria-valuenow={current}
                  aria-valuemin={0}
                  aria-valuemax={Math.max(goal, current)}
                  aria-valuetext={`${current} / ${goal} 克`}
                >
                  <motion.div
                    initial={false}
                    animate={{ width: `${barPct}%` }}
                    transition={SOFT_SPRING}
                    className={`h-full rounded-full ${macro.barClass}`}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </NumberFlowGroup>
    </section>
  );
}
