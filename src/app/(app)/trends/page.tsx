import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, CalendarDays, ChartNoAxesCombined } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { TrendsChart } from "@/components/app/trends-chart";
import { PageHeader } from "@/components/app/page-header";
import { getSession } from "@/lib/api-auth";
import { getTrends } from "@/services/trends";

export default async function TrendsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const trends = await getTrends(session.user.id, 30);
  const recorded = trends.filter((day) => day.calories > 0);
  const avg = (pick: (day: (typeof trends)[number]) => number) => recorded.length === 0 ? 0 : Math.round(recorded.reduce((sum, day) => sum + pick(day), 0) / recorded.length);
  const stats = [
    { label: "日均热量", value: avg((day) => day.calories), unit: "千卡", dot: "bg-chart-1", note: "已记录日期的平均摄入" },
    { label: "日均蛋白质", value: avg((day) => day.protein), unit: "克", dot: "bg-chart-2", note: "已记录日期的平均摄入" },
    { label: "有记录天数", value: recorded.length, unit: `/ ${trends.length} 天`, dot: "bg-chart-3", note: "一点一滴，积累自己的节奏" },
  ];

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="看见长期的变化" title="营养趋势" description="回顾每日摄入，在记录中发现自己的饮食习惯。" action={<span className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-xs text-muted-foreground"><CalendarDays className="size-4" aria-hidden />最近 30 天</span>} />
      <div className="grid gap-4 sm:grid-cols-3">
        {stats.map((stat) => <Card key={stat.label}><CardContent><p className="flex items-center gap-2 text-xs text-muted-foreground"><span className={`size-2 rounded-full ${stat.dot}`} aria-hidden />{stat.label}</p><p className="mt-4 text-3xl font-semibold tracking-tight tabular-nums">{stat.value.toLocaleString("zh-CN")}<span className="ml-2 text-xs font-normal text-muted-foreground">{stat.unit}</span></p><p className="mt-3 text-[11px] text-muted-foreground">{stat.note}</p></CardContent></Card>)}
      </div>
      <Card>
        <CardHeader><CardTitle>热量与蛋白质</CardTitle><p className="mt-1 text-xs text-muted-foreground">每日摄入与热量目标的对比</p></CardHeader>
        <CardContent>
          {recorded.length === 0 ? <div className="flex flex-col items-center justify-center rounded-xl border border-dashed bg-muted/30 px-4 py-16 text-center"><ChartNoAxesCombined className="mb-4 size-9 text-primary/50" strokeWidth={1.4} aria-hidden /><h2 className="text-base font-medium">每一次记录，都会留下轨迹。</h2><p className="mt-2 text-sm text-muted-foreground">记录第一餐，开始积累你的营养趋势。</p><Link href="/diary" className="mt-6 flex items-center gap-2 text-sm font-medium text-primary">去记录饮食<ArrowRight className="size-4" aria-hidden /></Link></div> : <TrendsChart data={trends} />}
        </CardContent>
      </Card>
    </div>
  );
}
