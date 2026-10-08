/**
 * 首页·今日总览：今天吃了多少、离目标还差多少，一眼看清。
 * 服务端组件：数据在服务器上查好，直接渲染成 HTML 发给浏览器。
 */
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MacroBars } from "@/components/app/macro-bars";
import { NutritionRing } from "@/components/app/nutrition-ring";
import { MEAL_STYLES } from "@/components/app/meal-styles";
import { getSession } from "@/lib/api-auth";
import { formatDateCn, todayStr } from "@/lib/date";
import { getDaySummary } from "@/services/meals";

export default async function TodayPage() {
  const session = await getSession();
  // 类型收窄：布局已保证登录，这里一定能拿到
  const userId = session!.user.id;

  const today = todayStr();
  const { totals, goals, byMeal } = await getDaySummary(userId, today);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">今日概览</h1>
          <p className="text-sm text-muted-foreground">{formatDateCn(today)}</p>
        </div>
        {/* render 属性让按钮内部渲染成 Link（Base UI 的组合方式，替代旧版 asChild）；
            nativeButton={false} 告诉它渲染的不是原生 <button>，别按按钮语义处理 */}
        <Button render={<Link href="/diary" />} nativeButton={false}>
          记一笔
        </Button>
      </div>

      {/* 热量环 + 宏量进度条并排（手机上下堆叠）。
          左卡用绿色渐变底制造视觉焦点 */}
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-xl border bg-gradient-to-br from-emerald-50 via-teal-50 to-sky-50 dark:from-emerald-950/40 dark:via-teal-950/30 dark:to-sky-950/30">
          <div className="flex items-center justify-center py-6">
            <NutritionRing consumed={totals.calories} goal={goals.calories} />
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">宏量营养素</CardTitle>
          </CardHeader>
          <CardContent className="pb-6">
            <MacroBars totals={totals} goals={goals} />
            <p className="mt-4 text-xs text-muted-foreground">
              目标可在
              <Link href="/goals" className="mx-0.5 underline underline-offset-2">
                目标设置
              </Link>
              里修改
            </p>
          </CardContent>
        </Card>
      </div>

      {/* 按餐次速览：每餐用专属色 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {byMeal.map((m) => {
          const kcal = Math.round(m.entries.reduce((sum, e) => sum + e.calories, 0));
          const style = MEAL_STYLES[m.mealType];
          const MealIcon = style.icon;
          return (
            <Link
              key={m.mealType}
              href="/diary"
              className={`rounded-xl border border-t-4 p-3 transition-all hover:-translate-y-0.5 hover:shadow-md ${style.topBar}`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{m.label}</span>
                <span className={`flex size-7 items-center justify-center rounded-full ${style.chip}`}>
                  <MealIcon className="size-3.5" aria-hidden />
                </span>
              </div>
              <div className={`mt-1.5 text-2xl font-bold tabular-nums ${style.value}`}>
                {kcal}
                <span className="ml-0.5 text-xs font-normal text-muted-foreground">千卡</span>
              </div>
              <div className="text-xs text-muted-foreground">{m.entries.length} 条记录</div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
