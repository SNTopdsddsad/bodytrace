import { getSession, unauthorized } from "@/lib/api-auth";
import { checkTrainingAccount } from "../request";

/** 实时记录先校准时刻，不依赖设备墙钟，也不在新增重试时改写原来的开始时刻。 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session) return unauthorized();
  const accountError = checkTrainingAccount(request, session.user.id);
  if (accountError) return accountError;
  return Response.json({ serverNow: new Date().toISOString() }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}
