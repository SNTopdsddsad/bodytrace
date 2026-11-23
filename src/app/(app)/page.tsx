import { redirect } from "next/navigation";
import { EditorialJournal } from "@/components/app/editorial-journal";
import { getSession } from "@/lib/api-auth";
import { isValidDateStr, todayStr } from "@/lib/date";
import { listFoods, listRecentFoods } from "@/services/foods";
import { getDaySummary } from "@/services/meals";
import { getMeasurementDashboard } from "@/services/measurements";
import { getProfile } from "@/services/profile";
import { getRecordCounts } from "@/services/records";
import { getTrends } from "@/services/trends";

export default async function HomePage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string; modal?: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");

  const params = await searchParams;
  const today = todayStr();
  const date =
    typeof params.date === "string" && isValidDateStr(params.date)
      ? params.date
      : today;

  const initialModal =
    params.modal === "trends" ||
    params.modal === "library" ||
    params.modal === "settings"
      ? params.modal
      : null;

  const userId = session.user.id;
  const [
    daySummary,
    recentFoods,
    myFoods,
    measurementData,
    trends,
    profile,
    recordCounts,
  ] = await Promise.all([
    getDaySummary(userId, date),
    listRecentFoods(userId, 12),
    listFoods(userId),
    getMeasurementDashboard(userId, "30"),
    getTrends(userId, 30),
    getProfile(userId),
    getRecordCounts(userId),
  ]);

  return (
    <EditorialJournal
      key={`${date}:${initialModal ?? ""}`}
      date={date}
      today={today}
      daySummary={daySummary}
      recentFoods={recentFoods}
      myFoods={myFoods}
      measurementData={measurementData}
      trends={trends}
      profile={profile}
      recordCounts={recordCounts}
      initialModal={initialModal}
    />
  );
}
