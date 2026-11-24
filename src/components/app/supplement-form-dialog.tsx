"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { toast } from "sonner";
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
import { withRequestTimeout } from "@/lib/request-timeout";
import {
  SUPPLEMENT_SLOTS,
  SUPPLEMENT_SLOT_LABELS,
  SUPPLEMENT_UNIT_PRESETS,
  WEEKDAY_SHORT_LABELS,
  roundQty,
  supplementCreateSchema,
  type Supplement,
  type SupplementCreateInput,
  type SupplementMode,
  type SupplementScheduleItem,
  type SupplementSlot,
  type SupplementTemplate,
} from "@/lib/supplements";
import { SUPPLEMENT_SLOT_ICONS } from "./supplement-slot-icons";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: Supplement | null;
  template: SupplementTemplate | null;
};

function hasDifferentSlotQuantities(schedule: SupplementScheduleItem[], defaultQty: number): boolean {
  return schedule.some((item) => roundQty(item.quantity) !== roundQty(defaultQty));
}

function SupplementFormBody({
  editing,
  template,
  busy,
  setBusy,
  pendingCreate,
  setPendingCreate,
  onClose,
}: {
  editing: Supplement | null;
  template: SupplementTemplate | null;
  busy: boolean;
  setBusy: (value: boolean) => void;
  pendingCreate: SupplementCreateInput | null;
  setPendingCreate: (value: SupplementCreateInput | null) => void;
  onClose: (saved?: boolean) => void;
}) {
  const initialSource = editing ?? template;
  const initialSlots =
    initialSource && initialSource.schedule.length > 0
      ? initialSource.schedule.map((item) => item.slot)
      : (["breakfast"] as SupplementSlot[]);

  const [name, setName] = useState(initialSource?.name ?? "");
  const [defaultQty, setDefaultQty] = useState(
    initialSource ? String(initialSource.defaultQuantity) : "1",
  );
  const [unit, setUnit] = useState(initialSource?.unit ?? "粒");
  const [spec, setSpec] = useState(initialSource?.spec ?? "");
  const [mode, setMode] = useState<SupplementMode>(initialSource?.mode ?? "scheduled");
  const [selectedSlots, setSelectedSlots] = useState<SupplementSlot[]>(initialSlots);
  const [customPerSlot, setCustomPerSlot] = useState(() =>
    editing ? hasDifferentSlotQuantities(editing.schedule, editing.defaultQuantity) : false,
  );
  const [slotQtys, setSlotQtys] = useState<Partial<Record<SupplementSlot, string>>>(() => {
    const map: Partial<Record<SupplementSlot, string>> = {};
    if (editing) {
      for (const item of editing.schedule) map[item.slot] = String(item.quantity);
    }
    return map;
  });
  const [freqMode, setFreqMode] = useState<"daily" | "weekdays">(() =>
    editing?.weekdays && editing.weekdays.length > 0 ? "weekdays" : "daily",
  );
  const [weekdays, setWeekdays] = useState<number[]>(() =>
    editing?.weekdays && editing.weekdays.length > 0 ? editing.weekdays : [0, 2, 4],
  );
  const [note, setNote] = useState(initialSource?.note ?? "");
  const [error, setError] = useState("");
  const busyRef = useRef(false);

  function toggleSlot(slot: SupplementSlot) {
    setSelectedSlots((prev) => {
      if (prev.includes(slot)) {
        return prev.filter((item) => item !== slot);
      }
      const next = [...prev, slot];
      setSlotQtys((map) => ({ ...map, [slot]: map[slot] ?? defaultQty }));
      return SUPPLEMENT_SLOTS.filter((s) => next.includes(s));
    });
  }

  function toggleWeekday(day: number) {
    setWeekdays((prev) =>
      prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day].sort((a, b) => a - b),
    );
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;

    const baseQty = Number(defaultQty);
    const schedule: SupplementScheduleItem[] =
      mode === "scheduled"
        ? selectedSlots.map((slot) => ({
            slot,
            quantity: customPerSlot ? Number(slotQtys[slot] ?? defaultQty) : baseQty,
          }))
        : [];

    if (mode === "scheduled" && freqMode === "weekdays" && weekdays.length === 0) {
      setError("按星期服用请至少选择一天");
      return;
    }

    const payload = {
      name: name.trim(),
      defaultQuantity: baseQty,
      unit: unit.trim(),
      spec: spec.trim() || null,
      mode,
      status: editing?.status ?? "active",
      schedule,
      weekdays: mode === "scheduled" && freqMode === "weekdays" ? weekdays : null,
      note: note.trim() || null,
    };

    const parsed = supplementCreateSchema.safeParse(pendingCreate ?? payload);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "请核对输入内容");
      return;
    }

    const createBody = editing ? null : pendingCreate ?? { ...parsed.data, requestId: crypto.randomUUID() };
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (editing) {
        const { status: _ignoredStatus, ...patchBody } = parsed.data;
        void _ignoredStatus;
        await withRequestTimeout((signal) =>
          api(`/api/v1/supplements/${editing.id}`, {
            method: "PATCH",
            signal,
            body: JSON.stringify(patchBody),
          }),
        );
        toast.success(`已更新「${parsed.data.name}」`);
      } else {
        const result = await withRequestTimeout((signal) =>
          api<{ supplement: Supplement }>("/api/v1/supplements", {
            method: "POST",
            signal,
            body: JSON.stringify(createBody),
          }),
        );
        if (!result.supplement?.id) throw new Error("未收到补剂保存结果");
        toast.success(`已加入补剂库「${parsed.data.name}」`);
      }
      onClose(true);
    } catch (err) {
      if (createBody && (!(err instanceof ApiError) || err.status >= 500)) {
        setPendingCreate(createBody);
        setError("保存结果待确认，请用原提交编号核对并重试。");
      } else {
        setPendingCreate(null);
        setError(err instanceof Error ? err.message : "保存失败，请重试");
      }
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 text-sm">
      <fieldset disabled={busy || pendingCreate !== null} className="min-w-0 space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="sup-name">补剂名称 *</Label>
          <Input
            id="sup-name"
            required
            maxLength={80}
            placeholder="如 复合维生素、深海鱼油、D3+K2"
            value={name}
            disabled={busy}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        {/* 每次用量 + 单位 */}
        <div className="space-y-2">
          <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="sup-qty">每次数量 *</Label>
              <Input
                id="sup-qty"
                type="number"
                inputMode="decimal"
                step="any"
                min={0.01}
                max={100}
                required
                value={defaultQty}
                disabled={busy}
                onChange={(e) => setDefaultQty(e.target.value)}
                className="font-mono"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="sup-unit">单位 *</Label>
              <Input
                id="sup-unit"
                required
                maxLength={16}
                placeholder="如 粒 / 片 / 勺"
                value={unit}
                disabled={busy}
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="常用单位快选">
            {SUPPLEMENT_UNIT_PRESETS.map((preset) => {
              const active = unit === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  disabled={busy}
                  aria-pressed={active}
                  onClick={() => setUnit(preset)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {preset}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="sup-spec">单份规格（可选）</Label>
          <Input
            id="sup-spec"
            maxLength={80}
            placeholder="留空只记数量，或填 1000mg / D3 2000IU+K2 100mcg"
            value={spec}
            disabled={busy}
            onChange={(e) => setSpec(e.target.value)}
          />
        </div>

        {/* 服用方式 */}
        <div className="space-y-1.5">
          <span className="text-sm font-medium">服用方式</span>
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border bg-background p-1">
            {(
              [
                { id: "scheduled", label: "常规计划", desc: "按时段出现在每日清单" },
                { id: "asNeeded", label: "按需常备", desc: "需要时一键快点记录" },
              ] as const
            ).map((opt) => {
              const active = mode === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  disabled={busy}
                  aria-pressed={active}
                  onClick={() => {
                    setMode(opt.id);
                    if (opt.id === "scheduled" && selectedSlots.length === 0) {
                      setSelectedSlots(["breakfast"]);
                    }
                  }}
                  className={`rounded-lg px-3 py-2 text-left transition-colors ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:bg-card hover:text-foreground"
                  }`}
                >
                  <div className="text-xs font-semibold">{opt.label}</div>
                  <div className={`mt-0.5 text-[11px] ${active ? "opacity-85" : "opacity-75"}`}>
                    {opt.desc}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* 常规计划：多时段 + 可选按时段用量 + 频率 */}
        {mode === "scheduled" && (
          <div className="space-y-3.5 rounded-2xl border bg-background p-3.5">
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">服用时段（可多选，支持一天多次）</span>
                <span className="font-mono text-[11px] text-muted-foreground">
                  已选 {selectedSlots.length} 个
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="选择服用时段">
                {SUPPLEMENT_SLOTS.map((slot) => {
                  const Icon = SUPPLEMENT_SLOT_ICONS[slot];
                  const active = selectedSlots.includes(slot);
                  return (
                    <button
                      key={slot}
                      type="button"
                      disabled={busy}
                      aria-pressed={active}
                      onClick={() => toggleSlot(slot)}
                      className={`inline-flex min-h-9 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }`}
                    >
                      <Icon className="size-3.5" aria-hidden />
                      {SUPPLEMENT_SLOT_LABELS[slot]}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedSlots.length > 0 && (
              <div className="space-y-2 border-t pt-3">
                <label className="flex cursor-pointer items-center justify-between gap-2 text-xs">
                  <span className="font-medium">单独设置时段用量</span>
                  <input
                    type="checkbox"
                    checked={customPerSlot}
                    disabled={busy}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setCustomPerSlot(checked);
                      if (checked) {
                        setSlotQtys((prev) => {
                          const next = { ...prev };
                          for (const s of selectedSlots) {
                            next[s] = next[s] ?? defaultQty;
                          }
                          return next;
                        });
                      }
                    }}
                    className="size-4 accent-primary"
                  />
                </label>
                {customPerSlot && (
                  <div className="grid grid-cols-2 gap-2">
                    {selectedSlots.map((slot) => (
                      <label
                        key={slot}
                        className="flex items-center justify-between gap-2 rounded-xl border bg-card px-2.5 py-1.5 text-xs"
                      >
                        <span className="truncate text-muted-foreground">
                          {SUPPLEMENT_SLOT_LABELS[slot]}
                        </span>
                        <span className="flex items-center gap-1">
                          <Input
                            type="number"
                            inputMode="decimal"
                            step="any"
                            min={0.01}
                            max={100}
                            required
                            disabled={busy}
                            value={slotQtys[slot] ?? defaultQty}
                            onChange={(e) =>
                              setSlotQtys((prev) => ({ ...prev, [slot]: e.target.value }))
                            }
                            className="h-7 w-16 px-1.5 text-right font-mono text-xs"
                            aria-label={`${SUPPLEMENT_SLOT_LABELS[slot]}数量`}
                          />
                          <span className="text-[11px] text-muted-foreground">
                            {unit.trim() || "份"}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2 border-t pt-3">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-semibold">服用频率</span>
                <div className="flex gap-1 rounded-lg border bg-card p-0.5 text-xs">
                  {(
                    [
                      { id: "daily", label: "每天" },
                      { id: "weekdays", label: "按星期" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      disabled={busy}
                      aria-pressed={freqMode === opt.id}
                      onClick={() => setFreqMode(opt.id)}
                      className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                        freqMode === opt.id
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {freqMode === "weekdays" && (
                <div className="grid grid-cols-7 gap-1" role="group" aria-label="选择每周服用日">
                  {WEEKDAY_SHORT_LABELS.map((label, dayIdx) => {
                    const active = weekdays.includes(dayIdx);
                    return (
                      <button
                        key={label}
                        type="button"
                        disabled={busy}
                        aria-pressed={active}
                        onClick={() => toggleWeekday(dayIdx)}
                        className={`min-h-9 rounded-lg border text-xs font-medium transition-colors ${
                          active
                            ? "border-primary bg-primary text-primary-foreground"
                            : "bg-card text-muted-foreground hover:border-primary/40 hover:text-foreground"
                        }`}
                      >
                        周{label}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        )}

        <div className="space-y-1.5">
          <Label htmlFor="sup-note">备注（可选）</Label>
          <Input
            id="sup-note"
            maxLength={200}
            placeholder="如 随含油脂餐吃、空腹温水送服"
            value={note}
            disabled={busy}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>

      </fieldset>
      {error && (
        <p role="alert" className="text-xs font-medium text-destructive">
          {error}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="outline" disabled={busy} onClick={() => onClose()}>
          {pendingCreate ? "关闭并刷新" : "取消"}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          {busy ? "保存中…" : pendingCreate ? "核对并重试" : editing ? "保存修改" : "加入补剂库"}
        </Button>
      </div>
    </form>
  );
}

export function SupplementFormDialog({ open, onOpenChange, editing, template }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [pendingCreate, setPendingCreate] = useState<SupplementCreateInput | null>(null);
  const bodyKey = editing
    ? `edit:${editing.id}:${editing.updatedAt}`
    : template
      ? `tpl:${template.name}`
      : "new";

  function closeForm(saved = false) {
    if (saved || pendingCreate) router.refresh();
    setPendingCreate(null);
    onOpenChange(false);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        if (next) onOpenChange(true);
        else closeForm();
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto rounded-3xl p-6 sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `编辑「${editing.name}」` : "新增补剂"}</DialogTitle>
          <DialogDescription>
            只需填写名称和每次份数；规格说明留空即可，修改不会影响过去已保存的服用记录。
          </DialogDescription>
        </DialogHeader>

        {open && (
          <SupplementFormBody
            key={bodyKey}
            editing={editing}
            template={template}
            busy={busy}
            setBusy={setBusy}
            pendingCreate={pendingCreate}
            setPendingCreate={setPendingCreate}
            onClose={closeForm}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
