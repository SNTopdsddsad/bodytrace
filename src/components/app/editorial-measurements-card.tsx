"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import NumberFlow from "@number-flow/react";
import { ArrowRight, ChevronDown, LoaderCircle, Pencil, Plus, Scale } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { InlineConfirmButton } from "./inline-confirm-button";
import { SOFT_SPRING, TAP_SPRING } from "./motion-provider";
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
import { api, ApiError } from "@/lib/api-client";
import {
  MEASUREMENT_KINDS,
  MEASUREMENT_LABELS,
  MEASUREMENT_PERIODS,
  MEASUREMENT_PERIOD_LABELS,
  measurementChange,
  measurementPeriodLabel,
  measurementSchemas,
  measurementUnit,
  measurementValue,
  type Measurement,
  type MeasurementDashboard,
  type MeasurementInput,
  type BloodPressureHistory,
  type MeasurementKind,
  type MeasurementPeriod,
} from "@/lib/measurements";
import { buildWeightTrendSvg } from "@/lib/weight-trend";
import { withRequestTimeout } from "@/lib/request-timeout";

function currentTimeInTz(timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

function defaultPeriodInTz(timeZone: string): MeasurementPeriod {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", {
      timeZone,
      hour: "2-digit",
      hourCycle: "h23",
    }).format(new Date()),
  );
  return hour < 12 ? "morning" : "evening";
}

