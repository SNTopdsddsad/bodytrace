/**
 * PATCH  /api/v1/meals/:id  修改克数 {grams}（营养值自动按比例重算）
 * DELETE /api/v1/meals/:id  删除一条记录
 */
import { getSession, unauthorized, invalidBody } from "@/lib/api-auth";
import { deleteEntry, mealPatchSchema, updateEntryGrams } from "@/services/meals";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await params;
  const parsed = mealPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  const entry = await updateEntryGrams(session.user.id, id, parsed.data.grams);
  if (!entry) return Response.json({ error: "记录不存在" }, { status: 404 });
  return Response.json({ entry });
}

export async function DELETE(_request: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return unauthorized();

  const { id } = await params;
  const ok = await deleteEntry(session.user.id, id);
  if (!ok) return Response.json({ error: "记录不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
