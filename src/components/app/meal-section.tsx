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
    <section className={`rounded-xl border border-l-4 ${style.bar}`}>
      {/* 区块标题栏：彩色图标 + 餐名 + 小计 */}
      <div className="flex items-center justify-between border-b px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className={`flex size-8 items-center justify-center rounded-full ${style.chip}`}>
            <MealIcon className="size-4" aria-hidden />
          </span>
          <div className="flex items-baseline gap-2">
            <h2 className="font-semibold">{label}</h2>
            {entries.length > 0 && (
              <span className={`text-sm tabular-nums font-medium ${style.value}`}>
                {kcalTotal} 千卡
              </span>
            )}
          </div>
        </div>
        <Button size="sm" variant="secondary" onClick={() => setPickerOpen(true)}>
          <Plus className="size-4" aria-hidden />
          添加
        </Button>
      </div>

      {/* 记录列表 */}
      {entries.length === 0 ? (
        <p className="px-4 py-5 text-sm text-muted-foreground">还没有记录</p>
      ) : (
        <ul className="divide-y">
          {entries.map((e) => (
            <li key={e.id} className="flex items-center gap-3 px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium">{e.name}</div>
                {editingId === e.id ? (
                  /* 行内改克数：保存/取消 */
                  <div className="mt-1 flex items-center gap-2">
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
                    className="text-xs text-muted-foreground hover:text-foreground hover:underline"
                    title="点击修改克数"
                    onClick={() => {
                      setEditingId(e.id);
                      setEditGrams(e.grams);
                    }}
                  >
                    {e.grams}g · 蛋白 {Math.round(e.protein)}g · 碳水 {Math.round(e.carbs)}g ·
                    脂肪 {Math.round(e.fat)}g
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
                className="size-8 text-muted-foreground hover:text-destructive"
                disabled={busy}
                onClick={() => handleDelete(e.id, e.name, e.grams)}
                title="删除"
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
