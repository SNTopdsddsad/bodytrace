"use client";

/**
 * 食物库管理：卡片网格 + 搜索 + 新增/编辑弹窗 + 收藏 + 删除。
 * 所有营养值按“每 100 克”录入；“一份克数”可选，填了以后记饮食时可以一键按份添加。
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Pencil, Plus, Search, Star, Trash2, Utensils } from "lucide-react";
import type { Food } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  // null = 关闭弹窗；否则是正在编辑的食物（undefined key 表示新增）
  const [editing, setEditing] = useState<Food | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [busy, setBusy] = useState(false);

  // 前端本地过滤即可（个人食物库量级很小）
  const filtered = initialFoods.filter((f) => f.name.includes(q.trim()) && (!onlyFavorites || f.isFavorite));

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
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card p-4 sm:p-5">
        <div className="relative min-w-0 flex-1 sm:max-w-md">
          <Search
            className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            className="bg-muted/40 pl-10"
            placeholder="搜索食物名称…"
            aria-label="搜索食物"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" aria-hidden />
          新增食物
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-xl bg-muted p-1">
          <Button variant={onlyFavorites ? "ghost" : "outline"} size="sm" aria-pressed={!onlyFavorites} onClick={() => setOnlyFavorites(false)}>全部食物 <span className="text-xs text-muted-foreground">{initialFoods.length}</span></Button>
          <Button variant={onlyFavorites ? "outline" : "ghost"} size="sm" aria-pressed={onlyFavorites} onClick={() => setOnlyFavorites(true)}><Star className="size-3.5" aria-hidden />我的收藏</Button>
        </div>
        <span className="text-xs text-muted-foreground">营养数值均为每 100 克</span>
      </div>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {filtered.length === 0 && (
          <li className="col-span-full flex flex-col items-center rounded-2xl border bg-card px-4 py-14 text-center text-sm text-muted-foreground">
            <Utensils className="mb-4 size-7 text-primary/50" aria-hidden />
            {onlyFavorites && !q ? "还没有收藏，点击食物旁的星标试试。" : "没有匹配的食物，试试其他名称。"}
          </li>
        )}
        {filtered.map((f) => (
          <li key={f.id} className="min-w-0">
            <Card size="sm" className="h-full gap-0 py-3 transition-colors hover:border-primary/30">
              <CardContent className="flex flex-1 flex-col gap-1.5">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <h2 className="break-words text-sm font-semibold leading-5">
                      {f.name}
                    </h2>
                    {f.brand && (
                      <p className="mt-0.5 break-words text-xs leading-4 text-muted-foreground">{f.brand}</p>
                    )}
                    {f.servingGrams != null && (
                      <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">一份 {f.servingGrams} g</p>
                    )}
                  </div>
                  <div className="flex shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11"
                      onClick={() => toggleFavorite(f)}
                      title={f.isFavorite ? "取消收藏" : "收藏"}
                      aria-label={`${f.isFavorite ? "取消收藏" : "收藏"}${f.name}`}
                      aria-pressed={f.isFavorite}
                    >
                      <Star
                        className={
                          "size-5 " +
                          (f.isFavorite
                            ? "fill-amber-400 text-amber-400"
                            : "text-muted-foreground")
                        }
                        aria-hidden
                      />
                    </Button>
                    <Button variant="ghost" size="icon" className="size-11" onClick={() => openEdit(f)} title="编辑" aria-label={`编辑${f.name}`}>
                      <Pencil className="size-4" aria-hidden />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-11 text-muted-foreground hover:text-destructive"
                      onClick={() => handleDelete(f)}
                      title="删除"
                      aria-label={`删除${f.name}`}
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                </div>
                <dl className="mt-auto grid grid-cols-2 gap-x-3 gap-y-1 rounded-lg bg-muted/50 px-3 py-2">
                  {[
                    { label: "热量", value: f.calories, unit: "千卡" },
                    { label: "蛋白质", value: f.protein, unit: "g" },
                    { label: "碳水", value: f.carbs, unit: "g" },
                    { label: "脂肪", value: f.fat, unit: "g" },
                  ].map((macro) => (
                    <div key={macro.label} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-1">
                      <dt className="text-xs text-muted-foreground">{macro.label}</dt>
                      <dd className={`text-sm font-medium tabular-nums ${macro.label === "热量" ? "text-primary" : ""}`}>
                        {macro.value}<span className="ml-0.5 text-[11px] font-normal text-muted-foreground">{macro.unit}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          </li>
        ))}
      </ul>

      {/* 新增/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-lg">
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
