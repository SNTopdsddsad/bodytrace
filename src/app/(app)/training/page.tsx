import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { TrainingHistory } from "@/components/app/training-history";
import { getSession } from "@/lib/api-auth";
import { TRAINING_FILTERS, TRAINING_RANGES } from "@/lib/training";
import { listTrainingRecords } from "@/services/training";

export default async function TrainingPage({ searchParams }: { searchParams: Promise<{ range?: string | string[]; kind?: string | string[] }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const query = await searchParams;
  const range = TRAINING_RANGES.find(value => value === query.range) ?? "30";
  const kind = TRAINING_FILTERS.find(value => value === query.kind) ?? "all";
  const entries = await listTrainingRecords(session.user.id, { range, kind, status: "all" });
  return <div className="space-y-6"><PageHeader eyebrow="把每次训练留下来" title="训练记录" description="边练边记，或补录一次训练；按日期回看力量、有氧和混合训练。" /><TrainingHistory entries={entries} range={range} kind={kind} /></div>;
}
