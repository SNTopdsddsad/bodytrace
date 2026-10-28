/**
 * 饮食计划页：按天编写一周饮食——先设每天目标，再填三餐食物。
 * 摄入由食物库实时折算；计划没有版本历史，保存会整体覆盖起始日（含）之后所有日期。
 */
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarRange, Gauge, ListChecks } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { PlanEditor } from "@/components/app/plan-editor";
import { getSession } from "@/lib/api-auth";
import { todayStr } from "@/lib/date";
import { MEAL_LABELS, type MealType } from "@/lib/nutrition";
import type { MacroGoals, PlanItem } from "@/lib/plan";
import {
  WEEKDAY_LABELS,
  mondayIndex,
  planItemsForDay,
  resolveDayGoals,
  summarizePlanDay,
} from "@/lib/plan";
import { getGoals } from "@/services/goals";
import { getPlan } from "@/services/plan";

const GOAL_FIELDS = [
  { key: "calories", label: "热量", unit: "千卡" },
  { key: "protein", label: "蛋白质", unit: "克" },
  { key: "carbs", label: "碳水", unit: "克" },
  { key: "fat", label: "脂肪", unit: "克" },
] as const satisfies readonly { key: keyof MacroGoals; label: string; unit: string }[];

const DAY_MEALS = ["breakfast", "lunch", "dinner"] as const satisfies readonly MealType[];

/** 早/午/晚固定展示；旧数据里有加餐项时追加，保证列表与合计口径一致（合计见 summarizePlanDay） */
function mealGroupsForDay(items: PlanItem[]): MealType[] {
  return items.some((item) => item.mealType === "snack") ? [...DAY_MEALS, "snack"] : [...DAY_MEALS];
}

/** 某餐已安排的食物行（营养为 null 表示食物已被删除） */
function itemsForMeal(items: PlanItem[], mealType: MealType) {
  return items.filter((item) => item.mealType === mealType);
}

