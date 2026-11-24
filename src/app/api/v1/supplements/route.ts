import { getSession, invalidBody, requireSession, unauthorized } from "@/lib/api-auth";
import { isValidDateStr, todayStr } from "@/lib/date";
import { supplementCreateSchema } from "@/lib/supplements";
import { createSupplement, getSupplementDashboard, SupplementConflict } from "@/services/supplements";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  const rawDate = new URL(request.url).searchParams.get("date");
  const date = rawDate ?? todayStr();
  if (!isValidDateStr(date)) {
    return Response.json({ error: "date: 请填写有效日期 YYYY-MM-DD" }, { status: 400 });
  }
  return Response.json(await getSupplementDashboard(session.user.id, date));
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();
  const parsed = supplementCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);
  try {
    const { supplement, created } = await createSupplement(session.user.id, parsed.data);
    return Response.json({ supplement }, { status: created ? 201 : 200 });
  } catch (error) {
    if (error instanceof SupplementConflict) return Response.json({ error: error.message }, { status: 409 });
    throw error;
  }
}
