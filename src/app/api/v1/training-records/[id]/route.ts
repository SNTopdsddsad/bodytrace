import { z } from "zod";
import { getSession, requireSession, unauthorized, invalidBody } from "@/lib/api-auth";
import { getTrainingRecord, updateTrainingRecord, deleteTrainingRecord, TrainingConflict } from "@/services/training";
import { checkTrainingAccount, currentTrainingSchemas, readTrainingBody } from "../request";

type Context = { params: Promise<{ id: string }> };
const missing = () => Response.json({ error: "训练记录不存在" }, { status: 404 });
const invalidId = () => Response.json({ error: "记录编号不合法" }, { status: 400 });

export async function GET(request: Request, { params }: Context) {
  const session = await getSession();
  if (!session) return unauthorized();
  const accountError = checkTrainingAccount(request, session.user.id);
  if (accountError) return accountError;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return invalidId();
  const entry = await getTrainingRecord(session.user.id, id);
  return entry ? Response.json({ entry }) : missing();
}

export async function PATCH(request: Request, { params }: Context) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  const accountError = checkTrainingAccount(request, session.user.id);
  if (accountError) return accountError;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return invalidId();
  const body = await readTrainingBody(request);
  if (!body.ok) return body.response;
  const parsed = currentTrainingSchemas().update.safeParse(body.body);
  if (!parsed.success) return invalidBody(parsed.error);
  try {
    const entry = await updateTrainingRecord(session.user.id, id, parsed.data.version, parsed.data.training);
    return entry ? Response.json({ entry }) : missing();
  } catch (error) {
    if (error instanceof TrainingConflict) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export async function DELETE(request: Request, { params }: Context) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  const accountError = checkTrainingAccount(request, session.user.id);
  if (accountError) return accountError;
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return invalidId();
  const body = await readTrainingBody(request);
  if (!body.ok) return body.response;
  const parsed = currentTrainingSchemas().remove.safeParse(body.body);
  if (!parsed.success) return invalidBody(parsed.error);
  try {
    return await deleteTrainingRecord(session.user.id, id, parsed.data.version) ? Response.json({ ok: true }) : missing();
  } catch (error) {
    if (error instanceof TrainingConflict) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
