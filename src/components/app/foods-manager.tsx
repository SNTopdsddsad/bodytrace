"use client";

/**
 * 食物库管理：列表 + 搜索 + 新增/编辑弹窗 + 收藏 + 删除。
 * 所有营养值按“每 100 克”录入；“一份克数”可选，填了以后记饮食时可以一键按份添加。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import type { Food } from "@/db/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api-client";

/** 弹窗表单的初始值（新增时用） */
const EMPTY_FORM = {
  name: "",
  brand: "",
  calories: "",
  protein: "",
  carbs: "",
  fat: "",
  servingGrams: "",
};

export function FoodsManager({ initialFoods }: { initialFoods: Food[] }) {
  const router = useRouter();
  const [q, setQ] = useState("");
  // null = 关闭弹窗；否则是正在编辑的食物（undefined key 表示新增）
  const [editing, setEditing] = useState<Food | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);

  // 前端本地过滤即可（个人食物库量级很小）
  const filtered = initialFoods.filter((f) => f.name.includes(q.trim()));

  function openCreate() {
    setEditing(null);
    setForm({ ...EMPTY_FORM });
    setDialogOpen(true);
  }

  function openEdit(f: Food) {
    setEditing(f);
    setForm({
      name: f.name,
      brand: f.brand ?? "",
      calories: String(f.calories),
      protein: String(f.protein),
      carbs: String(f.carbs),
      fat: String(f.fat),
      servingGrams: f.servingGrams != null ? String(f.servingGrams) : "",
    });
    setDialogOpen(true);
  }

  async function handleSave() {
    setBusy(true);
    try {
      const body = JSON.stringify({
        name: form.name,
        brand: form.brand.trim() === "" ? null : form.brand,
        calories: Number(form.calories),
        protein: Number(form.protein || 0),
        carbs: Number(form.carbs || 0),
        fat: Number(form.fat || 0),
        servingGrams:
          form.servingGrams.trim() === "" ? null : Number(form.servingGrams),
      });
      if (editing) {
        await api(`/api/v1/foods/${editing.id}`, { method: "PATCH", body });
        toast.success("已保存修改");
      } else {
        await api("/api/v1/foods", { method: "POST", body });
        toast.success("已新增食物");
      }
      setDialogOpen(false);
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存失败");
    } finally {
      setBusy(false);
    }
  }

  async function toggleFavorite(f: Food) {
    try {
      await api(`/api/v1/foods/${f.id}`, {
        method: "PATCH",
        body: JSON.stringify({ isFavorite: !f.isFavorite }),
      });
      router.refresh();
    } catch {
      toast.error("操作失败");
    }
  }

  async function handleDelete(f: Food) {
    if (!window.confirm(`确定删除「${f.name}」吗？历史记录会保留。`)) return;
    try {
      await api(`/api/v1/foods/${f.id}`, { method: "DELETE" });
      toast.success("已删除");
      router.refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "删除失败");
    }
  }

  const canSave =
    form.name.trim() !== "" && Number(form.calories) >= 0 && form.calories !== "";

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search
            className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="pl-8"
            placeholder="搜索食物…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          新增
        </Button>
      </div>

      <ul className="divide-y rounded-xl border">
        {filtered.length === 0 && (
          <li className="px-4 py-6 text-center text-sm text-muted-foreground">
            没有匹配的食物
          </li>
        )}
        {filtered.map((f) => (
          <li key={f.id} className="flex items-center gap-2 px-3 py-2.5">
            <button
              type="button"
              className="shrink-0"
              onClick={() => toggleFavorite(f)}
              title={f.isFavorite ? "取消收藏" : "收藏"}
            >
              <Star
                className={
                  "size-5 " +
                  (f.isFavorite
                    ? "fill-amber-400 text-amber-400"
                    : "text-muted-foreground hover:text-foreground")
                }
                aria-hidden
              />
            </button>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">
                {f.name}
                {f.brand && (
                  <span className="ml-1 text-xs text-muted-foreground">({f.brand})</span>
                )}
              </div>
              <div className="text-xs tabular-nums text-muted-foreground">
                {f.calories} 千卡 · 蛋白 {f.protein} · 碳水 {f.carbs} · 脂肪 {f.fat}
                {f.servingGrams != null && ` · 一份 ${f.servingGrams}g`}
                <span className="text-muted-foreground/60"> /100g</span>
              </div>
            </div>
            <Button variant="ghost" size="icon" className="size-8" onClick={() => openEdit(f)} title="编辑">
              <Pencil className="size-4" aria-hidden />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground hover:text-destructive"
              onClick={() => handleDelete(f)}
              title="删除"
            >
              <Trash2 className="size-4" aria-hidden />
            </Button>
          </li>
        ))}
      </ul>

      {/* 新增/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{editing ? "编辑食物" : "新增食物"}</DialogTitle>
            <DialogDescription>营养值按每 100 克填写，包装食品看背面营养成分表</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2 space-y-1.5">
              <Label htmlFor="f-name">名称 *</Label>
              <Input
                id="f-name"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：鸡胸肉"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-brand">品牌（可选）</Label>
              <Input
                id="f-brand"
                value={form.brand}
                onChange={(e) => setForm({ ...form, brand: e.target.value })}
                placeholder="如：某品牌"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-serving">一份 = 多少克（可选）</Label>
              <Input
                id="f-serving"
                type="number"
                min={1}
                value={form.servingGrams}
                onChange={(e) => setForm({ ...form, servingGrams: e.target.value })}
                placeholder="如 250"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-cal">热量（千卡/100g）*</Label>
              <Input
                id="f-cal"
                type="number"
                min={0}
                step="0.1"
                value={form.calories}
                onChange={(e) => setForm({ ...form, calories: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-protein">蛋白质 g</Label>
              <Input
                id="f-protein"
                type="number"
                min={0}
                step="0.1"
                value={form.protein}
                onChange={(e) => setForm({ ...form, protein: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-carbs">碳水 g</Label>
              <Input
                id="f-carbs"
                type="number"
                min={0}
                step="0.1"
                value={form.carbs}
                onChange={(e) => setForm({ ...form, carbs: e.target.value })}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="f-fat">脂肪 g</Label>
              <Input
                id="f-fat"
                type="number"
                min={0}
                step="0.1"
                value={form.fat}
                onChange={(e) => setForm({ ...form, fat: e.target.value })}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              取消
            </Button>
            <Button disabled={!canSave || busy} onClick={handleSave}>
              {busy ? "保存中…" : "保存"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
