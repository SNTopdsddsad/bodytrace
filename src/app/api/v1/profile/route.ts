/**
 * GET /api/v1/profile  查询个人资料（未填写时返回全 null 字段）
 * PUT /api/v1/profile  保存资料 {gender, heightCm, weightKg, targetWeightKg}
 */
import { getSession, requireSession, unauthorized, invalidBody } from "@/lib/api-auth";
import { getProfile, profileSchema, upsertProfile } from "@/services/profile";

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  const profile = await getProfile(session.user.id);
  return Response.json({
    profile: profile ?? { gender: null, heightCm: null, weightKg: null, targetWeightKg: null },
  });
}

export async function PUT(request: Request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();

  const parsed = profileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  return Response.json({ profile: await upsertProfile(session.user.id, parsed.data) });
}
