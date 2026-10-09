"use client";

/**
 * 日记页顶部的日期切换器：前一天 / 后一天 / 回到今天 / 直接选日期。
 */
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { todayStr } from "@/lib/date";

export function DateNav({ date }: { date: string }) {
  const router = useRouter();

  /** 跳到指定日期：只改 URL 上的 ?date= 参数，服务端组件会重新渲染 */
  function go(next: string) {
    router.push(`/diary?date=${next}`);
  }

  function shift(days: number) {
    const d = new Date(`${date}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + days);
    go(d.toISOString().slice(0, 10));
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-xl border bg-card p-1.5">
      <Button variant="ghost" size="icon" onClick={() => shift(-1)} title="前一天" aria-label="前一天">
        <ChevronLeft className="size-4" aria-hidden />
      </Button>

      <Input
        type="date"
        className="h-10 w-36 border-0 bg-transparent shadow-none sm:w-40"
        aria-label="记录日期"
        value={date}
        max={todayStr()}
        onChange={(e) => e.target.value && go(e.target.value)}
      />
      {date !== todayStr() && (
        <Button variant="secondary" size="sm" onClick={() => go(todayStr())}>
          今天
        </Button>
      )}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => shift(1)}
        disabled={date >= todayStr()}
        title="后一天"
        aria-label="后一天"
      >
        <ChevronRight className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
