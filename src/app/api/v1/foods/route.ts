/**
 * GET  /api/v1/foods?q=关键词   搜索自己的食物库（不带 q 返回全部）
 * POST /api/v1/foods            新增食物
 *
 * 这是“路由处理器”（Route Handler）：Next.js 里专门处理 HTTP 请求的文件，
 * 导出 GET/POST 等函数即对应 HTTP 方法。未来手机 app 直接请求这些地址。
 */
import { getSession, unauthorized, invalidBody } from "@/lib/api-auth";
import { createFood, foodInputSchema, listFoods } from "@/services/foods";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const q = new URL(request.url).searchParams.get("q")?.trim() || undefined;
  return Response.json({ foods: await listFoods(session.user.id, q) });
}

export async function POST(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const parsed = foodInputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return invalidBody(parsed.error);

  const food = await createFood(session.user.id, parsed.data);
  return Response.json({ food }, { status: 201 });
}
