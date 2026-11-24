"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, CalendarCheck2 } from "lucide-react";
import { motion } from "motion/react";
import {
  buildSupplementHabitMatrix,
  type HabitCellStatus,
  type HabitMatrixCell,
  type Supplement,
  type SupplementIntake,
} from "@/lib/supplements";
import { TAB_SPRING } from "./motion-provider";

function statusSummary(cell: HabitMatrixCell): string {
  switch (cell.status) {
    case "full":
      return cell.planned > 0
        ? `已记全部 ${cell.completed}/${cell.planned} 次`
        : `已记 ${cell.taken} 次`;
    case "partial":
      return `已记 ${cell.completed}/${cell.planned} 次`;
    case "missed":
      if (cell.taken > 0) return `计划时段未记，另有 ${cell.taken} 次额外记录`;
      return cell.planned > 0 ? `未记录（计划 ${cell.planned} 次）` : "未记录";
    case "extra":
      return `非计划日 · 已记 ${cell.taken} 次`;
    case "offDay":
      return "非计划日";
    case "beforeStart":
      return "尚未开始该补剂";
  }
}

function StatusDot({ status, compact }: { status: HabitCellStatus; compact: boolean }) {
  const sizeClass = compact ? "size-2.5" : "size-3.5";
  if (status === "full" || status === "extra") {
    return <span className={`block rounded-full bg-primary ${sizeClass}`} aria-hidden />;
  }
  if (status === "partial") {
    return (
      <svg
        viewBox="0 0 16 16"
        className={`block text-primary ${sizeClass}`}
        aria-hidden
      >
        <circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
        <path d="M8 1.5 A6.5 6.5 0 0 0 8 14.5 Z" fill="currentColor" />
      </svg>
    );
  }
  if (status === "missed") {
    return (
      <span
        className={`block rounded-full border border-border bg-background ${sizeClass}`}
        aria-hidden
      />
    );
  }
  return (
    <span
      className={`block rounded-full bg-muted-foreground/30 ${compact ? "size-1" : "size-1.5"}`}
      aria-hidden
    />
  );
}

export function SupplementHabitMatrix({
  supplements,
  windowIntakes,
  selectedDate,
  today,
}: {
  supplements: Supplement[];
  windowIntakes: SupplementIntake[];
  selectedDate: string;
  today: string;
}) {
  const [days, setDays] = useState<14 | 30>(14);
  const [inspected, setInspected] = useState<{
    supplementName: string;
    cell: HabitMatrixCell;
  } | null>(null);

  const matrix = useMemo(
    () => buildSupplementHabitMatrix(supplements, windowIntakes, today, days),
    [supplements, windowIntakes, today, days],
  );

  const compact = days === 30;

  return (
    <section
      aria-labelledby="supplement-habit-title"
      className="space-y-4 rounded-2xl border bg-card p-5 shadow-[0_2px_12px_-8px_#233e2e26]"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="supplement-habit-title" className="flex items-center gap-1.5 text-sm font-bold">
            <CalendarCheck2 className="size-4 text-primary" aria-hidden />
            <span>服用规律</span>
          </h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            近 {days} 天客观记录，点击任意日期可核对或补录
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-xl border bg-background p-1 text-xs">
          {([14, 30] as const).map((option) => (
            <button
              key={option}
              type="button"
              aria-pressed={days === option}
              onClick={() => {
                setDays(option);
                setInspected(null);
              }}
              className={`relative rounded-lg px-2.5 py-1 font-mono transition-colors ${
                days === option
                  ? "font-semibold text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {days === option && (
                <motion.span
                  layoutId="supplement-matrix-range"
                  transition={TAB_SPRING}
                  className="absolute inset-0 rounded-lg bg-primary"
                  aria-hidden
                />
              )}
              <span className="relative z-10">{option}天</span>
            </button>
          ))}
        </div>
      </div>

      {matrix.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-background px-4 py-6 text-center text-xs text-muted-foreground">
          添加常规补剂并开始记录后，这里会按补剂展示近 {days} 天的服用点阵。
        </p>
      ) : (
        <div className="space-y-3">
          {/* 日期头标 */}
          <div className="flex items-center justify-between pl-24 pr-11 font-mono text-[10px] text-muted-foreground sm:pl-28">
            <span>{matrix.dates[0]?.slice(5)}</span>
            <span>{matrix.dates[Math.floor(matrix.dates.length / 2)]?.slice(5)}</span>
            <span>今日</span>
          </div>

          <div className="space-y-2.5">
            {matrix.rows.map((row) => {
              const ratioText =
                row.supplement.mode === "scheduled"
                  ? `${row.fullDays}/${row.plannedDays}`
                  : `${row.takenDays}天`;
              return (
                <div key={row.supplement.id} className="flex items-center gap-2">
                  <div className="w-22 shrink-0 truncate text-xs font-medium sm:w-26" title={row.supplement.name}>
                    {row.supplement.name}
                  </div>
                  <div
                    className={`grid flex-1 items-center ${
                      compact ? "grid-cols-15 gap-y-1.5 sm:grid-cols-30" : "grid-cols-14"
                    } gap-x-0.5`}
                    role="group"
                    aria-label={`${row.supplement.name} 近 ${days} 天服用记录`}
                  >
                    {row.cells.map((cell) => {
                      const isSelectedDay = cell.date === selectedDate;
                      const isInspected =
                        inspected?.supplementName === row.supplement.name &&
                        inspected?.cell.date === cell.date;
                      return (
                        <button
                          key={cell.date}
                          type="button"
                          onClick={() =>
                            setInspected({ supplementName: row.supplement.name, cell })
                          }
                          aria-label={`${cell.date} ${row.supplement.name}：${statusSummary(cell)}`}
                          className={`flex h-6 items-center justify-center rounded-md transition-colors hover:bg-secondary/70 focus-visible:outline-2 focus-visible:outline-primary ${
                            isInspected
                              ? "bg-secondary ring-1 ring-primary/50"
                              : isSelectedDay
                                ? "bg-secondary/50"
                                : ""
                          }`}
                        >
                          <StatusDot status={cell.status} compact={compact} />
                        </button>
                      );
                    })}
                  </div>
                  <div className="w-10 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                    {ratioText}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 图例 */}
          <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 border-t pt-2.5 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <StatusDot status="full" compact={false} />
              全服
            </span>
            <span className="inline-flex items-center gap-1.5">
              <StatusDot status="partial" compact={false} />
              部分
            </span>
            <span className="inline-flex items-center gap-1.5">
              <StatusDot status="missed" compact={false} />
              未记
            </span>
            <span className="inline-flex items-center gap-1.5">
              <StatusDot status="offDay" compact={false} />
              无计划
            </span>
          </div>

          {/* 选中日期核对条 */}
          {inspected && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2 text-xs">
              <div className="min-w-0">
                <span className="font-mono text-muted-foreground">{inspected.cell.date}</span>{" "}
                <span className="font-semibold">{inspected.supplementName}</span>
                <span className="text-muted-foreground"> · {statusSummary(inspected.cell)}</span>
              </div>
              {inspected.cell.date !== selectedDate && (
                <Link
                  href={
                    inspected.cell.date === today
                      ? "/supplements"
                      : `/supplements?date=${inspected.cell.date}`
                  }
                  className="inline-flex shrink-0 items-center gap-1 font-medium text-primary hover:underline"
                >
                  查看/补录这一天
                  <ArrowRight className="size-3" aria-hidden />
                </Link>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}
