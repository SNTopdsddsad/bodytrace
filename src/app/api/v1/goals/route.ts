/**
 * GET /api/v1/goals  查询每日目标（未设置时返回默认值）
 * PUT /api/v1/goals  保存目标 {calories, protein, carbs, fat}
 */
import { getSession, requireSession, unauthorized, invalidBody } from "@/lib/api-auth";
import { getGoals, goalsSchema, upsertGoals } from "@/services/goals";

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  return Response.json({ goals: await getGoals(session.user.id) });
}

export async function PUT(request: Request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();

  const parsed = goalsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  return Response.json({ goals: await upsertGoals(session.user.id, parsed.data) });
}
