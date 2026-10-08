/**
 * GET /api/v1/foods/reference?q=关键词
 * 搜索官方食物参考库（全体用户共享的只读数据）。
 */
import { getSession, unauthorized } from "@/lib/api-auth";
import { searchFoodReference } from "@/services/foods";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();

  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q === "") return Response.json({ foods: [] });

  return Response.json({ foods: await searchFoodReference(q) });
}
