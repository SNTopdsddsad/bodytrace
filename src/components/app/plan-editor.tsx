"use client";

/**
 * 饮食计划编辑器：一周七天，一天一张卡。
 * 每张卡先填这一天四个目标，再按早餐 / 午餐 / 晚餐添加具体食物；
 * 食物行的热量与宏量按食物库每 100g 数值 × 克数折算（保存后用服务端读回值覆盖）。
 * 保存是整份替换：起始日（含）之后所有日期的目标与三餐食物都会被覆盖，没有版本历史。
 */
import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  CalendarDays,
  ChevronDown,
  History,
  LoaderCircle,
  Plus,
  Save,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PlanFoodPicker, type PlanFoodPick } from "@/components/app/plan-food-picker";
import { api, ApiError } from "@/lib/api-client";
import { MEAL_LABELS, scaleMacro } from "@/lib/nutrition";
import type { MacroLike, MealType } from "@/lib/nutrition";
import { WEEKDAY_LABELS, mondayIndex, summarizePlanDay } from "@/lib/plan";
import type { MacroGoals, PlanItem, WeeklyPlan } from "@/lib/plan";

type TargetForm = Record<"calories" | "protein" | "carbs" | "fat", string>;

/** 目标输入框的字段、单位与可接受区间（与 services/plan.ts 的 planSchema 一致） */
const TARGET_FIELDS = [
  { key: "calories", label: "热量", unit: "千卡", min: 500, max: 8000 },
  { key: "protein", label: "蛋白质", unit: "克", min: 0, max: 600 },
  { key: "carbs", label: "碳水", unit: "克", min: 0, max: 1200 },
  { key: "fat", label: "脂肪", unit: "克", min: 0, max: 500 },
] as const satisfies readonly {
  key: keyof TargetForm;
  label: string;
  unit: string;
  min: number;
  max: number;
}[];

/** 计划只排早 / 午 / 晚三餐；加餐只在旧数据里出现时保留展示 */
const PLAN_MEALS = ["breakfast", "lunch", "dinner"] as const satisfies readonly MealType[];

/** 编辑中的一行食物：per100g 为 null 表示食物已删除，营养无法折算 */
type ItemDraft = {
  key: string;
  id: string | null;
  weekday: number;
  mealType: MealType;
  foodId: string | null;
  name: string;
  grams: string;
  per100g: MacroLike | null;
};

function toTargetForm(goals: MacroGoals): TargetForm {
  return {
    calories: goals.calories.toString(),
    protein: goals.protein.toString(),
    carbs: goals.carbs.toString(),
    fat: goals.fat.toString(),
  };
}

/** 计划项 → 编辑行：直接使用食物库原始每 100g 营养，避免放大舍入误差。 */
function toDraft(item: PlanItem): ItemDraft {
  return {
    key: item.id,
    id: item.id,
    weekday: item.weekday,
    mealType: item.mealType,
    foodId: item.foodId,
    name: item.name,
    grams: item.grams.toString(),
    per100g: item.per100g,
  };
}

function draftMacro(draft: ItemDraft): MacroLike | null {
  if (draft.per100g === null) return null;
  const grams = Number(draft.grams);
  if (draft.grams.trim() === "" || !Number.isFinite(grams) || grams <= 0) return null;
  return scaleMacro(draft.per100g, grams);
}

function gramsProblem(draft: ItemDraft): boolean {
  const grams = Number(draft.grams);
  return draft.grams.trim() === "" || !Number.isFinite(grams) || grams < 1 || grams > 5000;
}

/** 编辑行 → PlanItem 形状，交给 lib/plan 的 summarizePlanDay 计数与合计（缺营养的项只计 missing） */
function toPlanItems(drafts: ItemDraft[]): PlanItem[] {
  return drafts.map((draft) => {
    const macro = draftMacro(draft);
    return {
      id: draft.id ?? draft.key,
      weekday: draft.weekday,
      mealType: draft.mealType,
      foodId: draft.foodId,
      name: draft.name,
      grams: Number(draft.grams) || 0,
      per100g: draft.per100g,
      calories: macro ? macro.calories : null,
      protein: macro ? macro.protein : null,
      carbs: macro ? macro.carbs : null,
      fat: macro ? macro.fat : null,
    };
  });
}

