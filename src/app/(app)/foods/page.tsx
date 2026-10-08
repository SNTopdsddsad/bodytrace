/**
 * 食物库页：服务端取出全量列表，交给客户端组件 FoodsManager 处理交互。
 */
import { FoodsManager } from "@/components/app/foods-manager";
import { getSession } from "@/lib/api-auth";
import { listFoods } from "@/services/foods";

export default async function FoodsPage() {
  const session = await getSession();
  const foods = await listFoods(session!.user.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">食物库</h1>
        <p className="text-sm text-muted-foreground">
          共 {foods.length} 种食物，点星标收藏常用项
        </p>
      </div>
      <FoodsManager initialFoods={foods} />
    </div>
  );
}
