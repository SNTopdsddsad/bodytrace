"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Check, Copy, LoaderCircle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { api, ApiError } from "@/lib/api-client";
import { ensureTrainingDocumentBoundary, installTrainingNavigationGuard } from "@/lib/training-navigation-guard";
import { createTrainingClock } from "@/lib/training-clock";
import { withRequestTimeout } from "@/lib/request-timeout";
import { TRAINING_EXERCISES, trainingProgress, trainingSchemas } from "@/lib/training";
import type { TrainingExercise, TrainingInput, TrainingRecord } from "@/lib/training";
import { blankSet, formToTraining, TrainingItemEditor, trainingToForm } from "./training-item-editor";
import type { ItemForm, TrainingForm } from "./training-item-editor";

type SaveState = "new" | "saved" | "dirty" | "saving" | "error" | "uncertain" | "conflict";
type PendingSave = { input: TrainingInput; form: TrainingForm; id: string | null; version: number | null; requestId: string; finish: boolean };
type EditorSession = { active: boolean; url: string };
type CheckResult = { state: "saved"; entry: TrainingRecord } | { state: "retry" } | { state: "conflict"; entry: TrainingRecord };
const selectClass = "h-11 w-full min-w-0 rounded-xl border border-input bg-background px-3 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 md:text-sm";

function sameTraining(a: TrainingInput, b: TrainingInput) {
  return JSON.stringify(formToTraining(trainingToForm(a))) === JSON.stringify(formToTraining(trainingToForm(b)));
}

async function lookupPending(pending: PendingSave, userId: string): Promise<CheckResult> {
  const path = pending.id ? `/api/v1/training-records/${pending.id}` : `/api/v1/training-records?requestId=${pending.requestId}`;
  const { entry } = await withRequestTimeout(signal => api<{ entry: TrainingRecord | null }>(path, { signal, cache: "no-store", headers: { "X-BodyTrace-User": userId } }));
  if (!entry) return { state: "retry" };
  if (pending.id) {
    if (entry.version === pending.version) return { state: "retry" };
    if (pending.version !== null && entry.version === pending.version + 1 && sameTraining(entry, pending.input)) return { state: "saved", entry };
    return { state: "conflict", entry };
  }
  if (entry.version === 1 && sameTraining(entry, pending.input)) return { state: "saved", entry };
  return { state: "conflict", entry };
}

