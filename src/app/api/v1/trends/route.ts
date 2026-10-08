/**
 * GET /api/v1/trends?days=30  最近 N 天每天的营养合计（缺日期补 0）。
 */
import { getSession, unauthorized } from "@/lib/api-auth";
import { getTrends } from "@/services/trends";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const raw = Number(new URL(request.url).searchParams.get("days"));
  const days = Number.isInteger(raw) && raw >= 7 && raw <= 180 ? raw : 30;
  return Response.json({ days, trends: await getTrends(session.user.id, days) });
}
