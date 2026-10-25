/**
 * GET  /api/v1/meals?date=YYYY-MM-DD  某天的全部饮食记录
 * POST /api/v1/meals                  添加记录 {date, mealType, foodId, grams}
 */
import { getSession, requireSession, unauthorized, invalidBody } from "@/lib/api-auth";
import { getPhotosForDay } from "@/services/meal-photos";
import { MEAL_ORDER } from "@/lib/nutrition";
import { isValidDateStr } from "@/lib/date";
import { addEntry, getDayEntries, mealCreateSchema } from "@/services/meals";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const date = new URL(request.url).searchParams.get("date") ?? "";
  if (!isValidDateStr(date)) {
    return Response.json({ error: "date 参数格式应为 YYYY-MM-DD" }, { status: 400 });
  }
  const [entries, byMeal] = await Promise.all([
    getDayEntries(session.user.id, date),
    getPhotosForDay(session.user.id, date),
  ]);
  return Response.json({ entries, photos: MEAL_ORDER.flatMap((meal) => byMeal.get(meal) ?? []) });
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();

  const parsed = mealCreateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  const entry = await addEntry(session.user.id, parsed.data);
  if (!entry) return Response.json({ error: "食物不存在" }, { status: 404 });
  return Response.json({ entry }, { status: 201 });
}
