/**
 * POST /api/v1/meal-photos  为某天某餐添加一张照片
 *
 * 一次请求只处理一张，客户端多选时逐张上传，失败可单独重试。
 * 用户归属来自会话，日期与餐次在处理图片前校验。
 */
import { z } from "zod";
import { getSession, requireSession, unauthorized, invalidBody } from "@/lib/api-auth";
import { MEAL_PHOTO_MAX_BYTES } from "@/lib/meal-photo";
import { addMealPhoto, getMealPhotoRequest, type AddMealPhotoResult } from "@/services/meal-photos";
import { mealSlotSchema } from "@/services/meal-slot";

export const runtime = "nodejs";

/** multipart 会比文件本身多一些边界和字段开销。 */
const MULTIPART_OVERHEAD = 512 * 1024;
const uploadSchema = mealSlotSchema.extend({ requestId: z.uuid().optional() });

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  const parsed = z.uuid().safeParse(new URL(request.url).searchParams.get("requestId"));
  if (!parsed.success) return invalidBody(parsed.error);
  try {
    const result = await getMealPhotoRequest(session.user.id, parsed.data);
    if (result.ok) return Response.json({ photo: result.photo });
    return Response.json({ error: result.message }, { status: 409 });
  } catch (error) {
    console.error("[BodyTrace] 照片核对暂不可用", error);
    return Response.json({ error: "暂时无法核对照片，请稍后重试" }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = await requireSession(request);
  if (!session) return unauthorized();

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MEAL_PHOTO_MAX_BYTES + MULTIPART_OVERHEAD) {
    return Response.json({ error: "照片不能超过 8 MB" }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json({ error: "请求格式应为 multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  const parsed = uploadSchema.safeParse({
    date: form.get("date"), mealType: form.get("mealType"),
    requestId: form.get("requestId") ?? undefined,
  });
  if (!parsed.success) return invalidBody(parsed.error);
  if (!(file instanceof File)) {
    return Response.json({ error: "请选择一张照片" }, { status: 400 });
  }
  if (file.size === 0) {
    return Response.json({ error: "请选择一张照片" }, { status: 400 });
  }
  if (file.size > MEAL_PHOTO_MAX_BYTES) {
    return Response.json({ error: "照片不能超过 8 MB" }, { status: 413 });
  }

  let result: AddMealPhotoResult;
  try {
    result = await addMealPhoto(session.user.id, parsed.data, file, parsed.data.requestId);
  } catch (error) {
    console.error("[BodyTrace] 照片保存结果待核对", error);
    return Response.json({ error: "照片保存结果尚未确认，请重试核对" }, { status: 502 });
  }
  if (result.ok) return Response.json({ photo: result.photo }, { status: result.created ? 201 : 200 });

  switch (result.reason) {
    case "conflict":
      return Response.json({ error: result.message }, { status: 409 });
    case "user_not_found":
      return Response.json({ error: result.message }, { status: 404 });
    case "limit":
      return Response.json({ error: result.message }, { status: 400 });
    case "storage_unconfigured":
      return Response.json({ error: result.message }, { status: 503 });
    case "storage_failed":
      return Response.json({ error: result.message }, { status: 502 });
    default:
      return Response.json({ error: result.message }, { status: 400 });
  }
}
