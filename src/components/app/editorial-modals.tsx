"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  ChartNoAxesCombined,
  Database,
  Pencil,
  Plus,
  Search,
  Settings2,
  Star,
  Utensils,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { InlineConfirmButton } from "./inline-confirm-button";
import { SOFT_SPRING, TAB_SPRING, TAP_SPRING } from "./motion-provider";
import type { Food } from "@/db/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { buildWeightTrendSvg } from "@/lib/weight-trend";
import type { MeasurementDashboard } from "@/lib/measurements";
import { GENDER_LABELS, type BodyProfile, type Gender } from "@/lib/profile";
import type { Goals } from "@/services/goals";
import type { RecordCounts } from "@/services/records";
import type { TrendPoint } from "@/services/trends";
import { ClearRecordsButton } from "./clear-records-button";

type ActiveModal = "trends" | "library" | "settings" | null;

const GENDERS = Object.keys(GENDER_LABELS) as Gender[];

export function EditorialModals({
  activeModal,
  onClose,
  trends,
  goals,
  profile,
  measurementData,
  myFoods,
  recordCounts,
}: {
  activeModal: ActiveModal;
  onClose: () => void;
  trends: TrendPoint[];
  goals: Goals;
  profile: BodyProfile | null;
  measurementData: MeasurementDashboard;
  myFoods: Food[];
  recordCounts: RecordCounts;
}) {
  return (
    <>
      <TrendsModal
        open={activeModal === "trends"}
        onOpenChange={(open) => !open && onClose()}
        trends={trends}
        goals={goals}
        measurementData={measurementData}
      />
      <LibraryModal
        open={activeModal === "library"}
        onOpenChange={(open) => !open && onClose()}
        myFoods={myFoods}
      />
      <SettingsModal
        open={activeModal === "settings"}
        onOpenChange={(open) => !open && onClose()}
        goals={goals}
        profile={profile}
        recordCounts={recordCounts}
      />
    </>
  );
}

/* ==================== 浮层 1：营养摄入趋势 & 身体指标复盘 ==================== */

