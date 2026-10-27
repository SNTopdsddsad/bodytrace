import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { TrainingEditor } from "@/components/app/training-editor";
import { getSession } from "@/lib/api-auth";
import { isValidDateStr, todayStr } from "@/lib/date";
import { copyTraining, newTraining } from "@/lib/training";
import type { TrainingInput } from "@/lib/training";
import { getTrainingRecord, listTrainingRecords } from "@/services/training";
import { recentTrainingExercises } from "../training-page-data";

export default async function NewTrainingPage({ searchParams }: { searchParams: Promise<{ mode?: string | string[]; copy?: string | string[]; date?: string | string[] }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const query = await searchParams;
  const mode: TrainingInput["mode"] = query.mode === "manual" ? "manual" : "live";
  const today = todayStr();
  const timeZone = process.env.APP_TIMEZONE ?? "Asia/Shanghai";
  const now = new Date();
  const time = mode === "live" ? new Intl.DateTimeFormat("en-GB", { timeZone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(now) : null;
  const date = mode === "manual" && typeof query.date === "string" && isValidDateStr(query.date) && query.date <= today ? query.date : today;
  if (query.copy !== undefined && (typeof query.copy !== "string" || !z.uuid().safeParse(query.copy).success)) notFound();
  const [reference, records] = await Promise.all([
    typeof query.copy === "string" ? getTrainingRecord(session.user.id, query.copy) : null,
    listTrainingRecords(session.user.id, { range: "all", kind: "all", status: "all" }),
  ]);
  if (query.copy && !reference) notFound();
  const input = reference ? { ...copyTraining(reference, date, time), mode, startedAt: mode === "live" ? now.toISOString() : null } : newTraining(mode, date, time, now.toISOString());
  return <TrainingEditor key={`${session.user.id}:${mode}:${reference?.id ?? "new"}:${date}`} initial={input} serverNow={new Date().toISOString()} userId={session.user.id} initialRecord={null} today={today} timeZone={timeZone} reference={reference} recentExercises={recentTrainingExercises(records)} />;
}
