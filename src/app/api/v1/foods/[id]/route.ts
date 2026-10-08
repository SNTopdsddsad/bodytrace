/**
 * PATCH  /api/v1/foods/:id  修改食物（字段部分更新，含收藏开关）
 * DELETE /api/v1/foods/:id  删除食物（历史饮食记录保留快照，不受影响）
 *
 * 注意：动态段 [id] 在 Next 16 里是异步的，需要 await params 拿值。
 */
import { requireSession, unauthorized, invalidBody } from "@/lib/api-auth";
import { deleteFood, foodPatchSchema, updateFood } from "@/services/foods";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const session = await requireSession(request);
  if (!session) return unauthorized();

  const { id } = await params;
  const parsed = foodPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  const food = await updateFood(session.user.id, id, parsed.data);
  if (!food) return Response.json({ error: "食物不存在" }, { status: 404 });
  return Response.json({ food });
}

export async function DELETE(request: Request, { params }: Ctx) {
  const session = await requireSession(request);
  if (!session) return unauthorized();

  const { id } = await params;
  const ok = await deleteFood(session.user.id, id);
  if (!ok) return Response.json({ error: "食物不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
