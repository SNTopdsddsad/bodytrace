"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { BookOpen, CalendarRange, ChartNoAxesCombined, ChevronRight, LayoutDashboard, Leaf, LogOut, Target, UserRound, Utensils } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";
import { Brand } from "./brand";

const LINKS = [
  { href: "/", label: "今日概览", short: "今日", icon: LayoutDashboard },
  { href: "/diary", label: "饮食日记", short: "日记", icon: BookOpen },
  { href: "/foods", label: "我的食物库", short: "食物库", icon: Utensils },
  { href: "/trends", label: "营养趋势", short: "趋势", icon: ChartNoAxesCombined },
  { href: "/goals", label: "目标设置", short: "目标", icon: Target },
] as const;

/** 侧边栏的次要入口：不占移动端底部导航的五个位置。 */
const SIDEBAR_LINKS = [
  { href: "/plan", label: "饮食计划", icon: CalendarRange },
  { href: "/profile", label: "个人资料", icon: UserRound },
] as const;

export function SiteNav({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const isActive = (href: string) => href === "/" ? pathname === "/" : pathname.startsWith(href);

  async function handleLogout() {
    const { error } = await authClient.signOut();
    if (error) {
      toast.error("退出登录失败，请重试。");
      return;
    }
    router.push("/login");
    router.refresh();
  }

  return (
    <>
      <a href="#main-content" className="sr-only fixed left-4 top-4 z-50 rounded-lg bg-card p-3 focus:not-sr-only">跳到主要内容</a>
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-60 flex-col overflow-y-auto border-r bg-card lg:flex">
        <Link href="/" className="px-7 pb-10 pt-9" aria-label="BodyTrace 首页"><Brand /></Link>
        <p className="px-8 pb-3 text-[11px] tracking-[0.18em] text-muted-foreground">我的健康记录</p>
        <nav aria-label="主导航" className="space-y-1.5 px-4">
          {LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-colors ${isActive(href) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
              {label}
              {isActive(href) && <ChevronRight className="ml-auto size-4 opacity-60" aria-hidden />}
            </Link>
          ))}
          <div className="my-3 border-t" />
          {SIDEBAR_LINKS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined}
              className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium transition-colors ${isActive(href) ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}>
              <Icon className="size-[18px]" strokeWidth={1.8} aria-hidden />
              {label}
              {isActive(href) && <ChevronRight className="ml-auto size-4 opacity-60" aria-hidden />}
            </Link>
          ))}
        </nav>
        <div className="mt-auto px-5 pb-5 pt-10">
          <div className="mb-6 rounded-2xl bg-secondary p-4">
            <Leaf className="mb-3 size-5 text-primary" aria-hidden />
            <p className="text-sm font-medium">好习惯，从一餐开始。</p>
            <p className="mt-1.5 text-xs leading-5 text-muted-foreground">一点一滴的记录，都是更了解自己的开始。</p>
          </div>
          <div className="flex items-center gap-3 border-t pt-5">
            <Link href="/profile" className="flex min-w-0 flex-1 items-center gap-3 rounded-xl p-1.5 transition-colors hover:bg-muted" aria-label="查看个人资料">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-semibold text-primary">{userName.slice(0, 1).toUpperCase()}</span>
              <div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{userName}</p><p className="mt-0.5 text-[11px] text-muted-foreground">个人空间</p></div>
            </Link>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="退出登录" aria-label="退出登录"><LogOut className="size-4" aria-hidden /></Button>
          </div>
        </div>
      </aside>
      <header className="flex h-20 items-center justify-between border-b bg-card px-5 lg:hidden">
        <Link href="/" aria-label="BodyTrace 首页"><Brand /></Link>
        <div className="flex items-center gap-2">
          <Link href="/plan" aria-label="饮食计划" aria-current={isActive("/plan") ? "page" : undefined} className="flex size-10 items-center justify-center rounded-xl text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
            <CalendarRange className="size-5" strokeWidth={1.8} aria-hidden />
          </Link>
          <Link href="/profile" className="flex items-center gap-2 rounded-xl px-2 py-1.5 transition-colors hover:bg-muted" aria-label="查看个人资料">
            <span className="flex size-8 items-center justify-center rounded-full bg-muted text-xs font-semibold text-primary">{userName.slice(0, 1).toUpperCase()}</span>
            <span className="max-w-24 truncate text-xs text-muted-foreground">{userName}</span>
          </Link>
          <Button variant="ghost" size="icon" onClick={handleLogout} title="退出登录" aria-label="退出登录"><LogOut className="size-4" aria-hidden /></Button>
        </div>
      </header>
      <nav aria-label="移动端导航" className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-5 border-t bg-card/95 px-2 pb-[env(safe-area-inset-bottom)] backdrop-blur-lg lg:hidden">
        {LINKS.map(({ href, short, icon: Icon }) => (
          <Link key={href} href={href} aria-current={isActive(href) ? "page" : undefined} className={`flex min-h-18 flex-col items-center justify-center gap-1.5 text-[11px] font-medium transition-colors ${isActive(href) ? "text-primary" : "text-muted-foreground"}`}>
            <span className={`rounded-xl px-4 py-1 ${isActive(href) ? "bg-secondary" : ""}`}><Icon className="size-5" strokeWidth={1.8} aria-hidden /></span>{short}
          </Link>
        ))}
      </nav>
    </>
  );
}
