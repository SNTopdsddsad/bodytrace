import { z } from "zod";
import { getSession, requireSession, unauthorized, invalidBody } from "@/lib/api-auth";
import { TRAINING_FILTERS, TRAINING_RANGES } from "@/lib/training";
import { createTrainingRecord, getTrainingByRequestId, listTrainingRecords, TrainingConflict } from "@/services/training";
import { checkTrainingAccount, currentTrainingSchemas, readTrainingBody } from "./request";

const querySchema = z.object({
  requestId: z.string().uuid().optional(),
  range: z.enum(TRAINING_RANGES).default("30"),
  kind: z.enum(TRAINING_FILTERS).default("all"),
  status: z.enum(["all", "inProgress", "completed"]).default("all"),
}).strict();

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  const accountError = checkTrainingAccount(request, session.user.id);
  if (accountError) return accountError;
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return invalidBody(parsed.error);
  try {
    if (parsed.data.requestId) {
      return Response.json({ entry: await getTrainingByRequestId(session.user.id, parsed.data.requestId) });
    }
    return Response.json({ entries: await listTrainingRecords(session.user.id, parsed.data) });
  } catch (error) {
    if (error instanceof TrainingConflict) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  const accountError = checkTrainingAccount(request, session.user.id);
  if (accountError) return accountError;
  const body = await readTrainingBody(request);
  if (!body.ok) return body.response;
  const parsed = currentTrainingSchemas().create.safeParse(body.body);
  if (!parsed.success) return invalidBody(parsed.error);
  try {
    const result = await createTrainingRecord(session.user.id, parsed.data.requestId, parsed.data.training);
    return Response.json({ entry: result.entry }, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof TrainingConflict) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
