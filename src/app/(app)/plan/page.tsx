/**
 * 饮食计划页（当前提供碳循环）：一周七天安排高/中/低碳日，
 * 每种日型独立目标。生效后首页、日记、趋势都按日期取当天目标。
 */
import Link from "next/link";
import { ArrowRight, CalendarRange, Gauge, Lightbulb } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { PlanEditor } from "@/components/app/plan-editor";
import { getSession } from "@/lib/api-auth";
import { getGoals } from "@/services/goals";
import { getPlan } from "@/services/plan";
import { DAY_TYPE_LABELS, WEEKDAY_LABELS, mondayIndex, resolveDayGoals } from "@/lib/plan";
import { todayStr } from "@/lib/date";

export default async function PlanPage() {
  const session = await getSession();
  const userId = session!.user.id;
  const today = todayStr();
  const [plan, baseGoals] = await Promise.all([getPlan(userId), getGoals(userId)]);
  const todayResolved = resolveDayGoals(plan, baseGoals, today);
  const todayLabel = WEEKDAY_LABELS[mondayIndex(today)];

  return (
    <div className="space-y-8">
      <PageHeader
        eyebrow="让节奏替你做决定"
        title="饮食计划"
        description="碳循环：一周里交替安排高碳日与低碳日，训练日多吃碳水、休息日控制碳水，脂肪随碳水反向调整。"
      />
      <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><CalendarRange className="size-4 text-primary" aria-hidden />{plan ? "编辑碳循环计划" : "创建碳循环计划"}</CardTitle>
            <p className="mt-2 text-xs text-muted-foreground">目标默认按「每日目标」推导：高碳日碳水 ×1.5、脂肪减半；低碳日碳水减半、脂肪 ×1.3；蛋白不变。</p>
          </CardHeader>
          <CardContent>
            <PlanEditor initialPlan={plan} baseGoals={baseGoals} today={today} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-secondary/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Gauge className="size-4 text-primary" aria-hidden />今日状态</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-7">
                今天是 <span className="font-medium text-foreground">{todayLabel}</span>，
                {todayResolved.dayType ? (
                  <>
                    计划安排为 <span className="font-medium text-foreground">{DAY_TYPE_LABELS[todayResolved.dayType]}</span>，
                    目标 <span className="font-medium text-foreground tabular-nums">{todayResolved.goals.calories.toLocaleString("zh-CN")} 千卡</span>。
                  </>
                ) : (
                  <>
                    按每日目标 <span className="font-medium text-foreground tabular-nums">{todayResolved.goals.calories.toLocaleString("zh-CN")} 千卡</span> 执行。
                  </>
                )}
              </p>
              <p className="mt-3 text-xs leading-6 text-muted-foreground">
                {plan
                  ? plan.isActive
                    ? "计划生效中：首页和饮食日记会按当天日型显示目标徽标。"
                    : "计划已停用：所有日期都按每日目标执行，配置仍保留在左侧。"
                  : "还没有计划。创建并保存后，这里会显示今天的安排。"}
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Lightbulb className="size-4 text-primary" aria-hidden />怎么排高低碳？</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-sm leading-6 text-muted-foreground">
              <p>高碳日放在<b className="font-medium text-foreground">训练日</b>：碳水支撑训练强度，热量略高于平时。</p>
              <p>低碳日放在休息日：热量缺口主要在这些天产生，脂肪上调保证饱腹感。</p>
              <p>中碳日用来过渡，或安排中等强度的活动。</p>
              <p>先保证一周总热量符合增减方向，再谈高低碳的分配；<Link href="/goals" className="text-primary underline underline-offset-2">每日目标</Link>仍是推导基准。</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>今天的摄入怎么样？</CardTitle>
            </CardHeader>
            <CardContent>
              <Link href="/" className="flex items-center justify-between border-t pt-4 text-xs text-muted-foreground transition-colors hover:text-primary">
                去今日概览看进度<ArrowRight className="size-4" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
