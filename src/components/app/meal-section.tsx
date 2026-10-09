"use client";

/**
 * 日记页的一个餐次区块：标题栏（餐名 + 小计 + 添加按钮）
 * + 该餐的记录列表（可改克数、可删除）。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import type { MealEntry } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import type { MealType } from "@/lib/nutrition";
import { FoodPicker } from "./food-picker";
import { MEAL_STYLES } from "./meal-styles";

export function MealSection({
  date,
  mealType,
  label,
  entries,
}: {
  date: string;
  mealType: MealType;
  label: string;
  entries: MealEntry[];
}) {
  const router = useRouter();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGrams, setEditGrams] = useState(0);
  const [busy, setBusy] = useState(false);

  const kcalTotal = Math.round(entries.reduce((s, e) => s + e.calories, 0));
  const style = MEAL_STYLES[mealType];
  const MealIcon = style.icon;

  async function handleDelete(id: string, name: string, grams: number) {
    if (!window.confirm(`确定删除「${name} ${grams}g」吗？`)) return;
    setBusy(true);
    try {
      await api(`/api/v1/meals/${id}`, { method: "DELETE" });
      toast.success("已删除");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    } finally {
      setBusy(false);
    }
  }

  async function handleSaveGrams(id: string) {
    if (editGrams < 1) return;
    setBusy(true);
    try {
      await api(`/api/v1/meals/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ grams: editGrams }),
      });
      toast.success("已更新克数");
      setEditingId(null);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "更新失败");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section id={`meal-${mealType}`} className="scroll-mt-6 overflow-hidden rounded-2xl border bg-card shadow-[0_2px_12px_-8px_#233e2e26]">
      {/* 区块标题栏：彩色图标 + 餐名 + 小计 */}
      <div className="flex items-center justify-between gap-3 border-b px-4 py-4 sm:px-5">
        <div className="flex items-center gap-2.5">
          <span className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${style.chip}`}>
            <MealIcon className="size-5" strokeWidth={1.7} aria-hidden />
          </span>
          <div>
            <h2 className="text-sm font-semibold">{label}</h2>
            <p className="mt-1 text-xs tabular-nums text-muted-foreground">{entries.length > 0 ? `${entries.length} 项食物 · ${kcalTotal} 千卡` : "等待记录"}</p>
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
          <Plus className="size-4" aria-hidden />
          添加
        </Button>
      </div>

      {/* 记录列表 */}
      {entries.length === 0 ? (
        <button type="button" onClick={() => setPickerOpen(true)} className="flex min-h-22 w-full items-center justify-center gap-2 px-4 py-5 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-primary"><Plus className="size-3.5" aria-hidden />添加食物，记录这一餐</button>
      ) : (
        <ul className="divide-y">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-center gap-2 px-4 py-4 sm:gap-3 sm:px-5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{e.name}</div>
                {editingId === e.id ? (
                  /* 行内改克数：保存/取消 */
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Input
                      type="number"
                      min={1}
                      max={5000}
                      className="h-7 w-24"
                      value={editGrams}
                      onChange={(ev) => setEditGrams(Number(ev.target.value) || 0)}
                    />
                    <span className="text-xs text-muted-foreground">克</span>
                    <Button
                      size="sm"
                      className="h-7"
                      disabled={busy}
                      onClick={() => handleSaveGrams(e.id)}
                    >
                      保存
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7"
                      onClick={() => setEditingId(null)}
                    >
                      取消
                    </Button>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="mt-1 text-left text-xs leading-5 text-muted-foreground hover:text-foreground hover:underline"
                    title="点击修改克数"
                    onClick={() => {
                      setEditingId(e.id);
                      setEditGrams(e.grams);
                    }}
                  >
                    <span className="block">{e.grams} g · 点击调整份量</span>
                    <span className="block text-[11px]">蛋白 {Math.round(e.protein)}g · 碳水 {Math.round(e.carbs)}g · 脂肪 {Math.round(e.fat)}g</span>
                  </button>
                )}
              </div>
              <span className="text-sm font-semibold tabular-nums">
                {Math.round(e.calories)}
                <span className="ml-0.5 text-xs font-normal text-muted-foreground">千卡</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="size-10 text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => handleDelete(e.id, e.name, e.grams)}
                title="删除"
                aria-label={`删除${e.name}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <FoodPicker
        date={date}
        mealType={mealType}
        mealLabel={label}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
      />
    </section>
  );
}
