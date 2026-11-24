"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Check,
  CheckCheck,
  ChevronDown,
  Clock,
  LoaderCircle,
  Pause,
  Pencil,
  Pill,
  Play,
  Plus,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api-client";
import { formatDateCn } from "@/lib/date";
import { withRequestTimeout } from "@/lib/request-timeout";
import {
  SUPPLEMENT_SLOTS,
  SUPPLEMENT_BATCH_LIMIT,
  SUPPLEMENT_SLOT_LABELS,
  SUPPLEMENT_TEMPLATES,
  formatQuantity,
  formatSupplementDose,
  formatWeekdaysLabel,
  isSupplementPlannedOnDate,
  roundQty,
  supplementIntakeSchemas,
  type Supplement,
  type SupplementDashboard,
  type SupplementIntake,
  type SupplementSlot,
  type SupplementTemplate,
} from "@/lib/supplements";
import { InlineConfirmButton } from "./inline-confirm-button";
import { SOFT_SPRING, TAB_SPRING, TAP_SPRING } from "./motion-provider";
import { SupplementAdhocDialog } from "./supplement-adhoc-dialog";
import { SupplementFormDialog } from "./supplement-form-dialog";
import { SupplementHabitMatrix } from "./supplement-habit-matrix";
import { SUPPLEMENT_SLOT_ICONS } from "./supplement-slot-icons";

type ActiveTab = "daily" | "matrix" | "library";

type PlannedRow = {
  supplement: Supplement;
  slot: SupplementSlot;
  defaultQuantity: number;
  intakes: SupplementIntake[];
};

type SlotGroup = {
  slot: SupplementSlot;
  rows: PlannedRow[];
  completedCount: number;
  remainingRows: PlannedRow[];
};

type PendingIntakeBody = {
  requestId: string;
  intake: {
    supplementId: string;
    date: string;
    slot: SupplementSlot;
    quantity: number;
    takenTime: string | null;
    note: string | null;
  };
};

function withoutKey<T>(state: Record<string, T>, key: string) {
  if (!(key in state)) return state;
  const next = { ...state };
  delete next[key];
  return next;
}

function currentTimeInTz(timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date());
}

function adjustQuantity(current: string, delta: number): string {
  const num = Number(current);
  const base = Number.isFinite(num) && num > 0 ? num : 1;
  const next = Math.max(0.5, Math.min(100, roundQty(base + delta)));
  return String(next);
}

