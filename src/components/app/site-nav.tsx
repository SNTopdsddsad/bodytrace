"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  Lock,
  LogOut,
  Settings2,
  UserRound,
  Utensils,
  BookOpen,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { authClient } from "@/lib/auth-client";
import { isValidDateStr, shiftDate } from "@/lib/date";
import {
  buildWeekStripDays,
  dispatchOpenModal,
  formatShortDate,
  type EditorialModalName,
} from "@/lib/editorial-events";
import { maskPhoneNumber } from "@/lib/phone-number";
import { Brand } from "./brand";

export type NavUser = {
  name: string;
  email: string;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
};

export type RecentDaySummary = {
  date: string;
  calories: number;
};

function WeekStrip({
  today,
  recentDays,
}: {
  today: string;
  recentDays: RecentDaySummary[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const rawDate = searchParams.get("date");
  const selectedDate = rawDate && isValidDateStr(rawDate) ? rawDate : today;
  const targetBase = pathname === "/diary" ? "/diary" : "/";

  const calMap = new Map(recentDays.map((d) => [d.date, Math.round(d.calories)]));
  const { days, tomorrow, showsToday } = buildWeekStripDays(selectedDate, today);
  const recentWindowStart = shiftDate(today, -14);

  function goDate(next: string) {
    if (!isValidDateStr(next) || next > today) return;
    router.push(next === today && targetBase === "/" ? "/" : `${targetBase}?date=${next}`);
  }

  return (
    <div
      className="flex w-full max-w-full min-w-0 items-center gap-1 rounded-xl border bg-background p-1 lg:w-auto"
      role="group"
      aria-label="日期周历切换"
    >
      <button
        type="button"
        onClick={() => goDate(shiftDate(selectedDate, -1))}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        title="前一天"
        aria-label="切换到前一天"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </button>

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {days.map((d) => {
          const active = d.date === selectedDate;
          const kcal = calMap.get(d.date);
          const inWindow = d.date >= recentWindowStart && d.date <= today;
          const subText =
            kcal !== undefined && kcal > 0
              ? `${kcal} kcal`
              : inWindow
                ? d.isToday
                  ? "今日待记"
                  : "未记录"
                : d.isToday
                  ? "今日"
                  : "查看";

          return (
            <button
              key={d.date}
              type="button"
              onClick={() => goDate(d.date)}
              aria-pressed={active}
              className={`shrink-0 rounded-lg px-2 py-1 text-left text-[11px] transition-colors sm:px-3 sm:text-xs ${
                active
                  ? "bg-primary font-semibold text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:bg-card hover:text-foreground"
              }`}
            >
              <div className="font-mono whitespace-nowrap">
                {d.short} {d.label}
              </div>
              <div className={`text-[10px] sm:text-[11px] tabular-nums whitespace-nowrap ${active ? "opacity-85" : "opacity-75"}`}>
                {subText}
              </div>
            </button>
          );
        })}

        {showsToday ? (
          <span
            className="hidden shrink-0 cursor-not-allowed items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-mono text-muted-foreground opacity-45 xl:inline-flex"
            title="不能记录未来日期"
          >
            {formatShortDate(tomorrow)} 明天
            <Lock className="size-3" aria-hidden />
          </span>
        ) : (
          <button
            type="button"
            onClick={() => goDate(shiftDate(selectedDate, 1))}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            title="后一天"
            aria-label="切换到后一天"
          >
            <ChevronRight className="size-4" aria-hidden />
          </button>
        )}
      </div>

      <label
        className="relative flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        title="选择任意历史日期"
      >
        <CalendarDays className="size-4" aria-hidden />
        <span className="sr-only">选择日期</span>
        <input
          type="date"
          aria-label="选择历史日期"
          value={selectedDate <= today ? selectedDate : today}
          max={today}
          onChange={(e) => e.target.value && goDate(e.target.value)}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
    </div>
  );
}

function WeekStripFallback() {
  return <div className="h-11 w-64 animate-pulse rounded-xl bg-muted" aria-hidden />;
}

export function SiteNav({
  user,
  today,
  foodsCount,
  recentDays,
}: {
  user: NavUser;
  today: string;
  foodsCount: number;
  recentDays: RecentDaySummary[];
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const isHome = pathname === "/";

  function triggerModal(modal: Exclude<EditorialModalName, "auth">) {
    if (isHome) {
      dispatchOpenModal(modal);
      return;
    }
    router.push(`/?modal=${modal}`);
  }

  async function handleLogout() {
    setSigningOut(true);
    try {
      const { error } = await authClient.signOut();
      if (error) {
        toast.error("退出登录失败，请重试。");
        return;
      }
      setAccountOpen(false);
      router.push("/login");
      router.refresh();
    } finally {
      setSigningOut(false);
    }
  }

  const accountIdentity =
    user.phoneNumber && user.phoneNumberVerified
      ? maskPhoneNumber(user.phoneNumber)
      : user.email;

  return (
    <>
      <a
        href="#main-content"
        className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-card px-3 py-2 text-xs font-medium shadow-md focus:not-sr-only"
      >
        跳到主要内容
      </a>

      <div className="sticky top-0 z-30 mx-auto w-full max-w-[1520px] px-3 pt-3 sm:px-6">
        <header className="rounded-2xl border bg-card/95 px-4 py-2.5 shadow-xs backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* 左侧：品牌与副标题 / 返回手账 */}
            <div className="flex items-center gap-3">
              <Link href="/" aria-label="BodyTrace 主手账" className="shrink-0">
                <Brand />
              </Link>
              {isHome ? (
                <div className="hidden 2xl:block">
                  <span className="rounded-full border bg-background px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
                    一屏主手账
                  </span>
                </div>
              ) : (
                <Link
                  href="/"
                  className="inline-flex items-center gap-1 rounded-xl border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary"
                >
                  <ArrowLeft className="size-3.5" aria-hidden />
                  返回主手账
                </Link>
              )}
            </div>

            {/* 中央：桌面端胶囊周历 */}
            <div className="hidden lg:block">
              <Suspense fallback={<WeekStripFallback />}>
                <WeekStrip today={today} recentDays={recentDays} />
              </Suspense>
            </div>

            {/* 右侧：三个杂志浮层触发器 + 账号按钮 */}
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => triggerModal("trends")}
                className={`hidden items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors md:inline-flex ${
                  pathname === "/trends"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:border-primary"
                }`}
              >
                <ChartNoAxesCombined className="size-3.5" aria-hidden />
                <span>营养 &amp; 体重趋势</span>
              </button>

              <button
                type="button"
                onClick={() => triggerModal("library")}
                className={`hidden items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors md:inline-flex ${
                  pathname === "/foods"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:border-primary"
                }`}
              >
                <Utensils className="size-3.5" aria-hidden />
                <span>我的食物库</span>
                <span
                  className={`rounded-full border px-1.5 py-0.2 font-mono text-[11px] tabular-nums ${
                    pathname === "/foods"
                      ? "border-white/30 bg-white/15 text-primary-foreground"
                      : "bg-card text-muted-foreground"
                  }`}
                >
                  {foodsCount}
                </span>
              </button>

              <button
                type="button"
                onClick={() => triggerModal("settings")}
                className={`hidden items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors md:inline-flex ${
                  pathname === "/goals" || pathname === "/profile"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:border-primary"
                }`}
              >
                <Settings2 className="size-3.5" aria-hidden />
                <span>目标与数据</span>
              </button>

              <button
                type="button"
                onClick={() => setAccountOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition-opacity hover:opacity-90"
                aria-label="查看账号与会话"
              >
                <UserRound className="size-3.5" aria-hidden />
                <span className="max-w-24 truncate">{user.name}</span>
              </button>
            </div>
          </div>

          {/* 移动端周历条 */}
          <div className="mt-2.5 w-full min-w-0 border-t pt-2.5 lg:hidden">
            <Suspense fallback={<WeekStripFallback />}>
              <WeekStrip today={today} recentDays={recentDays} />
            </Suspense>
          </div>
        </header>
      </div>

      {/* 移动端底部快捷栏 */}
      <nav
        aria-label="移动端快捷导航"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
      >
        <Link
          href="/"
          aria-current={isHome ? "page" : undefined}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            isHome ? "text-foreground font-semibold" : "text-muted-foreground"
          }`}
        >
          <BookOpen className="size-4" aria-hidden />
          主手账
        </Link>
        <button
          type="button"
          onClick={() => triggerModal("trends")}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            pathname === "/trends" ? "text-foreground font-semibold" : "text-muted-foreground"
          }`}
        >
          <ChartNoAxesCombined className="size-4" aria-hidden />
          趋势
        </button>
        <button
          type="button"
          onClick={() => triggerModal("library")}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            pathname === "/foods" ? "text-foreground font-semibold" : "text-muted-foreground"
          }`}
        >
          <Utensils className="size-4" aria-hidden />
          食物库 ({foodsCount})
        </button>
        <button
          type="button"
          onClick={() => triggerModal("settings")}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            pathname === "/goals" || pathname === "/profile"
              ? "text-foreground font-semibold"
              : "text-muted-foreground"
          }`}
        >
          <Settings2 className="size-4" aria-hidden />
          目标与数据
        </button>
      </nav>

      {/* 账号与会话浮层 */}
      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <UserRound className="size-4" aria-hidden />
              账号与当前会话
            </DialogTitle>
            <DialogDescription>
              所有身体指标、饮食记录与照片均严格隔离在当前登录账号下。
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 text-xs">
            <div className="flex items-center justify-between rounded-xl border bg-background p-3.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold">{user.name}</div>
                <div className="mt-0.5 truncate font-mono text-muted-foreground">
                  {accountIdentity}
                </div>
              </div>
              <span className="shrink-0 rounded-full border bg-card px-2.5 py-0.5 font-mono text-[11px] text-foreground">
                已登录
              </span>
            </div>

            <div className="space-y-1.5">
              <p className="font-medium text-muted-foreground">独立页面入口</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { href: "/", label: "主手账视图", icon: BookOpen },
                  { href: "/measurements", label: "完整身体变化", icon: Activity },
                  { href: "/foods", label: "完整食物库", icon: Utensils },
                  { href: "/trends", label: "完整营养趋势", icon: ChartNoAxesCombined },
                  { href: "/goals", label: "目标设置页", icon: Settings2 },
                  { href: "/profile", label: "个人资料与安全", icon: UserRound },
                ].map((item) => {
                  const Icon = item.icon;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setAccountOpen(false)}
                      className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 font-medium transition-colors hover:border-primary"
                    >
                      <Icon className="size-3.5 text-muted-foreground" aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="border-t pt-3">
              <Button
                variant="outline"
                className="w-full justify-center gap-2 text-destructive hover:border-destructive hover:text-destructive"
                disabled={signingOut}
                onClick={handleLogout}
              >
                <LogOut className="size-4" aria-hidden />
                {signingOut ? "正在退出…" : "退出当前登录"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
