import { Flame, Target } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { DateNav } from "@/components/app/date-nav";
import { MacroBars } from "@/components/app/macro-bars";
import { MealSection } from "@/components/app/meal-section";
import { PageHeader } from "@/components/app/page-header";
import { getSession } from "@/lib/api-auth";
import { formatDateCn, isValidDateStr, todayStr } from "@/lib/date";
import { getDaySummary } from "@/services/meals";
import Link from "next/link";

export default async function DiaryPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const session = await getSession();
  const params = await searchParams;
  const date = typeof params.date === "string" && isValidDateStr(params.date) ? params.date : todayStr();
  const { totals, goals, byMeal, goalSource } = await getDaySummary(session!.user.id, date);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="每一餐，都有迹可循" title="饮食日记" description={formatDateCn(date)} action={<DateNav date={date} />} />
      <div className="grid items-start gap-6 xl:grid-cols-[300px_minmax(0,1fr)]">
        <Card className="[--card-spacing:--spacing(4)] sm:[--card-spacing:--spacing(6)] xl:sticky xl:top-8">
          <CardContent>
            <div className="flex flex-wrap items-center justify-between gap-3 xl:block">
              <div><h2 className="flex items-center gap-2 text-sm font-medium"><Flame className="size-4 text-primary" aria-hidden />当日营养小结</h2><p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground"><Link href="/plan" className="rounded-full bg-secondary px-2 py-0.5 text-[11px] font-medium text-primary">{goalSource === "plan" ? "按计划" : "按每日目标"}</Link>目标 {goals.calories.toLocaleString("zh-CN")} 千卡</p></div>
              <div className="xl:mt-5"><p className="text-[11px] text-muted-foreground">已摄入</p><p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums xl:text-4xl">{Math.round(totals.calories).toLocaleString("zh-CN")}<span className="ml-1.5 text-xs font-normal text-muted-foreground">千卡</span></p></div>
            </div>
            <div className="my-4 border-t xl:my-6" />
            <MacroBars totals={totals} goals={goals} compact />
            <Link href="/goals" className="mt-4 flex items-center gap-2 border-t pt-3 text-xs text-primary"><Target className="size-3.5" aria-hidden />调整营养目标</Link>
          </CardContent>
        </Card>
        <div className="min-w-0 space-y-4">
          {byMeal.map((meal) => <MealSection key={meal.mealType} date={date} mealType={meal.mealType} label={meal.label} entries={meal.entries} />)}
        </div>
      </div>
    </div>
  );
}
