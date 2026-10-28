/**
 * 应用主布局：所有需要登录的页面共用。
 *
 * 关键点——登录守卫：这里是“服务端组件”（默认类型，在服务器上运行），
 * 每次请求页面时先向后端要 session，拿不到就跳转登录页，
 * 所以未登录用户根本看不到里面的任何内容。
 */
import { redirect } from "next/navigation";
import { getSession } from "@/lib/api-auth";
import { SiteNav } from "@/components/app/site-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <div className="min-h-svh flex-1">
      <SiteNav userName={session.user.name} />
      <main id="main-content" className="min-w-0 px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-7 sm:px-7 lg:ml-60 lg:px-10 lg:py-10 xl:px-14">
        <div className="mx-auto w-full max-w-6xl">{children}</div>
      </main>
    </div>
  );
}
