/**
 * 食物库页：服务端取出全量列表，交给客户端组件 FoodsManager 处理交互。
 */
import { redirect } from "next/navigation";
import { FoodsManager } from "@/components/app/foods-manager";
import { getSession } from "@/lib/api-auth";
import { listFoods } from "@/services/foods";
import { PageHeader } from "@/components/app/page-header";

export default async function FoodsPage() {
  const session = await getSession();
  if (!session) redirect("/login");
  const foods = await listFoods(session.user.id);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="熟悉的食物，轻松地记录" title="食物库" description={`共 ${foods.length} 种食物 · 收藏常用食物，下次记录更方便。`} />
      <FoodsManager initialFoods={foods} />
    </div>
  );
}
