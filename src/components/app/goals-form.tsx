"use client";

/**
 * 目标设置表单：每日热量和三大宏量营养素目标。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";

const FIELDS = [
  { key: "calories", label: "每日热量", unit: "千卡" },
  { key: "protein", label: "蛋白质", unit: "克" },
  { key: "carbs", label: "碳水", unit: "克" },
  { key: "fat", label: "脂肪", unit: "克" },
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
    <form onSubmit={handleSave} className="space-y-4">
      {FIELDS.map((f) => (
        <div key={f.key} className="flex items-center gap-3">
          <Label htmlFor={`goal-${f.key}`} className="w-24 shrink-0">
            {f.label}
          </Label>
          <Input
            id={`goal-${f.key}`}
            type="number"
            min={0}
            required
            className="w-32"
            value={goals[f.key]}
            onChange={(e) =>
              setGoals({ ...goals, [f.key]: Number(e.target.value) || 0 })
            }
          />
          <span className="text-sm text-muted-foreground">{f.unit}</span>
        </div>
      ))}
      <Button type="submit" disabled={busy}>
        {busy ? "保存中…" : "保存目标"}
      </Button>
    </form>
  );
}
