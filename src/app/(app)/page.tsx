import Link from "next/link";
import { ArrowRight, CalendarDays, Check, ChevronRight, Plus, Target, Utensils } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { MacroBars } from "@/components/app/macro-bars";
import { NutritionRing } from "@/components/app/nutrition-ring";
import { PageHeader } from "@/components/app/page-header";
import { MEAL_STYLES } from "@/components/app/meal-styles";
import { getSession } from "@/lib/api-auth";
import { formatDateCn, todayStr } from "@/lib/date";
import { getDaySummary } from "@/services/meals";

export default async function TodayPage() {
  const session = await getSession();
  const today = todayStr();
  const { totals, goals, byMeal, goalSource } = await getDaySummary(session!.user.id, today);
  const entries = byMeal.flatMap((meal) => meal.entries.map((entry) => ({ ...entry, mealLabel: meal.label })));
  const recordedMeals = byMeal.filter((meal) => meal.entries.length > 0 || meal.photos.length > 0).length;
  const progress = goals.calories > 0 ? Math.round((totals.calories / goals.calories) * 100) : 0;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="每一天，都值得好好记录" title="今日概览" description={`${session!.user.name}，从今天的每一餐，了解自己的饮食节奏。`}
        action={<div className="flex flex-wrap items-center gap-3"><span className="flex items-center gap-2 text-xs text-muted-foreground"><CalendarDays className="size-4" aria-hidden />{formatDateCn(today)}</span><Button render={<Link href="/diary" />} nativeButton={false}><Plus className="size-4" aria-hidden />记录饮食</Button></div>} />

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <section className="relative overflow-hidden rounded-2xl bg-(--brand-deep) p-6 text-white sm:p-7" aria-labelledby="energy-title">
          <div className="pointer-events-none absolute -right-14 -top-24 size-72 rounded-full border border-white/10" aria-hidden />
          <div className="relative flex items-center justify-between"><h2 id="energy-title" className="text-sm font-medium text-white/85">每日能量</h2><div className="flex items-center gap-2"><Link href="/plan" className="rounded-full bg-(--brand-light) px-3 py-1 text-[11px] font-medium text-(--brand-deep)">{goalSource === "plan" ? "按计划" : "按每日目标"}</Link><span className="rounded-full bg-white/10 px-3 py-1 text-[11px] text-(--brand-pale)">已完成 {progress}%</span></div></div>
          <div className="relative mt-5 flex flex-col-reverse items-center justify-between gap-6 min-[520px]:flex-row">
            <div className="w-full min-[520px]:w-auto">
              <p className="text-xs text-white/60">今日已摄入</p>
              <p className="mt-2 text-[2.6rem] leading-none font-semibold tracking-tight tabular-nums">{Math.round(totals.calories).toLocaleString("zh-CN")}<span className="ml-2 text-sm font-normal text-white/60">千卡</span></p>
              <div className="mt-6 flex items-center gap-2 text-xs text-white/70"><Target className="size-4 text-(--brand-light)" aria-hidden />{goalSource === "plan" ? "今日目标" : "每日目标"} <span className="font-medium text-white">{goals.calories.toLocaleString("zh-CN")}</span> 千卡</div>
            </div>
            <NutritionRing consumed={totals.calories} goal={goals.calories} inverse />
          </div>
          <div className="relative mt-6 flex items-center gap-2 border-t border-white/15 pt-4 text-xs text-white/65"><span className="size-1.5 rounded-full bg-(--brand-light)" aria-hidden />{recordedMeals === 0 ? "今天的记录，从第一餐开始。" : `已记录 ${recordedMeals} 餐，共 ${entries.length} 项食物。`}</div>
        </section>
        <Card className="justify-between">
          <CardHeader className="flex items-center justify-between"><CardTitle>营养摄入</CardTitle><span className="text-xs text-muted-foreground">已摄入 / 目标</span></CardHeader>
          <CardContent><MacroBars totals={totals} goals={goals} /></CardContent>
          <CardContent><Link href="/goals" className="flex items-center justify-between border-t pt-4 text-xs text-muted-foreground transition-colors hover:text-primary">调整每日营养目标<ArrowRight className="size-4" aria-hidden /></Link></CardContent>
        </Card>
      </div>

      <section aria-labelledby="meals-title">
        <div className="mb-4 flex items-center justify-between"><h2 id="meals-title" className="text-lg font-semibold">今日餐次<span className="ml-3 text-xs font-normal text-muted-foreground">{recordedMeals} / 4 已记录</span></h2><Link href="/diary" className="flex items-center gap-1 text-xs text-primary">查看日记<ChevronRight className="size-4" aria-hidden /></Link></div>
        <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          {byMeal.map((meal) => {
            const kcal = Math.round(meal.entries.reduce((sum, entry) => sum + entry.calories, 0));
            const style = MEAL_STYLES[meal.mealType];
            const MealIcon = style.icon;
            return (
              <Link key={meal.mealType} href={`/diary#meal-${meal.mealType}`} className="group rounded-2xl border bg-card p-4 transition-colors hover:border-primary/35 hover:bg-secondary/30 sm:p-5">
                <div className="flex items-center justify-between"><span className={`flex size-10 items-center justify-center rounded-xl ${style.chip}`}><MealIcon className="size-5" strokeWidth={1.7} aria-hidden /></span><ChevronRight className="size-4 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" aria-hidden /></div>
                <h3 className="mt-4 text-sm font-medium">{meal.label}</h3>
                <p className="mt-1.5 text-2xl font-semibold tracking-tight tabular-nums">{meal.entries.length === 0 && meal.photos.length > 0 ? "—" : kcal}<span className="ml-1.5 text-xs font-normal text-muted-foreground">千卡</span></p>
                <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">{meal.entries.length > 0 ? <><Check className="size-3 text-primary" aria-hidden />{meal.entries.length} 项食物</> : meal.photos.length > 0 ? <>{meal.photos.length} 张照片 · 待补食物</> : <><Plus className="size-3" aria-hidden />添加记录</>}</p>
              </Link>
            );
          })}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[1.3fr_1fr]">
        <Card>
          <CardHeader className="flex items-center justify-between"><CardTitle>今日食物记录</CardTitle><Utensils className="size-4 text-muted-foreground" aria-hidden /></CardHeader>
          <CardContent>
            {entries.length === 0 ? <div className="flex flex-col items-center rounded-xl border border-dashed bg-muted/30 px-4 py-7 text-center"><span className="mb-3 flex size-10 items-center justify-center rounded-full bg-secondary text-primary"><Utensils className="size-4" aria-hidden /></span><p className="text-sm font-medium">今天吃了什么？</p><p className="mt-1.5 text-xs text-muted-foreground">记录一餐，热量和营养就会在这里汇总。</p><Link href="/diary" className="mt-4 flex items-center gap-1 text-xs font-medium text-primary">开始记录<ArrowRight className="size-3.5" aria-hidden /></Link></div> : <ul className="divide-y">{entries.slice(0, 4).map((entry) => <li key={entry.id} className="flex items-center justify-between gap-3 py-3 first:pt-0"><div className="min-w-0"><p className="truncate text-sm font-medium">{entry.name}</p><p className="mt-1 text-xs text-muted-foreground">{entry.mealLabel} · {entry.grams} g</p></div><p className="shrink-0 text-sm font-semibold tabular-nums">{Math.round(entry.calories)}<span className="ml-1 text-xs font-normal text-muted-foreground">千卡</span></p></li>)}</ul>}
            {entries.length > 4 && <Link href="/diary" className="mt-3 block text-xs text-primary">查看全部 {entries.length} 项记录 →</Link>}
          </CardContent>
        </Card>
        <div className="flex flex-col justify-between rounded-2xl border border-border bg-secondary p-6">
          <div><span className="text-[11px] font-medium tracking-[0.14em] text-primary">让记录更轻松</span><h2 className="mt-3 text-xl leading-relaxed font-semibold">把常吃的食物，<br />留在自己的食物库。</h2><p className="mt-3 max-w-sm text-sm leading-6 text-muted-foreground">收藏常用食物，下次记录时快速找到。每一餐，都可以少一点繁琐。</p></div>
          <Link href="/foods" className="mt-5 flex items-center gap-2 text-sm font-medium text-primary">整理我的食物库<ArrowRight className="size-4" aria-hidden /></Link>
        </div>
      </div>
    </div>
  );
}