export function EditorialMeasurementsCard({
  data,
  selectedDate,
  onOpenSettings,
}: {
  data: MeasurementDashboard & { recentBloodPressure: BloodPressureHistory };
  selectedDate: string;
  onOpenSettings: () => void;
}) {
  const router = useRouter();
  const effectiveDate = selectedDate <= data.today ? selectedDate : data.today;

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [draftDate, setDraftDate] = useState<string | null>(null);
  const quickFormOpen = draftDate !== null;
  const [bpPeriod, setBpPeriod] = useState<MeasurementPeriod>(() =>
    data.latest.bloodPressure?.period ?? defaultPeriodInTz(data.timeZone),
  );

  // 新增测量状态（保留 requestId 以便不确定故障时安全重试）
  const [newKind, setNewKind] = useState<MeasurementKind>("weight");
  const [newPeriod, setNewPeriod] = useState<MeasurementPeriod>(() => defaultPeriodInTz(data.timeZone));
  const [newValue, setNewValue] = useState("");
  const [newSystolic, setNewSystolic] = useState("");
  const [newDiastolic, setNewDiastolic] = useState("");
  const [formError, setFormError] = useState("");
  // 结果未知时保留实际发出的整份请求，包含首次录入的日期和时间。
  const [pendingCreate, setPendingCreate] = useState<{
    body: { requestId: string; measurement: MeasurementInput };
    fromForm: boolean;
  } | null>(null);
  const uncertain = pendingCreate !== null;

  // 编辑 / 删除已有记录（乐观锁 version）
  const [editing, setEditing] = useState<Measurement | null>(null);
  const [editDate, setEditDate] = useState("");
  const [editTime, setEditTime] = useState("");
  const [editValue, setEditValue] = useState("");
  const [editSystolic, setEditSystolic] = useState("");
  const [editDiastolic, setEditDiastolic] = useState("");
  const [editPeriod, setEditPeriod] = useState<MeasurementPeriod>("morning");
  const [editError, setEditError] = useState("");

  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  const latestWeight = data.latest.weight;
  const currentWeightNum = latestWeight?.value != null
    ? Number(latestWeight.value)
    : data.legacyWeightKg;
  const weightDiffText = latestWeight
    ? measurementChange(latestWeight, data.previous.weight)
    : null;

  const latestFat = data.latest.bodyFat;
  const fatDiffText = latestFat
    ? measurementChange(latestFat, data.previous.bodyFat)
    : null;

  // 按目标体重进度估算
  const targetWeight = data.targetWeightKg;
  const weightToGo =
    currentWeightNum != null && targetWeight != null
      ? Number((currentWeightNum - targetWeight).toFixed(2))
      : null;

  // 按所选时段（晨间/夜间）查找最新血压及同时段上一次血压
  const [periodLatestBp, periodPrevBp] = data.recentBloodPressure[bpPeriod];

  const sparkline = buildWeightTrendSvg(data.entries.filter(entry => entry.kind === "weight").slice(0, 7), null, 200, 36);
  const recentSeven = data.entries.slice(0, 7);

  async function sendCreate(request: { requestId: string; measurement: MeasurementInput }, fromForm: boolean) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setFormError("");
    try {
      await withRequestTimeout((signal) =>
        api("/api/v1/measurements", {
          method: "POST", signal, body: JSON.stringify(request),
        }),
      );
      setPendingCreate(null);
      if (fromForm) {
        setDraftDate(null);
        setNewValue("");
        setNewSystolic("");
        setNewDiastolic("");
      }
      toast.success("身体指标已保存");
      router.refresh();
    } catch (err) {
      const unknown = !(err instanceof ApiError) || err.status >= 500;
      setPendingCreate(unknown ? { body: request, fromForm } : null);
      const message = err instanceof Error ? err.message : "保存未完成";
      setFormError(message);
      toast.error(message);
      if (err instanceof ApiError && err.status === 409) router.refresh();
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function submitCreate(input: unknown, fromForm: boolean) {
    if (busyRef.current || pendingCreate) return;
    const parsed = measurementSchemas(data.today).payload.safeParse(input);
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "请核对输入格式");
      return;
    }
    await sendCreate({ requestId: crypto.randomUUID(), measurement: parsed.data }, fromForm);
  }

  async function handleQuickWeight(delta: number) {
    if (currentWeightNum == null) return;
    await submitCreate({
      kind: "weight",
      date: effectiveDate,
      time: currentTimeInTz(data.timeZone),
      value: Math.max(0.01, Math.min(500, currentWeightNum + delta)).toFixed(2),
      note: null,
    }, false);
  }

  function toggleQuickForm() {
    if (!quickFormOpen) {
      setFormError("");
      setNewValue(currentWeightNum != null && newKind === "weight" ? currentWeightNum.toFixed(2) : "");
      setNewSystolic("");
      setNewDiastolic("");
      setNewPeriod(defaultPeriodInTz(data.timeZone));
    }
    setDraftDate(quickFormOpen ? null : effectiveDate);
  }

  async function handleInlineSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (uncertain || !draftDate) return;
    const payload =
      newKind === "bloodPressure"
        ? {
            kind: "bloodPressure",
            date: draftDate,
            time: currentTimeInTz(data.timeZone),
            period: newPeriod,
            systolic: Number(newSystolic),
            diastolic: Number(newDiastolic),
            note: null,
          }
        : {
            kind: newKind,
            date: draftDate,
            time: currentTimeInTz(data.timeZone),
            value: newValue.trim(),
            note: null,
          };

    await submitCreate(payload, true);
  }

  function startEdit(entry: Measurement) {
    setEditing(entry);
    setEditDate(entry.date);
    setEditTime(entry.time ?? "");
    setEditValue(entry.value ?? "");
    setEditSystolic(entry.systolic?.toString() ?? "");
    setEditDiastolic(entry.diastolic?.toString() ?? "");
    setEditPeriod(entry.period ?? defaultPeriodInTz(data.timeZone));
    setEditError("");
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!editing || busyRef.current) return;

    const payload =
      editing.kind === "bloodPressure"
        ? {
            kind: "bloodPressure",
            date: editDate,
            time: editTime || null,
            period: editPeriod,
            systolic: Number(editSystolic),
            diastolic: Number(editDiastolic),
            note: editing.note,
          }
        : {
            kind: editing.kind,
            date: editDate,
            time: editTime || null,
            value: editValue.trim(),
            note: editing.note,
          };

    const parsed = measurementSchemas(data.today).payload.safeParse(payload);
    if (!parsed.success) {
      setEditError(parsed.error.issues[0]?.message ?? "请核对输入");
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setEditError("");
    try {
      await withRequestTimeout((signal) =>
        api(`/api/v1/measurements/${editing.id}`, {
          method: "PATCH",
          signal,
          body: JSON.stringify({ version: editing.version, measurement: parsed.data }),
        }),
      );
      toast.success("已更新测量记录");
      setEditing(null);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(err.message);
        setEditing(null);
        router.refresh();
        return;
      }
      setEditError(err instanceof Error ? err.message : "修改失败，请重试");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function deleteEntry(entry: Measurement) {
    if (busyRef.current) return;

    busyRef.current = true;
    setBusy(true);
    try {
      await withRequestTimeout((signal) =>
        api(`/api/v1/measurements/${entry.id}`, {
          method: "DELETE",
          signal,
          body: JSON.stringify({ version: entry.version }),
        }),
      );
      toast.success("测量记录已删除");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(err.message);
        router.refresh();
        return;
      }
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <section
      aria-labelledby="editorial-measurements-title"
      className="space-y-3.5 rounded-2xl border bg-card p-5 shadow-[0_2px_12px_-8px_#233e2e26]"
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 id="editorial-measurements-title" className="flex items-center gap-1.5 text-sm font-bold">
            <Scale className="size-4 text-primary" aria-hidden />
            <span>身体指标追踪</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            持续记录体重、体脂与血压
          </p>
        </div>
        {latestWeight && (
          <span className="rounded-full border border-primary/15 bg-secondary px-2 py-0.5 font-mono text-xs font-medium text-secondary-foreground">
            {weightDiffText ?? "首次记录"}
          </span>
        )}
      </div>

      {/* 体重与目标卡片 */}
      <div className="space-y-2 rounded-xl border bg-background p-3.5">
        <div className="flex items-baseline justify-between gap-2">
          <div>
            <div className="text-xs text-muted-foreground">
              {latestWeight ? "最新测量体重" : data.legacyWeightKg != null ? "旧资料参考体重" : "最新体重"}
            </div>
            <div className="mt-0.5 font-mono text-2xl font-bold tabular-nums">
              {currentWeightNum != null ? (
                <NumberFlow
                  value={currentWeightNum}
                  format={{ minimumFractionDigits: 2, maximumFractionDigits: 2 }}
                />
              ) : (
                "—"
              )}
              {currentWeightNum != null && (
                <span className="ml-1 text-xs font-normal text-muted-foreground">kg</span>
              )}
            </div>
          </div>
          <div className="text-right">
            <div className="text-xs text-muted-foreground">目标体重</div>
            <button
              type="button"
              onClick={onOpenSettings}
              className="mt-0.5 font-mono text-sm font-semibold tabular-nums text-primary hover:underline"
            >
              {targetWeight != null ? `${targetWeight.toFixed(2)} kg` : "去设置"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2 font-mono text-xs text-muted-foreground">
          <span>
            体脂率:{" "}
            <strong className="text-foreground">
              {latestFat?.value != null ? `${Number(latestFat.value).toFixed(2)}%` : "未记录"}
            </strong>
            {fatDiffText ? ` (${fatDiffText})` : ""}
          </span>
          <span>
            {weightToGo == null
              ? "设置目标后展示差距"
              : weightToGo > 0
                ? `距目标 ${weightToGo.toFixed(2)} kg`
                : weightToGo < 0
                  ? `低于目标 ${Math.abs(weightToGo).toFixed(2)} kg`
                  : "与目标一致"}
          </span>
        </div>
      </div>

      {/* 快捷记录按钮组 */}
      <div className="space-y-2">
        <div className="flex items-center gap-1.5 text-xs">
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            transition={TAP_SPRING}
            disabled={busy || uncertain || currentWeightNum == null}
            onClick={() => handleQuickWeight(-0.15)}
            className="flex-1 rounded-lg border bg-background py-1.5 font-mono transition-colors hover:border-primary disabled:opacity-45"
            title={currentWeightNum == null ? "请先记录一次体重" : "基于当前体重 -0.15 kg 快速记录"}
          >
            -0.15 kg
          </motion.button>
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            transition={TAP_SPRING}
            disabled={busy || uncertain || currentWeightNum == null}
            onClick={() => handleQuickWeight(0.15)}
            className="flex-1 rounded-lg border bg-background py-1.5 font-mono transition-colors hover:border-primary disabled:opacity-45"
            title={currentWeightNum == null ? "请先记录一次体重" : "基于当前体重 +0.15 kg 快速记录"}
          >
            +0.15 kg
          </motion.button>
          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.95 }}
            transition={TAP_SPRING}
            disabled={busy || uncertain}
            onClick={toggleQuickForm}
            aria-expanded={quickFormOpen}
            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            <Plus className="size-3.5" aria-hidden />
            记指标
          </motion.button>
        </div>

        {pendingCreate && (
          <div role="alert" className="space-y-1 rounded-xl border p-2 text-xs">
            <p>{pendingCreate.body.measurement.date} 的{MEASUREMENT_LABELS[pendingCreate.body.measurement.kind]}保存结果待确认。</p>
            <Button type="button" size="sm" disabled={busy} onClick={() => void sendCreate(pendingCreate.body, pendingCreate.fromForm)}>
              核对并重试原记录
            </Button>
          </div>
        )}

        {/* 展开式新增测量小表单 */}
        <AnimatePresence initial={false}>
        {quickFormOpen && (
          <motion.form
            key="quick-measure-form"
            initial={{ opacity: 0, height: 0, y: -6 }}
            animate={{ opacity: 1, height: "auto", y: 0 }}
            exit={{ opacity: 0, height: 0, y: -6 }}
            transition={SOFT_SPRING}
            onSubmit={handleInlineSubmit}
            className="overflow-hidden"
          >
          <div className="space-y-2.5 rounded-xl border bg-background p-3 text-xs">
            <p className="font-medium">记录日期 {draftDate}</p>
            <div className="flex items-center justify-between gap-2">
              <label className="sr-only" htmlFor="quick-m-kind">
                指标类型
              </label>
              <select
                id="quick-m-kind"
                value={newKind}
                disabled={busy || uncertain}
                onChange={(e) => {
                  const next = e.target.value as MeasurementKind;
                  setNewKind(next);
                  setFormError("");
                }}
                className="flex-1 rounded-lg border bg-card px-2 py-1.5 font-medium"
              >
                {MEASUREMENT_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {MEASUREMENT_LABELS[k]} ({measurementUnit(k)})
                  </option>
                ))}
              </select>

              {newKind === "bloodPressure" && (
                <>
                  <label className="sr-only" htmlFor="quick-m-period">
                    测量时段
                  </label>
                  <select
                    id="quick-m-period"
                    value={newPeriod}
                    disabled={busy || uncertain}
                    onChange={(e) => setNewPeriod(e.target.value as MeasurementPeriod)}
                    className="rounded-lg border bg-card px-2 py-1.5 font-medium"
                  >
                    {MEASUREMENT_PERIODS.map((p) => (
                      <option key={p} value={p}>
                        {MEASUREMENT_PERIOD_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </>
              )}
            </div>

            {newKind === "bloodPressure" ? (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label htmlFor="quick-bp-sys" className="text-[11px] text-muted-foreground">
                    收缩压 (mmHg)
                  </Label>
                  <Input
                    id="quick-bp-sys"
                    type="number"
                    min={1}
                    max={400}
                    required
                    placeholder="如 118"
                    value={newSystolic}
                    disabled={busy || uncertain}
                    onChange={(e) => setNewSystolic(e.target.value)}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
                <div>
                  <Label htmlFor="quick-bp-dia" className="text-[11px] text-muted-foreground">
                    舒张压 (mmHg)
                  </Label>
                  <Input
                    id="quick-bp-dia"
                    type="number"
                    min={1}
                    max={400}
                    required
                    placeholder="如 76"
                    value={newDiastolic}
                    disabled={busy || uncertain}
                    onChange={(e) => setNewDiastolic(e.target.value)}
                    className="mt-1 h-8 font-mono text-xs"
                  />
                </div>
              </div>
            ) : (
              <div>
                <Label htmlFor="quick-m-val" className="text-[11px] text-muted-foreground">
                  {MEASUREMENT_LABELS[newKind]} ({measurementUnit(newKind)})
                </Label>
                <Input
                  id="quick-m-val"
                  type="number"
                  step="0.01"
                  min={0.01}
                  max={newKind === "weight" ? 500 : 100}
                  required
                  placeholder={newKind === "weight" ? "如 72.25" : "如 16.80"}
                  value={newValue}
                  disabled={busy || uncertain}
                  onChange={(e) => setNewValue(e.target.value)}
                  className="mt-1 h-8 font-mono text-xs"
                />
              </div>
            )}

            {formError && (
              <p role="alert" className="text-[11px] text-destructive">
                {formError}
              </p>
            )}

            <div className="flex justify-end gap-1.5">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={busy || uncertain}
                onClick={() => {
                  setDraftDate(null);
                  setFormError("");
                }}
              >
                收起
              </Button>
              <Button type="submit" size="sm" className="h-7 text-xs" disabled={busy || uncertain}>
                {busy && <LoaderCircle className="size-3 animate-spin" aria-hidden />}
                保存
              </Button>
            </div>
          </div>
          </motion.form>
        )}
        </AnimatePresence>

        {/* 血压同时段对比行 */}
        <div className="flex items-center justify-between gap-2 rounded-xl border bg-background p-2.5 text-xs">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 font-medium">
              <span>最新血压</span>
              <span className="rounded border bg-card px-1.5 py-0.2 font-mono text-[11px]">
                {bpPeriod === "morning" ? "🌅 晨间" : "🌙 夜间"}
              </span>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={bpPeriod}
                initial={{ opacity: 0, y: 3 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -3 }}
                transition={{ duration: 0.16 }}
                className="mt-0.5 truncate font-mono text-muted-foreground"
              >
                {periodLatestBp ? (
                  <>
                    <strong className="text-foreground">
                      {periodLatestBp.systolic} / {periodLatestBp.diastolic}
                    </strong>{" "}
                    mmHg
                    {periodPrevBp
                      ? ` · 同时段上次 ${periodPrevBp.systolic}/${periodPrevBp.diastolic}`
                      : " · 首次"}
                  </>
                ) : (
                  `暂无${MEASUREMENT_PERIOD_LABELS[bpPeriod]}血压记录`
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          <motion.button
            type="button"
            whileTap={{ scale: 0.94 }}
            transition={TAP_SPRING}
            onClick={() => setBpPeriod((p) => (p === "morning" ? "evening" : "morning"))}
            className="shrink-0 whitespace-nowrap rounded-lg border bg-card px-2 py-1 text-[11px] font-medium transition-colors hover:border-primary"
          >
            🌅/🌙 切换
          </motion.button>
        </div>
      </div>

      {/* 最近 7 次测量折叠抽屉 */}
      <div className="border-t pt-2">
        <button
          type="button"
          onClick={() => setDrawerOpen((v) => !v)}
          aria-expanded={drawerOpen}
          className="flex w-full items-center justify-between py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <span>最近 7 次测量折线与明细 ({recentSeven.length})</span>
          <span className="inline-flex items-center gap-1 font-mono">
            <span>{drawerOpen ? "收起" : "展开"}</span>
            <motion.span
              animate={{ rotate: drawerOpen ? 180 : 0 }}
              transition={SOFT_SPRING}
              className="inline-flex"
            >
              <ChevronDown className="size-3.5" aria-hidden />
            </motion.span>
          </span>
        </button>

        <AnimatePresence initial={false}>
        {drawerOpen && (
          <motion.div
            key="measure-drawer"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={SOFT_SPRING}
            className="overflow-hidden"
          >
          <div className="mt-2.5 space-y-2.5">
            {/* 迷你 SVG 体重折线图 */}
            <div className="rounded-xl border bg-background p-2.5">
              {sparkline.svg ? (
                <>
                  <div className="mb-1 flex justify-between font-mono text-xs text-muted-foreground">
                    <span>近期体重走势</span>
                    <span>
                      {sparkline.ordered[0][1].toFixed(2)} →{" "}
                      <strong className="text-foreground">{sparkline.ordered[sparkline.ordered.length - 1][1].toFixed(2)}</strong> kg
                    </span>
                  </div>
                  <svg className="h-10 w-full overflow-visible" viewBox="0 0 200 36" aria-hidden>
                    <motion.path
                      initial={{ pathLength: 0, opacity: 0.35 }}
                      animate={{ pathLength: 1, opacity: 1 }}
                      transition={{ duration: 0.65, ease: "easeOut" }}
                      fill="none"
                      stroke="currentColor"
                      className="text-primary"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d={sparkline.svg.path}
                    />
                    {sparkline.svg.points.map(point => (
                      <circle key={point.date} cx={point.x} cy={point.y} r="2.5" className="fill-primary" />
                    ))}
                  </svg>
                </>
              ) : (
                <p className="py-1 text-center text-xs text-muted-foreground">
                  至少记录两个日期的体重后可查看近期走势
                </p>
              )}
            </div>

            {/* 测量历史明细（可编辑、可删除） */}
            {recentSeven.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">
                暂无身体指标记录
              </p>
            ) : (
              <div className="max-h-52 space-y-1.5 overflow-y-auto pr-1">
                {recentSeven.map((m) => {
                  const periodText = measurementPeriodLabel(m);
                  return (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-2 rounded-lg border bg-background p-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="font-mono font-semibold">
                          {MEASUREMENT_LABELS[m.kind]} {measurementValue(m)} {measurementUnit(m.kind)}
                        </div>
                        <div className="truncate font-mono text-[11px] text-muted-foreground">
                          {m.date} {m.time ?? ""}
                          {periodText ? ` · ${periodText}` : ""}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => startEdit(m)}
                          className="rounded border bg-card p-1 text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                          title="编辑测量记录"
                          aria-label={`编辑 ${MEASUREMENT_LABELS[m.kind]} ${m.date}`}
                        >
                          <Pencil className="size-3" aria-hidden />
                        </button>
                        <InlineConfirmButton
                          disabled={busy}
                          onConfirm={() => deleteEntry(m)}
                          ariaLabel={`删除 ${MEASUREMENT_LABELS[m.kind]} ${m.date}`}
                          confirmText="确认删除"
                          className="rounded border bg-card p-1 hover:border-destructive"
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Link
              href="/measurements"
              className="flex items-center justify-between border-t pt-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <span>查看全部身体指标与完整图表</span>
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
          </motion.div>
        )}
        </AnimatePresence>
      </div>

      {/* 编辑测量记录弹窗（保留乐观锁 version） */}
      <Dialog open={editing != null} onOpenChange={(open) => !open && !busy && setEditing(null)}>
        <DialogContent className="sm:max-w-md rounded-2xl">
          <DialogHeader>
            <DialogTitle>
              修改{editing ? MEASUREMENT_LABELS[editing.kind] : "测量"}记录
            </DialogTitle>
            <DialogDescription>
              修改后将同步更新趋势与最新指标展示。
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <form onSubmit={saveEdit} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <Label htmlFor="edit-m-date">日期</Label>
                  <Input
                    id="edit-m-date"
                    type="date"
                    max={data.today}
                    required
                    value={editDate}
                    disabled={busy}
                    onChange={(e) => setEditDate(e.target.value)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="edit-m-time">时间 (可选)</Label>
                  <Input
                    id="edit-m-time"
                    type="time"
                    value={editTime}
                    disabled={busy}
                    onChange={(e) => setEditTime(e.target.value)}
                  />
                </div>
              </div>

              {editing.kind === "bloodPressure" ? (
                <>
                  <div className="space-y-1">
                    <Label htmlFor="edit-m-period">测量时段</Label>
                    <select
                      id="edit-m-period"
                      value={editPeriod}
                      disabled={busy}
                      onChange={(e) => setEditPeriod(e.target.value as MeasurementPeriod)}
                      className="w-full rounded-lg border bg-background px-3 py-2 text-sm"
                    >
                      {MEASUREMENT_PERIODS.map((p) => (
                        <option key={p} value={p}>
                          {MEASUREMENT_PERIOD_LABELS[p]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2.5">
                    <div className="space-y-1">
                      <Label htmlFor="edit-m-sys">收缩压 (mmHg)</Label>
                      <Input
                        id="edit-m-sys"
                        type="number"
                        min={1}
                        max={400}
                        required
                        value={editSystolic}
                        disabled={busy}
                        onChange={(e) => setEditSystolic(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="edit-m-dia">舒张压 (mmHg)</Label>
                      <Input
                        id="edit-m-dia"
                        type="number"
                        min={1}
                        max={400}
                        required
                        value={editDiastolic}
                        disabled={busy}
                        onChange={(e) => setEditDiastolic(e.target.value)}
                      />
                    </div>
                  </div>
                </>
              ) : (
                <div className="space-y-1">
                  <Label htmlFor="edit-m-val">
                    {MEASUREMENT_LABELS[editing.kind]} ({measurementUnit(editing.kind)})
                  </Label>
                  <Input
                    id="edit-m-val"
                    type="number"
                    step="0.01"
                    min={0.01}
                    max={editing.kind === "weight" ? 500 : 100}
                    required
                    value={editValue}
                    disabled={busy}
                    onChange={(e) => setEditValue(e.target.value)}
                  />
                </div>
              )}

              {editError && (
                <p role="alert" className="text-xs text-destructive">
                  {editError}
                </p>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  disabled={busy}
                  onClick={() => setEditing(null)}
                >
                  取消
                </Button>
                <Button type="submit" disabled={busy}>
                  {busy ? "保存中…" : "保存修改"}
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}
