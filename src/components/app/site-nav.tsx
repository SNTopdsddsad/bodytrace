"use client";

import { Suspense, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  BookOpen,
  CalendarDays,
  ChartNoAxesCombined,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  Lock,
  LogOut,
  Monitor,
  Moon,
  Pill,
  Settings2,
  Sun,
  UserRound,
  Utensils,
} from "lucide-react";
import { motion } from "motion/react";
import { useTheme } from "next-themes";
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
import { clearDeepSeekConfig, maskApiKey } from "@/lib/deepseek-client";
import {
  buildWeekStripDays,
  dispatchOpenModal,
  formatShortDate,
  type EditorialModalName,
} from "@/lib/editorial-events";
import { maskPhoneNumber } from "@/lib/phone-number";
import type { SupplementRecentDay } from "@/lib/supplements";
import { Brand } from "./brand";
import {
  DeepSeekConfigDialog,
  OPEN_DEEPSEEK_CONFIG_EVENT,
  useDeepSeekConfig,
} from "./deepseek-config-dialog";
import { TAB_SPRING, TAP_SPRING } from "./motion-provider";

export type NavUser = {
  id: string;
  name: string;
  email: string;
  phoneNumber: string | null;
  phoneNumberVerified: boolean;
};

export type RecentDaySummary = {
  date: string;
  calories: number;
};

export type NavSupplementSummary = {
  todayPlanned: number;
  todayCompleted: number;
  todayTaken: number;
  recentDays: SupplementRecentDay[];
};

