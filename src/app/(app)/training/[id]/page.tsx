import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { TrainingEditor } from "@/components/app/training-editor";
import { getSession } from "@/lib/api-auth";
import { todayStr } from "@/lib/date";
import { getTrainingRecord, listTrainingRecords } from "@/services/training";
import { recentTrainingExercises } from "../training-page-data";

export default async function TrainingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const [entry, records] = await Promise.all([
    getTrainingRecord(session.user.id, id),
    listTrainingRecords(session.user.id, { range: "all", kind: "all", status: "all" }),
  ]);
  if (!entry) notFound();
  return <TrainingEditor key={`${session.user.id}:${entry.id}`} initial={entry} serverNow={new Date().toISOString()} userId={session.user.id} initialRecord={entry} today={todayStr()} timeZone={process.env.APP_TIMEZONE ?? "Asia/Shanghai"} reference={null} recentExercises={recentTrainingExercises(records)} />;
}
