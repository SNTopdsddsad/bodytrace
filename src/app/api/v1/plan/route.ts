/**
 * GET    /api/v1/plan  查询碳循环计划（没有时返回 null）
 * PUT    /api/v1/plan  整体保存计划 {startDate, isActive, weekdays[7]}
 * DELETE /api/v1/plan  删除计划（之后所有日期回落到每日目标）
 */
import { getSession, requireSession, unauthorized, invalidBody } from "@/lib/api-auth";
import { getPlan, planSchema, savePlan, deletePlan } from "@/services/plan";

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  return Response.json({ plan: await getPlan(session.user.id) });
}

export async function PUT(request: Request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();

  const parsed = planSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  return Response.json({ plan: await savePlan(session.user.id, parsed.data) });
}

export async function DELETE(request: Request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();

  await deletePlan(session.user.id);
  return Response.json({ status: true });
}