/** 单条已保存服用记录的行内编辑与删除卡（用于打卡展开面板和临时记录列表）。 */
function IntakeEditItem({
  entry,
  today,
  canRecord,
  showSlotPicker,
  onChanged,
}: {
  entry: SupplementIntake;
  today: string;
  canRecord: boolean;
  showSlotPicker?: boolean;
  onChanged: () => void;
}) {
  const [editBase, setEditBase] = useState<SupplementIntake | null>(null);
  const [qty, setQty] = useState(String(entry.quantity));
  const [slot, setSlot] = useState<SupplementSlot>(entry.slot);
  const [takenTime, setTakenTime] = useState(entry.takenTime ?? "");
  const [note, setNote] = useState(entry.note ?? "");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);

  async function saveEdit(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current || !editBase) return;
    const payload = {
      version: editBase.version,
      intake: {
        date: editBase.date,
        slot,
        quantity: Number(qty),
        takenTime: takenTime.trim() || null,
        note: note.trim() || null,
      },
    };
    const parsed = supplementIntakeSchemas(today).update.safeParse(payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "请核对输入内容");
      return;
    }

    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await withRequestTimeout((signal) =>
        api(`/api/v1/supplements/intakes/${entry.id}`, {
          method: "PATCH",
          signal,
          body: JSON.stringify(parsed.data),
        }),
      );
      setEditBase(null);
      toast.success("已更新本次服用记录");
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setEditBase(null);
        toast.error(err.message);
        onChanged();
        return;
      }
      setError(err instanceof Error ? err.message : "修改失败，请重试");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function removeEntry() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await withRequestTimeout((signal) =>
        api(`/api/v1/supplements/intakes/${entry.id}`, {
          method: "DELETE",
          signal,
          body: JSON.stringify({ version: entry.version }),
        }),
      );
      toast.success("已删除这条记录");
      onChanged();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(err.message);
        onChanged();
        return;
      }
      toast.error(err instanceof Error ? err.message : "删除失败，请重试");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (!editBase) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-3 py-2 text-xs">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            {!showSlotPicker && <span>{entry.name}</span>}
            <span className="font-mono font-semibold text-foreground">
              {formatSupplementDose(entry.quantity, entry.unit, entry.spec)}
            </span>
            {showSlotPicker && (
              <span className="rounded-md border bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">
                {SUPPLEMENT_SLOT_LABELS[entry.slot]}
              </span>
            )}
            <span className="font-mono text-[11px] text-muted-foreground">
              {entry.takenTime ? entry.takenTime : "未填时间"}
            </span>
          </div>
          {entry.note && (
            <p className="mt-0.5 break-words text-[11px] text-muted-foreground">{entry.note}</p>
          )}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {canRecord && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setQty(String(entry.quantity));
                setSlot(entry.slot);
                setTakenTime(entry.takenTime ?? "");
                setNote(entry.note ?? "");
                setError("");
                setEditBase(entry);
              }}
              className="inline-flex min-h-8 items-center gap-1 rounded-lg border bg-background px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
              aria-label={`编辑 ${entry.name} 本次记录`}
            >
              <Pencil className="size-3" aria-hidden />
              微调
            </button>
          )}
          <InlineConfirmButton
            disabled={busy}
            onConfirm={removeEntry}
            ariaLabel={`删除 ${entry.name} 本次记录`}
            confirmText="确认删除"
            className="min-h-8 rounded-lg border bg-background px-2 py-1 hover:border-destructive"
          />
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={saveEdit} className="space-y-2.5 rounded-xl border border-primary/50 bg-card p-3 text-xs">
      <div className="flex flex-wrap items-end gap-2">
        <div className="space-y-1">
          <Label htmlFor={`edit-qty-${entry.id}`} className="text-[11px] text-muted-foreground">
            本次数量 ({entry.unit})
          </Label>
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={busy}
              onClick={() => setQty((v) => adjustQuantity(v, -0.5))}
              className="flex size-8 items-center justify-center rounded-lg border bg-background font-mono text-sm hover:border-primary"
              aria-label="减少数量"
            >
              −
            </button>
            <Input
              id={`edit-qty-${entry.id}`}
              type="number"
              inputMode="decimal"
              step="any"
              min={0.01}
              max={100}
              required
              disabled={busy}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              className="h-8 w-16 px-2 text-center font-mono text-xs"
            />
            <button
              type="button"
              disabled={busy}
              onClick={() => setQty((v) => adjustQuantity(v, 0.5))}
              className="flex size-8 items-center justify-center rounded-lg border bg-background font-mono text-sm hover:border-primary"
              aria-label="增加数量"
            >
              +
            </button>
          </div>
        </div>

        {showSlotPicker && (
          <div className="space-y-1">
            <Label htmlFor={`edit-slot-${entry.id}`} className="text-[11px] text-muted-foreground">
              时段
            </Label>
            <select
              id={`edit-slot-${entry.id}`}
              value={slot}
              disabled={busy}
              onChange={(e) => setSlot(e.target.value as SupplementSlot)}
              className="h-8 rounded-lg border border-input bg-background px-2 text-xs"
            >
              {SUPPLEMENT_SLOTS.map((s) => (
                <option key={s} value={s}>
                  {SUPPLEMENT_SLOT_LABELS[s]}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="space-y-1">
          <Label htmlFor={`edit-time-${entry.id}`} className="text-[11px] text-muted-foreground">
            时间（可选）
          </Label>
          <Input
            id={`edit-time-${entry.id}`}
            type="time"
            disabled={busy}
            value={takenTime}
            onChange={(e) => setTakenTime(e.target.value)}
            className="h-8 w-28 font-mono text-xs"
          />
        </div>
      </div>

      <div className="space-y-1">
        <Label htmlFor={`edit-note-${entry.id}`} className="text-[11px] text-muted-foreground">
          备注（可选）
        </Label>
        <Input
          id={`edit-note-${entry.id}`}
          maxLength={300}
          disabled={busy}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="如：饭后半小时吃、只吃了一半"
          className="h-8 text-xs"
        />
      </div>

      {error && (
        <p role="alert" className="text-[11px] font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-1.5">
        <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={busy} onClick={() => setEditBase(null)}>
          取消
        </Button>
        <Button type="submit" size="sm" className="h-7 text-xs" disabled={busy}>
          {busy && <LoaderCircle className="size-3 animate-spin" aria-hidden />}
          保存修改
        </Button>
      </div>
    </form>
  );
}

export function SupplementsManager({ data }: { data: SupplementDashboard }) {
  const router = useRouter();
  const canRecord = data.date <= data.today;

  const [activeTab, setActiveTab] = useState<ActiveTab>("daily");
  const [formOpen, setFormOpen] = useState(false);
  const [editingSupplement, setEditingSupplement] = useState<Supplement | null>(null);
  const [prefillTemplate, setPrefillTemplate] = useState<SupplementTemplate | null>(null);
  const [adhocOpeningTime, setAdhocOpeningTime] = useState<string | null>(null);
  const [refreshing, startRefresh] = useTransition();
  function refreshIntakes() {
    startRefresh(() => router.refresh());
  }

  function setAdhocOpen(open: boolean) {
    setAdhocOpeningTime(open ? (data.date === data.today ? currentTimeInTz(data.timeZone) : "") : null);
  }

  // 展开的打卡行 key（`${date}:${supplementId}:${slot}`）
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [draftQty, setDraftQty] = useState("1");
  const [draftTime, setDraftTime] = useState("");
  const [draftNote, setDraftNote] = useState("");
  const [extraFormKey, setExtraFormKey] = useState<string | null>(null);

  // 并发锁定与幂等重试状态（按行 / 时段 / 补剂 ID 独立管理）
  const [busyKeys, setBusyKeys] = useState<Record<string, boolean>>({});
  const busyKeysRef = useRef<Set<string>>(new Set());
  const [pendingSingle, setPendingSingle] = useState<Record<string, PendingIntakeBody>>({});
  const [pendingBatch, setPendingBatch] = useState<Record<string, PendingIntakeBody[]>>({});

  function acquireBusy(key: string, conflictingKeys: string[] = []): boolean {
    if (busyKeysRef.current.has(key) || conflictingKeys.some(k => busyKeysRef.current.has(k))) return false;
    busyKeysRef.current.add(key);
    setBusyKeys((prev) => ({ ...prev, [key]: true }));
    return true;
  }

  function releaseBusy(key: string) {
    busyKeysRef.current.delete(key);
    setBusyKeys(prev => withoutKey(prev, key));
  }

  // 构建当日按时段分组的计划清单 + 其余非计划（按需/临时/历史）记录
  const { slotGroups, unmatchedIntakes, plannedTotal, plannedCompleted } = useMemo(() => {
    const matchedIds = new Set<string>();
    const bySlot = new Map<SupplementSlot, PlannedRow[]>();

    for (const sup of data.supplements) {
      if (!isSupplementPlannedOnDate(sup, data.date)) continue;
      for (const item of sup.schedule) {
        const matched = data.intakes.filter(
          (entry) => entry.supplementId === sup.id && entry.slot === item.slot,
        );
        for (const entry of matched) matchedIds.add(entry.id);
        const list = bySlot.get(item.slot) ?? [];
        list.push({
          supplement: sup,
          slot: item.slot,
          defaultQuantity: item.quantity,
          intakes: matched,
        });
        bySlot.set(item.slot, list);
      }
    }

    const groups: SlotGroup[] = [];
    let total = 0;
    let completed = 0;

    for (const slot of SUPPLEMENT_SLOTS) {
      const rows = bySlot.get(slot);
      if (!rows || rows.length === 0) continue;
      const remainingRows = rows.filter((row) => row.intakes.length === 0);
      const done = rows.length - remainingRows.length;
      total += rows.length;
      completed += done;
      groups.push({ slot, rows, completedCount: done, remainingRows });
    }

    const unmatched = data.intakes.filter((entry) => !matchedIds.has(entry.id));
    return {
      slotGroups: groups,
      unmatchedIntakes: unmatched,
      plannedTotal: total,
      plannedCompleted: completed,
    };
  }, [data.supplements, data.intakes, data.date]);

  const activeScheduled = useMemo(
    () => data.supplements.filter((s) => s.status === "active" && s.mode === "scheduled"),
    [data.supplements],
  );
  const activeAsNeeded = useMemo(
    () => data.supplements.filter((s) => s.status === "active" && s.mode === "asNeeded"),
    [data.supplements],
  );
  const pausedSupplements = useMemo(
    () => data.supplements.filter((s) => s.status === "paused"),
    [data.supplements],
  );

  function openCreateDialog(template: SupplementTemplate | null = null) {
    setEditingSupplement(null);
    setPrefillTemplate(template);
    setFormOpen(true);
  }

  function openEditDialog(sup: Supplement) {
    setEditingSupplement(sup);
    setPrefillTemplate(null);
    setFormOpen(true);
  }

  function openRowDrawer(row: PlannedRow, key: string, forceExtra = false) {
    const isSame = expandedKey === key;
    if (isSame && !forceExtra) {
      setExpandedKey(null);
      setExtraFormKey(null);
      return;
    }
    setExpandedKey(key);
    setDraftQty(String(row.defaultQuantity));
    setDraftTime(data.date === data.today ? currentTimeInTz(data.timeZone) : "");
    setDraftNote("");
    setExtraFormKey(forceExtra ? key : null);
  }

  async function sendSingleIntake(
    actionKey: string,
    body: PendingIntakeBody,
    label: string,
    fromPlan = true,
  ) {
    const batchKey = `batch:${body.intake.date}:${body.intake.slot}`;
    if (refreshing || (fromPlan && pendingBatch[batchKey]) || !acquireBusy(actionKey, fromPlan ? [batchKey] : [])) return;
    try {
      const result = await withRequestTimeout((signal) =>
        api<{ entry: SupplementIntake }>("/api/v1/supplements/intakes", {
          method: "POST",
          signal,
          body: JSON.stringify(body),
        }),
      );
      if (!result.entry?.id) throw new Error("未收到打卡结果，请核对并重试");
      setPendingSingle(prev => withoutKey(prev, actionKey));
      setExpandedKey(current => current === actionKey ? null : current);
      setExtraFormKey(current => current === actionKey ? null : current);
      toast.success(`已记录「${label}」`);
      refreshIntakes();
    } catch (err) {
      const isUnknown = !(err instanceof ApiError) || err.status >= 500;
      if (isUnknown) {
        setPendingSingle((prev) => ({ ...prev, [actionKey]: body }));
      } else {
        setPendingSingle(prev => withoutKey(prev, actionKey));
        refreshIntakes();
      }
      toast.error(err instanceof Error ? err.message : "记录未完成，请核对后重试");
    } finally {
      releaseBusy(actionKey);
    }
  }

  async function handleQuickToggle(row: PlannedRow, rowKey: string) {
    const batchKey = `batch:${data.date}:${row.slot}`;
    if (!canRecord || refreshing || pendingBatch[batchKey]) return;
    if (pendingSingle[rowKey]) {
      await sendSingleIntake(rowKey, pendingSingle[rowKey], row.supplement.name);
      return;
    }

    if (row.intakes.length === 0) {
      const body: PendingIntakeBody = {
        requestId: crypto.randomUUID(),
        intake: {
          supplementId: row.supplement.id,
          date: data.date,
          slot: row.slot,
          quantity: row.defaultQuantity,
          takenTime: data.date === data.today ? currentTimeInTz(data.timeZone) : null,
          note: null,
        },
      };
      await sendSingleIntake(rowKey, body, row.supplement.name);
      return;
    }

    // 只有单条且未改过剂量/备注时，再次点勾选直接温和撤销；改过内容或有多条则展开防误删。
    const first = row.intakes[0];
    const isUnmodifiedSingle =
      row.intakes.length === 1 &&
      roundQty(first.quantity) === roundQty(row.defaultQuantity) &&
      !first.note;

    if (!isUnmodifiedSingle) {
      openRowDrawer(row, rowKey);
      return;
    }

    if (!acquireBusy(rowKey, [batchKey])) return;
    try {
      await withRequestTimeout((signal) =>
        api(`/api/v1/supplements/intakes/${first.id}`, {
          method: "DELETE",
          signal,
          body: JSON.stringify({ version: first.version }),
        }),
      );
      toast.success(`已撤销「${row.supplement.name}」`);
      refreshIntakes();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        toast.error(err.message);
        refreshIntakes();
        return;
      }
      toast.error(err instanceof Error ? err.message : "撤销失败，请重试");
    } finally {
      releaseBusy(rowKey);
    }
  }

  async function handleCustomCreate(
    event: React.FormEvent,
    row: PlannedRow,
    rowKey: string,
  ) {
    event.preventDefault();
    if (!canRecord || pendingSingle[rowKey]) return;
    const body: PendingIntakeBody = {
      requestId: crypto.randomUUID(),
      intake: {
        supplementId: row.supplement.id,
        date: data.date,
        slot: row.slot,
        quantity: Number(draftQty),
        takenTime: draftTime.trim() || null,
        note: draftNote.trim() || null,
      },
    };
    const parsed = supplementIntakeSchemas(data.today).createItem.safeParse(body);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? "请核对数量与时间格式");
      return;
    }
    await sendSingleIntake(rowKey, body, row.supplement.name);
  }

  async function sendBatchSlot(slotKey: string, group: SlotGroup, items: PendingIntakeBody[]) {
    const rowKeys = group.rows.map(row => `${data.date}:${row.supplement.id}:${group.slot}`);
    if (refreshing || rowKeys.some(key => pendingSingle[key]) || !acquireBusy(slotKey, rowKeys)) return;
    let remaining = items;
    try {
      while (remaining.length) {
        const chunk = remaining.slice(0, SUPPLEMENT_BATCH_LIMIT);
        const result = await withRequestTimeout(signal =>
          api<{ entries: SupplementIntake[] }>("/api/v1/supplements/intakes/batch", {
            method: "POST", signal, body: JSON.stringify({ items: chunk }),
          }),
        );
        if (result.entries?.length !== chunk.length || result.entries.some(entry => !entry?.id)) {
          throw new Error("未收到完整的批量打卡结果，请核对并重试");
        }
        remaining = remaining.slice(chunk.length);
      }
      setPendingBatch(prev => withoutKey(prev, slotKey));
      toast.success(`已记录「${SUPPLEMENT_SLOT_LABELS[group.slot]}」${items.length} 项`);
    } catch (err) {
      const isUnknown = !(err instanceof ApiError) || err.status >= 500;
      setPendingBatch(prev => isUnknown ? { ...prev, [slotKey]: remaining } : withoutKey(prev, slotKey));
      const confirmed = items.length - remaining.length;
      const message = err instanceof Error ? err.message : "批量记录未完成，请核对后重试";
      toast.error(confirmed ? `已保存 ${confirmed} 项。${message}` : message);
    } finally {
      refreshIntakes();
      releaseBusy(slotKey);
    }
  }

  async function handleTakeAllSlot(group: SlotGroup) {
    if (!canRecord) return;
    const slotKey = `batch:${data.date}:${group.slot}`;
    if (pendingBatch[slotKey]) {
      await sendBatchSlot(slotKey, group, pendingBatch[slotKey]);
      return;
    }
    if (group.remainingRows.length === 0) return;
    const takenTime = data.date === data.today ? currentTimeInTz(data.timeZone) : null;
    const items: PendingIntakeBody[] = group.remainingRows.map((row) => ({
      requestId: crypto.randomUUID(),
      intake: {
        supplementId: row.supplement.id,
        date: data.date,
        slot: group.slot,
        quantity: row.defaultQuantity,
        takenTime,
        note: null,
      },
    }));
    await sendBatchSlot(slotKey, group, items);
  }

  async function handleAsNeededTap(sup: Supplement) {
    if (!canRecord) return;
    const chipKey = `asNeeded:${data.date}:${sup.id}`;
    if (pendingSingle[chipKey]) {
      await sendSingleIntake(chipKey, pendingSingle[chipKey], sup.name, false);
      return;
    }
    const body: PendingIntakeBody = {
      requestId: crypto.randomUUID(),
      intake: {
        supplementId: sup.id,
        date: data.date,
        slot: "anytime",
        quantity: sup.defaultQuantity,
        takenTime: data.date === data.today ? currentTimeInTz(data.timeZone) : null,
        note: null,
      },
    };
    await sendSingleIntake(chipKey, body, sup.name, false);
  }

  async function toggleSupplementStatus(sup: Supplement) {
    const key = `status:${sup.id}`;
    if (!acquireBusy(key)) return;
    const nextStatus = sup.status === "active" ? "paused" : "active";
    try {
      await withRequestTimeout((signal) =>
        api(`/api/v1/supplements/${sup.id}`, {
          method: "PATCH",
          signal,
          body: JSON.stringify({ status: nextStatus }),
        }),
      );
      toast.success(nextStatus === "paused" ? `已暂停「${sup.name}」` : `已恢复「${sup.name}」`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "操作失败，请重试");
    } finally {
      releaseBusy(key);
    }
  }

  async function removeSupplement(sup: Supplement) {
    const key = `delete-sup:${sup.id}`;
    if (!acquireBusy(key)) return;
    try {
      await withRequestTimeout((signal) =>
        api(`/api/v1/supplements/${sup.id}`, { method: "DELETE", signal }),
      );
      toast.success(`已从补剂库删除「${sup.name}」，历史服用记录已保留`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败，请重试");
    } finally {
      releaseBusy(key);
    }
  }

  const isBrandNew = data.supplements.length === 0 && data.intakes.length === 0;
  const isHistoricalDate = data.date < data.today;

  return (
    <div className="space-y-5">
      {/* 顶部摘要与视图切换条 */}
      <section className="rounded-2xl border bg-card p-5 shadow-[0_2px_12px_-8px_#233e2e26]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/15 bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                <Pill className="size-3.5 text-primary" aria-hidden />
                {formatDateCn(data.date)}
              </span>
              {isHistoricalDate && (
                <>
                  <span className="rounded-full border bg-background px-2.5 py-0.5 text-xs text-muted-foreground">
                    正在查看/补录历史日期
                  </span>
                  <Link
                    href="/supplements"
                    className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
                  >
                    <RotateCcw className="size-3" aria-hidden />
                    回到今天
                  </Link>
                </>
              )}
              {!canRecord && (
                <span className="rounded-full border border-destructive/30 bg-destructive/10 px-2.5 py-0.5 text-xs text-destructive">
                  不能记录未来日期
                </span>
              )}
            </div>

            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h1 className="text-xl font-bold tracking-tight sm:text-2xl">每日补剂</h1>
              <p className="font-mono text-xs text-muted-foreground tabular-nums">
                {plannedTotal > 0 ? (
                  <>
                    计划已记 <strong className="text-foreground">{plannedCompleted} / {plannedTotal}</strong> 次
                    {unmatchedIntakes.length > 0 && ` · 按需与临时 ${unmatchedIntakes.length} 次`}
                  </>
                ) : data.intakes.length > 0 ? (
                  <>当日已记 <strong className="text-foreground">{data.intakes.length}</strong> 次</>
                ) : (
                  "当日暂无服用记录"
                )}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {canRecord && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="min-h-10 rounded-xl"
                onClick={() => setAdhocOpen(true)}
              >
                <Plus className="size-3.5" aria-hidden />
                临时记录
              </Button>
            )}
            <Button
              type="button"
              size="sm"
              className="min-h-10 rounded-xl"
              onClick={() => openCreateDialog(null)}
            >
              <Plus className="size-3.5" aria-hidden />
              新增补剂
            </Button>
          </div>
        </div>

        {/* 视图切换 Tab：桌面显示 2 项（规律在右栏常驻），手机显示 3 项 */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3.5">
          <div className="inline-flex items-center gap-1 rounded-xl border bg-background p-1 text-xs">
            {(
              [
                { id: "daily", label: "每日记录", mobileOnly: false },
                { id: "matrix", label: "服用规律", mobileOnly: true },
                { id: "library", label: `我的补剂库 (${data.supplements.length})`, mobileOnly: false },
              ] as const
            ).map((tab) => {
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setActiveTab(tab.id)}
                  className={`relative min-h-9 rounded-lg px-3 py-1.5 font-medium transition-colors ${
                    tab.mobileOnly ? "lg:hidden" : ""
                  } ${
                    active
                      ? "font-semibold text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId="supplements-view-tab"
                      transition={TAB_SPRING}
                      className="absolute inset-0 rounded-lg bg-primary"
                      aria-hidden
                    />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </div>

          <p className="hidden text-xs text-muted-foreground sm:block">
            单击即可按默认份数记录；点右侧份数或箭头可微调本次数量与备注。
          </p>
        </div>
      </section>

      {/* 冷启动引导（补剂库和当日都为空） */}
      {isBrandNew && activeTab === "daily" ? (
        <section className="rounded-2xl border bg-card p-6 shadow-[0_2px_12px_-8px_#233e2e26]">
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="space-y-1.5">
              <p className="inline-flex items-center gap-1.5 text-xs font-medium text-primary">
                <Sparkles className="size-3.5" aria-hidden />
                30 秒配好你的常用补剂
              </p>
              <h2 className="text-lg font-bold">先把每天常吃的补剂放进清单，之后每天只需勾选</h2>
              <p className="text-xs leading-6 text-muted-foreground">
                只需记录名称和每次份数（如「2 粒」），规格说明完全可选；支持同一种补剂配置早晚多个时段，也支持随时记一条临时补剂。
              </p>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground">常见补剂快选模板（点击预填后可自由修改）</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {SUPPLEMENT_TEMPLATES.map((tpl) => (
                  <button
                    key={tpl.name}
                    type="button"
                    onClick={() => openCreateDialog(tpl)}
                    className="flex items-center justify-between gap-2 rounded-xl border bg-background px-3.5 py-3 text-left transition-colors hover:border-primary/50 hover:bg-secondary/40"
                  >
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-foreground">{tpl.name}</div>
                      <div className="mt-0.5 truncate font-mono text-xs text-muted-foreground">
                        {formatSupplementDose(tpl.defaultQuantity, tpl.unit, tpl.spec)}
                        {" · "}
                        {tpl.mode === "asNeeded"
                          ? "按需常备"
                          : tpl.schedule.map((s) => SUPPLEMENT_SLOT_LABELS[s.slot]).join(" / ")}
                      </div>
                    </div>
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-lg bg-secondary text-primary">
                      <Plus className="size-4" aria-hidden />
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-t pt-4">
              <Button type="button" onClick={() => openCreateDialog(null)}>
                <Plus className="size-4" aria-hidden />
                自定义新增补剂
              </Button>
              {canRecord && (
                <Button type="button" variant="outline" onClick={() => setAdhocOpen(true)}>
                  先记一条临时记录
                </Button>
              )}
            </div>
          </div>
        </section>
      ) : activeTab === "library" ? (
        /* ==================== 视图 B：我的补剂库 ==================== */
        <div className="space-y-6">
          {data.supplements.length === 0 ? (
            <div className="rounded-2xl border border-dashed bg-card px-6 py-12 text-center">
              <Pill className="mx-auto mb-3 size-7 text-primary/50" aria-hidden />
              <p className="text-sm font-medium">补剂库还是空的</p>
              <p className="mt-1 text-xs text-muted-foreground">
                添加常吃的补剂后，每天打开页面即可按时段勾选。
              </p>
              <Button type="button" className="mt-4" onClick={() => openCreateDialog(null)}>
                <Plus className="size-4" aria-hidden />
                新增第一种补剂
              </Button>
            </div>
          ) : (
            <>
              {[
                {
                  title: "在服常规计划",
                  desc: "按设定的时段和星期出现在每日打卡清单中。",
                  items: activeScheduled,
                },
                {
                  title: "按需常备",
                  desc: "不计入每日计划分母，需要时一键快点即可记入当天。",
                  items: activeAsNeeded,
                },
                {
                  title: "已暂停",
                  desc: "暂时停服的补剂不会出现在每日清单，历史记录完好保留，随时可恢复。",
                  items: pausedSupplements,
                },
              ]
                .filter((group) => group.items.length > 0)
                .map((group) => (
                  <section key={group.title} className="space-y-3">
                    <div>
                      <h2 className="text-sm font-bold">
                        {group.title}{" "}
                        <span className="font-mono text-xs font-normal text-muted-foreground">
                          ({group.items.length})
                        </span>
                      </h2>
                      <p className="text-xs text-muted-foreground">{group.desc}</p>
                    </div>
                    <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-3">
                      {group.items.map((sup) => {
                        const statusBusy = Boolean(busyKeys[`status:${sup.id}`]);
                        const deleteBusy = Boolean(busyKeys[`delete-sup:${sup.id}`]);
                        const anyBusy = statusBusy || deleteBusy;
                        const hasMixedQty =
                          sup.schedule.length >= 2 &&
                          sup.schedule.some((s) => roundQty(s.quantity) !== roundQty(sup.defaultQuantity));

                        return (
                          <div
                            key={sup.id}
                            className={`flex flex-col justify-between gap-3 rounded-2xl border bg-card p-4 shadow-[0_2px_12px_-8px_#233e2e26] ${
                              sup.status === "paused" ? "opacity-75" : ""
                            }`}
                          >
                            <div className="space-y-2">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <h3 className="truncate text-sm font-bold">{sup.name}</h3>
                                  <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                                    {formatSupplementDose(sup.defaultQuantity, sup.unit, sup.spec)}
                                  </p>
                                </div>
                                <span className="shrink-0 rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                                  {sup.mode === "asNeeded"
                                    ? "按需"
                                    : formatWeekdaysLabel(sup.weekdays)}
                                </span>
                              </div>

                              {sup.schedule.length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                  {sup.schedule.map((item) => {
                                    const Icon = SUPPLEMENT_SLOT_ICONS[item.slot];
                                    return (
                                      <span
                                        key={item.slot}
                                        className="inline-flex items-center gap-1 rounded-lg border border-primary/15 bg-secondary/70 px-2 py-0.5 text-[11px] font-medium text-secondary-foreground"
                                      >
                                        <Icon className="size-3" aria-hidden />
                                        {SUPPLEMENT_SLOT_LABELS[item.slot]}
                                        {hasMixedQty && (
                                          <span className="font-mono opacity-80">
                                            · {formatQuantity(item.quantity)}
                                            {sup.unit}
                                          </span>
                                        )}
                                      </span>
                                    );
                                  })}
                                </div>
                              )}

                              {sup.note && (
                                <p className="text-xs leading-5 text-muted-foreground">{sup.note}</p>
                              )}
                            </div>

                            <div className="flex items-center justify-between gap-2 border-t pt-3 text-xs">
                              <span className="font-mono text-[11px] text-muted-foreground">
                                始于 {sup.startDate}
                              </span>
                              <div className="flex items-center gap-1.5">
                                <button
                                  type="button"
                                  disabled={anyBusy}
                                  onClick={() => openEditDialog(sup)}
                                  className="inline-flex min-h-8 items-center gap-1 rounded-lg border bg-background px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                                >
                                  <Pencil className="size-3" aria-hidden />
                                  编辑
                                </button>
                                <button
                                  type="button"
                                  disabled={anyBusy}
                                  onClick={() => void toggleSupplementStatus(sup)}
                                  className="inline-flex min-h-8 items-center gap-1 rounded-lg border bg-background px-2.5 py-1 font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                                >
                                  {sup.status === "active" ? (
                                    <>
                                      <Pause className="size-3" aria-hidden />
                                      暂停
                                    </>
                                  ) : (
                                    <>
                                      <Play className="size-3" aria-hidden />
                                      恢复
                                    </>
                                  )}
                                </button>
                                <InlineConfirmButton
                                  disabled={anyBusy}
                                  onConfirm={() => removeSupplement(sup)}
                                  ariaLabel={`删除补剂 ${sup.name}`}
                                  confirmText="确认删除"
                                  className="min-h-8 rounded-lg border bg-background px-2 py-1 hover:border-destructive"
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                ))}
            </>
          )}

          {/* 快捷模板补充条 */}
          <section className="space-y-2.5 rounded-2xl border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">
              从常见模板快速添加（点击预填，保存前可修改名称、用量和时段）
            </p>
            <div className="flex flex-wrap gap-2">
              {SUPPLEMENT_TEMPLATES.map((tpl) => (
                <button
                  key={tpl.name}
                  type="button"
                  onClick={() => openCreateDialog(tpl)}
                  className="inline-flex items-center gap-1.5 rounded-xl border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/50 hover:bg-secondary/50"
                >
                  <Plus className="size-3 text-primary" aria-hidden />
                  {tpl.name}
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : (
        /* ==================== 视图 A：每日记录 & 移动端规律 Tab ==================== */
        <>
          {activeTab === "matrix" && (
            <div className="lg:hidden">
              <SupplementHabitMatrix
                supplements={data.supplements}
                windowIntakes={data.windowIntakes}
                selectedDate={data.date}
                today={data.today}
              />
            </div>
          )}
          <div
            className={`${
              activeTab === "matrix" ? "hidden lg:grid" : "grid"
            } grid-cols-1 items-start gap-5 lg:grid-cols-12`}
          >
          {/* 左 8 列：按时段分组的打卡流 + 按需与临时记录 */}
          <div className="min-w-0 space-y-4 lg:col-span-7 xl:col-span-8">
            {slotGroups.length === 0 ? (
              <div className="rounded-2xl border border-dashed bg-card px-5 py-8 text-center">
                <p className="text-sm font-medium">
                  {activeScheduled.length > 0
                    ? `${formatDateCn(data.date)}没有按星期安排的常规补剂`
                    : "还没有配置常规计划补剂"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {activeScheduled.length > 0
                    ? "当天如有额外服用，可点下方按需常备或顶部「临时记录」。"
                    : "你可以新增常规补剂，或直接用右侧的按需常备 / 顶部「临时记录」记录。"}
                </p>
              </div>
            ) : (
              slotGroups.map((group) => {
                const SlotIcon = SUPPLEMENT_SLOT_ICONS[group.slot];
                const slotKey = `batch:${data.date}:${group.slot}`;
                const batchBusy = Boolean(busyKeys[slotKey]);
                const batchBlocked = refreshing || batchBusy || group.rows.some(row => {
                  const key = `${data.date}:${row.supplement.id}:${group.slot}`;
                  return busyKeys[key] || pendingSingle[key];
                });
                const slotPendingBatch = pendingBatch[slotKey];
                const allDone = group.remainingRows.length === 0;

                return (
                  <section
                    key={group.slot}
                    aria-labelledby={`slot-heading-${group.slot}`}
                    className="overflow-hidden rounded-2xl border bg-card shadow-[0_2px_12px_-8px_#233e2e26]"
                  >
                    {/* 时段标题栏 */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-background/60 px-4 py-3 sm:px-5">
                      <div className="flex items-center gap-2">
                        <span className="flex size-7 items-center justify-center rounded-lg bg-secondary text-primary">
                          <SlotIcon className="size-4" aria-hidden />
                        </span>
                        <h2 id={`slot-heading-${group.slot}`} className="text-sm font-bold">
                          {SUPPLEMENT_SLOT_LABELS[group.slot]}
                        </h2>
                        <span className="rounded-full border bg-card px-2 py-0.5 font-mono text-[11px] tabular-nums text-muted-foreground">
                          {group.completedCount}/{group.rows.length}
                        </span>
                      </div>

                      {allDone ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-primary/20 bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                          <Check className="size-3.5 text-primary" aria-hidden />
                          已完成
                        </span>
                      ) : canRecord && (group.remainingRows.length >= 2 || slotPendingBatch) ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={batchBlocked}
                          onClick={() => void handleTakeAllSlot(group)}
                          className="h-8 rounded-xl text-xs"
                        >
                          {batchBusy ? (
                            <LoaderCircle className="size-3.5 animate-spin" aria-hidden />
                          ) : (
                            <CheckCheck className="size-3.5 text-primary" aria-hidden />
                          )}
                          {slotPendingBatch ? "核对并重试全服" : "本时段全服"}
                        </Button>
                      ) : null}
                    </div>

                    {slotPendingBatch && (
                      <div
                        role="alert"
                        className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/60 px-4 py-2 text-xs sm:px-5"
                      >
                        <span>「{SUPPLEMENT_SLOT_LABELS[group.slot]}」批量保存结果待确认。</span>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={batchBlocked}
                          onClick={() => void handleTakeAllSlot(group)}
                          className="h-7 text-xs"
                        >
                          核对并重试
                        </Button>
                      </div>
                    )}

                    {/* 该时段内的补剂条目 */}
                    <ul className="divide-y">
                      {group.rows.map((row) => {
                        const rowKey = `${data.date}:${row.supplement.id}:${group.slot}`;
                        const checked = row.intakes.length > 0;
                        const rowBusy = Boolean(busyKeys[rowKey]) || batchBusy || Boolean(slotPendingBatch) || refreshing;
                        const rowPending = pendingSingle[rowKey];
                        const isExpanded = expandedKey === rowKey;
                        const lastIntake = row.intakes.at(-1);
                        const displayName = lastIntake?.name ?? row.supplement.name;
                        const displayDose = row.intakes.length > 1 ? "查看明细" : lastIntake
                          ? formatSupplementDose(lastIntake.quantity, lastIntake.unit, lastIntake.spec)
                          : formatSupplementDose(row.defaultQuantity, row.supplement.unit, row.supplement.spec);

                        return (
                          <li key={rowKey} className="transition-colors">
                            <div className="flex items-center gap-3 px-4 py-3 sm:px-5">
                              {/* 左侧大勾选按钮 */}
                              <motion.button
                                type="button"
                                whileTap={{ scale: 0.92 }}
                                transition={TAP_SPRING}
                                disabled={!canRecord || rowBusy}
                                onClick={() => void handleQuickToggle(row, rowKey)}
                                aria-pressed={checked}
                                aria-label={
                                  checked
                                    ? `${displayName}（${SUPPLEMENT_SLOT_LABELS[group.slot]}）已记录，点击撤销或展开管理`
                                    : `记录 ${row.supplement.name}（${SUPPLEMENT_SLOT_LABELS[group.slot]}，${displayDose}）`
                                }
                                className="flex size-11 shrink-0 items-center justify-center rounded-xl transition-colors hover:bg-secondary/60 disabled:opacity-50"
                              >
                                <span
                                  className={`flex size-6 items-center justify-center rounded-full border-2 transition-colors ${
                                    checked
                                      ? "border-primary bg-primary text-primary-foreground"
                                      : "border-input bg-background text-transparent"
                                  }`}
                                >
                                  {rowBusy ? (
                                    <LoaderCircle className="size-3.5 animate-spin text-primary" aria-hidden />
                                  ) : (
                                    <Check className="size-3.5 stroke-[2.6]" aria-hidden />
                                  )}
                                </span>
                              </motion.button>

                              {/* 中间名称与备注 / 服用时间 */}
                              <button
                                type="button"
                                onClick={() => openRowDrawer(row, rowKey)}
                                className="min-w-0 flex-1 text-left"
                              >
                                <div className="flex flex-wrap items-center gap-2">
                                  <span
                                    className={`text-sm font-semibold transition-colors ${
                                      checked ? "text-muted-foreground" : "text-foreground"
                                    }`}
                                  >
                                    {displayName}
                                  </span>
                                  {row.intakes.length > 1 && (
                                    <span className="rounded-full border border-primary/20 bg-secondary px-1.5 py-0.2 font-mono text-[10px] font-medium text-secondary-foreground">
                                      已记 {row.intakes.length} 次
                                    </span>
                                  )}
                                </div>
                                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                                  {checked ? (
                                    <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                                      <Clock className="size-3" aria-hidden />
                                      {row.intakes
                                        .map((e) => e.takenTime ?? "已记")
                                        .join(" · ")}
                                    </span>
                                  ) : row.supplement.note ? (
                                    <span className="truncate">{row.supplement.note}</span>
                                  ) : null}
                                  {checked && row.intakes.some((e) => e.note) && (
                                    <span className="truncate text-[11px]">
                                      · {row.intakes.find((e) => e.note)?.note}
                                    </span>
                                  )}
                                </div>
                              </button>

                              {/* 右侧剂量胶囊 + 展开箭头 */}
                              <button
                                type="button"
                                aria-expanded={isExpanded}
                                onClick={() => openRowDrawer(row, rowKey)}
                                className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1 font-mono text-xs transition-colors ${
                                  isExpanded
                                    ? "border-primary bg-secondary/70 text-foreground"
                                    : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                                }`}
                              >
                                <span className="max-w-36 truncate sm:max-w-52">{displayDose}</span>
                                <ChevronDown
                                  className={`size-3.5 transition-transform ${isExpanded ? "rotate-180" : ""}`}
                                  aria-hidden
                                />
                              </button>
                            </div>

                            {rowPending && (
                              <div
                                role="alert"
                                className="mx-4 mb-3 flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-muted/60 px-3 py-2 text-xs sm:mx-5"
                              >
                                <span>「{row.supplement.name}」保存结果待确认。</span>
                                <Button
                                  type="button"
                                  size="sm"
                                  variant="outline"
                                  disabled={rowBusy}
                                  onClick={() => void sendSingleIntake(rowKey, rowPending, row.supplement.name)}
                                  className="h-7 text-xs"
                                >
                                  核对并重试
                                </Button>
                              </div>
                            )}

                            {/* 行内展开微调抽屉 */}
                            <AnimatePresence initial={false}>
                              {isExpanded && (
                                <motion.div
                                  key={`drawer-${rowKey}`}
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: "auto" }}
                                  exit={{ opacity: 0, height: 0 }}
                                  transition={SOFT_SPRING}
                                  className="overflow-hidden border-t bg-background/70"
                                >
                                  <div className="space-y-3 px-4 py-3.5 sm:px-5">
                                    {checked && (
                                      <div className="space-y-2">
                                        {row.intakes.map((entry) => (
                                          <IntakeEditItem
                                            key={entry.id}
                                            entry={entry}
                                            today={data.today}
                                            canRecord={canRecord}
                                            onChanged={() => router.refresh()}
                                          />
                                        ))}
                                      </div>
                                    )}

                                    {canRecord && !rowPending && (!checked || extraFormKey === rowKey) ? (
                                      <form
                                        onSubmit={(e) => void handleCustomCreate(e, row, rowKey)}
                                        className="space-y-2.5 rounded-xl border bg-card p-3 text-xs"
                                      >
                                        <div className="font-medium text-foreground">
                                          {checked ? "追加一条今日服用记录" : "自定义本次服用量与备注"}
                                        </div>
                                        <div className="flex flex-wrap items-end gap-2.5">
                                          <div className="space-y-1">
                                            <Label
                                              htmlFor={`draft-qty-${rowKey}`}
                                              className="text-[11px] text-muted-foreground"
                                            >
                                              数量 ({row.supplement.unit})
                                            </Label>
                                            <div className="flex items-center gap-1">
                                              <button
                                                type="button"
                                                disabled={rowBusy}
                                                onClick={() => setDraftQty((v) => adjustQuantity(v, -0.5))}
                                                className="flex size-8 items-center justify-center rounded-lg border bg-background font-mono text-sm hover:border-primary"
                                                aria-label="减少数量"
                                              >
                                                −
                                              </button>
                                              <Input
                                                id={`draft-qty-${rowKey}`}
                                                type="number"
                                                inputMode="decimal"
                                                step="any"
                                                min={0.01}
                                                max={100}
                                                required
                                                disabled={rowBusy}
                                                value={draftQty}
                                                onChange={(e) => setDraftQty(e.target.value)}
                                                className="h-8 w-16 px-2 text-center font-mono text-xs"
                                              />
                                              <button
                                                type="button"
                                                disabled={rowBusy}
                                                onClick={() => setDraftQty((v) => adjustQuantity(v, 0.5))}
                                                className="flex size-8 items-center justify-center rounded-lg border bg-background font-mono text-sm hover:border-primary"
                                                aria-label="增加数量"
                                              >
                                                +
                                              </button>
                                            </div>
                                          </div>
                                          <div className="space-y-1">
                                            <Label
                                              htmlFor={`draft-time-${rowKey}`}
                                              className="text-[11px] text-muted-foreground"
                                            >
                                              时间（可选）
                                            </Label>
                                            <Input
                                              id={`draft-time-${rowKey}`}
                                              type="time"
                                              disabled={rowBusy}
                                              value={draftTime}
                                              onChange={(e) => setDraftTime(e.target.value)}
                                              className="h-8 w-28 font-mono text-xs"
                                            />
                                          </div>
                                          <div className="min-w-0 flex-1 space-y-1">
                                            <Label
                                              htmlFor={`draft-note-${rowKey}`}
                                              className="text-[11px] text-muted-foreground"
                                            >
                                              备注（可选）
                                            </Label>
                                            <Input
                                              id={`draft-note-${rowKey}`}
                                              maxLength={300}
                                              disabled={rowBusy}
                                              value={draftNote}
                                              onChange={(e) => setDraftNote(e.target.value)}
                                              placeholder="如：今天只吃一半"
                                              className="h-8 text-xs"
                                            />
                                          </div>
                                        </div>
                                        <div className="flex justify-end gap-1.5">
                                          <Button
                                            type="button"
                                            variant="ghost"
                                            size="sm"
                                            className="h-7 text-xs"
                                            disabled={rowBusy}
                                            onClick={() => {
                                              if (checked) setExtraFormKey(null);
                                              else setExpandedKey(null);
                                            }}
                                          >
                                            收起
                                          </Button>
                                          <Button type="submit" size="sm" className="h-7 text-xs" disabled={rowBusy}>
                                            {rowBusy && <LoaderCircle className="size-3 animate-spin" aria-hidden />}
                                            保存本次
                                          </Button>
                                        </div>
                                      </form>
                                    ) : canRecord && !rowPending ? (
                                      <div className="flex items-center justify-between">
                                        <Button
                                          type="button"
                                          size="sm"
                                          variant="outline"
                                          className="h-8 rounded-xl text-xs"
                                          onClick={() => openRowDrawer(row, rowKey, true)}
                                          disabled={rowBusy}
                                        >
                                          <Plus className="size-3.5" aria-hidden />
                                          今日再记一次
                                        </Button>
                                        <button
                                          type="button"
                                          onClick={() => setExpandedKey(null)}
                                          className="text-xs text-muted-foreground hover:text-foreground"
                                        >
                                          收起
                                        </button>
                                      </div>
                                    ) : null}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                );
              })
            )}

            {/* 按需、临时及历史非当前计划的服用记录 */}
            {unmatchedIntakes.length > 0 && (
              <section
                aria-labelledby="extra-intakes-heading"
                className="space-y-3 rounded-2xl border bg-card p-4 shadow-[0_2px_12px_-8px_#233e2e26] sm:p-5"
              >
                <div className="flex items-center justify-between gap-2">
                  <h2 id="extra-intakes-heading" className="text-sm font-bold">
                    按需与临时记录{" "}
                    <span className="font-mono text-xs font-normal text-muted-foreground">
                      ({unmatchedIntakes.length})
                    </span>
                  </h2>
                </div>
                <div className="space-y-2">
                  {unmatchedIntakes.map((entry) => (
                    <div key={entry.id} className="space-y-1.5">
                      <div className="flex items-center gap-1.5 text-xs font-semibold">
                        <span>{entry.name}</span>
                        <span className="rounded-full border bg-background px-2 py-0.2 text-[10px] font-medium text-muted-foreground">
                          {entry.isAdhoc ? "临时" : entry.supplementId ? "按需/额外" : "已移除补剂"}
                        </span>
                      </div>
                      <IntakeEditItem
                        entry={entry}
                        today={data.today}
                        canRecord={canRecord}
                        showSlotPicker
                        onChanged={() => router.refresh()}
                      />
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>

          {/* 右 4 列：按需常备快点区 + 近 14/30 天规律点阵（桌面常驻；手机在下方显示按需快点，规律点阵在“服用规律”Tab） */}
          <aside className="space-y-4 lg:col-span-5 xl:col-span-4">
            {activeAsNeeded.length > 0 && (
              <section className="space-y-3 rounded-2xl border bg-card p-5 shadow-[0_2px_12px_-8px_#233e2e26]">
                <div>
                  <h2 className="text-sm font-bold">按需常备</h2>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    点一下直接记入 {data.date === data.today ? "今日" : data.date}，不占每日计划分母
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {activeAsNeeded.map((sup) => {
                    const chipKey = `asNeeded:${data.date}:${sup.id}`;
                    const chipBusy = Boolean(busyKeys[chipKey]) || refreshing;
                    const chipPending = pendingSingle[chipKey];
                    return (
                      <motion.button
                        key={sup.id}
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        transition={TAP_SPRING}
                        disabled={!canRecord || chipBusy}
                        onClick={() => void handleAsNeededTap(sup)}
                        className={`inline-flex min-h-10 items-center gap-1.5 rounded-xl border px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-45 ${
                          chipPending
                            ? "border-destructive/50 bg-destructive/10 text-destructive"
                            : "bg-background text-foreground hover:border-primary/50 hover:bg-secondary/60"
                        }`}
                      >
                        {chipBusy ? (
                          <LoaderCircle className="size-3.5 animate-spin text-primary" aria-hidden />
                        ) : (
                          <Plus className="size-3.5 text-primary" aria-hidden />
                        )}
                        <span>{sup.name}</span>
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {formatSupplementDose(sup.defaultQuantity, sup.unit, sup.spec)}
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </section>
            )}

            <div className="hidden lg:block">
              <SupplementHabitMatrix
                supplements={data.supplements}
                windowIntakes={data.windowIntakes}
                selectedDate={data.date}
                today={data.today}
              />
            </div>
          </aside>
        </div>
        </>
      )}

      {/* 补剂库新建 / 编辑弹窗 */}
      <SupplementFormDialog
        open={formOpen}
        onOpenChange={(next) => {
          setFormOpen(next);
          if (!next) {
            setEditingSupplement(null);
            setPrefillTemplate(null);
          }
        }}
        editing={editingSupplement}
        template={prefillTemplate}
      />

      {/* 临时记录弹窗 */}
      <SupplementAdhocDialog
        key={data.date}
        open={adhocOpeningTime !== null}
        onOpenChange={setAdhocOpen}
        date={data.date}
        today={data.today}
        openingTime={data.date === data.today ? adhocOpeningTime ?? "" : ""}
      />
    </div>
  );
}
