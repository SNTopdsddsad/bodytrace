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

export function TrainingItemEditor({ item, index, total, disabled, readOnly, reference, onChange, onMove, onRemove }: {
  item: ItemForm; index: number; total: number; disabled: boolean; readOnly: boolean; reference?: TrainingItem;
  onChange: (item: ItemForm) => void; onMove: (direction: -1 | 1) => void; onRemove: () => void;
}) {
  const modeLabel = item.kind === "cardio" ? "有氧" : item.mode === "weighted" ? "负重 · kg / 次" : item.mode === "bodyweight" ? "自重 · 次 / 可选额外负重" : "计时 · 秒";
  return <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-label={`${index + 1}. ${item.name}`}>
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1"><p className="mb-1.5 text-xs text-muted-foreground">项目 {index + 1} · {modeLabel}</p>{readOnly ? <h2 className="break-words text-lg font-semibold">{item.name}</h2> : <><Label className="sr-only" htmlFor={`name-${item.id}`}>项目 {index + 1} 名称</Label><Input id={`name-${item.id}`} value={item.name} maxLength={80} disabled={disabled} onChange={event => onChange({ ...item, name: event.target.value })} /></>}</div>
      {!readOnly && <div className="flex shrink-0 flex-wrap justify-end gap-0.5"><Button variant="ghost" size="icon" className="size-11" disabled={disabled || index === 0} aria-label={`上移${item.name}`} onClick={() => onMove(-1)}><ArrowUp aria-hidden /></Button><Button variant="ghost" size="icon" className="size-11" disabled={disabled || index === total - 1} aria-label={`下移${item.name}`} onClick={() => onMove(1)}><ArrowDown aria-hidden /></Button></div>}
    </div>
    {item.kind === "strength" ? <div className="mt-4 space-y-3">
      {item.sets.map((set, setIndex) => {
        const previous = reference?.kind === "strength" ? reference.sets[setIndex] : undefined;
        const change = (key: "weightKg" | "reps" | "durationSeconds", value: string) => onChange({ ...item, sets: item.sets.map(row => row.id === set.id ? { ...row, [key]: value } : row) });
        const previousText = previous ? item.mode === "timed" ? `${previous.durationSeconds ?? "未填"} 秒` : `${previous.weightKg == null ? "重量未填" : `${previous.weightKg} kg`} × ${previous.reps ?? "未填"} 次` : null;
        return <div key={set.id} className="rounded-xl bg-muted/55 p-3">
          <div className="flex items-center justify-between gap-2"><p className="text-sm font-medium">第 {setIndex + 1} 组</p>{!readOnly && <Button variant="ghost" size="icon" className="size-11" disabled={disabled || item.sets.length === 1} aria-label={`删除${item.name}第 ${setIndex + 1} 组`} onClick={() => onChange({ ...item, sets: item.sets.filter(row => row.id !== set.id) })}><Trash2 className="size-4 text-muted-foreground" aria-hidden /></Button>}</div>
          {readOnly ? <p className="mt-2 text-sm tabular-nums">{item.mode === "timed" ? `${set.durationSeconds || "未填"} 秒` : `${set.weightKg ? `${set.weightKg} kg · ` : item.mode === "weighted" ? "重量未填 · " : ""}${set.reps || "未填"} 次`}<span className="ml-3 text-muted-foreground">{set.completed ? "已完成" : "未完成，不计入"}</span></p> : <>
            <div className={`grid gap-3 ${item.mode === "timed" ? "grid-cols-1" : "grid-cols-2"}`}>
              {item.mode !== "timed" && <><div className="min-w-0 space-y-1.5"><Label htmlFor={`weight-${set.id}`}>{item.mode === "bodyweight" ? "额外负重（kg，可选）" : "重量（kg）"}</Label><Input id={`weight-${set.id}`} type="number" inputMode="decimal" min={0} max={1000} step={0.01} value={set.weightKg} disabled={disabled} onChange={event => change("weightKg", event.target.value)} /></div><div className="min-w-0 space-y-1.5"><Label htmlFor={`reps-${set.id}`}>次数</Label><Input id={`reps-${set.id}`} type="number" inputMode="numeric" min={1} max={10000} step={1} value={set.reps} disabled={disabled} onChange={event => change("reps", event.target.value)} /></div></>}
              {item.mode === "timed" && <div className="space-y-1.5"><Label htmlFor={`seconds-${set.id}`}>持续时间（秒）</Label><Input id={`seconds-${set.id}`} type="number" inputMode="numeric" min={1} max={86400} step={1} value={set.durationSeconds} disabled={disabled} onChange={event => change("durationSeconds", event.target.value)} /></div>}
            </div>
            {previousText && <div className="mt-2 flex flex-wrap items-center justify-between gap-1"><p className="text-xs text-muted-foreground">上次：{previousText}（{previous?.completed ? "已完成" : "未完成"}）</p><Button variant="ghost" size="sm" className="min-h-11" disabled={disabled} onClick={() => { if (previous) onChange({ ...item, sets: item.sets.map(row => row.id === set.id ? { ...setToForm(previous), id: row.id, completed: false } : row) }); }}>带入参考值</Button></div>}
            <Button variant={set.completed ? "default" : "outline"} className="mt-3 min-h-11 w-full" aria-pressed={set.completed} disabled={disabled} onClick={() => onChange({ ...item, sets: item.sets.map(row => row.id === set.id ? { ...row, completed: !row.completed } : row) })}>{set.completed && <Check aria-hidden />}{set.completed ? "本组已完成" : "标记本组完成"}</Button>
          </>}
        </div>;
      })}
      {!readOnly && <Button variant="outline" className="min-h-11 w-full" disabled={disabled || item.sets.length >= 50} onClick={() => onChange({ ...item, sets: [...item.sets, blankSet()] })}><Plus aria-hidden />添加一组{item.sets.length >= 50 && "（已达上限）"}</Button>}
    </div> : <div className="mt-4">
      {readOnly ? <p className="text-sm tabular-nums">{item.durationMinutes || "未填"} 分钟 · {item.distanceKm ? `${item.distanceKm} km` : "距离未填"}<span className="ml-3 text-muted-foreground">{item.completed ? "已完成" : "未完成，不计入"}</span></p> : <>
        <div className="grid grid-cols-2 gap-3"><div className="min-w-0 space-y-1.5"><Label htmlFor={`duration-${item.id}`}>时长（分钟）</Label><Input id={`duration-${item.id}`} type="number" inputMode="numeric" min={1} max={1440} step={1} value={item.durationMinutes} disabled={disabled} onChange={event => onChange({ ...item, durationMinutes: event.target.value })} /></div><div className="min-w-0 space-y-1.5"><Label htmlFor={`distance-${item.id}`}>距离（km，可选）</Label><Input id={`distance-${item.id}`} type="number" inputMode="decimal" min={0} max={1000} step={0.01} value={item.distanceKm} disabled={disabled} onChange={event => onChange({ ...item, distanceKm: event.target.value })} /></div></div>
        {reference?.kind === "cardio" && <div className="mt-2 flex flex-wrap items-center justify-between gap-1"><p className="text-xs text-muted-foreground">上次：{reference.durationMinutes ?? "未填"} 分钟 · {reference.distanceKm == null ? "距离未填" : `${reference.distanceKm} km`}</p><Button variant="ghost" size="sm" className="min-h-11" disabled={disabled} onClick={() => onChange({ ...item, durationMinutes: reference.durationMinutes?.toString() ?? "", distanceKm: reference.distanceKm?.toString() ?? "", completed: false })}>带入参考值</Button></div>}
        <Button className="mt-3 min-h-11 w-full" variant={item.completed ? "default" : "outline"} aria-pressed={item.completed} disabled={disabled} onClick={() => onChange({ ...item, completed: !item.completed })}>{item.completed && <Check aria-hidden />}{item.completed ? "本项有氧已完成" : "标记本项有氧完成"}</Button>
      </>}
    </div>}
    {!readOnly && <Button variant="ghost" className="mt-3 min-h-11 text-muted-foreground" disabled={disabled} onClick={onRemove}><Trash2 className="size-4" aria-hidden />移除项目</Button>}
  </section>;
}
