import { redirect } from "next/navigation";
import { PageHeader } from "@/components/app/page-header";
import { MeasurementsManager } from "@/components/app/measurements-manager";
import { getSession } from "@/lib/api-auth";
import { MEASUREMENT_RANGES } from "@/lib/measurements";
import type { MeasurementRange } from "@/lib/measurements";
import { getMeasurementDashboard } from "@/services/measurements";

export default async function MeasurementsPage({ searchParams }: { searchParams: Promise<{ range?: string | string[] }> }) {
  const session = await getSession();
  if (!session) redirect("/login");
  const params = await searchParams;
  const range: MeasurementRange = typeof params.range === "string" && MEASUREMENT_RANGES.includes(params.range as MeasurementRange) ? params.range as MeasurementRange : "30";
  const data = await getMeasurementDashboard(session.user.id, range);
  return <div className="space-y-6"><PageHeader eyebrow="每次测量，都留下一点变化" title="身体变化" description="持续记录体重、体脂率和血压，按日期回看真实数据。" /><MeasurementsManager data={data} /></div>;
}
