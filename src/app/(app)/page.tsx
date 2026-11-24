import { redirect } from "next/navigation";
import { EditorialJournal } from "@/components/app/editorial-journal";
import { getSession } from "@/lib/api-auth";
import { isValidDateStr, todayStr } from "@/lib/date";
import type { MealType } from "@/lib/nutrition";
import { listFoods, listRecentFoods } from "@/services/foods";
import { getDaySummary } from "@/services/meals";
import { getMeasurementDashboard, getRecentBloodPressure } from "@/services/measurements";
import { getProfile } from "@/services/profile";
import { getRecordCounts } from "@/services/records";
import { getTrends } from "@/services/trends";

function inferDefaultMeal(): MealType {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: process.env.APP_TIMEZONE ?? "Asia/Shanghai",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 12);
  const minute = Number(parts.find((p) => p.type === "minute")?.value ?? 0);
  const mins = hour * 60 + minute;

  if (mins < 10 * 60 + 30) return "breakfast";
  if (mins < 14 * 60 + 30) return "lunch";
  if (mins < 17 * 60) return "snack";
  if (mins < 21 * 60) return "dinner";
  return "snack";
}

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
    recentBloodPressure,
    trends,
    profile,
    recordCounts,
  ] = await Promise.all([
    getDaySummary(userId, date),
    listRecentFoods(userId, 12),
    listFoods(userId),
    getMeasurementDashboard(userId, "30"),
    getRecentBloodPressure(userId),
    getTrends(userId, 30),
    getProfile(userId),
    getRecordCounts(userId),
  ]);

  return (
    <EditorialJournal
      key={initialModal ?? "journal"}
      userId={userId}
      date={date}
      today={today}
      defaultMeal={inferDefaultMeal()}
      daySummary={daySummary}
      recentFoods={recentFoods}
      myFoods={myFoods}
      measurementData={{ ...measurementData, recentBloodPressure }}
      trends={trends}
      profile={profile}
      recordCounts={recordCounts}
      initialModal={initialModal}
    />
  );
}
