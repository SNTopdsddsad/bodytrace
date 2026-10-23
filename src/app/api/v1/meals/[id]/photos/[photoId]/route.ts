/**
 * DELETE /api/v1/meals/:id/photos/:photoId  删除一条饮食记录的照片
 *
 * 记录、照片与当前用户三者都匹配才删除；保留删除标记，再尽力清理 COS 对象。
 */
import { z } from "zod";
import { requireSession, unauthorized, invalidBody } from "@/lib/api-auth";
import { removeMealPhoto } from "@/services/meal-photos";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string; photoId: string }> };

export async function DELETE(request: Request, { params }: Ctx) {
  const session = await requireSession(request);
  if (!session) return unauthorized();

  const { id, photoId } = await params;
  const parsed = z.object({ id: z.uuid(), photoId: z.uuid() }).safeParse({ id, photoId });
  if (!parsed.success) return invalidBody(parsed.error);
  const removed = await removeMealPhoto(session.user.id, id, photoId);
  if (!removed) return Response.json({ error: "照片不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
