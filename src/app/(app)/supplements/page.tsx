import { redirect } from "next/navigation";
import { SupplementsManager } from "@/components/app/supplements-manager";
import { getSession } from "@/lib/api-auth";
import { isValidDateStr, todayStr } from "@/lib/date";
import { getSupplementDashboard } from "@/services/supplements";

export default async function SupplementsPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string | string[] }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  const params = await searchParams;
  const today = todayStr();
  const rawDate = typeof params.date === "string" ? params.date : null;
  const date = rawDate && isValidDateStr(rawDate) ? rawDate : today;
  const data = await getSupplementDashboard(session.user.id, date);

  return <SupplementsManager data={data} />;
}
