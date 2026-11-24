import { z } from "zod";
import { invalidBody, requireSession, unauthorized } from "@/lib/api-auth";
import { supplementPatchSchema } from "@/lib/supplements";
import {
  deleteSupplement,
  SupplementValidationError,
  updateSupplement,
} from "@/services/supplements";

type Context = { params: Promise<{ id: string }> };
const missing = () => Response.json({ error: "补剂不存在" }, { status: 404 });

export async function PATCH(request: Request, { params }: Context) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "补剂编号不合法" }, { status: 400 });
  }
  const parsed = supplementPatchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);
  try {
    const supplement = await updateSupplement(session.user.id, id, parsed.data);
    return supplement ? Response.json({ supplement }) : missing();
  } catch (error) {
    if (error instanceof SupplementValidationError) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) {
    return Response.json({ error: "补剂编号不合法" }, { status: 400 });
  }
  return (await deleteSupplement(session.user.id, id)) ? Response.json({ ok: true }) : missing();
}
