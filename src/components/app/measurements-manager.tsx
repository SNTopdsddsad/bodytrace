"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Activity, HeartPulse, LoaderCircle, Pencil, Plus, Scale, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api-client";
import { withRequestTimeout } from "@/lib/request-timeout";
import { shiftDate } from "@/lib/date";
import { MEASUREMENT_KINDS, MEASUREMENT_LABELS, MEASUREMENT_PERIODS, MEASUREMENT_PERIOD_LABELS, MEASUREMENT_RANGES, measurementChange, measurementPeriodLabel, measurementSchemas, measurementUnit, measurementValue } from "@/lib/measurements";
import type { Measurement, MeasurementDashboard, MeasurementKind, MeasurementPeriod } from "@/lib/measurements";
import { MeasurementChart } from "./measurement-chart";

type FormState = { kind: MeasurementKind; date: string; time: string; value: string; systolic: string; diastolic: string; period: MeasurementPeriod | ""; note: string };
const ICONS = { weight: Scale, bodyFat: Activity, bloodPressure: HeartPulse };
const when = (entry: Measurement) => `${entry.date}${entry.time ? ` ${entry.time}` : " · 未填测量时间"}`;
const whenWithPeriod = (entry: Measurement) => {
  const label = measurementPeriodLabel(entry);
  return `${when(entry)}${label ? ` · ${label}` : ""}`;
};

