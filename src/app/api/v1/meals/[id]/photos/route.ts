/**
 * POST /api/v1/meals/:id/photos  为一条饮食记录添加一张照片
 *
 * 一次请求只处理一张，客户端多选时逐张上传，失败可单独重试。
 * 上传前先按会话校验记录归属，避免为不属于当前用户的记录处理图片。
 */
import { z } from "zod";
import { getSession, requireSession, unauthorized, invalidBody } from "@/lib/api-auth";
import { MEAL_PHOTO_MAX_BYTES } from "@/lib/meal-photo";
import { addMealPhoto, entryBelongsToUser, getMealPhotoRequest } from "@/services/meal-photos";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

/** multipart 会比文件本身多一些边界和字段开销。 */
const MULTIPART_OVERHEAD = 512 * 1024;
const idSchema = z.uuid();
const uploadSchema = z.object({ requestId: z.uuid().optional() });

export async function GET(request: Request, { params }: Ctx) {
  const session = await getSession();
  if (!session) return unauthorized();
  const parsed = z.object({ id: idSchema, requestId: z.uuid() }).safeParse({
    id: (await params).id,
    requestId: new URL(request.url).searchParams.get("requestId"),
  });
  if (!parsed.success) return invalidBody(parsed.error);
  const result = await getMealPhotoRequest(session.user.id, parsed.data.id, parsed.data.requestId);
  if (result.ok) return Response.json({ photo: result.photo });
  return Response.json({ error: result.message }, { status: result.reason === "entry_not_found" ? 404 : 409 });
}

export async function POST(request: Request, { params }: Ctx) {
  const session = await requireSession(request);
  if (!session) return unauthorized();

  const { id } = await params;
  const parsedId = idSchema.safeParse(id);
  if (!parsedId.success) return invalidBody(parsedId.error);
  if (!(await entryBelongsToUser(session.user.id, id))) {
    return Response.json({ error: "记录不存在" }, { status: 404 });
  }

  const contentLength = Number(request.headers.get("content-length") ?? 0);
  if (contentLength > MEAL_PHOTO_MAX_BYTES + MULTIPART_OVERHEAD) {
    return Response.json({ error: "照片不能超过 8 MB" }, { status: 413 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json({ error: "请求格式应为 multipart/form-data" }, { status: 400 });
  }
  const file = form.get("file");
  const parsed = uploadSchema.safeParse({ requestId: form.get("requestId") ?? undefined });
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

  const result = await addMealPhoto(session.user.id, id, file, parsed.data.requestId);
  if (result.ok) return Response.json({ photo: result.photo }, { status: result.created ? 201 : 200 });

  switch (result.reason) {
    case "conflict":
      return Response.json({ error: result.message }, { status: 409 });
    case "entry_not_found":
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
