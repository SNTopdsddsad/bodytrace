"use client";

import { ArrowDown, ArrowUp, Check, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { TrainingInput, TrainingItem, TrainingSet } from "@/lib/training";

export type SetForm = Omit<TrainingSet, "weightKg" | "reps" | "durationSeconds"> & { weightKg: string; reps: string; durationSeconds: string };
export type ItemForm =
  | { id: string; kind: "strength"; name: string; mode: "weighted" | "bodyweight" | "timed"; sets: SetForm[] }
  | { id: string; kind: "cardio"; name: string; durationMinutes: string; distanceKm: string; completed: boolean };
export type TrainingForm = Omit<TrainingInput, "time" | "durationMinutes" | "note" | "items"> & { time: string; durationMinutes: string; note: string; items: ItemForm[] };

const numberOrNull = (value: string) => value.trim() === "" ? null : Number(value);
export const blankSet = (): SetForm => ({ id: crypto.randomUUID(), weightKg: "", reps: "", durationSeconds: "", completed: false });
const setToForm = (set: TrainingSet): SetForm => ({ id: set.id, weightKg: set.weightKg?.toString() ?? "", reps: set.reps?.toString() ?? "", durationSeconds: set.durationSeconds?.toString() ?? "", completed: set.completed });
export function trainingToForm(input: TrainingInput): TrainingForm {
  return {
    title: input.title, date: input.date, time: input.time ?? "", mode: input.mode, status: input.status,
    startedAt: input.startedAt, durationMinutes: input.durationMinutes?.toString() ?? "", note: input.note ?? "",
    items: input.items.map(item => item.kind === "strength" ? { id: item.id, kind: item.kind, name: item.name, mode: item.mode, sets: item.sets.map(setToForm) } : { id: item.id, kind: item.kind, name: item.name, durationMinutes: item.durationMinutes?.toString() ?? "", distanceKm: item.distanceKm?.toString() ?? "", completed: item.completed }),
  };
}
export function formToTraining(form: TrainingForm): TrainingInput {
  return {
    ...form, time: form.time || null, durationMinutes: numberOrNull(form.durationMinutes), note: form.note || null,
    items: form.items.map(item => item.kind === "strength" ? { ...item, sets: item.sets.map(set => ({ ...set, weightKg: numberOrNull(set.weightKg), reps: numberOrNull(set.reps), durationSeconds: numberOrNull(set.durationSeconds) })) } : { ...item, durationMinutes: numberOrNull(item.durationMinutes), distanceKm: numberOrNull(item.distanceKm) }),
  };
}

/** 表头只出现一次，每行是一组；数值宽度收窄，完成状态用圆形勾选，避免每组都带标签和大按钮。 */
const rowGrid = (mode: "weighted" | "bodyweight" | "timed") => mode === "timed"
  ? "grid grid-cols-[1.75rem_minmax(0,1fr)_2.75rem_2.75rem] items-center gap-2"
  : "grid grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_2.75rem_2.75rem] items-center gap-2";

export function TrainingItemEditor({ item, index, total, disabled, readOnly, reference, onChange, onMove, onRemove }: {
  item: ItemForm; index: number; total: number; disabled: boolean; readOnly: boolean; reference?: TrainingItem;
  onChange: (item: ItemForm) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void;
}) {
  const modeLabel = item.kind === "cardio" ? "有氧" : item.mode === "weighted" ? "负重 · 公斤 / 次" : item.mode === "bodyweight" ? "自重 · 次，额外负重可选" : "计时 · 秒";
  const grid = item.kind === "strength" ? rowGrid(item.mode) : "";

  function fillReference() {
    if (!reference) return;
    if (item.kind === "cardio") {
      if (reference.kind !== "cardio") return;
      onChange({ ...item, durationMinutes: reference.durationMinutes?.toString() ?? "", distanceKm: reference.distanceKm?.toString() ?? "", completed: false });
      return;
    }
    if (reference.kind !== "strength") return;
    onChange({
      ...item,
      sets: item.sets.map((set, setIndex) => {
        const source = reference.sets[setIndex];
        return source ? { ...set, weightKg: source.weightKg?.toString() ?? "", reps: source.reps?.toString() ?? "", durationSeconds: source.durationSeconds?.toString() ?? "", completed: false } : set;
      }),
    });
  }

  return <section className="overflow-hidden rounded-2xl border bg-card" aria-label={`${index + 1}. ${item.name}`}>
    <div className="flex items-start gap-2 px-4 pb-3 pt-4 sm:px-5">
      <span className="mt-3.5 w-7 shrink-0 text-xs font-medium tabular-nums text-muted-foreground" aria-hidden>{String(index + 1).padStart(2, "0")}</span>
      <div className="min-w-0 flex-1">
        {readOnly ? <h2 className="break-words text-lg font-semibold">{item.name}</h2> : <>
          <Label className="sr-only" htmlFor={`name-${item.id}`}>项目 {index + 1} 名称</Label>
          <Input id={`name-${item.id}`} value={item.name} maxLength={80} disabled={disabled}
            className="h-10 border-transparent bg-transparent px-0 text-lg font-semibold focus-visible:border-input focus-visible:px-3"
            onChange={event => onChange({ ...item, name: event.target.value })} />
        </>}
        <p className="text-xs text-muted-foreground">{modeLabel}</p>
      </div>
      {!readOnly && <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon" className="size-11" disabled={disabled || index === 0} aria-label={`上移${item.name}`} onClick={() => onMove(-1)}><ArrowUp aria-hidden /></Button>
        <Button variant="ghost" size="icon" className="size-11" disabled={disabled || index === total - 1} aria-label={`下移${item.name}`} onClick={() => onMove(1)}><ArrowDown aria-hidden /></Button>
      </div>}
    </div>

    <div className="border-t px-4 py-2 sm:px-5">
      {item.kind === "strength" ? <>
        <div className={`${grid} px-1 pb-1 text-xs text-muted-foreground`} aria-hidden>
          <span>组</span>
          {item.mode === "timed" ? <span>持续时间（秒）</span> : <><span>重量（公斤）</span><span>次数</span></>}
          <span className="text-center">完成</span>
          <span />
        </div>
        <ul className="divide-y">
          {item.sets.map((set, setIndex) => {
            const previous = reference?.kind === "strength" ? reference.sets[setIndex] : undefined;
            const change = (key: "weightKg" | "reps" | "durationSeconds", value: string) => onChange({ ...item, sets: item.sets.map(row => row.id === set.id ? { ...row, [key]: value } : row) });
            const toggle = () => onChange({ ...item, sets: item.sets.map(row => row.id === set.id ? { ...row, completed: !row.completed } : row) });
            const value = item.mode === "timed" ? `${set.durationSeconds || "未填"} 秒` : `${item.mode === "weighted" ? `${set.weightKg || "未填"} 公斤 · ` : set.weightKg ? `额外 ${set.weightKg} 公斤 · ` : ""}${set.reps || "未填"} 次`;
            return <li key={set.id} className={`${grid} py-2`}>
              <span className="text-sm font-medium tabular-nums text-muted-foreground">{setIndex + 1}</span>
              {readOnly ? <>
                <span className={`text-sm tabular-nums ${item.mode === "timed" ? "" : "col-span-2"}`}>{value}</span>
                <span className={`text-center text-xs ${set.completed ? "text-foreground" : "text-muted-foreground"}`}>{set.completed ? "已完成" : "未完成"}</span>
                <span />
              </> : <>
                {item.mode === "timed"
                  ? <><Label className="sr-only" htmlFor={`seconds-${set.id}`}>第 {setIndex + 1} 组秒数</Label>
                      <Input id={`seconds-${set.id}`} type="number" inputMode="numeric" min={1} max={86400} step={1} placeholder={previous?.durationSeconds?.toString() ?? ""} value={set.durationSeconds} disabled={disabled} onChange={event => change("durationSeconds", event.target.value)} /></>
                  : <><Label className="sr-only" htmlFor={`weight-${set.id}`}>第 {setIndex + 1} 组{item.mode === "bodyweight" ? "额外负重公斤" : "重量公斤"}</Label>
                      <Input id={`weight-${set.id}`} type="number" inputMode="decimal" min={0} max={1000} step={0.01} placeholder={previous?.weightKg?.toString() ?? ""} value={set.weightKg} disabled={disabled} onChange={event => change("weightKg", event.target.value)} />
                      <Label className="sr-only" htmlFor={`reps-${set.id}`}>第 {setIndex + 1} 组次数</Label>
                      <Input id={`reps-${set.id}`} type="number" inputMode="numeric" min={1} max={10000} step={1} placeholder={previous?.reps?.toString() ?? ""} value={set.reps} disabled={disabled} onChange={event => change("reps", event.target.value)} /></>}
                <Button variant={set.completed ? "default" : "outline"} size="icon" className="size-11 justify-self-center rounded-full" aria-pressed={set.completed} aria-label={`第 ${setIndex + 1} 组完成`} disabled={disabled} onClick={toggle}><Check className="size-4" aria-hidden /></Button>
                <Button variant="ghost" size="icon" className="size-11 text-muted-foreground" disabled={disabled || item.sets.length === 1} aria-label={`删除第 ${setIndex + 1} 组`} onClick={() => onChange({ ...item, sets: item.sets.filter(row => row.id !== set.id) })}><Trash2 className="size-4" aria-hidden /></Button>
              </>}
            </li>;
          })}
        </ul>
        {!readOnly && <Button variant="ghost" className="mt-1 min-h-11 w-full text-muted-foreground" disabled={disabled || item.sets.length >= 50} onClick={() => onChange({ ...item, sets: [...item.sets, blankSet()] })}><Plus aria-hidden />添加一组{item.sets.length >= 50 && "（已达上限）"}</Button>}
      </> : <>
        {readOnly ? <p className="px-1 py-2 text-sm tabular-nums">{item.durationMinutes || "未填"} 分钟{item.distanceKm ? ` · ${item.distanceKm} 公里` : ""}<span className={`ml-3 text-xs ${item.completed ? "text-foreground" : "text-muted-foreground"}`}>{item.completed ? "已完成" : "未完成"}</span></p> : <>
          <div className="grid grid-cols-2 gap-3 pb-1">
            <div className="min-w-0 space-y-1.5"><Label htmlFor={`duration-${item.id}`}>时长（分钟）</Label><Input id={`duration-${item.id}`} type="number" inputMode="numeric" min={1} max={1440} step={1} value={item.durationMinutes} disabled={disabled} onChange={event => onChange({ ...item, durationMinutes: event.target.value })} /></div>
            <div className="min-w-0 space-y-1.5"><Label htmlFor={`distance-${item.id}`}>距离（公里，可选）</Label><Input id={`distance-${item.id}`} type="number" inputMode="decimal" min={0} max={1000} step={0.01} value={item.distanceKm} disabled={disabled} onChange={event => onChange({ ...item, distanceKm: event.target.value })} /></div>
          </div>
          <Button variant={item.completed ? "default" : "outline"} className="mt-2 min-h-11 w-full" aria-pressed={item.completed} disabled={disabled} onClick={() => onChange({ ...item, completed: !item.completed })}>{item.completed && <Check aria-hidden />}{item.completed ? "本项有氧已完成" : "标记本项有氧完成"}</Button>
        </>}
      </>}
    </div>

    {!readOnly && <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-1.5 sm:px-5">
      {reference ? <Button variant="ghost" size="sm" className="min-h-11 text-muted-foreground" disabled={disabled} onClick={fillReference}>带入上次数值</Button> : <span />}
      <Button variant="ghost" size="sm" className="min-h-11 text-muted-foreground" disabled={disabled} onClick={onRemove}><Trash2 className="size-4" aria-hidden />移除项目</Button>
    </div>}
  </section>;
}