function TrendsModal({
  open,
  onOpenChange,
  trends,
  goals,
  measurementData,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trends: TrendPoint[];
  goals: Goals;
  measurementData: MeasurementDashboard;
}) {
  const [days, setDays] = useState<7 | 14 | 30>(14);
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const slice = trends.slice(-days);
  const recordedSlice = slice.filter((p) => p.hasMealEntries);
  const avgCalories =
    recordedSlice.length > 0
      ? Math.round(recordedSlice.reduce((s, p) => s + p.calories, 0) / recordedSlice.length)
      : 0;

  const maxCal = Math.max(
    goals.calories * 1.15,
    ...slice.map((p) => p.calories),
    500,
  );
  const targetLineBottomPct = Math.min(96, Math.round((goals.calories / maxCal) * 100));

  const inspected = hoveredIdx != null ? slice[hoveredIdx] ?? null : slice[slice.length - 1] ?? null;

  const weightTrend = useMemo(() => buildWeightTrendSvg(measurementData.entries, measurementData.targetWeightKg), [measurementData]);

  const fatEntries = measurementData.entries
    .filter((m) => m.kind === "bodyFat" && m.value != null)
    .slice()
    .reverse();
  const morningBp = measurementData.entries.filter(
    (m) => m.kind === "bloodPressure" && m.period === "morning" && m.systolic != null && m.diastolic != null,
  );
  const avgMorningSys =
    morningBp.length > 0
      ? Math.round(morningBp.reduce((s, m) => s + (m.systolic ?? 0), 0) / morningBp.length)
      : null;
  const avgMorningDia =
    morningBp.length > 0
      ? Math.round(morningBp.reduce((s, m) => s + (m.diastolic ?? 0), 0) / morningBp.length)
      : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto rounded-3xl p-6 sm:max-w-5xl">
        <DialogHeader className="border-b pb-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <div>
              <span className="inline-block rounded-full border border-primary/15 bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                近 30 天数据回顾
              </span>
              <DialogTitle className="mt-1.5 flex items-center gap-2 text-lg font-bold">
                <ChartNoAxesCombined className="size-5 text-primary" aria-hidden />
                营养摄入趋势 &amp; 身体指标复盘
              </DialogTitle>
              <DialogDescription className="mt-1">
                按已记录摄入日期统计，未记录日期补 0，不代表全天真实空腹。
              </DialogDescription>
            </div>
            <Link
              href="/trends"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1 rounded-xl border bg-background px-3 py-1.5 text-xs font-medium hover:border-primary"
            >
              独立趋势页
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-12">
          {/* 左侧 7 列：7/14/30 天营养柱状趋势 */}
          <div className="space-y-4 rounded-2xl border bg-background p-5 lg:col-span-7">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold">每日热量与营养素</h3>
                <p className="text-xs text-muted-foreground">
                  虚线为每日基础目标 ({goals.calories} kcal) · 有记录 {recordedSlice.length} 天
                  {recordedSlice.length > 0 ? ` · 日均 ${avgCalories} kcal` : ""}
                </p>
              </div>
              <div className="flex items-center gap-1 rounded-xl border bg-card p-1 text-xs">
                {([7, 14, 30] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDays(d);
                      setHoveredIdx(null);
                    }}
                    aria-pressed={days === d}
                    className={`relative rounded-lg px-2.5 py-1 font-mono transition-colors ${
                      days === d
                        ? "font-semibold text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {days === d && (
                      <motion.span
                        layoutId="trends-range-pill"
                        transition={TAB_SPRING}
                        className="absolute inset-0 rounded-lg bg-primary"
                        aria-hidden
                      />
                    )}
                    <span className="relative z-10">{d}天</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="relative h-48 pt-6">
              {/* 目标线 */}
              <div
                className="pointer-events-none absolute inset-x-0 z-10 flex justify-end border-t border-dashed border-primary/70"
                style={{ bottom: `calc(${targetLineBottomPct}% * 0.8 + 20px)` }}
              >
                <span className="-mt-3 rounded-full border bg-card px-2 py-0.5 font-mono text-[10px] text-foreground">
                  目标 {goals.calories}
                </span>
              </div>

              <div className="flex h-full items-end gap-1 border-b pb-5">
                {slice.map((point, idx) => {
                  const hPct =
                    point.calories === 0
                      ? 8
                      : Math.max(8, Math.min(100, Math.round((point.calories / maxCal) * 100)));
                  const isActive = hoveredIdx === idx;
                  return (
                    <button
                      key={`${days}:${point.date}`}
                      type="button"
                      onMouseEnter={() => setHoveredIdx(idx)}
                      onFocus={() => setHoveredIdx(idx)}
                      className="group flex h-full flex-1 flex-col items-center justify-end gap-1 focus:outline-none"
                      aria-label={`${point.date} ${Math.round(point.calories)} 千卡`}
                    >
                      <div className="flex h-36 w-full items-end">
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${hPct}%` }}
                          transition={{
                            ...SOFT_SPRING,
                            delay: Math.min(idx * 0.012, 0.22),
                          }}
                          className={`w-full rounded-t-md transition-colors ${
                            !point.hasMealEntries
                              ? "border border-dashed border-border bg-transparent"
                              : point.calories > goals.calories
                                ? isActive
                                  ? "bg-chart-3"
                                  : "bg-chart-3/85 group-hover:bg-chart-3"
                                : isActive
                                  ? "bg-primary"
                                  : "bg-chart-1/85 group-hover:bg-primary"
                          }`}
                        />
                      </div>
                      <span className="h-3.5 whitespace-nowrap font-mono text-[10px] leading-none text-muted-foreground">
                        {days <= 14 ? point.date.slice(8) : idx % 6 === 0 || idx === slice.length - 1 ? point.date.slice(5) : ""}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {inspected && (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card p-3 font-mono text-xs">
                {!inspected.hasMealEntries ? (
                  <span>
                    {inspected.date}：暂无饮食记录 (0 kcal)
                  </span>
                ) : (
                  <span>
                    {inspected.date}：摄入 <strong>{Math.round(inspected.calories)} kcal</strong> · P:
                    {Math.round(inspected.protein)}g C:{Math.round(inspected.carbs)}g F:
                    {Math.round(inspected.fat)}g
                  </span>
                )}
                <span className="text-muted-foreground">目标 {inspected.goalCalories} kcal</span>
              </div>
            )}
          </div>

          {/* 右侧 5 列：近 30 天体重与体脂/血压周期 */}
          <div className="flex flex-col justify-between space-y-4 rounded-2xl border bg-background p-5 lg:col-span-5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold">体重与身体指标 (近30天)</h3>
                <Link
                  href="/measurements"
                  onClick={() => onOpenChange(false)}
                  className="font-mono text-xs text-primary hover:underline"
                >
                  管理明细 →
                </Link>
              </div>
              <p className="mt-0.5 text-xs text-muted-foreground">
                每天取最后一条体重记录，缺测日断开折线。
              </p>
            </div>

            <div className="space-y-3 rounded-xl border bg-card p-4">
              {weightTrend.svg ? (
                <>
                  <div className="flex items-center justify-between font-mono text-xs">
                    <span className="text-muted-foreground">
                      近30天体重 ({weightTrend.ordered.length} 天有记)
                    </span>
                    <span className="font-bold">
                      {weightTrend.ordered[0][1].toFixed(2)} →{" "}
                      {weightTrend.ordered[weightTrend.ordered.length - 1][1].toFixed(2)} kg
                    </span>
                  </div>
                  <svg className="h-24 w-full overflow-visible" viewBox="0 0 260 90" aria-hidden>
                    {weightTrend.svg.targetY != null && (
                      <line
                        x1="0"
                        y1={weightTrend.svg.targetY}
                        x2="260"
                        y2={weightTrend.svg.targetY}
                        stroke="currentColor"
                        className="text-chart-3"
                        strokeDasharray="4 4"
                        strokeWidth="1.2"
                      />
                    )}
                    <motion.path
                      initial={{ pathLength: 0, opacity: 0.35 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.7, ease: "easeOut" }}
                      fill="none"
                      stroke="currentColor"
                      className="text-primary"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={weightTrend.svg.path}
                    />
                    {weightTrend.svg.points.map((p, idx) => (
                      <motion.circle
                        key={p.date}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.25 + idx * 0.03, ...TAP_SPRING }}
                        cx={p.x}
                        cy={p.y}
                        r="3"
                        className="fill-primary"
                      />
                    ))}
                  </svg>
                  <div className="flex justify-between font-mono text-[11px] text-muted-foreground">
                    <span>{weightTrend.ordered[0][0].slice(5)}</span>
                    <span>
                      {measurementData.targetWeightKg != null
                        ? `虚线目标 ${measurementData.targetWeightKg}kg`
                        : "未设目标体重"}
                    </span>
                    <span>{weightTrend.ordered[weightTrend.ordered.length - 1][0].slice(5)}</span>
                  </div>
                </>
              ) : (
                <div className="py-6 text-center text-xs text-muted-foreground">
                  {weightTrend.ordered.length === 1
                    ? `近30天有 1 天记录：${weightTrend.ordered[0][1].toFixed(2)} kg，继续记录可看曲线变化。`
                    : "近30天暂无体重记录，可在左侧「身体指标追踪」快速录入。"}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="rounded-xl border bg-card p-3">
                <div className="text-muted-foreground">近30天体脂率</div>
                <div className="mt-1 font-mono text-sm font-bold">
                  {fatEntries.length >= 2
                    ? `${Number(fatEntries[0].value).toFixed(1)}% → ${Number(fatEntries[fatEntries.length - 1].value).toFixed(1)}%`
                    : fatEntries.length === 1
                      ? `${Number(fatEntries[0].value).toFixed(2)}%`
                      : "暂无记录"}
                </div>
              </div>
              <div className="rounded-xl border bg-card p-3">
                <div className="text-muted-foreground">晨间血压均值</div>
                <div className="mt-1 font-mono text-sm font-bold">
                  {avgMorningSys != null && avgMorningDia != null
                    ? `${avgMorningSys} / ${avgMorningDia} mmHg`
                    : "暂无记录"}
                </div>
              </div>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ==================== 浮层 2：我的个人食物库管理 ==================== */

function LibraryModal({
  open,
  onOpenChange,
  myFoods,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  myFoods: Food[];
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [onlyFav, setOnlyFav] = useState(false);
  const [editing, setEditing] = useState<Food | null>(null);
  const [creating, setCreating] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [servingGrams, setServingGrams] = useState("");

  const filtered = myFoods.filter(
    (f) =>
      f.name.toLowerCase().includes(q.trim().toLowerCase()) &&
      (!onlyFav || f.isFavorite),
  );

  function startCreate() {
    setEditing(null);
    setCreating(true);
    setName("");
    setBrand("");
    setCalories("");
    setProtein("0");
    setCarbs("0");
    setFat("0");
    setServingGrams("");
  }

  function startEdit(f: Food) {
    setCreating(false);
    setEditing(f);
    setName(f.name);
    setBrand(f.brand ?? "");
    setCalories(String(f.calories));
    setProtein(String(f.protein));
    setCarbs(String(f.carbs));
    setFat(String(f.fat));
    setServingGrams(f.servingGrams != null ? String(f.servingGrams) : "");
  }

  async function handleSaveFood(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || calories.trim() === "") return;
    const id = editing?.id ?? "new";
    setBusyId(id);
    try {
      const body = JSON.stringify({
        name: name.trim(),
        brand: brand.trim() === "" ? null : brand.trim(),
        calories: Number(calories),
        protein: Number(protein || 0),
        carbs: Number(carbs || 0),
        fat: Number(fat || 0),
        servingGrams: servingGrams.trim() === "" ? null : Number(servingGrams),
      });
      if (editing) {
        await api(`/api/v1/foods/${editing.id}`, { method: "PATCH", body });
        toast.success("已更新食物");
        setEditing(null);
      } else {
        await api("/api/v1/foods", { method: "POST", body });
        toast.success("已新增食物");
        setCreating(false);
      }
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusyId(null);
    }
  }

  async function toggleFav(f: Food) {
    setBusyId(f.id);
    try {
      await api(`/api/v1/foods/${f.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isFavorite: !f.isFavorite }),
      });
      router.refresh();
    } catch {
      toast.error("操作失败");
    } finally {
      setBusyId(null);
    }
  }

  async function deleteFoodItem(f: Food) {
    setBusyId(f.id);
    try {
      await api(`/api/v1/foods/${f.id}`, { method: "DELETE" });
      toast.success(`已删除「${f.name}」`);
      if (editing?.id === f.id) setEditing(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88svh] overflow-y-auto rounded-3xl p-6 sm:max-w-3xl">
        <DialogHeader className="border-b pb-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <div>
              <span className="inline-block rounded-full border border-primary/15 bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                常用食材管理
              </span>
              <DialogTitle className="mt-1.5 flex items-center gap-2 text-lg font-bold">
                <Utensils className="size-5 text-primary" aria-hidden />
                我的个人食物库 ({myFoods.length})
              </DialogTitle>
              <DialogDescription className="mt-1">
                收藏优先排序；修改或删除食物不会回写历史饮食记录的营养快照。
              </DialogDescription>
            </div>
            <Link
              href="/foods"
              onClick={() => onOpenChange(false)}
              className="inline-flex items-center gap-1 rounded-xl border bg-background px-3 py-1.5 text-xs font-medium hover:border-primary"
            >
              独立食物库页
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </DialogHeader>

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              placeholder="搜索个人食物…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-9 bg-background pl-8 text-xs"
            />
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant={onlyFav ? "default" : "outline"}
              onClick={() => setOnlyFav((v) => !v)}
              className="h-9 text-xs"
            >
              <Star className="size-3.5" aria-hidden />
              只看收藏
            </Button>
            <Button type="button" size="sm" onClick={startCreate} className="h-9 text-xs">
              <Plus className="size-3.5" aria-hidden />
              新增食物
            </Button>
          </div>
        </div>

        <AnimatePresence initial={false}>
        {(creating || editing) && (
          <motion.form
            key={editing ? `edit-${editing.id}` : "create-food"}
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={SOFT_SPRING}
            onSubmit={handleSaveFood}
            className="overflow-hidden"
          >
          <div className="space-y-3 rounded-2xl border border-primary bg-background p-4 text-xs">
            <div className="flex items-center justify-between font-semibold">
              <span>{editing ? `编辑「${editing.name}」` : "新增个人食物 (每 100g 营养值)"}</span>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setEditing(null);
                }}
                className="text-muted-foreground hover:text-foreground"
              >
                取消
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <Input
                required
                placeholder="名称 *"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="h-8 bg-card text-xs"
              />
              <Input
                placeholder="品牌 (可选)"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                className="h-8 bg-card text-xs"
              />
            </div>
            <div className="grid grid-cols-5 gap-2 font-mono">
              <label className="space-y-0.5">
                <span className="text-[11px] text-muted-foreground">热量kcal*</span>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={2000}
                  required
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  className="h-8 bg-card px-2 text-xs"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[11px] text-muted-foreground">蛋白g</span>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={200}
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  className="h-8 bg-card px-2 text-xs"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[11px] text-muted-foreground">碳水g</span>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={200}
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  className="h-8 bg-card px-2 text-xs"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[11px] text-muted-foreground">脂肪g</span>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  max={200}
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  className="h-8 bg-card px-2 text-xs"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[11px] text-muted-foreground">一份g</span>
                <Input
                  type="number"
                  min={1}
                  max={5000}
                  value={servingGrams}
                  onChange={(e) => setServingGrams(e.target.value)}
                  className="h-8 bg-card px-2 text-xs"
                />
              </label>
            </div>
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={busyId !== null} className="text-xs">
                {busyId ? "保存中…" : "保存食物"}
              </Button>
            </div>
          </div>
          </motion.form>
        )}
        </AnimatePresence>

        <div className="max-h-96 space-y-2 overflow-y-auto pr-1">
          {filtered.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              没有匹配的食物。
            </p>
          ) : (
            <AnimatePresence initial={false}>
            {filtered.map((f) => (
              <motion.div
                key={f.id}
                layout
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96 }}
                transition={SOFT_SPRING}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-background p-3 text-xs"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 font-semibold">
                    <span>{f.name}</span>
                    {f.brand && (
                      <span className="rounded border bg-card px-1.5 py-0.2 text-[11px] font-normal text-muted-foreground">
                        {f.brand}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 font-mono text-muted-foreground">
                    每100g: {f.calories} kcal · P:{f.protein}g C:{f.carbs}g F:{f.fat}g
                    {f.servingGrams ? ` · 一份 ${f.servingGrams}g` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <button
                    type="button"
                    disabled={busyId === f.id}
                    onClick={() => void toggleFav(f)}
                    className="inline-flex items-center gap-1 rounded-lg border bg-card px-2.5 py-1 transition-colors hover:border-primary"
                  >
                    <Star
                      className={`size-3.5 ${
                        f.isFavorite ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                      }`}
                      aria-hidden
                    />
                    {f.isFavorite ? "已收藏" : "收藏"}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === f.id}
                    onClick={() => startEdit(f)}
                    className="inline-flex items-center gap-1 rounded-lg border bg-card px-2 py-1 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                    aria-label={`编辑 ${f.name}`}
                  >
                    <Pencil className="size-3.5" aria-hidden />
                  </button>
                  <InlineConfirmButton
                    disabled={busyId === f.id}
                    onConfirm={() => deleteFoodItem(f)}
                    ariaLabel={`删除 ${f.name}`}
                    confirmText="确认删除"
                    className="inline-flex items-center gap-1 rounded-lg border bg-card px-2 py-1 hover:border-destructive"
                  />
                </div>
              </motion.div>
            ))}
            </AnimatePresence>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ==================== 浮层 3：个人资料、基础目标与数据安全 ==================== */

function SettingsModal({
  open,
  onOpenChange,
  goals,
  profile,
  recordCounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goals: Goals;
  profile: BodyProfile | null;
  recordCounts: RecordCounts;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto rounded-3xl p-6 sm:max-w-4xl">
        <DialogHeader className="border-b pb-3.5">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-6">
            <div>
              <span className="inline-block rounded-full border border-primary/15 bg-secondary px-2.5 py-0.5 text-[11px] font-medium text-secondary-foreground">
                目标与账户数据
              </span>
              <DialogTitle className="mt-1.5 flex items-center gap-2 text-lg font-bold">
                <Settings2 className="size-5 text-primary" aria-hidden />
                个人资料、基础目标与数据安全
              </DialogTitle>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Link
                href="/goals"
                onClick={() => onOpenChange(false)}
                className="rounded-xl border bg-background px-2.5 py-1.5 font-medium hover:border-primary"
              >
                目标设置页
              </Link>
              <Link
                href="/profile"
                onClick={() => onOpenChange(false)}
                className="rounded-xl border bg-background px-2.5 py-1.5 font-medium hover:border-primary"
              >
                个人资料页
              </Link>
            </div>
          </div>
        </DialogHeader>

        {open && (
          <SettingsModalBody
            goals={goals}
            profile={profile}
            recordCounts={recordCounts}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function SettingsModalBody({
  goals,
  profile,
  recordCounts,
}: {
  goals: Goals;
  profile: BodyProfile | null;
  recordCounts: RecordCounts;
}) {
  const router = useRouter();
  const [cal, setCal] = useState(String(goals.calories));
  const [pro, setPro] = useState(String(goals.protein));
  const [carb, setCarb] = useState(String(goals.carbs));
  const [fat, setFat] = useState(String(goals.fat));

  const [gender, setGender] = useState<Gender | null>(profile?.gender ?? null);
  const [heightCm, setHeightCm] = useState(profile?.heightCm?.toString() ?? "");
  const [targetWeightKg, setTargetWeightKg] = useState(profile?.targetWeightKg?.toString() ?? "");

  const [busy, setBusy] = useState<"goals" | "profile" | null>(null);
  const busyRef = useRef(false);
  const [error, setError] = useState({ goals: "", profile: "" });

  async function saveSection(event: React.FormEvent, section: "goals" | "profile") {
    event.preventDefault();
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(section);
    setError(previous => ({ ...previous, [section]: "" }));
    try {
      const body = section === "goals"
        ? { calories: Number(cal), protein: Number(pro), carbs: Number(carb), fat: Number(fat) }
        : {
            gender,
            heightCm: heightCm.trim() === "" ? null : Number(heightCm),
            targetWeightKg: targetWeightKg.trim() === "" ? null : Number(targetWeightKg),
          };
      await api(`/api/v1/${section}`, { method: "PUT", body: JSON.stringify(body) });
      toast.success(section === "goals" ? "每日目标已保存" : "个人资料已保存");
      router.refresh();
    } catch (err) {
      setError(previous => ({ ...previous, [section]: err instanceof Error ? err.message : "保存失败，请重试" }));
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  }

  const totalRecords =
    recordCounts.mealEntries + recordCounts.measurements + recordCounts.mealPhotos;

  return (
    <div className="grid gap-5 md:grid-cols-2">
      {/* 左：每日目标 + 个人资料 */}
      <div className="space-y-4 rounded-2xl border bg-background p-5 text-xs">
        <form onSubmit={(event) => saveSection(event, "goals")}>
          <fieldset disabled={busy !== null} className="space-y-3">
            <h3 className="text-sm font-bold">每日营养基础目标</h3>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="modal-goal-cal">热量 (500–8000 kcal)</Label>
                <Input
                  id="modal-goal-cal"
                  type="number"
                  min={500}
                  max={8000}
                  required
                  value={cal}
                  onChange={(e) => setCal(e.target.value)}
                  className="bg-card font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal-goal-pro">蛋白质 (0–600 g)</Label>
                <Input
                  id="modal-goal-pro"
                  type="number"
                  min={0}
                  max={600}
                  required
                  value={pro}
                  onChange={(e) => setPro(e.target.value)}
                  className="bg-card font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal-goal-carb">碳水 (0–1200 g)</Label>
                <Input
                  id="modal-goal-carb"
                  type="number"
                  min={0}
                  max={1200}
                  required
                  value={carb}
                  onChange={(e) => setCarb(e.target.value)}
                  className="bg-card font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal-goal-fat">脂肪 (0–500 g)</Label>
                <Input
                  id="modal-goal-fat"
                  type="number"
                  min={0}
                  max={500}
                  required
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  className="bg-card font-mono"
                />
              </div>
            </div>

            {error.goals && <p role="alert" className="text-destructive">{error.goals}</p>}
            <Button type="submit" className="w-full">{busy === "goals" ? "正在保存…" : "保存每日目标"}</Button>
          </fieldset>
        </form>
        <form onSubmit={(event) => saveSection(event, "profile")}>
          <fieldset disabled={busy !== null} className="space-y-3 border-t pt-3">
            <h3 className="text-sm font-bold">个人资料（可留空）</h3>
            <div className="space-y-1.5">
              <span className="text-muted-foreground">性别（再次点击取消）</span>
              <div className="flex gap-1 rounded-xl border bg-card p-1">
                {GENDERS.map((g) => (
                  <button
                    key={g}
                    type="button"
                    aria-pressed={gender === g}
                    onClick={() => setGender(gender === g ? null : g)}
                    className={`flex-1 rounded-lg py-1.5 font-medium transition-colors ${
                      gender === g
                        ? "bg-primary text-primary-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {GENDER_LABELS[g]}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="modal-profile-height">身高 (cm)</Label>
                <Input
                  id="modal-profile-height"
                  type="number"
                  min={50}
                  max={280}
                  step="0.5"
                  placeholder="可留空"
                  value={heightCm}
                  onChange={(e) => setHeightCm(e.target.value)}
                  className="bg-card font-mono"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="modal-profile-target-w">目标体重 (kg)</Label>
                <Input
                  id="modal-profile-target-w"
                  type="number"
                  min={20}
                  max={500}
                  step="0.1"
                  placeholder="可留空"
                  value={targetWeightKg}
                  onChange={(e) => setTargetWeightKg(e.target.value)}
                  className="bg-card font-mono"
                />
              </div>
            </div>
            {error.profile && <p role="alert" className="text-destructive">{error.profile}</p>}
            <Button type="submit" className="w-full">{busy === "profile" ? "正在保存…" : "保存个人资料"}</Button>
          </fieldset>
        </form>
      </div>

      {/* 右：一键清空数据 */}
      <div className="flex flex-col justify-between rounded-2xl border bg-background p-5 text-xs">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-1.5 font-medium text-destructive">
            <Database className="size-3.5" aria-hidden />
            <span>危险操作 · 清空后无法恢复</span>
          </div>
          <h3 className="text-sm font-bold text-destructive">
            清空饮食、照片与身体指标记录
          </h3>
          <p className="leading-relaxed text-muted-foreground">
            同一事务内永久删除当前账号全部饮食记录（{recordCounts.mealEntries} 条）、餐次照片（
            {recordCounts.mealPhotos} 张）及身体指标（{recordCounts.measurements} 条），无法恢复。
          </p>
          <p className="text-muted-foreground">
            个人食物库和每日目标、个人资料会完好保留。
          </p>
        </div>

        <div className="space-y-3 border-t pt-4">
          <div className="font-mono text-muted-foreground">
            {totalRecords === 0
              ? "当前暂无可清空的记录"
              : `当前累计 ${totalRecords} 条待管理记录`}
          </div>
          <ClearRecordsButton counts={recordCounts} />
        </div>
      </div>
    </div>
  );
}
