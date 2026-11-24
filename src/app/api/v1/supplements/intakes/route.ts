import { invalidBody, requireSession, unauthorized } from "@/lib/api-auth";
import { todayStr } from "@/lib/date";
import { supplementIntakeSchemas } from "@/lib/supplements";
import {
  createSupplementIntake,
  SupplementConflict,
  SupplementNotFound,
} from "@/services/supplements";

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  const parsed = supplementIntakeSchemas(todayStr()).createItem.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return invalidBody(parsed.error);
  try {
    const result = await createSupplementIntake(
      session.user.id,
      parsed.data.requestId,
      parsed.data.intake,
    );
    return Response.json({ entry: result.entry }, { status: result.created ? 201 : 200 });
  } catch (error) {
    if (error instanceof SupplementNotFound) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof SupplementConflict) {
      return Response.json({ error: error.message }, { status: 409 });
    }
    throw error;
  }
}
