import { z } from "zod";
import { invalidBody, requireSession, unauthorized } from "@/lib/api-auth";
import { todayStr } from "@/lib/date";
import { supplementIntakeSchemas } from "@/lib/supplements";
import {
  deleteSupplementIntake,
  SupplementConflict,
  updateSupplementIntake,
} from "@/services/supplements";

type Context = { params: Promise<{ id: string }> };
const missing = () => Response.json({ error: "记录不存在" }, { status: 404 });

export async function PATCH(request: Request, { params }: Context) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "记录编号不合法" }, { status: 400 });
  }
  const parsed = supplementIntakeSchemas(todayStr()).update.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return invalidBody(parsed.error);
  try {
    const entry = await updateSupplementIntake(
      session.user.id,
      id,
      parsed.data.version,
      parsed.data.intake,
    );
    return entry ? Response.json({ entry }) : missing();
  } catch (error) {
    if (error instanceof SupplementConflict) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "记录编号不合法" }, { status: 400 });
  }
  const parsed = supplementIntakeSchemas(todayStr()).remove.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return invalidBody(parsed.error);
  try {
    return (await deleteSupplementIntake(session.user.id, id, parsed.data.version))
      ? Response.json({ ok: true })
      : missing();
  } catch (error) {
    if (error instanceof SupplementConflict) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
