/**
 * 首页·今日总览：今天吃了多少、离目标还差多少，一眼看清。
 * 服务端组件：数据在服务器上查好，直接渲染成 HTML 发给浏览器。
 */
import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MacroBars } from "@/components/app/macro-bars";
import { NutritionRing } from "@/components/app/nutrition-ring";
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
        {/* render 属性让按钮内部渲染成 Link（Base UI 的组合方式，替代旧版 asChild） */}
        <Button render={<Link href="/diary" />}>记一笔</Button>
      </div>

      {/* 热量环 + 宏量进度条并排（手机上下堆叠） */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="flex items-center justify-center py-6">
            <NutritionRing consumed={totals.calories} goal={goals.calories} />
          </CardContent>
        </Card>
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

      {/* 按餐次速览 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">今日各餐</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-3 pb-6 md:grid-cols-4">
          {byMeal.map((m) => {
            const kcal = Math.round(
              m.entries.reduce((sum, e) => sum + e.calories, 0),
            );
            return (
              <Link
                key={m.mealType}
                href="/diary"
                className="rounded-lg border p-3 transition-colors hover:bg-muted"
              >
                <div className="text-sm text-muted-foreground">{m.label}</div>
                <div className="mt-1 text-xl font-semibold tabular-nums">
                  {kcal}
                  <span className="ml-0.5 text-xs font-normal text-muted-foreground">
                    千卡
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {m.entries.length} 条记录
                </div>
              </Link>
            );
          })}
        </CardContent>
      </Card>
    </div>
  );
}
