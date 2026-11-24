import { invalidBody, requireSession, unauthorized } from "@/lib/api-auth";
import { todayStr } from "@/lib/date";
import { supplementIntakeSchemas } from "@/lib/supplements";
import {
  createSupplementIntakesBatch,
  SupplementConflict,
  SupplementNotFound,
} from "@/services/supplements";

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  const parsed = supplementIntakeSchemas(todayStr()).batchCreate.safeParse(
    await request.json().catch(() => null),
  );
  if (!parsed.success) return invalidBody(parsed.error);
  try {
    const result = await createSupplementIntakesBatch(session.user.id, parsed.data.items);
    return Response.json({ entries: result.entries }, { status: result.created ? 201 : 200 });
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
