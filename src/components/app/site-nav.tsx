"use client";

/**
 * 顶部导航栏。客户端组件是为了用 usePathname()
 * 给当前所在页的链接加高亮样式。
 */
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Flame, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { authClient } from "@/lib/auth-client";

const LINKS = [
  { href: "/", label: "今日" },
  { href: "/diary", label: "日记" },
  { href: "/foods", label: "食物库" },
  { href: "/trends", label: "趋势" },
  { href: "/goals", label: "目标" },
] as const;

export function SiteNav({ userName }: { userName: string }) {
  const pathname = usePathname();
  const router = useRouter();

  async function handleLogout() {
    await authClient.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-3xl items-center gap-4 px-4">
        <Link href="/" className="flex items-center gap-1.5 font-semibold">
          <Flame className="size-5 text-primary" aria-hidden />
          BodyTrace
        </Link>

        <nav className="flex flex-1 gap-1 overflow-x-auto">
          {LINKS.map((link) => {
            const active =
              link.href === "/" ? pathname === "/" : pathname.startsWith(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className={
                  "rounded-md px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors " +
                  (active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground")
                }
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden items-center gap-2 sm:flex">
          <span className="text-sm text-muted-foreground">{userName}</span>
          <Button variant="ghost" size="icon" onClick={handleLogout} title="退出登录">
            <LogOut className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </header>
  );
}
