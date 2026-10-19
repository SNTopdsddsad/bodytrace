/**
 * DELETE /api/v1/records  一键清空当前用户全部饮食记录与身体指标
 */
import { requireSession, unauthorized } from "@/lib/api-auth";
import { clearAllRecords } from "@/services/records";

export async function DELETE(request: Request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  const cleared = await clearAllRecords(session.user.id);
  return Response.json({ ok: true, cleared });
}