export default async function PlanPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const userId = session.user.id;
  const today = todayStr();
  const [plan, baseGoals] = await Promise.all([getPlan(userId), getGoals(userId)]);
  const todayIndex = mondayIndex(today);
  // 今天的目标来源：计划启用且覆盖今天 → 来自计划，否则按每日目标
  const todayResolved = resolveDayGoals(plan, baseGoals, today);
  // 只有计划今天生效（fromPlan）才整理计划里的餐次；停用或起始日在未来时为 null，不展示清单与合计
  const todayPlan = todayResolved.fromPlan
    ? {
        items: planItemsForDay(plan?.items ?? [], todayIndex),
        summary: summarizePlanDay(plan?.items ?? [], todayIndex),
      }
    : null;

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="先定目标，再排三餐"
        title="饮食计划"
        description="按天编写一周饮食：先设每天目标，再填三餐食物。"
      />
      <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card id="plan-editor">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarRange className="size-4 text-primary" aria-hidden />
              {plan ? "编辑饮食计划" : "创建饮食计划"}
            </CardTitle>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              周一到周日各一张卡：先填热量 / 蛋白 / 碳水 / 脂肪四个目标，再为早餐、午餐、晚餐添加食物。食物行按食物库每 100g 数值乘克数实时折算，改克数立刻重算；计划里不保存营养快照，所以食物库数值变了，计划里的摄入也会跟着变。保存是整份覆盖，起始日（含）之后所有日期（含过去）的目标与三餐食物都会被替换。
            </p>
          </CardHeader>
          <CardContent>
            <PlanEditor initialPlan={plan} baseGoals={baseGoals} today={today} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-secondary/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Gauge className="size-4 text-primary" aria-hidden />
                今日状态
              </CardTitle>
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                今天是 {WEEKDAY_LABELS[todayIndex]}（{today}），今天的目标
                {todayResolved.fromPlan ? "来自计划" : "按每日目标"}。
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-2">
                {GOAL_FIELDS.map((field) => (
                  <div key={field.key} className="rounded-lg border bg-card px-2.5 py-2">
                    <p className="text-[11px] text-muted-foreground">{field.label}</p>
                    <p className="mt-0.5 text-sm font-medium tabular-nums">
                      {todayResolved.goals[field.key].toLocaleString("zh-CN")}
                      <span className="ml-1 text-[11px] font-normal text-muted-foreground">
                        {field.unit}
                      </span>
                    </p>
                  </div>
                ))}
              </div>

              {todayPlan ? (
                <div className="space-y-2">
                  <p className="text-xs font-medium">今天安排的餐次</p>
                  {mealGroupsForDay(todayPlan.items).map((mealType) => {
                    const mealItems = itemsForMeal(todayPlan.items, mealType);
                    const mealCalories = mealItems.reduce(
                      (sum, item) => sum + (item.calories ?? 0),
                      0,
                    );
                    return (
                      <div key={mealType} className="rounded-lg border bg-card px-2.5 py-2">
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-xs font-medium">{MEAL_LABELS[mealType]}</p>
                          <p className="text-[11px] tabular-nums text-muted-foreground">
                            {Math.round(mealCalories)} 千卡
                          </p>
                        </div>
                        {mealItems.length === 0 ? (
                          <p className="mt-1 text-[11px] text-muted-foreground">还没有安排食物</p>
                        ) : (
                          <ul className="mt-1 space-y-0.5">
                            {mealItems.map((item) => (
                              <li
                                key={item.id}
                                className="flex items-baseline justify-between gap-2 text-[11px]"
                              >
                                <span className="min-w-0 truncate">
                                  {item.name} · {item.grams} g
                                </span>
                                <span className="shrink-0 tabular-nums text-muted-foreground">
                                  {item.calories === null
                                    ? "食物已删除"
                                    : `${Math.round(item.calories)} 千卡`}
                                </span>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="rounded-lg border bg-card px-2.5 py-2">
                  <p className="text-xs font-medium">今天不在计划生效范围内</p>
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    今天按上面的每日目标执行，不展示计划里的食物清单与合计。
                  </p>
                  <Link
                    href="#plan-editor"
                    className="mt-1.5 inline-flex items-center gap-1 text-[11px] text-primary underline underline-offset-2"
                  >
                    去编辑计划
                    <ArrowRight className="size-3" aria-hidden />
                  </Link>
                </div>
              )}

              {todayPlan && (
                <div className="rounded-lg border bg-card px-2.5 py-2">
                  <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                    <p className="text-xs font-medium">今天计划合计</p>
                    <p className="text-[11px] tabular-nums text-muted-foreground">
                      {Math.round(todayPlan.summary.totals.calories)} 千卡 · 蛋白{" "}
                      {Math.round(todayPlan.summary.totals.protein)}g · 碳水{" "}
                      {Math.round(todayPlan.summary.totals.carbs)}g · 脂肪{" "}
                      {Math.round(todayPlan.summary.totals.fat)}g
                    </p>
                  </div>
                  {todayPlan.summary.missing > 0 && (
                    <p className="mt-1 text-[11px] text-destructive">
                      有 {todayPlan.summary.missing} 项食物已删除，未计入合计。
                    </p>
                  )}
                  <p className="mt-1 text-[11px] leading-5 text-muted-foreground">
                    合计与上面各餐小计口径相同，是计划里各餐食物的折算值，不代表今天实际吃了什么。
                  </p>
                </div>
              )}

              <p className="text-[11px] leading-5 text-muted-foreground">
                {!plan
                  ? "还没有计划。填好左侧的目标与三餐并保存后，这里会显示今天的安排。"
                  : !plan.isActive
                    ? "计划已停用：所有日期都按每日目标执行，配置仍保留在左侧。"
                    : todayResolved.fromPlan
                      ? "计划生效中：起始日（含）之后按当天目标与三餐安排。"
                      : `计划起始日是 ${plan.startDate}，还没到：今天仍按每日目标执行。`}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ListChecks className="size-4 text-primary" aria-hidden />
                怎么排这一周
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>先填四个目标数字，再为每一餐挑食物；每餐小计与全天合计会立刻算出来。</p>
              <p>
                摄入按食物库每 100g 的数值乘克数折算，计划本身不保存营养快照；改食物库里的数值，计划里的摄入会一起变。
              </p>
              <p>
                参考库条目不是你的个人食物：选中后会先抄进个人食物库再被计划引用，和日记页用的是同一个入口。
              </p>
              <p>
                保存会整体替换起始日（含）之后所有日期的目标与三餐食物，没有版本历史可回退。未写计划或被停用的日期仍按
                <Link href="/goals" className="mx-1 text-primary underline underline-offset-2">
                  每日目标
                </Link>
                执行。
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>今天的实际摄入</CardTitle>
            </CardHeader>
            <CardContent>
              <Link
                href="/"
                className="flex items-center justify-between border-t pt-4 text-xs text-muted-foreground transition-colors hover:text-primary"
              >
                去今日概览看记录进度
                <ArrowRight className="size-4" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
