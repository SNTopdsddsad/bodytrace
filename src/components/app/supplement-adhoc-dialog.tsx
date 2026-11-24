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
  supplementIntakeSchemas,
  type SupplementSlot,
} from "@/lib/supplements";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  today: string;
  openingTime: string;
};

export function SupplementAdhocDialog({ open, onOpenChange, date, today, openingTime }: Props) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unit, setUnit] = useState("粒");
  const [spec, setSpec] = useState("");
  const [slot, setSlot] = useState<SupplementSlot>("anytime");
  const [enteredTime, setTakenTime] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingRequest, setPendingRequest] = useState<{
    requestId: string;
    intake: {
      supplementId: null;
      date: string;
      slot: SupplementSlot;
      name: string;
      quantity: number;
      unit: string;
      spec: string | null;
      takenTime: string | null;
      note: string | null;
    };
  } | null>(null);
  const busyRef = useRef(false);

  const uncertain = pendingRequest !== null;
  const takenTime = pendingRequest ? pendingRequest.intake.takenTime ?? "" : enteredTime ?? openingTime;

  function resetDraft() {
    setName("");
    setQuantity("1");
    setUnit("粒");
    setSpec("");
    setSlot("anytime");
    setTakenTime(null);
    setNote("");
    setError("");
  }

  async function sendPayload(body: NonNullable<typeof pendingRequest>) {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await withRequestTimeout((signal) =>
        api("/api/v1/supplements/intakes", {
          method: "POST",
          signal,
          body: JSON.stringify(body),
        }),
      );
      setPendingRequest(null);
      resetDraft();
      onOpenChange(false);
      toast.success(`已记录「${body.intake.name}」`);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setPendingRequest(null);
        resetDraft();
        onOpenChange(false);
        toast.error(err.message);
        router.refresh();
        return;
      }
      const isUnknown = !(err instanceof ApiError) || err.status >= 500;
      setPendingRequest(isUnknown ? body : null);
      setError(err instanceof Error ? err.message : "保存未完成，请核对后重试");
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    if (pendingRequest) {
      await sendPayload(pendingRequest);
      return;
    }

    const raw = {
      requestId: crypto.randomUUID(),
      intake: {
        supplementId: null,
        date,
        slot,
        name: name.trim(),
        quantity: Number(quantity),
        unit: unit.trim(),
        spec: spec.trim() || null,
        takenTime: takenTime.trim() || null,
        note: note.trim() || null,
      },
    };
    const parsed = supplementIntakeSchemas(today).createItem.safeParse(raw);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "请核对输入内容");
      return;
    }
    await sendPayload(raw);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next);
      }}
    >
      <DialogContent className="max-h-[90svh] overflow-y-auto rounded-3xl p-6 sm:max-w-md">
        <DialogHeader>
          <DialogTitle>临时记录 · {date}</DialogTitle>
          <DialogDescription>
            单次额外服用记录，不会加入你的常规补剂库。
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 text-sm">
          <div className="space-y-1.5">
            <Label htmlFor="adhoc-name">补剂名称 *</Label>
            <Input
              id="adhoc-name"
              required
              maxLength={80}
              placeholder="如 维C泡腾片、褪黑素、电解质粉"
              value={name}
              disabled={busy || uncertain}
              onChange={(e) => setName(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-[120px_minmax(0,1fr)] gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="adhoc-qty">数量 *</Label>
                <Input
                  id="adhoc-qty"
                  type="number"
                  inputMode="decimal"
                  step="any"
                  min={0.01}
                  max={100}
                  required
                  value={quantity}
                  disabled={busy || uncertain}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="font-mono"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="adhoc-unit">单位 *</Label>
                <Input
                  id="adhoc-unit"
                  required
                  maxLength={16}
                  value={unit}
                  disabled={busy || uncertain}
                  onChange={(e) => setUnit(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {SUPPLEMENT_UNIT_PRESETS.map((preset) => (
                <button
                  key={preset}
                  type="button"
                  disabled={busy || uncertain}
                  aria-pressed={unit === preset}
                  onClick={() => setUnit(preset)}
                  className={`rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors ${
                    unit === preset
                      ? "border-primary bg-primary text-primary-foreground"
                      : "bg-background text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adhoc-spec">单份规格（可选）</Label>
            <Input
              id="adhoc-spec"
              maxLength={80}
              placeholder="可留空，如 1000mg"
              value={spec}
              disabled={busy || uncertain}
              onChange={(e) => setSpec(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="adhoc-slot">时段</Label>
              <select
                id="adhoc-slot"
                value={slot}
                disabled={busy || uncertain}
                onChange={(e) => setSlot(e.target.value as SupplementSlot)}
                className="h-9 w-full rounded-lg border border-input bg-background px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
              >
                {SUPPLEMENT_SLOTS.map((s) => (
                  <option key={s} value={s}>
                    {SUPPLEMENT_SLOT_LABELS[s]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adhoc-time">时间（可选）</Label>
              <Input
                id="adhoc-time"
                type="time"
                value={takenTime}
                disabled={busy || uncertain}
                onChange={(e) => setTakenTime(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adhoc-note">备注（可选）</Label>
            <Input
              id="adhoc-note"
              maxLength={300}
              placeholder="如 感觉有点着凉、运动出汗多"
              value={note}
              disabled={busy || uncertain}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {uncertain && pendingRequest && (
            <p role="status" className="rounded-xl border bg-muted p-3 text-xs leading-5">
              {pendingRequest.intake.date} 的「{pendingRequest.intake.name}」保存结果尚未确认，输入已保留。重试会核对同一次提交，避免重复记录。
            </p>
          )}
          {error && (
            <p role="alert" className="text-xs font-medium text-destructive">
              {error}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            {uncertain && (
              <Button
                type="button"
                variant="ghost"
                disabled={busy}
                onClick={() => {
                  setPendingRequest(null);
                  resetDraft();
                  onOpenChange(false);
                  router.refresh();
                }}
              >
                关闭并刷新
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={busy}
              onClick={() => onOpenChange(false)}
            >
              取消
            </Button>
            <Button type="submit" disabled={busy}>
              {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
              {busy ? "保存中…" : uncertain ? "核对并重试" : "保存记录"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
