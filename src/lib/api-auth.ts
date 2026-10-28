import { cache } from "react";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { Session } from "@/lib/auth";

/**
 * 会话守卫：返回会话或 null（API 调用方回 401，页面调用方跳登录）。
 * 用 React cache 按请求去重：同一请求里布局和页面多次调用只查一次数据库。
 */
export const getSession = cache(async (): Promise<Session | null> => {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
  return session;
});

/**
 * 带 CSRF 校验的守卫，给会改数据的方法（POST/PATCH/DELETE）用：
 * 浏览器发的跨站请求必带 Origin 头，和应用地址不匹配就直接拒绝；
 * 没有 Origin 的请求（未来 app 的 token 调用、curl 脚本）放行，
 * 它们不携带 cookie，本来就不存在跨站伪造问题。
 */
export async function requireSession(request: Request): Promise<Session | null> {
  const session = await getSession();
  if (!session) return null;

  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const allowedHost = new URL(
        process.env.BETTER_AUTH_URL ?? "http://localhost:3000",
      ).host;
      if (new URL(origin).host !== allowedHost) return null;
    } catch {
      return null; // Origin 不是合法 URL，按可疑处理
    }
  }
  return session;
}

export function unauthorized(): Response {
  return Response.json({ error: "未登录" }, { status: 401 });
}

/** 把 zod 校验失败转成 400 响应，避免每个接口重复写。 */
export function invalidBody(error: {
  issues: { message: string; path: (string | number | symbol)[] }[];
}): Response {
  const first = error.issues[0];
  return Response.json(
    { error: first ? `${first.path.join(".")}: ${first.message}` : "参数不合法" },
    { status: 400 },
  );
}