export function MeasurementsManager({ data }: { data: MeasurementDashboard }) {
  const router = useRouter();
  const [kind, setKind] = useState<MeasurementKind>("weight");
  const [visible, setVisible] = useState(30);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Measurement | null>(null);
  const [deleting, setDeleting] = useState<Measurement | null>(null);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState("");
  const [uncertain, setUncertain] = useState(false);
  const requestId = useRef("");
  const [form, setForm] = useState<FormState>({ kind: "weight", date: data.today, time: "", value: "", systolic: "", diastolic: "", period: "", note: "" });
  const entries = data.entries.filter(entry => entry.kind === kind);

  /** 新记录的时段默认值按当前时间推断：12 点前晨间，之后夜间。 */
  function defaultPeriod(): MeasurementPeriod {
    const hour = Number(new Intl.DateTimeFormat("en-GB", { timeZone: data.timeZone, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
    return hour < 12 ? "morning" : "evening";
  }

  function create(selected: MeasurementKind) {
    if (uncertain) { setOpen(true); return; }
    setEditing(null);
    setError("");
    requestId.current = crypto.randomUUID();
    const time = new Intl.DateTimeFormat("en-GB", { timeZone: data.timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date());
    setForm({ kind: selected, date: data.today, time, value: "", systolic: "", diastolic: "", period: selected === "bloodPressure" ? defaultPeriod() : "", note: "" });
    setOpen(true);
  }

  function edit(entry: Measurement) {
    if (uncertain) { setOpen(true); return; }
    setEditing(entry);
    setError("");
    setForm({ kind: entry.kind, date: entry.date, time: entry.time ?? "", value: entry.value ?? "", systolic: entry.systolic?.toString() ?? "", diastolic: entry.diastolic?.toString() ?? "", period: entry.period ?? "", note: entry.note ?? "" });
    setOpen(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (busyRef.current) return;
    const payload = {
      kind: form.kind, date: form.date, time: form.time || null, note: form.note || null,
      ...(form.kind === "bloodPressure" ? { systolic: Number(form.systolic), diastolic: Number(form.diastolic), period: form.period } : { value: form.value }),
    };
    const parsed = measurementSchemas(data.today).payload.safeParse(payload);
    if (!parsed.success) { setError(parsed.error.issues[0]?.message ?? "请核对输入"); return; }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const body = editing ? { version: editing.version, measurement: parsed.data } : { requestId: requestId.current, measurement: parsed.data };
      await withRequestTimeout(signal => api<{ entry: Measurement }>(editing ? `/api/v1/measurements/${editing.id}` : "/api/v1/measurements", { method: editing ? "PATCH" : "POST", signal, body: JSON.stringify(body) }));
      setUncertain(false);
      setOpen(false);
      setKind(form.kind);
      setVisible(30);
      toast.success(editing ? "测量记录已修改" : "测量记录已保存");
      // 补录或改期到当前范围之外的记录时才切到全部，保证保存结果能在列表中找到。
      const from = data.range === "all" ? null : shiftDate(data.today, -(Number(data.range) - 1));
      if (from && parsed.data.date < from) router.push("/measurements?range=all");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        // 服务端已明确拒绝（版本或提交编号冲突）：留在表单里重试只会继续失败，关闭并刷新，重新打开时使用最新数据。
        setUncertain(false);
        setEditing(null);
        setOpen(false);
        setError("");
        toast.error(err.message);
        router.refresh();
        return;
      }
      setUncertain(!(err instanceof ApiError) || err.status >= 500);
      setError(err instanceof Error ? err.message : "保存未完成，请核对后重试");
    } finally { busyRef.current = false; setBusy(false); }
  }

  async function remove() {
    if (!deleting || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      await withRequestTimeout(signal => api(`/api/v1/measurements/${deleting.id}`, { method: "DELETE", signal, body: JSON.stringify({ version: deleting.version }) }));
      setDeleting(null);
      toast.success("测量记录已删除");
      router.refresh();
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        setDeleting(null);
        setError("");
        toast.error(err.message);
        router.refresh();
        return;
      }
      setError(err instanceof Error ? err.message : "删除结果未确认，请核对后重试");
    }
    finally { busyRef.current = false; setBusy(false); }
  }

  function updateField(key: keyof FormState, value: string) {
    setForm(previous => ({ ...previous, [key]: value }));
  }

  const selectedFirst = entries.at(-1);
  const selectedLast = entries[0];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">持续记录，回看自己的身体变化。</p>
        <Button onClick={() => create(kind)}><Plus className="size-4" aria-hidden />记录身体指标</Button>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        {MEASUREMENT_KINDS.map(item => {
          const latest = data.latest[item];
          const Icon = ICONS[item];
          const change = latest ? measurementChange(latest, data.previous[item]) : null;
          return <Card key={item} size="sm">
            <CardContent>
              <div className="flex items-center justify-between gap-2"><p className="flex items-center gap-2 text-sm font-medium"><Icon className="size-4 text-primary" aria-hidden />{MEASUREMENT_LABELS[item]}</p><Button variant="ghost" size="icon" className="size-11" onClick={() => create(item)} aria-label={`记录${MEASUREMENT_LABELS[item]}`}><Plus className="size-4" aria-hidden /></Button></div>
              {latest ? <>
                <p className="mt-1 text-2xl font-semibold tabular-nums">{measurementValue(latest)}<span className="ml-2 text-xs font-normal text-muted-foreground">{measurementUnit(item)}</span></p>
                <p className="mt-2 text-xs text-muted-foreground">{whenWithPeriod(latest)} · 手动记录</p>
                <p className="mt-1 text-xs text-muted-foreground">{change ? `较上一次${item === "bloodPressure" && latest.period ? MEASUREMENT_PERIOD_LABELS[latest.period] : ""} ${change}` : "第一条测量记录"}</p>
                {item === "weight" && data.targetWeightKg != null && <p className="mt-1 text-xs text-muted-foreground">目标 {data.targetWeightKg} kg · 相差 {Math.abs(Number(latest.value) - data.targetWeightKg).toFixed(2)} kg</p>}
              </> : <>
                <p className="mt-2 text-sm text-muted-foreground">还没有测量记录</p>
                {item === "weight" && data.legacyWeightKg != null && <p className="mt-2 text-xs text-muted-foreground">旧资料参考：{data.legacyWeightKg} kg，未计入历史。</p>}
              </>}
            </CardContent>
          </Card>;
        })}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1" aria-label="选择身体指标">
          {MEASUREMENT_KINDS.map(item => <Button key={item} size="sm" className="min-h-11" variant={kind === item ? "outline" : "ghost"} aria-pressed={kind === item} onClick={() => { setKind(item); setVisible(30); }}>{MEASUREMENT_LABELS[item]}</Button>)}
        </div>
        <div className="flex flex-wrap gap-1" aria-label="选择日期范围">
          {MEASUREMENT_RANGES.map(range => <Button key={range} size="sm" className="min-h-11" variant={data.range === range ? "outline" : "ghost"} aria-pressed={data.range === range} onClick={() => { setVisible(30); router.push(`/measurements?range=${range}`); }}>{range === "all" ? "全部" : `近 ${range} 天`}</Button>)}
        </div>
      </div>
      <Card>
        <CardHeader><CardTitle>{MEASUREMENT_LABELS[kind]}趋势 <span className="text-xs font-normal text-muted-foreground">{measurementUnit(kind)}</span></CardTitle><p className="text-xs leading-5 text-muted-foreground">{kind === "bloodPressure" ? "晨间、夜间分别取每天最晚的一条，同屏对比；未标记时段的旧记录不进趋势，可在历史记录里编辑补选。" : "每天取已填写时间最晚的一条；当天均未填时间时取最晚录入的一条。"}缺失日期断开，不补零。</p>{kind === "bloodPressure" && <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-2" aria-hidden />晨间·收缩压</span>
          <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-chart-4" aria-hidden />晨间·舒张压</span>
          <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-chart-2" aria-hidden />夜间·收缩压</span>
          <span className="flex items-center gap-1.5"><span className="w-4 border-t-2 border-dashed border-chart-4" aria-hidden />夜间·舒张压</span>
        </div>}</CardHeader>
        <CardContent>
          {entries.length === 0 ? <div className="rounded-xl border border-dashed bg-muted/25 px-4 py-12 text-center"><Activity className="mx-auto mb-3 size-7 text-primary/50" aria-hidden /><p className="text-sm">这个时间段还没有{MEASUREMENT_LABELS[kind]}记录。</p><Button variant="outline" className="mt-4" onClick={() => create(kind)}>记录{MEASUREMENT_LABELS[kind]}</Button></div> : <>
            <MeasurementChart entries={entries} kind={kind} />
            <p className="mt-4 text-xs leading-5 text-muted-foreground">所选范围共 {entries.length} 次记录。{selectedFirst && selectedLast && `${whenWithPeriod(selectedFirst)}：${measurementValue(selectedFirst)} ${measurementUnit(kind)}；${whenWithPeriod(selectedLast)}：${measurementValue(selectedLast)} ${measurementUnit(kind)}。`}{entries.length === 1 && "继续记录后可以回看变化。"}</p>
          </>}
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>{MEASUREMENT_LABELS[kind]}历史记录 <span className="ml-1 text-xs font-normal text-muted-foreground">{entries.length} 条</span></CardTitle></CardHeader>
        <CardContent>
          {entries.length === 0 ? <p className="py-5 text-sm text-muted-foreground">记录后会在这里显示，可回看、修改和删除。</p> : <ul className="divide-y">
            {entries.slice(0, visible).map(entry => <li key={entry.id} className="flex items-start justify-between gap-3 py-3 first:pt-0">
              <div className="min-w-0"><p className="text-base font-semibold tabular-nums">{measurementValue(entry)} <span className="text-xs font-normal text-muted-foreground">{measurementUnit(kind)}</span></p><p className="mt-1 text-xs text-muted-foreground">{whenWithPeriod(entry)}{entry.timeZone !== data.timeZone && ` · ${entry.timeZone}`}</p>{entry.note && <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-5 text-muted-foreground">{entry.note}</p>}</div>
              <div className="flex shrink-0"><Button size="icon" className="size-11" variant="ghost" aria-label={`编辑${MEASUREMENT_LABELS[kind]} ${whenWithPeriod(entry)}`} onClick={() => edit(entry)}><Pencil className="size-4" aria-hidden /></Button><Button size="icon" className="size-11 text-muted-foreground hover:text-destructive" variant="ghost" aria-label={`删除${MEASUREMENT_LABELS[kind]} ${whenWithPeriod(entry)}`} onClick={() => { if (uncertain) { setOpen(true); return; } setDeleting(entry); setError(""); }}><Trash2 className="size-4" aria-hidden /></Button></div>
            </li>)}
          </ul>}
          {visible < entries.length && <Button variant="outline" className="mt-4 w-full" onClick={() => setVisible(count => count + 30)}>显示更多记录</Button>}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={value => { if (!busy) setOpen(value); }}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
          <DialogHeader><DialogTitle>{editing ? "修改" : "记录"}{MEASUREMENT_LABELS[form.kind]}</DialogTitle><DialogDescription>按本次实际测量填写，时间和备注可留空。</DialogDescription></DialogHeader>
          <form onSubmit={save} className="space-y-4">
            {!editing && <div className="flex gap-1 rounded-xl bg-muted p-1" aria-label="记录的指标类型">{MEASUREMENT_KINDS.map(item => <Button key={item} type="button" variant={form.kind === item ? "outline" : "ghost"} className="min-h-11 flex-1" aria-pressed={form.kind === item} disabled={busy || uncertain} onClick={() => setForm(previous => ({ ...previous, kind: item, ...(item === "bloodPressure" && !previous.period ? { period: defaultPeriod() } : {}) }))}>{MEASUREMENT_LABELS[item]}</Button>)}</div>}
            <div className="grid grid-cols-2 gap-3"><div className="min-w-0 space-y-1.5"><Label htmlFor="measurement-date">测量日期</Label><Input id="measurement-date" type="date" required max={data.today} value={form.date} disabled={busy || uncertain} onChange={event => updateField("date", event.target.value)} /></div><div className="min-w-0 space-y-1.5"><Label htmlFor="measurement-time">时间（可选）</Label><Input id="measurement-time" type="time" value={form.time} disabled={busy || uncertain} onChange={event => updateField("time", event.target.value)} /></div></div>
            {form.kind === "bloodPressure" && <div className="space-y-1.5">
              <p className="text-sm font-medium">测量时段</p>
              <div className="flex gap-1 rounded-xl bg-muted p-1" aria-label="测量时段">{MEASUREMENT_PERIODS.map(item => <Button key={item} type="button" variant={form.period === item ? "outline" : "ghost"} className="min-h-11 flex-1" aria-pressed={form.period === item} disabled={busy || uncertain} onClick={() => setForm(previous => ({ ...previous, period: item }))}>{MEASUREMENT_PERIOD_LABELS[item]}</Button>)}</div>
            </div>}
            {form.kind === "bloodPressure" ? <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5"><Label htmlFor="measurement-systolic">收缩压（mmHg）</Label><Input id="measurement-systolic" type="number" inputMode="numeric" required min={1} max={400} step={1} value={form.systolic} disabled={busy || uncertain} onChange={event => updateField("systolic", event.target.value)} placeholder="如 120" /></div>
              <div className="space-y-1.5"><Label htmlFor="measurement-diastolic">舒张压（mmHg）</Label><Input id="measurement-diastolic" type="number" inputMode="numeric" required min={1} max={400} step={1} value={form.diastolic} disabled={busy || uncertain} onChange={event => updateField("diastolic", event.target.value)} placeholder="如 80" /></div>
            </div> : <div className="space-y-1.5"><Label htmlFor="measurement-value">{MEASUREMENT_LABELS[form.kind]}（{measurementUnit(form.kind)}）</Label><Input id="measurement-value" type="number" inputMode="decimal" required min={0.01} max={form.kind === "weight" ? 500 : 100} step={0.01} value={form.value} disabled={busy || uncertain} onChange={event => updateField("value", event.target.value)} placeholder={form.kind === "weight" ? "如 65.5" : "如 20.5"} /></div>}
            <div className="space-y-1.5"><Label htmlFor="measurement-note">备注（可选）</Label><textarea id="measurement-note" rows={2} maxLength={500} value={form.note} disabled={busy || uncertain} onChange={event => updateField("note", event.target.value)} className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50" placeholder="如：晨起测量、运动后测量" /></div>
            {uncertain && <p role="status" className="rounded-lg border bg-muted p-3 text-xs leading-5">保存结果尚未确认，输入已保留。重试会核对同一次提交，避免重复新增。请先完成本次核对，再录入其他数据。</p>}
            {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
            <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={busy} onClick={() => setOpen(false)}>关闭</Button><Button type="submit" disabled={busy}>{busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}{busy ? "保存中…" : uncertain ? "核对并重试" : "保存记录"}</Button></div>
          </form>
        </DialogContent>
      </Dialog>
      <Dialog open={deleting != null} onOpenChange={value => { if (!value && !busy) setDeleting(null); }}>
        <DialogContent><DialogHeader><DialogTitle>删除这条测量记录？</DialogTitle><DialogDescription>{deleting && `${MEASUREMENT_LABELS[deleting.kind]} ${measurementValue(deleting)} ${measurementUnit(deleting.kind)} · ${whenWithPeriod(deleting)}`}。删除后不再参与趋势和最新值计算。</DialogDescription></DialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeleting(null)}>取消</Button><Button variant="destructive" disabled={busy} onClick={remove}>{busy ? "删除中…" : "确认删除"}</Button></div></DialogContent>
      </Dialog>
    </div>
  );
}
