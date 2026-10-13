import { z } from "zod";
import { getSession, requireSession, unauthorized, invalidBody } from "@/lib/api-auth";
import { MEASUREMENT_RANGES, measurementSchemas } from "@/lib/measurements";
import { todayStr } from "@/lib/date";
import { createMeasurement, getMeasurementDashboard, MeasurementConflict } from "@/services/measurements";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  const range = z.enum(MEASUREMENT_RANGES).safeParse(new URL(request.url).searchParams.get("range") ?? "30");
  if (!range.success) return invalidBody(range.error);
  return Response.json(await getMeasurementDashboard(session.user.id, range.data));
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  const parsed = measurementSchemas(todayStr()).create.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);
  try {
    const result = await createMeasurement(session.user.id, parsed.data.requestId, parsed.data.measurement);
    return Response.json({ entry: result.entry }, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof MeasurementConflict) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
