/**
 * DELETE /api/v1/meal-photos/:photoId  删除餐次照片
 *
 * 照片归属当前用户才删除；保留删除标记，再尽力清理 COS 对象。
 */
import { z } from "zod";
import { requireSession, unauthorized, invalidBody } from "@/lib/api-auth";
import { removeMealPhoto } from "@/services/meal-photos";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ photoId: string }> };

export async function DELETE(request: Request, { params }: Ctx) {
  const session = await requireSession(request);
  if (!session) return unauthorized();

  const { photoId } = await params;
  const parsed = z.uuid().safeParse(photoId);
  if (!parsed.success) return invalidBody(parsed.error);
  const removed = await removeMealPhoto(session.user.id, photoId);
  if (!removed) return Response.json({ error: "照片不存在" }, { status: 404 });
  return Response.json({ ok: true });
}
