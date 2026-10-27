"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Copy, Dumbbell, Footprints, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { TRAINING_RANGES, trainingKind, trainingProgress } from "@/lib/training";
import type { TrainingRecord, TrainingRange, TrainingFilter } from "@/lib/training";

const kindLabels = { all: "全部类型", strength: "力量", cardio: "有氧", mixed: "混合", empty: "待添加项目" };
const kinds: TrainingFilter[] = ["all", "strength", "cardio", "mixed"];

export function TrainingHistory({ entries, range, kind }: {
  entries: TrainingRecord[];
  range: TrainingRange;
  kind: TrainingFilter;
}) {
  const router = useRouter();
  const [visible, setVisible] = useState(30);
  const ongoing = entries.filter(entry => entry.status === "inProgress");
  const completed = entries.filter(entry => entry.status === "completed");

  function change(nextRange: TrainingRange, nextKind: TrainingFilter) {
    setVisible(30);
    router.push(`/training?range=${nextRange}&kind=${nextKind}`);
  }

  function row(entry: TrainingRecord) {
    const progress = trainingProgress(entry);
    const category = trainingKind(entry);
    return <li key={entry.id} className="flex flex-wrap items-center gap-3 py-5 first:pt-0 last:pb-0">
      <Link href={`/training/${entry.id}`} className="group flex min-w-0 flex-1 items-start gap-3 rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-ring">
        <span className="mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">{category === "cardio" ? <Footprints className="size-5" aria-hidden /> : <Dumbbell className="size-5" aria-hidden />}</span>
        <div className="min-w-0"><p className="break-words text-base font-semibold group-hover:underline">{entry.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{entry.date}{entry.time ? ` ${entry.time}` : " · 时间未填写"} · {kindLabels[category]} · {entry.durationMinutes == null ? "整场时长未填写" : `${entry.durationMinutes} 分钟`}</p><p className="mt-1 text-sm text-muted-foreground">已完成 {progress.completedSets} / {progress.totalSets} 组力量 · {progress.completedCardio} / {progress.totalCardio} 项有氧</p></div>
      </Link>
      <div className="ml-auto flex items-center gap-1">
        <Button nativeButton={false} render={<Link href={`/training/${entry.id}`} />} variant="ghost" className="min-h-11">{entry.status === "inProgress" ? entry.mode === "manual" ? "继续补录" : "继续训练" : "查看"}<ArrowRight className="size-4" aria-hidden /></Button>
        {entry.status === "completed" && <Button nativeButton={false} render={<Link href={`/training/new?copy=${entry.id}`} />} variant="outline" className="min-h-11" aria-label={`复制 ${entry.title}`}><Copy className="size-4" aria-hidden /><span className="hidden sm:inline">复制</span></Button>}
      </div>
    </li>;
  }

  return <div className="space-y-6">
    <div className="grid gap-3 sm:grid-cols-2">
      <Button nativeButton={false} render={<Link href="/training/new?mode=live" />} size="lg" className="h-auto min-h-16 justify-start rounded-2xl px-5 py-4"><Dumbbell className="size-5" aria-hidden /><span className="text-left"><span className="block text-base">开始一次训练</span><span className="mt-1 block text-xs font-normal opacity-80">边练边记，退出后可以继续</span></span></Button>
      <Button nativeButton={false} render={<Link href="/training/new?mode=manual" />} size="lg" variant="outline" className="h-auto min-h-16 justify-start rounded-2xl px-5 py-4"><Plus className="size-5" aria-hidden /><span className="text-left"><span className="block text-base">补录已完成的训练</span><span className="mt-1 block text-xs font-normal text-muted-foreground">选择日期，填写实际训练内容</span></span></Button>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap gap-1 rounded-xl bg-muted p-1" aria-label="训练类型">{kinds.map(item => <Button key={item} variant={item === kind ? "outline" : "ghost"} size="sm" className="min-h-11" aria-pressed={item === kind} onClick={() => change(range, item)}>{kindLabels[item]}</Button>)}</div>
      <div className="flex flex-wrap gap-1" aria-label="训练日期范围">{TRAINING_RANGES.map(item => <Button key={item} variant={item === range ? "outline" : "ghost"} size="sm" className="min-h-11" aria-pressed={item === range} onClick={() => change(item, kind)}>{item === "all" ? "全部日期" : `近 ${item} 天`}</Button>)}</div>
    </div>
    {ongoing.length > 0 && <section aria-labelledby="ongoing-heading"><h2 id="ongoing-heading" className="mb-3 text-lg font-semibold">继续记录 <span className="text-sm font-normal text-muted-foreground">{ongoing.length} 次</span></h2><Card><CardContent className="py-5"><ul className="divide-y">{ongoing.map(row)}</ul></CardContent></Card></section>}
    <section aria-labelledby="history-heading"><h2 id="history-heading" className="mb-3 text-lg font-semibold">训练历史 <span className="text-sm font-normal text-muted-foreground">{completed.length} 次</span></h2><Card><CardContent className="py-5">{completed.length === 0 ? <div className="py-10 text-center"><Dumbbell className="mx-auto mb-3 size-7 text-muted-foreground" aria-hidden /><p className="font-medium">这个范围还没有已完成的训练</p><p className="mx-auto mt-2 max-w-sm text-sm leading-6 text-muted-foreground">开始训练或事后补录，力量与有氧可以记在同一次训练中。确认完成后会显示在这里。</p></div> : <><ul className="divide-y">{completed.slice(0, visible).map(row)}</ul>{visible < completed.length && <Button variant="outline" className="mt-5 w-full" onClick={() => setVisible(count => count + 30)}>显示更多训练</Button>}</>}</CardContent></Card></section>
    <p className="text-xs leading-5 text-muted-foreground">日期按训练开始日期归档；整场时长包含休息，与各项有氧时长分别记录。未完成的组和项目保留，但不计入已完成数量。</p>
  </div>;
}
