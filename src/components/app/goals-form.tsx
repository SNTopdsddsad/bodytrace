"use client";

/**
 * 目标设置表单：每日热量和三大宏量营养素目标。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Beef, Droplets, Flame, LoaderCircle, Save, Wheat } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";

const FIELDS = [
  { key: "calories", label: "每日热量", unit: "千卡", icon: Flame, color: "text-primary" },
  { key: "protein", label: "蛋白质", unit: "克", icon: Beef, color: "text-chart-2" },
  { key: "carbs", label: "碳水化合物", unit: "克", icon: Wheat, color: "text-chart-3" },
  { key: "fat", label: "脂肪", unit: "克", icon: Droplets, color: "text-chart-4" },
] as const;

type Goals = { calories: number; protein: number; carbs: number; fat: number };

export function GoalsForm({ initialGoals }: { initialGoals: Goals }) {
  const router = useRouter();
  const [goals, setGoals] = useState<Goals>(initialGoals);
  const [busy, setBusy] = useState(false);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await api("/api/v1/goals", {
        method: "PUT",
        body: JSON.stringify({
          calories: Number(goals.calories),
          protein: Number(goals.protein),
          carbs: Number(goals.carbs),
          fat: Number(goals.fat),
        }),
      });
      toast.success("目标已保存");
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      <div className="grid grid-cols-1 gap-3 min-[360px]:grid-cols-2 sm:gap-4">
      {FIELDS.map((f) => {
        const Icon = f.icon;
        return (
        <div key={f.key} className="space-y-4 rounded-xl border bg-muted/25 p-3 sm:p-4">
          <Label htmlFor={`goal-${f.key}`} className="flex items-center gap-2 text-xs sm:text-sm"><Icon className={`size-3.5 sm:size-4 ${f.color}`} aria-hidden />{f.label}</Label>
          <div className="relative"><Input
            id={`goal-${f.key}`}
            type="number"
            min={0}
            required
            className="h-12 px-2.5 pr-10 text-base font-medium tabular-nums md:text-lg"
            value={goals[f.key]}
            onChange={(e) =>
              setGoals({ ...goals, [f.key]: Number(e.target.value) || 0 })
            }
          /><span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">{f.unit}</span></div>
        </div>
      );})}
      </div>
      <Button type="submit" size="lg" className="w-full sm:w-auto" disabled={busy}>
        {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Save className="size-4" aria-hidden />}{busy ? "保存中…" : "保存目标"}
      </Button>
    </form>
  );
}
