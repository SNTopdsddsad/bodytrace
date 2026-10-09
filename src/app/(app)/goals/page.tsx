/**
 * 目标设置页：附带一些估算小知识，方便拍数值。
 */
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { GoalsForm } from "@/components/app/goals-form";
import { getSession } from "@/lib/api-auth";
import { getGoals } from "@/services/goals";
import { PageHeader } from "@/components/app/page-header";
import { Lightbulb, Target } from "lucide-react";

export default async function GoalsPage() {
  const session = await getSession();
  const goals = await getGoals(session!.user.id);

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="找到自己的节奏" title="目标设置" description="设定每日营养目标，让每一次记录都有参照。" />
      <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Target className="size-4 text-primary" aria-hidden />每日营养目标</CardTitle>
          <p className="mt-2 text-xs text-muted-foreground">保存后，首页和饮食日记中的进度将同步更新。</p>
        </CardHeader>
        <CardContent>
          <GoalsForm initialGoals={goals} />
        </CardContent>
      </Card>

      <Card className="bg-secondary/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Lightbulb className="size-4 text-primary" aria-hidden />怎么估算？</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4 text-sm leading-7 text-muted-foreground">
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
    </div>
  );
}
