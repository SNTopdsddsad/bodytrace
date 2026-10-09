"use client";

/**
 * 个人资料表单：性别、身高、体重、目标体重。
 * 所有字段都可以留空（= 未填写），留空保存时提交 null。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { LoaderCircle, Save, Ruler, Scale, VenusAndMars } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";
import { GENDER_LABELS, type BodyProfile, type Gender } from "@/lib/profile";

/** 数值输入统一转字符串管理：空字符串代表未填写，提交时转回 null。 */
type NumberKey = "heightCm" | "weightKg" | "targetWeightKg";
type FormState = { gender: Gender | null } & Record<NumberKey, string>;

const NUMBER_FIELDS: { key: NumberKey; label: string; unit: string; icon: typeof Ruler; min: number; max: number; step: number; placeholder: string }[] = [
  { key: "heightCm", label: "身高", unit: "cm", icon: Ruler, min: 50, max: 280, step: 1, placeholder: "如 170" },
  { key: "weightKg", label: "体重", unit: "kg", icon: Scale, min: 20, max: 500, step: 0.5, placeholder: "如 65.5" },
  { key: "targetWeightKg", label: "目标体重", unit: "kg", icon: Scale, min: 20, max: 500, step: 0.5, placeholder: "如 60" },
];

const GENDERS = Object.keys(GENDER_LABELS) as Gender[];

export function ProfileForm({ initialProfile }: { initialProfile: BodyProfile | null }) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(() => ({
    gender: initialProfile?.gender ?? null,
    heightCm: initialProfile?.heightCm?.toString() ?? "",
    weightKg: initialProfile?.weightKg?.toString() ?? "",
    targetWeightKg: initialProfile?.targetWeightKg?.toString() ?? "",
  }));
  const [busy, setBusy] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const toNumberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));
      await api("/api/v1/profile", {
        method: "PUT",
        body: JSON.stringify({
          gender: form.gender,
          heightCm: toNumberOrNull(form.heightCm),
          weightKg: toNumberOrNull(form.weightKg),
          targetWeightKg: toNumberOrNull(form.targetWeightKg),
        }),
      });
      toast.success("个人资料已保存");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2.5">
          <Label id="gender-label" className="flex items-center gap-2 text-xs sm:text-sm"><VenusAndMars className="size-3.5 sm:size-4 text-primary" aria-hidden />性别</Label>
          {/* 分组容器不是表单控件，Label 用 htmlFor 关联不上，改用 aria-labelledby */}
          <div role="group" aria-labelledby="gender-label" className="flex gap-1 rounded-xl bg-muted p-1">
            {GENDERS.map((g) => (
              <button
                key={g}
                type="button"
                aria-pressed={form.gender === g}
                onClick={() => setForm({ ...form, gender: form.gender === g ? null : g })}
                className={`h-10 flex-1 rounded-lg text-sm font-medium transition-colors ${form.gender === g ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
              >
                {GENDER_LABELS[g]}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-muted-foreground">再次点击可取消选择。</p>
        </div>

        <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4">
          {NUMBER_FIELDS.map((f) => {
            const Icon = f.icon;
            return (
              <div key={f.key} className="space-y-4 rounded-xl border bg-muted/25 p-3 sm:p-4">
                <Label htmlFor={`profile-${f.key}`} className="flex items-center gap-2 text-xs sm:text-sm"><Icon className="size-3.5 sm:size-4 text-primary" aria-hidden />{f.label}</Label>
                <div className="relative">
                  <Input
                    id={`profile-${f.key}`}
                    type="number"
                    min={f.min}
                    max={f.max}
                    step={f.step}
                    inputMode="decimal"
                    placeholder={f.placeholder}
                    className="h-12 px-2.5 pr-10 text-base font-medium tabular-nums md:text-lg"
                    value={form[f.key]}
                    onChange={(e) => setForm({ ...form, [f.key]: e.target.value })}
                  />
                  <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{f.unit}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy}>
        {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}{busy ? "保存中…" : "保存资料"}
      </Button>
    </form>
  );
}