export function TrainingEditor({ initial, initialRecord, today, timeZone, serverNow, userId, reference, recentExercises }: {
  initial: TrainingInput; initialRecord: TrainingRecord | null; today: string; timeZone: string;
  userId: string; serverNow: string;
  reference: TrainingRecord | null; recentExercises: TrainingExercise[];
}) {
  const router = useRouter();
  const [clock] = useState(() => createTrainingClock(serverNow));
  const editorSession = useRef<EditorSession | null>(null);
  const navigationGuard = useRef<ReturnType<typeof installTrainingNavigationGuard> | null>(null);
  const shouldBlockNavigation = useRef(false);
  const isCurrentSession = useCallback((session: EditorSession | null) => session !== null && session === editorSession.current && session.active && session.url === window.location.pathname + window.location.search, []);
  const leaveEditor = useCallback(() => { if (editorSession.current) editorSession.current.active = false; }, []);
  const replaceEditorUrl = useCallback((id: string) => {
    const session = editorSession.current;
    if (!isCurrentSession(session)) return;
    const url = `/training/${id}`;
    // 保留正在逐组编辑的状态；新建页按创建意图区分实例，复制时不会复用旧表单。
    window.history.replaceState(null, "", url);
    if (session) session.url = url;
  }, [isCurrentSession]);
  const [form, setForm] = useState(() => trainingToForm(initial));
  const [currentToday, setCurrentToday] = useState(today);
  const formRef = useRef(form);
  const [record, setRecord] = useState(initialRecord);
  const recordRef = useRef(initialRecord);
  const [recoveryEntry, setRecoveryEntry] = useState<TrainingRecord | null>(null);
  const [missingRecord, setMissingRecord] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>(initialRecord ? "saved" : "new");
  const [error, setError] = useState("");
  const [readOnly, setReadOnly] = useState(initial.status === "completed");
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [finishing, setFinishing] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [customKind, setCustomKind] = useState<"weighted" | "bodyweight" | "timed" | "cardio">("weighted");
  const [finishOpen, setFinishOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteUncertain, setDeleteUncertain] = useState(false);
  const [reloadOpen, setReloadOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [leaveTarget, setLeaveTarget] = useState<string | null>("/training?range=all");
  const [removeItem, setRemoveItem] = useState<string | null>(null);
  const [finishDuration, setFinishDuration] = useState("");
  const requestId = useRef("");
  const pendingRef = useRef<PendingSave | null>(null);
  const savedFormRef = useRef(JSON.stringify(form));
  const referenceItems = useMemo(() => new Map(initial.items.map((item, i) => [item.id, reference?.items[i]])), [initial.items, reference]);
  const initialSnapshot = useMemo(() => JSON.stringify(trainingToForm(initial)), [initial]);
  const progress = trainingProgress(formToTraining(form));
  const blocked = saveState === "uncertain" || saveState === "conflict";
  const locked = blocked || finishing || (busy && !record) || deleteOpen || reloadOpen;
  const unsaved = busy || (saveState !== "saved" && (record != null || saveState !== "new" || JSON.stringify(form) !== initialSnapshot));

  useLayoutEffect(() => { shouldBlockNavigation.current = unsaved || blocked; }, [unsaved, blocked]);
  useLayoutEffect(() => {
    if (ensureTrainingDocumentBoundary() === "replacing") return;
    let session = { active: true, url: window.location.pathname + window.location.search };
    editorSession.current = session;
    const guard = installTrainingNavigationGuard({
      shouldBlock: () => session.active && shouldBlockNavigation.current,
      onBlocked: () => { setLeaveTarget(null); setLeaveOpen(true); },
      onLeave: () => { session.active = false; },
      onResume: () => {
        if (session.url !== window.location.pathname + window.location.search) return;
        // 浏览器恢复整个文档时不会重跑挂载 effect；旧请求的回调仍须失效。
        session.active = false;
        session = { active: true, url: session.url };
        editorSession.current = session;
        setLeaveOpen(false);
        if (busyRef.current) {
          busyRef.current = false;
          setBusy(false);
          setFinishing(false);
          setSaveState(pendingRef.current ? "uncertain" : "error");
          setError(pendingRef.current ? "页面已恢复，请核对上一次保存结果后继续。" : "页面已恢复，输入仍保留，请重新保存。");
        }
      },
      onError: message => {
        if (session.url === window.location.pathname + window.location.search) session.active = true;
        setLeaveOpen(false);
        setError(message);
      },
    });
    navigationGuard.current = guard;
    return () => { session.active = false; guard.dispose(); navigationGuard.current = null; };
  }, []);

  const markMissing = useCallback(() => {
    pendingRef.current = null;
    setRecoveryEntry(null);
    setMissingRecord(true);
    setSaveState("conflict");
    setError("这次训练不存在或已删除。本页输入仍保留，可以先记下需要的内容，再返回训练列表。");
    setFinishOpen(false);
    setReloadOpen(false);
  }, []);

  const acceptSaved = useCallback((entry: TrainingRecord, pending: PendingSave) => {
    recordRef.current = entry;
    setRecord(entry);
    setRecoveryEntry(null);
    setMissingRecord(false);
    pendingRef.current = null;
    savedFormRef.current = JSON.stringify(pending.form);
    if (!pending.id) replaceEditorUrl(entry.id);
    if (pending.finish) {
      formRef.current = pending.form;
      setForm(pending.form);
      setReadOnly(true);
      setFinishOpen(false);
    }
    setSaveState(JSON.stringify(formRef.current) === savedFormRef.current ? "saved" : "dirty");
    setError("");
  }, [replaceEditorUrl]);

  const send = useCallback(async (pending: PendingSave) => {
    const session = editorSession.current;
    if (!isCurrentSession(session)) return;
    busyRef.current = true;
    setBusy(true);
    setFinishing(pending.finish);
    pendingRef.current = pending;
    setSaveState("saving");
    setError("");
    try {
      const body = pending.id ? { version: pending.version, training: pending.input } : { requestId: pending.requestId, training: pending.input };
      const { entry } = await withRequestTimeout(signal => api<{ entry: TrainingRecord }>(pending.id ? `/api/v1/training-records/${pending.id}` : "/api/v1/training-records", { method: pending.id ? "PATCH" : "POST", body: JSON.stringify(body), signal, headers: { "X-BodyTrace-User": userId } }));
      if (!isCurrentSession(session)) return;
      acceptSaved(entry, pending);
    } catch (err) {
      if (!isCurrentSession(session)) return;
      if (err instanceof ApiError && err.status < 500) {
        pendingRef.current = null;
        if (err.status === 404) markMissing();
        else { setSaveState(err.status === 409 ? "conflict" : "error"); setError(err.message); }
      } else {
        setSaveState("uncertain");
        setError("保存结果尚未确认，正在核对服务器。输入已保留。");
        try {
          const result = await lookupPending(pending, userId);
          if (!isCurrentSession(session)) return;
          if (result.state === "saved") acceptSaved(result.entry, pending);
          else if (result.state === "conflict") { setRecoveryEntry(result.entry); setSaveState("conflict"); setError("另一处已修改这次训练。你的输入仍保留，请核对后加载最新记录。"); }
          else setError("暂未确认本次保存。请点击“核对并重试”，使用同一次提交继续核对。");
        } catch (lookupError) {
          if (!isCurrentSession(session)) return;
          if (lookupError instanceof ApiError && lookupError.status === 404) markMissing();
          else if (lookupError instanceof ApiError && lookupError.status === 409) { setSaveState("conflict"); setError(lookupError.message); }
          else setError("暂时无法核对保存结果。输入已保留，网络恢复后点击“核对并重试”。");
        }
      }
    } finally {
      if (isCurrentSession(session)) {
        busyRef.current = false;
        setBusy(false);
        setFinishing(false);
      }
    }
  }, [acceptSaved, isCurrentSession, markMissing, userId]);

  const save = useCallback(async (finish = false, duration?: string) => {
    const session = editorSession.current;
    if (busyRef.current || pendingRef.current || !isCurrentSession(session)) return;
    busyRef.current = true;
    setBusy(true);
    setFinishing(finish);
    try {
      // 采样只发生在一次新提交前；未知写入的重试始终保留原请求和开始时刻。
      const sample = await withRequestTimeout(signal => api<{ serverNow: string }>("/api/v1/training-records/clock", { signal, cache: "no-store", headers: { "X-BodyTrace-User": userId } }));
      if (!isCurrentSession(session)) return;
      clock.synchronize(sample.serverNow);
      const now = clock.read(timeZone);
      setCurrentToday(now.date);
      let nextForm = formRef.current;
      if (!recordRef.current && nextForm.mode === "live") {
        nextForm = { ...nextForm, date: now.date, time: now.time, startedAt: now.iso };
        formRef.current = nextForm;
        setForm(nextForm);
      }
      if (finish) nextForm = { ...nextForm, status: "completed", durationMinutes: duration ?? nextForm.durationMinutes };
      const parsed = trainingSchemas(now.date, now.time, now.iso).payload.safeParse(formToTraining(nextForm));
      if (!parsed.success) {
        const issue = parsed.error.issues[0];
        const itemIndex = issue?.path[0] === "items" && typeof issue.path[1] === "number" ? issue.path[1] : null;
        const prefix = itemIndex == null ? "" : `项目 ${itemIndex + 1}：`;
        setError(`${prefix}${issue?.message ?? "请核对输入"}`);
        setSaveState("error");
        return;
      }
      if (!requestId.current) requestId.current = crypto.randomUUID();
      await send({ input: parsed.data, form: nextForm, id: recordRef.current?.id ?? null, version: recordRef.current?.version ?? null, requestId: requestId.current, finish });
    } catch (err) {
      if (!isCurrentSession(session)) return;
      setError(err instanceof Error ? `无法校准服务器时间：${err.message}。输入已保留，请重试。` : "无法读取服务器时间，输入已保留，请重试。");
      setSaveState("error");
    } finally {
      if (isCurrentSession(session)) { busyRef.current = false; setBusy(false); setFinishing(false); }
    }
  }, [clock, isCurrentSession, send, timeZone, userId]);

  useEffect(() => {
    if (!record || form.status !== "inProgress" || saveState !== "dirty" || busy || finishOpen || deleteOpen || reloadOpen || leaveOpen) return;
    const timer = window.setTimeout(() => { void save(); }, 900);
    return () => window.clearTimeout(timer);
  }, [form, record, saveState, busy, finishOpen, deleteOpen, reloadOpen, leaveOpen, save]);

  useEffect(() => {
    const updateToday = () => setCurrentToday(clock.read(timeZone).date);
    const timer = window.setInterval(updateToday, 60_000);
    window.addEventListener("focus", updateToday);
    document.addEventListener("visibilitychange", updateToday);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("focus", updateToday);
      document.removeEventListener("visibilitychange", updateToday);
    };
  }, [clock, timeZone]);


  useEffect(() => {
    const guardNavigation = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download") || (anchor.target && anchor.target !== "_self")) return;
      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || (destination.pathname === window.location.pathname && destination.search === window.location.search)) return;
      if (!unsaved && !blocked) { leaveEditor(); return; }
      event.preventDefault();
      event.stopPropagation();
      setLeaveTarget(`${destination.pathname}${destination.search}${destination.hash}`);
      setLeaveOpen(true);
    };
    document.addEventListener("click", guardNavigation, true);
    return () => document.removeEventListener("click", guardNavigation, true);
  }, [unsaved, blocked, leaveEditor]);

  function change(next: TrainingForm) {
    formRef.current = next;
    setForm(next);
    if (!blocked) {
      setError("");
      setSaveState(busyRef.current ? "saving" : recordRef.current ? JSON.stringify(next) === savedFormRef.current ? "saved" : "dirty" : "new");
    }
  }

  async function retryUnknown() {
    const session = editorSession.current;
    const pending = pendingRef.current;
    if (!pending || busyRef.current || !isCurrentSession(session)) return;
    busyRef.current = true;
    setBusy(true);
    setError("正在核对上一次保存…");
    try {
      const result = await lookupPending(pending, userId);
      if (!isCurrentSession(session)) return;
      if (result.state === "saved") acceptSaved(result.entry, pending);
      else if (result.state === "conflict") { setRecoveryEntry(result.entry); setSaveState("conflict"); setError("服务器中的记录已经变化。输入已保留，请加载最新记录后再编辑。"); }
      else await send(pending);
    } catch (err) {
      if (!isCurrentSession(session)) return;
      if (err instanceof ApiError && err.status === 404) markMissing();
      else if (err instanceof ApiError && err.status === 409) { setSaveState("conflict"); setError(err.message); }
      else setError(err instanceof Error ? `核对失败：${err.message}` : "核对失败，请稍后重试");
    }
    finally { if (isCurrentSession(session)) { busyRef.current = false; setBusy(false); } }
  }

  async function reload() {
    const session = editorSession.current;
    const id = recoveryEntry?.id ?? recordRef.current?.id;
    if (!id || busyRef.current || !isCurrentSession(session)) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const { entry } = await withRequestTimeout(signal => api<{ entry: TrainingRecord }>(`/api/v1/training-records/${id}`, { signal, cache: "no-store", headers: { "X-BodyTrace-User": userId } }));
      if (!isCurrentSession(session)) return;
      const next = trainingToForm(entry);
      formRef.current = next; setForm(next);
      recordRef.current = entry; setRecord(entry);
      setRecoveryEntry(null); setMissingRecord(false);
      savedFormRef.current = JSON.stringify(next);
      pendingRef.current = null;
      replaceEditorUrl(entry.id);
      setSaveState("saved"); setError(""); setReadOnly(entry.status === "completed"); setReloadOpen(false);
    } catch (err) { if (!isCurrentSession(session)) return; if (err instanceof ApiError && err.status === 404) markMissing(); else setError(err instanceof Error ? err.message : "读取失败，请稍后重试"); }
    finally { if (isCurrentSession(session)) { busyRef.current = false; setBusy(false); } }
  }

  async function removeTraining() {
    const session = editorSession.current;
    const current = recordRef.current;
    if (!current || busyRef.current || blocked || !isCurrentSession(session)) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      if (deleteUncertain) {
        try {
          const { entry } = await withRequestTimeout(signal => api<{ entry: TrainingRecord }>(`/api/v1/training-records/${current.id}`, { signal, cache: "no-store", headers: { "X-BodyTrace-User": userId } }));
          if (!isCurrentSession(session)) return;
          if (entry.version !== current.version) { setSaveState("conflict"); setDeleteOpen(false); setError("训练已在另一处修改，删除没有继续。请先加载最新记录。"); return; }
        } catch (err) { if (!isCurrentSession(session)) return; if (err instanceof ApiError && err.status === 404) { leaveEditor(); router.push("/training?range=all"); router.refresh(); return; } throw err; }
      }
      await withRequestTimeout(signal => api(`/api/v1/training-records/${current.id}`, { method: "DELETE", body: JSON.stringify({ version: current.version }), signal, headers: { "X-BodyTrace-User": userId } }));
      if (!isCurrentSession(session)) return;
      setSaveState("saved"); leaveEditor(); router.push("/training?range=all"); router.refresh();
    } catch (err) {
      if (!isCurrentSession(session)) return;
      if (err instanceof ApiError && err.status === 409) { setSaveState("conflict"); setDeleteOpen(false); }
      else if (err instanceof ApiError && err.status === 404) { setSaveState("saved"); router.push("/training?range=all"); router.refresh(); return; }
      else setDeleteUncertain(!(err instanceof ApiError) || err.status >= 500);
      setError(err instanceof Error ? err.message : "删除结果未确认，请核对后重试");
    } finally { if (isCurrentSession(session)) { busyRef.current = false; setBusy(false); } }
  }

  function addExercise(exercise: TrainingExercise) {
    const item: ItemForm = exercise.kind === "cardio" ? { id: crypto.randomUUID(), name: exercise.name, kind: "cardio", durationMinutes: "", distanceKm: "", completed: false } : { id: crypto.randomUUID(), name: exercise.name, kind: "strength", mode: exercise.mode, sets: [blankSet()] };
    change({ ...formRef.current, items: [...formRef.current.items, item] });
    setPickerOpen(false);
    setSearch("");
  }

  function fillReferences() {
    change({ ...formRef.current, items: formRef.current.items.map(item => {
      const source = referenceItems.get(item.id);
      if (!source || source.kind !== item.kind) return item;
      if (source.kind === "strength" && item.kind === "strength") return { ...item, sets: item.sets.map((set, i) => { const old = source.sets[i]; return old ? { ...set, weightKg: old.weightKg?.toString() ?? "", reps: old.reps?.toString() ?? "", durationSeconds: old.durationSeconds?.toString() ?? "", completed: false } : set; }) };
      if (source.kind === "cardio" && item.kind === "cardio") return { ...item, durationMinutes: source.durationMinutes?.toString() ?? "", distanceKm: source.distanceKm?.toString() ?? "", completed: false };
      return item;
    }) });
  }

  async function beginFinish() {
    const session = editorSession.current;
    if (busyRef.current || blocked || !isCurrentSession(session)) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      const sample = await withRequestTimeout(signal => api<{ serverNow: string }>("/api/v1/training-records/clock", { signal, cache: "no-store", headers: { "X-BodyTrace-User": userId } }));
      if (!isCurrentSession(session)) return;
      clock.synchronize(sample.serverNow);
      const current = formRef.current;
      const elapsed = current.startedAt ? Math.max(1, Math.round((Date.parse(clock.read(timeZone).iso) - Date.parse(current.startedAt)) / 60000)) : null;
      setFinishDuration(current.durationMinutes || (elapsed && elapsed <= 1440 ? elapsed.toString() : ""));
      setFinishOpen(true);
    } catch (err) {
      if (!isCurrentSession(session)) return;
      setError(err instanceof Error ? `暂时无法核对训练时长：${err.message}。输入已保留，请重试。` : "暂时无法核对训练时长，输入已保留，请重试。");
    } finally {
      if (isCurrentSession(session)) { busyRef.current = false; setBusy(false); }
    }
  }

  const exerciseChoices = [...recentExercises, ...TRAINING_EXERCISES].filter((exercise, i, all) => all.findIndex(other => other.name === exercise.name && other.kind === exercise.kind && (other.kind === "cardio" || exercise.kind === "cardio" || other.mode === exercise.mode)) === i).filter(exercise => exercise.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  const statusText = busy ? "保存中…" : saveState === "new" ? "尚未创建记录" : saveState === "saved" ? "已保存到服务器" : saveState === "dirty" ? form.status === "completed" ? "有未保存的修改" : "等待自动保存…" : saveState === "conflict" ? "记录冲突，输入已保留" : saveState === "uncertain" ? "保存结果待核对" : "尚未保存，请检查输入";
  const unfinished = progress.totalSets - progress.completedSets + progress.totalCardio - progress.completedCardio;

  return <div className="mx-auto max-w-3xl space-y-6 pb-[env(safe-area-inset-bottom)]">
    <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="ghost" className="-ml-3 min-h-11" disabled={busy} onClick={() => { if (unsaved || blocked) { setLeaveTarget("/training?range=all"); setLeaveOpen(true); } else { leaveEditor(); router.push("/training?range=all"); } }}><ArrowLeft aria-hidden />训练记录</Button><p role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-muted-foreground">{busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : saveState === "saved" ? <Check className="size-4" aria-hidden /> : null}{statusText}</p></div>
    <div className="flex flex-wrap items-start justify-between gap-3"><div><p className="mb-2 text-xs font-medium tracking-wider text-muted-foreground">{form.mode === "manual" ? "事后补录" : "边练边记"} · {form.status === "completed" ? "已完成" : record ? "进行中" : "准备记录"}</p><h1 className="text-2xl font-semibold sm:text-3xl">{readOnly ? form.title : !record ? reference ? "复制一次训练" : form.mode === "live" ? "开始训练" : "补录训练" : form.mode === "live" ? "记录本次训练" : "继续补录"}</h1><p className="mt-2 text-sm leading-6 text-muted-foreground">{readOnly ? `${form.date}${form.time ? ` ${form.time}` : " · 时间未填写"} · ${record?.timeZone ?? timeZone} · 手动记录` : "每组按实际表现填写，力量和有氧可以放在同一次训练里。"}</p></div>{readOnly && <Button variant="outline" className="min-h-11" onClick={() => setReadOnly(false)}><Pencil aria-hidden />修改记录</Button>}</div>
    {reference && !readOnly && <div className="rounded-xl border bg-muted/40 p-4"><p className="text-sm leading-6">参考 {reference.date} 的「{reference.title}」。动作和组数已复制，本次实际数值留空；带入后仍需逐组确认完成。</p><Button variant="outline" className="mt-3 min-h-11" disabled={locked} onClick={fillReferences}><Copy aria-hidden />带入全部参考值</Button></div>}
    {error && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 text-sm leading-6"><p>{error}</p>{saveState === "uncertain" && <Button variant="outline" className="mt-3 min-h-11" disabled={busy} onClick={retryUnknown}>核对并重试</Button>}{saveState === "conflict" && !missingRecord && (record || recoveryEntry) && <Button variant="outline" className="mt-3 min-h-11" disabled={busy} onClick={() => setReloadOpen(true)}>加载最新记录</Button>}{saveState === "conflict" && <Button variant="outline" className="ml-2 mt-3 min-h-11" disabled={busy} onClick={() => { setLeaveTarget("/training?range=all"); setLeaveOpen(true); }}>返回训练列表</Button>}{saveState === "error" && !readOnly && <Button variant="outline" className="mt-3 min-h-11" disabled={busy} onClick={() => void save()}>重试保存</Button>}</div>}
    {!readOnly ? <fieldset disabled={locked} className="space-y-4 rounded-2xl border p-4 sm:p-5"><legend className="px-1 text-sm font-semibold">本次训练</legend>
      {!record && <div className="flex gap-2" aria-label="记录方式"><Button variant={form.mode === "live" ? "default" : "outline"} className="min-h-11 flex-1" aria-pressed={form.mode === "live"} onClick={() => { const now = clock.read(timeZone); change({ ...form, mode: "live", date: now.date, time: now.time, startedAt: now.iso }); }}>边练边记</Button><Button variant={form.mode === "manual" ? "default" : "outline"} className="min-h-11 flex-1" aria-pressed={form.mode === "manual"} onClick={() => change({ ...form, mode: "manual", time: "", startedAt: null })}>事后补录</Button></div>}
      <div className="space-y-1.5"><Label htmlFor="training-title">训练名称</Label><Input id="training-title" value={form.title} maxLength={80} onChange={event => change({ ...form, title: event.target.value })} placeholder="如：上肢力量与跑步" /></div>
      <div className="grid grid-cols-1 gap-3 min-[400px]:grid-cols-2"><div className="min-w-0 space-y-1.5"><Label htmlFor="training-date">开始日期</Label><Input id="training-date" type="date" max={currentToday} value={form.date} disabled={!record && form.mode === "live"} onChange={event => change({ ...form, date: event.target.value })} /></div><div className="min-w-0 space-y-1.5"><Label htmlFor="training-time">开始时间（可选）</Label><Input id="training-time" type="time" value={form.time} disabled={!record && form.mode === "live"} onChange={event => change({ ...form, time: event.target.value })} /></div></div>
      <p className="text-xs leading-5 text-muted-foreground">{record?.timeZone ?? timeZone} · {form.mode === "live" && !record ? "开始记录时保存当前日期和时间。" : "不知道时间可以留空。"}跨午夜训练按开始日期归档。</p>
      <div className="space-y-1.5"><Label htmlFor="training-duration">整场时长（分钟，可选）</Label><Input id="training-duration" type="number" inputMode="numeric" min={1} max={1440} step={1} value={form.durationMinutes} onChange={event => change({ ...form, durationMinutes: event.target.value })} /><p className="text-xs text-muted-foreground">包含组间休息，与下方每项有氧时长分别填写。</p></div>
      <div className="space-y-1.5"><Label htmlFor="training-note">备注（可选）</Label><textarea id="training-note" rows={2} value={form.note} maxLength={1000} onChange={event => change({ ...form, note: event.target.value })} className="w-full rounded-xl border border-input bg-background px-3 py-2 text-base outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50" placeholder="记录本次训练的感受或需要记住的事" /></div>
    </fieldset> : <div className="rounded-2xl border bg-muted/30 p-5"><div className="flex flex-wrap gap-x-6 gap-y-3 text-sm"><p>已完成 <strong className="text-lg tabular-nums">{progress.completedSets}</strong> 组力量</p><p>已完成 <strong className="text-lg tabular-nums">{progress.completedCardio}</strong> 项有氧</p><p>{form.durationMinutes ? `整场 ${form.durationMinutes} 分钟` : "整场时长未填写"}</p></div>{form.note && <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-6 text-muted-foreground">{form.note}</p>}{unfinished > 0 && <p className="mt-3 text-xs text-muted-foreground">另有 {unfinished} 组／项未完成，保留在下方，不计入完成数量。</p>}</div>}
    <div className="space-y-4">{form.items.map((item, index) => <TrainingItemEditor key={item.id} item={item} index={index} total={form.items.length} disabled={locked} readOnly={readOnly} reference={referenceItems.get(item.id)} onChange={next => change({ ...formRef.current, items: formRef.current.items.map(row => row.id === item.id ? next : row) })} onMove={direction => { const items = [...formRef.current.items]; const other = items[index + direction]; if (!other) return; items[index] = other; items[index + direction] = item; change({ ...formRef.current, items }); }} onRemove={() => setRemoveItem(item.id)} />)}
      {!readOnly && <Button variant="outline" className="min-h-14 w-full border-dashed" disabled={locked || form.items.length >= 50} onClick={() => setPickerOpen(true)}><Plus aria-hidden />添加力量动作或有氧项目{form.items.length >= 50 && "（已达上限）"}</Button>}
      {form.items.length === 0 && <p className="py-2 text-center text-sm text-muted-foreground">还没有训练项目。可以先开始，再随时添加动作。</p>}
    </div>
    {!readOnly && <div className="space-y-3 border-t pt-5"><div className="flex flex-wrap justify-end gap-3">
      {record && form.status === "inProgress" && <Button variant="outline" className="min-h-12 flex-1 sm:flex-none" disabled={busy || blocked} onClick={() => void save()}>立即保存草稿</Button>}
      {!record ? <Button className="min-h-12 w-full" disabled={busy || blocked} onClick={() => void save()}>{busy ? "创建中…" : form.mode === "live" ? "开始记录，自动保存" : "创建补录草稿"}</Button> : form.status === "inProgress" ? <Button className="min-h-12 flex-1 sm:flex-none" disabled={busy || blocked} onClick={beginFinish}><Check aria-hidden />{form.mode === "live" ? "结束训练并核对" : "核对并完成补录"}</Button> : <><Button variant="outline" className="min-h-12" disabled={busy || blocked} onClick={() => { if (saveState === "saved") setReadOnly(true); else setReloadOpen(true); }}>取消修改</Button><Button className="min-h-12" disabled={busy || blocked} onClick={async () => { await save(); if (!pendingRef.current && JSON.stringify(formRef.current) === savedFormRef.current) setReadOnly(true); }}>保存修改</Button></>}
    </div><p className="text-xs leading-5 text-muted-foreground">{!record ? "创建之后，草稿会自动保存到账号。" : form.status === "completed" ? "修改后点击保存；失败时输入会保留。" : "进行中的内容会自动保存。离开前请确认顶部显示“已保存到服务器”。"}未标记完成的内容不会计入已完成数量。</p></div>}
    {readOnly && record && <div className="flex flex-wrap gap-3"><Button nativeButton={false} render={<Link href={`/training/new?copy=${record.id}`} />} className="min-h-12"><Copy aria-hidden />复制这次训练</Button><Button nativeButton={false} render={<Link href={`/training/new?copy=${record.id}&mode=manual`} />} variant="outline" className="min-h-12">复制并补录</Button></div>}
    {record && <div className="border-t pt-6"><Button variant="ghost" className="min-h-11 text-destructive" disabled={busy || blocked} onClick={() => { setError(""); setDeleteOpen(true); }}><Trash2 aria-hidden />删除整次训练</Button></div>}

    <Dialog open={pickerOpen} onOpenChange={setPickerOpen}><DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg"><DialogHeader><DialogTitle>添加训练项目</DialogTitle><DialogDescription>最近使用排在前面。选择常用项目，也可以自定义名称和计量方式。</DialogDescription></DialogHeader><div className="relative"><Search className="absolute left-3 top-3.5 size-4 text-muted-foreground" aria-hidden /><Label htmlFor="training-search" className="sr-only">搜索或填写自定义项目名称</Label><Input id="training-search" className="pl-9" value={search} maxLength={80} onChange={event => setSearch(event.target.value)} placeholder="搜索动作，如：卧推、跑步" /></div><div className="max-h-64 space-y-1 overflow-y-auto">{exerciseChoices.map(exercise => <Button key={`${exercise.kind}-${exercise.name}-${exercise.kind === "strength" ? exercise.mode : ""}`} variant="ghost" className="h-auto min-h-11 w-full justify-between whitespace-normal py-3 text-left" onClick={() => addExercise(exercise)}><span>{exercise.name}</span><span className="ml-3 shrink-0 text-xs font-normal text-muted-foreground">{exercise.kind === "cardio" ? "有氧" : exercise.mode === "weighted" ? "负重" : exercise.mode === "bodyweight" ? "自重" : "计时"}</span></Button>)}{exerciseChoices.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">没有匹配项目，可以在下方自定义。</p>}</div><div className="space-y-3 border-t pt-4"><Label htmlFor="training-custom-mode">自定义项目的计量方式</Label><select id="training-custom-mode" className={selectClass} value={customKind} onChange={event => { const value = event.target.value; if (value === "weighted" || value === "bodyweight" || value === "timed" || value === "cardio") setCustomKind(value); }}><option value="weighted">负重力量：重量 × 次数</option><option value="bodyweight">自重：次数，可选额外负重</option><option value="timed">计时动作：持续秒数</option><option value="cardio">有氧：时长，可选距离</option></select><Button className="min-h-11 w-full" disabled={!search.trim()} onClick={() => addExercise(customKind === "cardio" ? { name: search.trim(), kind: "cardio" } : { name: search.trim(), kind: "strength", mode: customKind })}><Plus aria-hidden />添加{search.trim() ? `“${search.trim()}”` : "自定义项目"}</Button></div></DialogContent></Dialog>
    <Dialog open={finishOpen} onOpenChange={value => { if (!busy && !blocked) setFinishOpen(value); }}><DialogContent showCloseButton={!busy && !blocked} className="sm:max-w-lg"><DialogHeader><DialogTitle>核对并完成这次训练</DialogTitle><DialogDescription>已标记完成 {progress.completedSets} 组力量和 {progress.completedCardio} 项有氧。{unfinished > 0 ? `另外 ${unfinished} 组／项仍未完成，将保留为未完成，不计入完成数量。` : "请核对日期、实际数据和整场时长。"}</DialogDescription></DialogHeader><div className="space-y-2"><Label htmlFor="training-finish-duration">整场时长（分钟，可选）</Label><Input id="training-finish-duration" type="number" min={1} max={1440} step={1} value={finishDuration} disabled={busy || blocked} onChange={event => setFinishDuration(event.target.value)} /><p className="text-xs leading-5 text-muted-foreground">{form.mode === "live" ? "未填时根据实际开始时刻给出经过时长，包含休息；请核对后修改，也可以清空。" : "不知道整场时长可以留空，不会将有氧时长相加。"}</p></div>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy || blocked} onClick={() => setFinishOpen(false)}>返回修改</Button>{saveState === "uncertain" ? <Button disabled={busy} onClick={retryUnknown}>核对并重试</Button> : <Button disabled={busy || blocked} onClick={() => void save(true, finishDuration)}>{busy ? "保存中…" : "确认完成训练"}</Button>}</div>{blocked && saveState === "conflict" && <Button variant="outline" onClick={() => { setFinishOpen(false); setReloadOpen(true); }}>核对最新记录</Button>}</DialogContent></Dialog>
    <Dialog open={deleteOpen} onOpenChange={value => { if (!busy) setDeleteOpen(value); }}><DialogContent><DialogHeader><DialogTitle>删除整次训练？</DialogTitle><DialogDescription>将删除 {form.date} 的「{form.title}」及其全部动作、组和有氧数据。本页未保存的修改也会丢弃，删除后无法恢复。</DialogDescription></DialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}{deleteUncertain && <p className="text-sm text-muted-foreground">删除结果尚未确认，重试会先核对服务器状态。</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setDeleteOpen(false)}>取消</Button><Button variant="destructive" disabled={busy} onClick={removeTraining}>{busy ? "处理中…" : deleteUncertain ? "核对并重试删除" : "确认删除"}</Button></div></DialogContent></Dialog>
    <Dialog open={reloadOpen} onOpenChange={value => { if (!busy) setReloadOpen(value); }}><DialogContent><DialogHeader><DialogTitle>加载服务器中的最新记录？</DialogTitle><DialogDescription>本页尚未保存的输入会被替换。可以先返回，记下需要保留的内容，再重新加载。</DialogDescription></DialogHeader>{error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={busy} onClick={() => setReloadOpen(false)}>保留本页输入</Button><Button disabled={busy} onClick={reload}>{busy ? "读取中…" : "加载最新记录"}</Button></div></DialogContent></Dialog>
    <Dialog open={leaveOpen} onOpenChange={open => { if (!open) navigationGuard.current?.cancelLeave(); setLeaveOpen(open); }}><DialogContent><DialogHeader><DialogTitle>离开训练记录？</DialogTitle><DialogDescription>{missingRecord ? "服务器中的记录已不存在。本页保留的输入会在离开后丢失，请确认需要的内容已记下。" : blocked ? "本次保存尚未核对。本页输入会丢失，服务器中已确认保存的内容可以从训练列表继续。" : "本页仍有尚未保存的输入。返回后可继续保存；直接离开会丢失这些修改。"}</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => { navigationGuard.current?.cancelLeave(); setLeaveOpen(false); }}>继续记录</Button><Button variant="destructive" onClick={() => { if (leaveTarget === null) { navigationGuard.current?.confirmLeave(); } else { leaveEditor(); router.push(leaveTarget); } }}>放弃本页修改并离开</Button></div></DialogContent></Dialog>
    <Dialog open={removeItem != null} onOpenChange={value => { if (!value) setRemoveItem(null); }}><DialogContent><DialogHeader><DialogTitle>移除这个训练项目？</DialogTitle><DialogDescription>这个项目及已填写的组数据会从本次训练中移除。</DialogDescription></DialogHeader><div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setRemoveItem(null)}>取消</Button><Button variant="destructive" onClick={() => { change({ ...formRef.current, items: formRef.current.items.filter(item => item.id !== removeItem) }); setRemoveItem(null); }}>确认移除</Button></div></DialogContent></Dialog>
  </div>;
}
