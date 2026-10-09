/**
 * 个人资料页：填写身体数据（性别/年龄/身高/体重/目标体重），
 * 右侧根据已填数据展示 BMI、基础代谢估算和目标体重差距。
 */
import Link from "next/link";
import { ArrowRight, AtSign, Flame, Gauge, Scale, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { ProfileForm } from "@/components/app/profile-form";
import { getSession } from "@/lib/api-auth";
import { getProfile } from "@/services/profile";
import { bmiLabel, calcBmi, estimateBmr } from "@/lib/profile";
import { round1 } from "@/lib/nutrition";

function MetricRow({ icon: Icon, label, value, hint }: { icon: typeof Gauge; label: string; value: string; hint?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b py-3.5 first:pt-0 last:border-b-0 last:pb-0">
      <div className="flex min-w-0 items-center gap-2.5 text-sm text-muted-foreground"><Icon className="size-4 shrink-0 text-primary" aria-hidden />{label}</div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold tabular-nums text-foreground">{value}</p>
        {hint && <p className="mt-0.5 text-[11px] text-muted-foreground">{hint}</p>}
      </div>
    </div>
  );
}

export default async function ProfilePage() {
  const session = await getSession();
  const user = session!.user;
  const profile = await getProfile(user.id);

  const bmr = profile ? estimateBmr(profile) : null;
  const bmi = profile ? calcBmi(profile) : null;

  let targetGap: string | null = null;
  if (profile?.weightKg != null && profile.targetWeightKg != null) {
    const diff = round1(profile.weightKg - profile.targetWeightKg);
    targetGap = diff > 0 ? `距目标还差 ${diff} kg` : diff < 0 ? `超出目标 ${Math.abs(diff)} kg` : "已达成目标体重";
  }

  const hasBodyData = bmr != null || bmi != null || targetGap != null;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="了解自己的起点" title="个人资料" description="填写身体数据，用于估算基础代谢与身体指标，也能让目标设置更有依据。" />
      <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserRound className="size-4 text-primary" aria-hidden />我的身体数据</CardTitle>
            <p className="mt-2 text-xs text-muted-foreground">所有字段都可留空，先填一部分也没问题；体重有变化时随时回来更新。</p>
          </CardHeader>
          <CardContent>
            <ProfileForm initialProfile={profile} />
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card className="bg-secondary/40">
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Gauge className="size-4 text-primary" aria-hidden />身体指标</CardTitle>
            </CardHeader>
            <CardContent>
              {hasBodyData ? (
                <>
                  {bmi != null && <MetricRow icon={Scale} label="BMI" value={`${bmi}（${bmiLabel(bmi)}）`} hint="按中国成人标准分级" />}
                  {bmr != null && <MetricRow icon={Flame} label="基础代谢（BMR）" value={`${bmr.toLocaleString("zh-CN")} 千卡/天`} hint="Mifflin-St Jeor 公式估算" />}
                  {targetGap != null && (
                    <MetricRow
                      icon={Gauge}
                      label="目标体重"
                      value={targetGap}
                      hint={`当前 ${profile!.weightKg} kg · 目标 ${profile!.targetWeightKg} kg`}
                    />
                  )}
                  {bmr != null && (
                    <p className="mt-4 rounded-xl border bg-card p-3.5 text-xs leading-6 text-muted-foreground">
                      每日总消耗 ≈ BMR × 活动系数（久坐 1.2、轻活动 1.375、中活动 1.55、高强度 1.725）。
                      可以到<Link href="/goals" className="mx-0.5 text-primary underline underline-offset-2">目标设置</Link>把它换算成每日热量目标。
                    </p>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center rounded-xl border border-dashed bg-muted/30 px-4 py-7 text-center">
                  <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-secondary text-primary"><Gauge className="size-4" aria-hidden /></span>
                  <p className="text-sm font-medium">填得越全，估算越准</p>
                  <p className="mt-1.5 text-xs leading-6 text-muted-foreground">身高、体重、年龄、性别都填写后，<br />这里会展示 BMI 和基础代谢估算。</p>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AtSign className="size-4 text-primary" aria-hidden />账号信息</CardTitle>
            </CardHeader>
            <CardContent>
              <MetricRow icon={UserRound} label="昵称" value={user.name} />
              <MetricRow icon={AtSign} label="注册邮箱" value={user.email} />
              <Link href="/goals" className="mt-4 flex items-center justify-between border-t pt-4 text-xs text-muted-foreground transition-colors hover:text-primary">
                调整每日营养目标<ArrowRight className="size-4" aria-hidden />
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
