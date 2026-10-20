/**
 * GET    /api/v1/plan  查询饮食计划（没有时返回 null）
 * PUT    /api/v1/plan  整体保存计划 {startDate, isActive, weekdays[7], items[]}
 * DELETE /api/v1/plan  删除计划（之后所有日期回落到每日目标）
 */
import { getSession, requireSession, unauthorized, invalidBody } from "@/lib/api-auth";
import {
  getPlan,
  planSchema,
  savePlan,
  deletePlan,
  PlanFoodNotOwned,
  PlanStaleItem,
} from "@/services/plan";

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

  try {
    // 返回读回值：客户端直接拿到展开后的食物名与实时折算营养，不用自己算
    return Response.json({ plan: await savePlan(session.user.id, parsed.data) });
  } catch (error) {
    // 计划里引用了别人的食物（或已删除的食物）：整单拒绝，不做部分写入。
    // 要保留的失效行对不上当前计划同样整单拒绝，两种情况都不透露对方资源是否存在。
    if (error instanceof PlanFoodNotOwned || error instanceof PlanStaleItem) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(request: Request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();

  await deletePlan(session.user.id);
  return Response.json({ status: true });
}
