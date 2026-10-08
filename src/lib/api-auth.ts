import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { Session } from "@/lib/auth";

/** API 路由的会话守卫：返回会话或 null（调用方回 401）。 */
export async function getSession(): Promise<Session | null> {
  const h = await headers();
  const session = await auth.api.getSession({ headers: h });
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
