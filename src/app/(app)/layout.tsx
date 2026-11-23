/**
 * 应用主布局：所有需要登录的页面共用。
 *
 * 关键点——登录守卫：这里是“服务端组件”（默认类型，在服务器上运行），
 * 每次请求页面时先向后端要 session，拿不到就跳转登录页，
 * 所以未登录用户根本看不到里面的任何内容。
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/api-auth";
import { shiftDate, todayStr } from "@/lib/date";
import { countFoods } from "@/services/foods";
import { getDailyTotals } from "@/services/meals";
import { SiteNav } from "@/components/app/site-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  const today = todayStr();
  const [foodsCount, recentTotals] = await Promise.all([
    countFoods(session.user.id),
    getDailyTotals(session.user.id, shiftDate(today, -14), today),
  ]);

  return (
    <div className="min-h-svh flex-1 bg-background text-foreground">
      <SiteNav
        user={{
          name: session.user.name,
          email: session.user.email,
          phoneNumber: session.user.phoneNumber ?? null,
          phoneNumberVerified: session.user.phoneNumberVerified ?? false,
        }}
        today={today}
        foodsCount={foodsCount}
        recentDays={recentTotals.map((t) => ({ date: t.date, calories: t.calories }))}
      />
      <main
        id="main-content"
        className="mx-auto w-full min-w-0 max-w-[1520px] px-3 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-5 sm:px-6 lg:pb-10"
      >
        {children}
      </main>
    </div>
  );
}