function formatDiff(diff: number): string {
  return diff > 0 ? `+${diff}` : `${diff}`;
}

export function PlanEditor({
  initialPlan,
  baseGoals,
  today,
}: {
  initialPlan: WeeklyPlan | null;
  baseGoals: MacroGoals;
  today: string;
}) {
  const router = useRouter();
  const todayIndex = mondayIndex(today);
  const [busy, setBusy] = useState(false);
  // 同步拦截重复提交，以及已经关闭的选择弹层迟到的回调。
  const pending = useRef(false);
  const [startDate, setStartDate] = useState(initialPlan?.startDate ?? today);
  const [isActive, setIsActive] = useState(initialPlan?.isActive ?? true);
  const [weekdays, setWeekdays] = useState<TargetForm[]>(() =>
    (initialPlan?.weekdays ?? Array.from({ length: 7 }, () => baseGoals)).map(toTargetForm),
  );
  const [drafts, setDrafts] = useState<ItemDraft[]>(() => (initialPlan?.items ?? []).map(toDraft));
  // 默认只展开今天，其余折叠；折叠时卡头仍显示合计热量
  const [openDays, setOpenDays] = useState<number[]>([todayIndex]);
  const [picking, setPicking] = useState<{ weekday: number; mealType: MealType } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // 本地新增行的自增序号：只用于生成唯一 key（删行后 rows.length 会重复，不能用它）
  const newItemSeq = useRef(0);

  const planItems = toPlanItems(drafts);
  // 起始日早于今天：保存会连已经过去的日期一起改写。
  // startDate 被清空时是 ""，不能参与比较，否则提示里会出现空日期。
  const rewritesPast = startDate !== "" && startDate < today;

  function toggleDay(day: number) {
    setOpenDays((days) => (days.includes(day) ? days.filter((d) => d !== day) : [...days, day]));
  }

  function setTarget(day: number, key: keyof TargetForm, value: string) {
    setWeekdays((rows) => rows.map((row, i) => (i === day ? { ...row, [key]: value } : row)));
  }

  function setGrams(key: string, value: string) {
    setDrafts((rows) => rows.map((row) => (row.key === key ? { ...row, grams: value } : row)));
  }

  function removeItem(key: string) {
    setDrafts((rows) => rows.filter((row) => row.key !== key));
  }

  function addFood(pick: PlanFoodPick) {
    if (!picking || pending.current) return;
    newItemSeq.current += 1;
    const key = `new-${newItemSeq.current}`;
    setDrafts((rows) => [
      ...rows,
      {
        key,
        id: null,
        weekday: picking.weekday,
        mealType: picking.mealType,
        foodId: pick.foodId,
        name: pick.name,
        grams: "100",
        per100g: pick.per100g,
      },
    ]);
    setPicking(null);
  }

  /** 保存成功后用服务端读回值覆盖本地状态（拿到 id 与实时折算营养） */
  function applyPlan(plan: WeeklyPlan) {
    setStartDate(plan.startDate);
    setIsActive(plan.isActive);
    setWeekdays(plan.weekdays.map(toTargetForm));
    setDrafts(plan.items.map(toDraft));
  }

  function findTargetProblem(): string | null {
    for (let day = 0; day < weekdays.length; day++) {
      for (const field of TARGET_FIELDS) {
        const raw = weekdays[day][field.key].trim();
        const value = Number(raw);
        if (
          raw === "" ||
          !Number.isFinite(value) ||
          !Number.isInteger(value) ||
          value < field.min ||
          value > field.max
        ) {
          return `${WEEKDAY_LABELS[day]}的${field.label}需要是 ${field.min}–${field.max} 之间的整数`;
        }
      }
    }
    return null;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending.current) return;

    if (startDate === "") {
      toast.error("请先选择起始日期");
      return;
    }
    const targetProblem = findTargetProblem();
    if (targetProblem) {
      toast.error(targetProblem);
      return;
    }
    const badGrams = drafts.find(gramsProblem);
    if (badGrams) {
      toast.error(`「${badGrams.name}」的克数需要是 1–5000 之间的数值`);
      return;
    }

    pending.current = true;
    setBusy(true);
    try {
      const { plan } = await api<{ plan: WeeklyPlan | null }>("/api/v1/plan", {
        method: "PUT",
        body: JSON.stringify({
          startDate,
          isActive,
          weekdays: weekdays.map((row) => ({
            calories: Number(row.calories),
            protein: Number(row.protein),
            carbs: Number(row.carbs),
            fat: Number(row.fat),
          })),
          // 只传食物引用与克数：食物名与营养由服务端按食物库实时折算。
          // 食物已删除的既有行照样提交（foodId: null + 它在计划里的 id），服务端沿用原来的名称与克数保留这一项；
          // 新增行没有 id，服务端按 foodId 落库。
          items: drafts.map((draft) => ({
            ...(draft.id === null ? {} : { id: draft.id }),
            weekday: draft.weekday,
            mealType: draft.mealType,
            foodId: draft.foodId,
            grams: Number(draft.grams),
          })),
        }),
      });
      if (plan) applyPlan(plan);
      toast.success(isActive ? "计划已保存并生效" : "计划已保存（当前为停用状态）");
      router.refresh();
    } catch (error) {
      if (error instanceof ApiError && error.status === 400) {
        toast.error(`${error.message}（已填内容已保留）`);
      } else {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  async function handleDelete() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try {
      await api("/api/v1/plan", { method: "DELETE" });
      setConfirmDelete(false);
      // 服务端已删除：本地一起回到默认状态，避免删完还显示旧内容
      setStartDate(today);
      setIsActive(true);
      setWeekdays(Array.from({ length: 7 }, () => toTargetForm(baseGoals)));
      setDrafts([]);
      toast.success("计划已删除，所有日期恢复为每日目标");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "删除失败");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-7" noValidate>
      {rewritesPast && (
        <p className="flex items-start gap-2 rounded-xl border border-primary/30 bg-secondary/50 px-3 py-2.5 text-[11px] leading-5 sm:text-xs">
          <History className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
          <span>
            起始日是 {startDate}，早于今天。保存会改写起始日（含）之后
            <span className="font-medium text-foreground">所有日期的目标与三餐食物，包括已经过去的日期</span>
            ；当前这一份计划的目标与三餐食物都会被整体替换，没有版本历史可回退。已记录的饮食摄入不变，只是那些天用来对照的目标会变成这次保存的数值。
          </span>
        </p>
      )}

      <div className="space-y-2.5">
        <Label id="week-label" className="text-xs sm:text-sm">
          一周七天
        </Label>
        <p className="text-[11px] leading-5 text-muted-foreground">
          先填这一天的四个目标，再为早餐 / 午餐 / 晚餐添加食物；食物行按食物库每 100g 数值乘克数实时折算，改克数立刻重算。折叠时卡头仍显示该天合计热量。
        </p>
        <div aria-labelledby="week-label" className="space-y-2.5">
          {weekdays.map((target, day) => {
            const open = openDays.includes(day);
            const summary = summarizePlanDay(planItems, day);
            const dayDrafts = drafts.filter((draft) => draft.weekday === day);
            // 加餐只可能来自旧数据：保持可见可删，但不提供新增入口
            const mealGroups: MealType[] = dayDrafts.some((draft) => draft.mealType === "snack")
              ? [...PLAN_MEALS, "snack"]
              : [...PLAN_MEALS];
            const bodyId = `plan-day-body-${day}`;
            return (
              <section key={WEEKDAY_LABELS[day]} className="rounded-xl border bg-card">
                <h3>
                  <button
                    type="button"
                    onClick={() => toggleDay(day)}
                    aria-expanded={open}
                    aria-controls={bodyId}
                    className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left"
                  >
                    <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                      <span className="text-sm font-medium">{WEEKDAY_LABELS[day]}</span>
                      {day === todayIndex && (
                        <span className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary">
                          今天
                        </span>
                      )}
                      <span className="text-[11px] tabular-nums text-muted-foreground">
                        合计 {Math.round(summary.totals.calories)} / 目标 {target.calories || "—"} 千卡
                      </span>
                      {summary.missing > 0 && (
                        <span className="text-[11px] text-destructive">{summary.missing} 项未计入</span>
                      )}
                    </span>
                    <ChevronDown
                      className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
                      aria-hidden
                    />
                  </button>
                </h3>

                <div id={bodyId} hidden={!open} className="space-y-4 border-t px-3 py-3">
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium">这一天的目标</h4>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      {TARGET_FIELDS.map((field) => (
                        <div key={field.key}>
                          <label
                            htmlFor={`plan-day-${day}-${field.key}`}
                            className="mb-1 block text-[11px] text-muted-foreground"
                          >
                            {field.label}
                          </label>
                          <div className="relative">
                            <Input
                              id={`plan-day-${day}-${field.key}`}
                              type="number"
                              inputMode="numeric"
                              min={field.min}
                              max={field.max}
                              step={1}
                              className="h-10 pr-8 text-sm font-medium tabular-nums"
                              value={target[field.key]}
                              disabled={busy}
                              onChange={(event) => setTarget(day, field.key, event.target.value)}
                            />
                            <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-muted-foreground">
                              {field.unit}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-xs font-medium">三餐食物</h4>
                    {mealGroups.map((meal) => {
                      const mealDrafts = dayDrafts.filter((draft) => draft.mealType === meal);
                      const mealCalories = mealDrafts.reduce(
                        (sum, draft) => sum + (draftMacro(draft)?.calories ?? 0),
                        0,
                      );
                      return (
                        <div key={meal} className="rounded-lg bg-muted/30 p-2.5">
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-medium">{MEAL_LABELS[meal]}</p>
                            <p className="text-[11px] tabular-nums text-muted-foreground">
                              {Math.round(mealCalories)} 千卡
                            </p>
                          </div>
                          {mealDrafts.length === 0 && (
                            <p className="mt-1.5 text-[11px] text-muted-foreground">还没有加食物</p>
                          )}
                          <ul className="mt-1.5 divide-y">
                            {mealDrafts.map((draft) => {
                              const macro = draftMacro(draft);
                              return (
                                <li key={draft.key} className="flex flex-wrap items-center gap-2 py-2">
                                  <div className="min-w-0 flex-1">
                                    <p className="truncate text-sm">{draft.name}</p>
                                    {macro === null && (
                                      <p className="mt-0.5 flex items-center gap-1 text-[11px] text-destructive">
                                        <TriangleAlert className="size-3 shrink-0" aria-hidden />
                                        食物已删除，保存后按原名称与克数保留（不计入合计）
                                      </p>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-1">
                                    <label htmlFor={`plan-item-${draft.key}`} className="sr-only">
                                      {draft.name} 的克数
                                    </label>
                                    <Input
                                      id={`plan-item-${draft.key}`}
                                      type="number"
                                      inputMode="decimal"
                                      min={1}
                                      max={5000}
                                      step="any"
                                      aria-invalid={gramsProblem(draft)}
                                      className="h-8 w-20 text-sm tabular-nums"
                                      value={draft.grams}
                                      disabled={busy}
                                      onChange={(event) => setGrams(draft.key, event.target.value)}
                                    />
                                    <span className="text-[11px] text-muted-foreground">克</span>
                                  </div>
                                  <p className="w-full text-[11px] tabular-nums text-muted-foreground sm:w-auto">
                                    {macro
                                      ? `${Math.round(macro.calories)} 千卡 · 蛋白 ${macro.protein}g · 碳水 ${macro.carbs}g · 脂肪 ${macro.fat}g`
                                      : "营养未知"}
                                  </p>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="icon-sm"
                                    aria-label={`删除 ${draft.name}`}
                                    onClick={() => removeItem(draft.key)}
                                    disabled={busy}
                                  >
                                    <Trash2 className="size-3.5" aria-hidden />
                                  </Button>
                                </li>
                              );
                            })}
                          </ul>
                          {meal !== "snack" && (
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => setPicking({ weekday: day, mealType: meal })}
                              disabled={busy}
                            >
                              <Plus className="size-3.5" aria-hidden />
                              添加食物
                            </Button>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="rounded-lg border p-2.5">
                    <h4 className="text-xs font-medium">全天对照</h4>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
                      {TARGET_FIELDS.map((field) => {
                        const targetValue =
                          target[field.key].trim() === "" ? null : Number(target[field.key]);
                        const total = Math.round(summary.totals[field.key]);
                        const diff =
                          targetValue !== null && Number.isFinite(targetValue)
                            ? total - targetValue
                            : null;
                        return (
                          <div key={field.key} className="text-[11px] leading-5">
                            <p className="text-muted-foreground">{field.label}</p>
                            <p className="tabular-nums">
                              目标 {targetValue === null ? "—" : targetValue} · 合计 {total}
                            </p>
                            <p className="tabular-nums text-muted-foreground">
                              差值 {diff === null ? "—" : formatDiff(diff)}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    {summary.missing > 0 && (
                      <p className="mt-2 flex items-start gap-1.5 text-[11px] leading-5 text-destructive">
                        <TriangleAlert className="mt-0.5 size-3 shrink-0" aria-hidden />
                        有 {summary.missing} 项食物已删除，暂不计入合计；保存时这些行会按原名称与克数保留，也可以在对应餐次删除或重新选择食物替换。
                      </p>
                    )}
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      </div>

      <div className="grid gap-3 min-[360px]:grid-cols-2">
        <div className="space-y-2 rounded-xl border bg-muted/25 p-3">
          <Label htmlFor="plan-start" className="flex items-center gap-2 text-xs sm:text-sm">
            <CalendarDays className="size-3.5 text-primary sm:size-4" aria-hidden />
            起始日期
          </Label>
          <Input
            id="plan-start"
            type="date"
            value={startDate}
            disabled={busy}
            max={today}
            required
            onChange={(event) => setStartDate(event.target.value)}
            className="h-10"
          />
          <p className="text-[11px] leading-5 text-muted-foreground">
            起始日之前的日期不受计划影响，仍按每日目标。
          </p>
        </div>
        <div className="space-y-2 rounded-xl border bg-muted/25 p-3">
          <Label className="text-xs sm:text-sm">生效状态</Label>
          <div role="group" aria-label="生效状态" className="flex gap-1 rounded-lg bg-muted p-1">
            <button
              type="button"
              aria-pressed={isActive}
              disabled={busy}
              onClick={() => setIsActive(true)}
              className={`h-9 flex-1 rounded-md text-sm font-medium transition-colors ${isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              生效中
            </button>
            <button
              type="button"
              aria-pressed={!isActive}
              disabled={busy}
              onClick={() => setIsActive(false)}
              className={`h-9 flex-1 rounded-md text-sm font-medium transition-colors ${!isActive ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              已停用
            </button>
          </div>
          <p className="text-[11px] leading-5 text-muted-foreground">
            停用后所有日期回到每日目标；配置保留，随时可重新生效。
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" size="lg" disabled={busy}>
          {busy ? (
            <LoaderCircle className="size-4 animate-spin" aria-hidden />
          ) : (
            <Save className="size-4" aria-hidden />
          )}
          {busy ? "保存中…" : "保存计划"}
        </Button>
        {initialPlan && (
          <Button
            type="button"
            variant="outline"
            size="lg"
            disabled={busy}
            onClick={() => setConfirmDelete(true)}
          >
            <Trash2 className="size-4" aria-hidden />
            删除计划
          </Button>
        )}
      </div>

      {picking && !busy && (
        <PlanFoodPicker
          mealLabel={MEAL_LABELS[picking.mealType]}
          open
          onOpenChange={(open) => {
            if (!open) setPicking(null);
          }}
          onSelect={addFood}
        />
      )}

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>删除整份计划？</DialogTitle>
            <DialogDescription>
              删除后所有日期回到每日目标，计划里七天设定的目标与三餐食物会一起删除，不能撤销。已经记录的饮食摄入不受影响。
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setConfirmDelete(false)}>
              取消
            </Button>
            <Button type="button" variant="destructive" disabled={busy} onClick={handleDelete}>
              删除计划
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </form>
  );
}
