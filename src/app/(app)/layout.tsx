/**
 * 应用主布局：所有需要登录的页面共用。
 *
 * 关键点——登录守卫：这里是“服务端组件”（默认类型，在服务器上运行），
 * 每次请求页面时先向后端要 session，拿不到就跳转登录页，
 * 所以未登录用户根本看不到里面的任何内容。
 */
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { SiteNav } from "@/components/app/site-nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login");

  return (
    <div className="flex min-h-svh flex-1 flex-col">
      <SiteNav userName={session.user.name} />
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">{children}</main>
    </div>
  );
}
