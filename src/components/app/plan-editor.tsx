"use client";

/**
 * 碳循环计划编辑器：一周七天选日型（高/中/低碳），每种日型一套目标，
 * 加起始日和生效状态。保存时按天展开存库。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CalendarDays, LoaderCircle, Repeat, Save, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import {
  DAY_TYPE_LABELS,
  PLAN_TEMPLATES,
  WEEKDAY_LABELS,
  deriveTargets,
  type CarbCyclePlan,
  type DayType,
  type MacroGoals,
} from "@/lib/plan";

type TargetForm = Record<"calories" | "protein" | "carbs" | "fat", string>;
type TargetsForm = Record<DayType, TargetForm>;

const MACRO_FIELDS: { key: keyof TargetForm; label: string; unit: string }[] = [
  { key: "calories", label: "热量", unit: "千卡" },
  { key: "protein", label: "蛋白质", unit: "克" },
  { key: "carbs", label: "碳水", unit: "克" },
  { key: "fat", label: "脂肪", unit: "克" },
];

const DAY_TYPES = Object.keys(DAY_TYPE_LABELS) as DayType[];

function toTargetForm(t: MacroGoals): TargetForm {
  return {
    calories: t.calories.toString(),
    protein: t.protein.toString(),
    carbs: t.carbs.toString(),
    fat: t.fat.toString(),
  };
}

export function PlanEditor({ initialPlan, baseGoals, today }: {
  initialPlan: CarbCyclePlan | null;
  baseGoals: MacroGoals;
  today: string;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [types, setTypes] = useState<DayType[]>(() => initialPlan?.weekdays.map((d) => d.dayType) ?? PLAN_TEMPLATES[0].days);
  const [targets, setTargets] = useState<TargetsForm>(() => {
    const derived = deriveTargets(baseGoals);
    const form: TargetsForm = {
      high: toTargetForm(derived.high),
      medium: toTargetForm(derived.medium),
      low: toTargetForm(derived.low),
    };
    // 已有计划：用库里每种日型实际保存的数值覆盖（取该日型的第一天）
    for (const day of initialPlan?.weekdays ?? []) {
      form[day.dayType] = {
        calories: day.calories.toString(),
        protein: day.protein.toString(),
        carbs: day.carbs.toString(),
        fat: day.fat.toString(),
      };
    }
    return form;
  });
  const [startDate, setStartDate] = useState(initialPlan?.startDate ?? today);
  const [isActive, setIsActive] = useState(initialPlan?.isActive ?? true);

  async function handleSave() {
    setBusy(true);
    try {
      const num = (v: string) => Number(v);
      await api("/api/v1/plan", {
        method: "PUT",
        body: JSON.stringify({
          startDate,
          isActive,
          weekdays: types.map((dayType) => ({
            dayType,
            calories: num(targets[dayType].calories),
            protein: num(targets[dayType].protein),
            carbs: num(targets[dayType].carbs),
            fat: num(targets[dayType].fat),
          })),
        }),
      });
      toast.success(isActive ? "碳循环计划已保存并生效" : "计划已保存（当前为停用状态）");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleDelete() {
    setBusy(true);
    try {
      await api("/api/v1/plan", { method: "DELETE" });
      toast.success("计划已删除，所有日期恢复为每日目标");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-7">
      {/* 快速模板 */}
      <div className="space-y-2.5">
        <Label className="flex items-center gap-2 text-xs sm:text-sm"><Repeat className="size-3.5 sm:size-4 text-primary" aria-hidden />快速排布</Label>
        <div className="grid gap-2 min-[360px]:grid-cols-3">
          {PLAN_TEMPLATES.map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={() => setTypes(tpl.days)}
              className="rounded-xl border bg-muted/25 p-3 text-left transition-colors hover:border-primary/40 hover:bg-secondary/50"
            >
              <span className="text-sm font-medium">{tpl.name}</span>
              <span className="mt-1 block text-[11px] leading-4 text-muted-foreground">{tpl.description}</span>
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">选模板后再按自己的一周逐天调整。</p>
      </div>

      {/* 一周七天 */}
      <div className="space-y-2.5">
        <Label className="text-xs sm:text-sm" id="week-label">一周安排</Label>
        <div aria-labelledby="week-label" className="grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 xl:grid-cols-1">
          {types.map((dayType, i) => (
            <div key={WEEKDAY_LABELS[i]} className="flex items-center justify-between gap-3 rounded-xl border bg-muted/25 px-3 py-2.5">
              <span className="w-8 shrink-0 text-sm font-medium">{WEEKDAY_LABELS[i]}</span>
              <div role="group" aria-label={`${WEEKDAY_LABELS[i]}日型`} className="flex flex-1 gap-1 rounded-lg bg-muted p-1">
                {DAY_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={dayType === t}
                    onClick={() => setTypes(types.map((old, idx) => (idx === i ? t : old)))}
                    className={`h-8 flex-1 rounded-md text-xs font-medium transition-colors ${dayType === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    {DAY_TYPE_LABELS[t].replace("日", "")}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 每种日型的目标 */}
      <div className="space-y-2.5">
        <Label className="text-xs sm:text-sm">每种日型的目标</Label>
        <div className="grid gap-3 min-[360px]:grid-cols-3">
          {DAY_TYPES.map((t) => (
            <div key={t} className="space-y-3 rounded-xl border bg-muted/25 p-3">
              <p className="text-sm font-medium">{DAY_TYPE_LABELS[t]}</p>
              <div className="grid grid-cols-2 gap-2">
                {MACRO_FIELDS.map((f) => (
                  <div key={f.key}>
                    <label htmlFor={`target-${t}-${f.key}`} className="mb-1 block text-[11px] text-muted-foreground">{f.label}</label>
                    <div className="relative">
                      <Input
                        id={`target-${t}-${f.key}`}
                        type="number"
                        min={0}
                        required
                        className="h-10 pr-8 text-sm font-medium tabular-nums"
                        value={targets[t][f.key]}
                        onChange={(e) => setTargets({ ...targets, [t]: { ...targets[t], [f.key]: e.target.value } })}
                      />
                      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">{f.unit}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 起始日 + 生效状态 */}
      <div className="grid gap-3 min-[360px]:grid-cols-2">
        <div className="space-y-2 rounded-xl border bg-muted/25 p-3">
          <Label htmlFor="plan-start" className="flex items-center gap-2 text-xs sm:text-sm"><CalendarDays className="size-3.5 sm:size-4 text-primary" aria-hidden />起始日期</Label>
          <Input id="plan-start" type="date" value={startDate} max={today} required onChange={(e) => setStartDate(e.target.value)} className="h-10" />
          <p className="text-[11px] text-muted-foreground">起始日之前的日期不受计划影响，仍按每日目标。</p>
        </div>
        <div className="space-y-2 rounded-xl border bg-muted/25 p-3">
          <Label className="text-xs sm:text-sm">生效状态</Label>
          <div role="group" aria-label="生效状态" className="flex gap-1 rounded-lg bg-muted p-1">
            <button type="button" aria-pressed={isActive} onClick={() => setIsActive(true)} className={`h-9 flex-1 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>生效中</button>
            <button type="button" aria-pressed={!isActive} onClick={() => setIsActive(false)} className={`h-9 flex-1 rounded-md text-sm font-medium transition-colors ${!isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>已停用</button>
          </div>
          <p className="text-[11px] text-muted-foreground">停用后所有日期回到每日目标；配置保留，随时可重新生效。</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}保存计划
        </Button>
        {initialPlan && (
          <Button type="button" variant="outline" size="lg" disabled={busy} onClick={handleDelete}>
            <Trash2 className="size-4" aria-hidden />删除计划
          </Button>
        )}
      </div>
    </form>
  );
}
