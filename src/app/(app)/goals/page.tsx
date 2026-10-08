/**
 * 目标设置页：附带一些估算小知识，方便拍数值。
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GoalsForm } from "@/components/app/goals-form";
import { getSession } from "@/lib/api-auth";
import { getGoals } from "@/services/goals";

export default async function GoalsPage() {
  const session = await getSession();
  const goals = await getGoals(session!.user.id);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">目标设置</h1>
        <p className="text-sm text-muted-foreground">每日摄入目标，首页和日记页都会用它做对比</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">每日目标</CardTitle>
        </CardHeader>
        <CardContent>
          <GoalsForm initialGoals={goals} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">怎么估算？</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>
            热量：先估基础消耗（TDEE），减脂每天减 300–500 千卡，增肌加 200–300 千卡。
            网上搜“TDEE 计算器”填身高体重活动量即可。
          </p>
          <p>蛋白质：每公斤体重 1.6–2.2 克（增肌取高值）。</p>
          <p>脂肪：不低于每公斤体重 0.8 克，激素健康需要基本脂肪摄入。</p>
          <p>碳水：剩余热量补齐即可，公式：碳水克数 ≈ (总热量 − 蛋白×4 − 脂肪×9) ÷ 4。</p>
        </CardContent>
      </Card>
    </div>
  );
}
