/**
 * GET /api/v1/summary?date=YYYY-MM-DD
 * 某天汇总：按餐次分组的记录 + 全天合计 + 目标。首页和 app 都用这个接口。
 */
import { getSession, unauthorized } from "@/lib/api-auth";
import { isValidDateStr } from "@/lib/date";
import { getDaySummary } from "@/services/meals";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!isValidDateStr(date)) {
    return Response.json({ error: "date 参数格式应为 YYYY-MM-DD" }, { status: 400 });
  }
  return Response.json(await getDaySummary(session.user.id, date));
}
