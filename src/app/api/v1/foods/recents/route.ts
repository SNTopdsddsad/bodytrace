/**
 * GET /api/v1/foods/recents  最近吃过的食物（去重，最多 12 个）
 * 静态路径 recents 优先于同级的 [id] 动态路由，不会被误匹配。
 */
import { getSession, unauthorized } from "@/lib/api-auth";
import { listRecentFoods } from "@/services/foods";

export async function GET() {
  const session = await getSession();
  if (!session) return unauthorized();

  return Response.json({ foods: await listRecentFoods(session.user.id) });
}
