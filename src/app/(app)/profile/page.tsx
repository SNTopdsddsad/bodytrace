/**
 * 个人资料页：填写身体数据（性别/身高/体重/目标体重），
 * 右侧根据已填数据展示 BMI 和目标体重差距。
 */
import Link from "next/link";
import { ArrowRight, AtSign, Database, Gauge, Scale, UserRound } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/app/page-header";
import { ProfileForm } from "@/components/app/profile-form";
import { ClearRecordsButton } from "@/components/app/clear-records-button";
import { getSession } from "@/lib/api-auth";
import { getProfileContext } from "@/services/profile";
import { getRecordCounts } from "@/services/records";
import { bmiLabel, calcBmi } from "@/lib/profile";
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
  const [context, recordCounts] = await Promise.all([
    getProfileContext(user.id),
    getRecordCounts(user.id),
  ]);
  const profile = context?.profile ?? null;
  const latestWeight = context?.latestWeight ?? null;

  const bmi = profile ? calcBmi(profile) : null;

  let targetGap: string | null = null;
  if (profile?.weightKg != null && profile.targetWeightKg != null) {
    const diff = round1(profile.weightKg - profile.targetWeightKg);
    targetGap = diff > 0 ? `距目标还差 ${diff} kg` : diff < 0 ? `超出目标 ${Math.abs(diff)} kg` : "已达成目标体重";
  }

  const hasBodyData = bmi != null || targetGap != null;

  return (
    <div className="space-y-8">
      <PageHeader eyebrow="了解自己的起点" title="个人资料" description="填写基础资料和目标，当前体重来自最新测量记录。" action={<Link href="/measurements" className="flex items-center gap-2 rounded-xl border bg-card px-4 py-3 text-sm font-medium text-primary"><Scale className="size-4" aria-hidden />身体变化<ArrowRight className="size-4" aria-hidden /></Link>} />
      <div className="grid items-start gap-6 xl:grid-cols-[1.5fr_1fr]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserRound className="size-4 text-primary" aria-hidden />我的身体数据</CardTitle>
            <p className="mt-2 text-xs text-muted-foreground">基础字段可留空；体重、体脂率和血压在身体变化中持续记录。</p>
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
              {profile?.weightKg != null && <MetricRow icon={Scale} label={latestWeight ? "最新测量体重" : "旧资料参考体重"} value={`${profile.weightKg} kg`} hint={latestWeight ? `${latestWeight.date}${latestWeight.time ? ` ${latestWeight.time}` : " · 未填测量时间"}` : "尚无测量历史，保留原资料值"} />}
              {hasBodyData ? (
                <>
                  {bmi != null && <MetricRow icon={Scale} label="BMI" value={`${bmi}（${bmiLabel(bmi)}）`} hint="按中国成人标准分级" />}
                  {targetGap != null && (
                    <MetricRow
                      icon={Gauge}
                      label="目标体重"
                      value={targetGap}
                      hint={`当前 ${profile!.weightKg} kg · 目标 ${profile!.targetWeightKg} kg`}
                    />
                  )}
                  <p className="mt-4 rounded-xl border bg-card p-3.5 text-xs leading-6 text-muted-foreground">
                    想知道每天该吃多少？到<Link href="/goals" className="mx-0.5 text-primary underline underline-offset-2">目标设置</Link>看看估算方法，把体重数据也用上。
                  </p>
                </>
              ) : (
                <div className="flex flex-col items-center rounded-xl border border-dashed bg-muted/30 px-4 py-7 text-center">
                  <span className="mb-3 flex size-10 items-center justify-center rounded-full bg-secondary text-primary"><Gauge className="size-4" aria-hidden /></span>
                  <p className="text-sm font-medium">填得越全，看得越清</p>
                  <p className="mt-1.5 text-xs leading-6 text-muted-foreground">填写身高和体重后，这里会展示 BMI；<br />填上目标体重还能看到距目标的差距。</p>
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

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Database className="size-4 text-primary" aria-hidden />数据管理</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-xs leading-6 text-muted-foreground">
                {recordCounts.mealEntries + recordCounts.measurements === 0
                  ? "当前没有饮食或身体指标记录。"
                  : `当前有 ${recordCounts.mealEntries} 条饮食记录、${recordCounts.measurements} 条身体指标记录。清空后日记、趋势和最新指标立即归零，无法恢复；个人食物库、目标、计划和个人资料保持不变。`}
              </p>
              <div className="mt-4">
                <ClearRecordsButton counts={recordCounts} />
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