function WeekStrip({
  today,
  recentDays,
  supplementDays,
  scope,
  isPending,
  navigate,
}: {
  today: string;
  recentDays: RecentDaySummary[];
  supplementDays: SupplementRecentDay[];
  scope: "desktop" | "mobile";
  isPending: boolean;
  navigate: (href: string) => void;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const rawDate = searchParams.get("date");
  const selectedDate = rawDate && isValidDateStr(rawDate) ? rawDate : today;
  const isSupplements = pathname === "/supplements";
  const targetBase = pathname === "/diary" ? "/diary" : isSupplements ? "/supplements" : "/";

  const calMap = new Map(recentDays.map((d) => [d.date, Math.round(d.calories)]));
  const supMap = new Map(supplementDays.map((d) => [d.date, d]));
  const { days, tomorrow, showsToday } = buildWeekStripDays(selectedDate, today);
  const recentWindowStart = shiftDate(today, -14);

  function goDate(next: string) {
    if (!isValidDateStr(next) || next > today || next === selectedDate) return;
    navigate(next === today && (targetBase === "/" || targetBase === "/supplements") ? targetBase : `${targetBase}?date=${next}`);
  }

  return (
    <div
      className={`relative flex w-full max-w-full min-w-0 items-center gap-1 rounded-xl border bg-background p-1 transition-opacity lg:w-auto ${
        isPending ? "opacity-85" : ""
      }`}
      role="group"
      aria-label="日期周历切换"
      aria-busy={isPending}
    >
      <motion.button
        type="button"
        whileTap={{ scale: 0.9 }}
        transition={TAP_SPRING}
        onClick={() => goDate(shiftDate(selectedDate, -1))}
        className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
        title="前一天"
        aria-label="切换到前一天"
      >
        <ChevronLeft className="size-4" aria-hidden />
      </motion.button>

      <div className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto">
        {days.map((d) => {
          const active = d.date === selectedDate;
          const kcal = calMap.get(d.date);
          const sup = supMap.get(d.date);
          const inWindow = d.date >= recentWindowStart && d.date <= today;
          let subText: string;
          if (isSupplements) {
            if (sup && sup.planned > 0) {
              subText =
                sup.completed >= sup.planned
                  ? `${sup.completed}/${sup.planned} 已服`
                  : `${sup.completed}/${sup.planned} 次`;
            } else if (sup && sup.taken > 0) {
              subText = `已记 ${sup.taken} 次`;
            } else if (inWindow) {
              subText = d.isToday ? "今日待记" : "未记录";
            } else {
              subText = d.isToday ? "今日" : "查看";
            }
          } else {
            subText =
              kcal !== undefined
                ? `${kcal} kcal`
                : inWindow
                  ? d.isToday
                    ? "今日待记"
                    : "未记录"
                  : d.isToday
                    ? "今日"
                    : "查看";
          }

          return (
            <motion.button
              key={d.date}
              type="button"
              whileTap={{ scale: 0.96 }}
              transition={TAP_SPRING}
              onClick={() => goDate(d.date)}
              aria-pressed={active}
              className={`relative shrink-0 rounded-lg px-2 py-1 text-left text-[11px] transition-colors sm:px-3 sm:text-xs ${
                active
                  ? "font-semibold text-primary-foreground"
                  : "text-muted-foreground hover:bg-card/80 hover:text-foreground"
              }`}
            >
              {active && (
                <motion.span
                  layoutId={`week-strip-active-${scope}`}
                  transition={TAB_SPRING}
                  className="absolute inset-0 rounded-lg bg-primary shadow-xs"
                  aria-hidden
                />
              )}
              <div className="relative z-10 font-mono whitespace-nowrap">
                {d.short} {d.label}
              </div>
              <div
                className={`relative z-10 text-[10px] sm:text-[11px] tabular-nums whitespace-nowrap ${
                  active ? "opacity-85" : "opacity-75"
                }`}
              >
                {subText}
              </div>
            </motion.button>
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
          <motion.button
            type="button"
            whileTap={{ scale: 0.9 }}
            transition={TAP_SPRING}
            onClick={() => goDate(shiftDate(selectedDate, 1))}
            className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-card hover:text-foreground"
            title="后一天"
            aria-label="切换到后一天"
          >
            <ChevronRight className="size-4" aria-hidden />
          </motion.button>
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

      {isPending && (
        <span
          className="pointer-events-none absolute inset-x-2 bottom-0 h-0.5 animate-pulse rounded-full bg-primary/60"
          aria-hidden
        />
      )}
    </div>
  );
}

function WeekStripFallback() {
  return <div className="h-11 w-64 animate-pulse rounded-xl bg-muted" aria-hidden />;
}

const THEME_OPTIONS = [
  { id: "light", label: "浅色", icon: Sun },
  { id: "dark", label: "深色", icon: Moon },
  { id: "system", label: "跟随系统", icon: Monitor },
] as const;

export function SiteNav({
  user,
  today,
  foodsCount,
  recentDays,
  supplementSummary,
  children,
}: {
  children: React.ReactNode;
  user: NavUser;
  today: string;
  foodsCount: number;
  recentDays: RecentDaySummary[];
  supplementSummary: NavSupplementSummary;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, resolvedTheme, setTheme } = useTheme();
  const [accountOpen, setAccountOpen] = useState(false);
  const [aiConfigOpen, setAiConfigOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const deepSeekConfig = useDeepSeekConfig(user.id);

  const [switchingDate, startDateTransition] = useTransition();

  useEffect(() => {
    const onOpenAiConfig = () => setAiConfigOpen(true);
    window.addEventListener(OPEN_DEEPSEEK_CONFIG_EVENT, onOpenAiConfig);
    return () => window.removeEventListener(OPEN_DEEPSEEK_CONFIG_EVENT, onOpenAiConfig);
  }, []);

  function navigateDate(href: string) {
    startDateTransition(() => router.push(href));
  }

  const isHome = pathname === "/";

  function triggerModal(modal: Exclude<EditorialModalName, "auth">) {
    if (isHome) {
      dispatchOpenModal(modal);
      return;
    }
    router.push(`/?modal=${modal}`);
  }

  function quickToggleTheme() {
    setTheme(resolvedTheme === "dark" ? "light" : "dark");
  }

  async function handleLogout() {
    setSigningOut(true);
    try {
      const { error } = await authClient.signOut();
      if (error) {
        toast.error("退出登录失败，请重试。");
        return;
      }
      // 退出登录时同步清除本机保存的 DeepSeek API Key 与 Base URL
      clearDeepSeekConfig();
      setAccountOpen(false);
      setAiConfigOpen(false);
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
        <header className="rounded-2xl border bg-card/95 px-4 py-2.5 shadow-[0_4px_20px_-12px_#233e2e2b] backdrop-blur-md">
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* 左侧：品牌与副标题 / 返回手账 */}
            <div className="flex items-center gap-3">
              <Link href="/" aria-label="BodyTrace 主手账" className="shrink-0">
                <Brand />
              </Link>
              {!isHome && (
                <Link
                  href="/"
                  className="inline-flex items-center gap-1 rounded-xl border bg-background px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-secondary/70"
                >
                  <ArrowLeft className="size-3.5 text-primary" aria-hidden />
                  返回主手账
                </Link>
              )}
            </div>

            {/* 中央：桌面端胶囊周历 */}
            <div className="hidden lg:block">
              <Suspense fallback={<WeekStripFallback />}>
                <WeekStrip
                  today={today}
                  recentDays={recentDays}
                  supplementDays={supplementSummary.recentDays}
                  isPending={switchingDate}
                  navigate={navigateDate}
                  scope="desktop"
                />
              </Suspense>
            </div>

            {/* 右侧：补剂独立页 + 三个杂志浮层触发器 + 明暗切换 + 账号按钮 */}
            <div className="flex items-center gap-2">
              <Link
                href="/supplements"
                aria-current={pathname === "/supplements" ? "page" : undefined}
                className={`hidden items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors md:inline-flex ${
                  pathname === "/supplements"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:border-primary/40 hover:bg-secondary/70"
                }`}
              >
                <Pill
                  className={`size-3.5 ${
                    pathname === "/supplements" ? "text-primary-foreground" : "text-primary"
                  }`}
                  aria-hidden
                />
                <span>每日补剂</span>
                {(supplementSummary.todayPlanned > 0 || supplementSummary.todayTaken > 0) && (
                  <span
                    className={`rounded-full border px-1.5 py-0.2 font-mono text-[11px] tabular-nums ${
                      pathname === "/supplements"
                        ? "border-white/30 bg-white/15 text-primary-foreground"
                        : "border-primary/15 bg-secondary text-secondary-foreground"
                    }`}
                  >
                    {supplementSummary.todayPlanned > 0
                      ? `${supplementSummary.todayCompleted}/${supplementSummary.todayPlanned}`
                      : supplementSummary.todayTaken}
                  </span>
                )}
              </Link>
              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={TAP_SPRING}
                onClick={() => triggerModal("trends")}
                className={`hidden items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors md:inline-flex ${
                  pathname === "/trends"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:border-primary/40 hover:bg-secondary/70"
                }`}
              >
                <ChartNoAxesCombined
                  className={`size-3.5 ${
                    pathname === "/trends" ? "text-primary-foreground" : "text-primary"
                  }`}
                  aria-hidden
                />
                <span>营养 &amp; 体重趋势</span>
              </motion.button>

              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={TAP_SPRING}
                onClick={() => triggerModal("library")}
                className={`hidden items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors md:inline-flex ${
                  pathname === "/foods"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:border-primary/40 hover:bg-secondary/70"
                }`}
              >
                <Utensils
                  className={`size-3.5 ${
                    pathname === "/foods" ? "text-primary-foreground" : "text-primary"
                  }`}
                  aria-hidden
                />
                <span>我的食物库</span>
                <span
                  className={`rounded-full border px-1.5 py-0.2 font-mono text-[11px] tabular-nums ${
                    pathname === "/foods"
                      ? "border-white/30 bg-white/15 text-primary-foreground"
                      : "border-primary/15 bg-secondary text-secondary-foreground"
                  }`}
                >
                  {foodsCount}
                </span>
              </motion.button>

              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={TAP_SPRING}
                onClick={() => triggerModal("settings")}
                className={`hidden items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors md:inline-flex ${
                  pathname === "/goals" || pathname === "/profile"
                    ? "border-primary bg-primary text-primary-foreground"
                    : "bg-background text-foreground hover:border-primary/40 hover:bg-secondary/70"
                }`}
              >
                <Settings2
                  className={`size-3.5 ${
                    pathname === "/goals" || pathname === "/profile"
                      ? "text-primary-foreground"
                      : "text-primary"
                  }`}
                  aria-hidden
                />
                <span>目标与数据</span>
              </motion.button>

              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={TAP_SPRING}
                onClick={() => setAiConfigOpen(true)}
                className="hidden items-center gap-1.5 rounded-xl border bg-background px-3 py-2 text-xs font-semibold text-foreground transition-colors hover:border-primary/40 hover:bg-secondary/70 sm:inline-flex"
                title="配置仅保存在本机的 DeepSeek 官方 API Key 与 Base URL"
              >
                <span
                  className={`size-1.5 rounded-full ${
                    deepSeekConfig ? "bg-primary" : "bg-chart-3"
                  }`}
                  aria-hidden
                />
                <KeyRound className="size-3.5 text-primary" aria-hidden />
                <span>{deepSeekConfig ? "AI 已配置" : "配置 AI"}</span>
              </motion.button>

              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.92 }}
                transition={TAP_SPRING}
                onClick={quickToggleTheme}
                className="flex size-8 items-center justify-center rounded-xl border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:bg-secondary/70 hover:text-primary"
                title="切换浅色 / 深色模式"
                aria-label="切换浅色或深色外观"
              >
                <Moon className="size-3.5 dark:hidden" aria-hidden />
                <Sun className="hidden size-3.5 dark:block" aria-hidden />
              </motion.button>

              <motion.button
                type="button"
                whileHover={{ y: -1 }}
                whileTap={{ scale: 0.96 }}
                transition={TAP_SPRING}
                onClick={() => setAccountOpen(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground shadow-xs transition-opacity hover:opacity-90"
                aria-label="查看账号与会话"
              >
                <UserRound className="size-3.5" aria-hidden />
                <span className="max-w-24 truncate">{user.name}</span>
              </motion.button>
            </div>
          </div>

          {/* 移动端周历条 */}
          <div className="mt-2.5 w-full min-w-0 border-t pt-2.5 lg:hidden">
            <Suspense fallback={<WeekStripFallback />}>
              <WeekStrip
                today={today}
                recentDays={recentDays}
                supplementDays={supplementSummary.recentDays}
                isPending={switchingDate}
                navigate={navigateDate}
                scope="mobile"
              />
            </Suspense>
          </div>
        </header>
      </div>

      {/* 移动端底部快捷栏 */}
      <nav
        aria-label="移动端快捷导航"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t bg-card/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
      >
        <Link
          href="/"
          aria-current={isHome ? "page" : undefined}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            isHome ? "text-primary font-semibold" : "text-muted-foreground"
          }`}
        >
          <BookOpen className="size-4" aria-hidden />
          主手账
        </Link>
        <Link
          href="/supplements"
          aria-current={pathname === "/supplements" ? "page" : undefined}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            pathname === "/supplements" ? "text-primary font-semibold" : "text-muted-foreground"
          }`}
        >
          <Pill className="size-4" aria-hidden />
          补剂
        </Link>
        <button
          type="button"
          onClick={() => triggerModal("trends")}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            pathname === "/trends" ? "text-primary font-semibold" : "text-muted-foreground"
          }`}
        >
          <ChartNoAxesCombined className="size-4" aria-hidden />
          趋势
        </button>
        <button
          type="button"
          onClick={() => triggerModal("library")}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            pathname === "/foods" ? "text-primary font-semibold" : "text-muted-foreground"
          }`}
        >
          <Utensils className="size-4" aria-hidden />
          食物库
        </button>
        <button
          type="button"
          onClick={() => triggerModal("settings")}
          className={`flex min-h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium ${
            pathname === "/goals" || pathname === "/profile"
              ? "text-primary font-semibold"
              : "text-muted-foreground"
          }`}
        >
          <Settings2 className="size-4" aria-hidden />
          设置
        </button>
      </nav>

      {/* 账号与外观浮层 */}
      <Dialog open={accountOpen} onOpenChange={setAccountOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl p-6">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-base font-bold">
              <UserRound className="size-4 text-primary" aria-hidden />
              账号与外观
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
              <span className="shrink-0 rounded-full border border-primary/20 bg-secondary px-2.5 py-0.5 font-mono text-[11px] font-medium text-secondary-foreground">
                已登录
              </span>
            </div>

            {/* 外观模式切换 */}
            <div className="space-y-1.5">
              <p className="font-medium text-muted-foreground">界面外观</p>
              <div className="grid grid-cols-3 gap-1 rounded-xl border bg-background p-1">
                {THEME_OPTIONS.map((opt) => {
                  const Icon = opt.icon;
                  const active = (theme ?? "light") === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTheme(opt.id)}
                      aria-pressed={active}
                      className={`relative flex items-center justify-center gap-1.5 rounded-lg py-2 font-medium transition-colors ${
                        active
                          ? "text-primary-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {active && (
                        <motion.span
                          layoutId="theme-mode-pill"
                          transition={TAB_SPRING}
                          className="absolute inset-0 rounded-lg bg-primary"
                          aria-hidden
                        />
                      )}
                      <span className="relative z-10 inline-flex items-center gap-1.5">
                        <Icon className="size-3.5" aria-hidden />
                        {opt.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="font-medium text-muted-foreground">独立页面入口</p>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { href: "/", label: "主手账视图", icon: BookOpen },
                  { href: "/supplements", label: "每日补剂记录", icon: Pill },
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
                      className="flex items-center gap-2 rounded-xl border bg-background px-3 py-2.5 font-medium transition-colors hover:border-primary/40 hover:bg-secondary/50"
                    >
                      <Icon className="size-3.5 text-primary" aria-hidden />
                      <span>{item.label}</span>
                    </Link>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <p className="font-medium text-muted-foreground">AI 营养估算（本地配置）</p>
              <button
                type="button"
                onClick={() => {
                  setAccountOpen(false);
                  setAiConfigOpen(true);
                }}
                className="flex w-full items-center justify-between gap-2 rounded-xl border bg-background px-3 py-2.5 text-left transition-colors hover:border-primary/40 hover:bg-secondary/50"
              >
                <span className="inline-flex min-w-0 items-center gap-2 font-medium">
                  <KeyRound className="size-3.5 shrink-0 text-primary" aria-hidden />
                  <span className="truncate">
                    {deepSeekConfig
                      ? `DeepSeek 官方直连 · ${maskApiKey(deepSeekConfig.apiKey)}`
                      : "配置 DeepSeek 官方 API Key"}
                  </span>
                </span>
                <span className="shrink-0 font-mono text-[11px] text-primary">
                  {deepSeekConfig ? "修改" : "去配置"}
                </span>
              </button>
              <p className="text-[11px] text-muted-foreground">
                密钥仅保存于当前浏览器，退出登录时会自动清除。
              </p>
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

      <DeepSeekConfigDialog
        userId={user.id}
        open={aiConfigOpen}
        onOpenChange={setAiConfigOpen}
      />

      <main
        id="main-content"
        inert={switchingDate}
        aria-busy={switchingDate}
        className="mx-auto w-full min-w-0 max-w-[1520px] px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:pb-10"
      >
        {children}
      </main>
    </>
  );
}
