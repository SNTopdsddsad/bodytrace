/**
 * 饮食日记页：按日期查看/编辑四餐的记录。
 * URL 形如 /diary?date=2026-10-08，不带参数时默认今天。
 */
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { DateNav } from "@/components/app/date-nav";
import { MacroBars } from "@/components/app/macro-bars";
import { MealSection } from "@/components/app/meal-section";
import { getSession } from "@/lib/api-auth";
import { formatDateCn, isValidDateStr, todayStr } from "@/lib/date";
import { getDaySummary } from "@/services/meals";

export default async function DiaryPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const session = await getSession();
  const userId = session!.user.id;

  // URL 参数校验：不合法就回落到今天
  const params = await searchParams;
  const date =
    typeof params.date === "string" && isValidDateStr(params.date) ? params.date : todayStr();

  const { totals, goals, byMeal } = await getDaySummary(userId, date);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">饮食日记</h1>
          <p className="text-sm text-muted-foreground">{formatDateCn(date)}</p>
        </div>
        <DateNav date={date} />
      </div>

      {/* 当日小结条 */}
      <Card>
        <CardContent className="flex flex-col gap-4 py-4 md:flex-row md:items-center">
          <div className="shrink-0 md:w-40">
            <div className="text-3xl font-bold tabular-nums">
              {Math.round(totals.calories)}
              <span className="ml-1 text-sm font-normal text-muted-foreground">千卡</span>
            </div>
            <div className="text-xs text-muted-foreground">目标 {goals.calories} 千卡</div>
            <Link
              href="/goals"
              className="text-xs underline underline-offset-2 text-muted-foreground hover:text-foreground"
            >
              修改目标
            </Link>
          </div>
          <div className="flex-1">
            <MacroBars totals={totals} goals={goals} />
          </div>
        </CardContent>
      </Card>

      {/* 四个餐次区块 */}
      <div className="space-y-4">
        {byMeal.map((m) => (
          <MealSection
            key={m.mealType}
            date={date}
            mealType={m.mealType}
            label={m.label}
            entries={m.entries}
          />
        ))}
      </div>
    </div>
  );
}
