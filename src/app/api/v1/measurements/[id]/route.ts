import { z } from "zod";
import { getSession, requireSession, unauthorized, invalidBody } from "@/lib/api-auth";
import { measurementSchemas } from "@/lib/measurements";
import { todayStr } from "@/lib/date";
import { getMeasurement, updateMeasurement, deleteMeasurement, MeasurementConflict } from "@/services/measurements";

type Context = { params: Promise<{ id: string }> };
const missing = () => Response.json({ error: "记录不存在" }, { status: 404 });

export async function GET(_request: Request, { params }: Context) {
  const session = await getSession();
  if (!session) return unauthorized();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "记录编号不合法" }, { status: 400 });
  const entry = await getMeasurement(session.user.id, id);
  return entry ? Response.json({ entry }) : missing();
}

export async function PATCH(request: Request, { params }: Context) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "记录编号不合法" }, { status: 400 });
  const parsed = measurementSchemas(todayStr()).update.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);
  try {
    const entry = await updateMeasurement(session.user.id, id, parsed.data.version, parsed.data.measurement);
    return entry ? Response.json({ entry }) : missing();
  } catch (error) {
    if (error instanceof MeasurementConflict) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return Response.json({ error: "记录编号不合法" }, { status: 400 });
  const parsed = z.object({ version: z.number().int().min(1) }).strict().safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);
  try {
    return await deleteMeasurement(session.user.id, id, parsed.data.version) ? Response.json({ ok: true }) : missing();
  } catch (error) {
    if (error instanceof MeasurementConflict) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
