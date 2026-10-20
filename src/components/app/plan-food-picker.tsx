"use client";

/**
 * 计划用的食物选择弹层：来源与日记的「添加食物」一致（最近吃过 / 收藏 / 搜索 / 参考库），
 * 但只把选中的食物回调给计划表单的本地状态，不写饮食记录（不发 /api/v1/meals）。
 * 参考库条目不是个人食物，沿用日记页的做法：先抄进个人食物库，再把抄好的食物回调出去。
 */
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, History, Search, Star } from "lucide-react";
import type { Food } from "@/db/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import type { MacroLike } from "@/lib/nutrition";

/** 选中结果：计划项只需要个人 food.id、食物名和每 100g 营养，克数由表单自己折算。 */
export type PlanFoodPick = { foodId: string; name: string; per100g: MacroLike };

/** 参考库条目（《中国食物成分表》公共只读数据） */
type ReferenceFood = {
  id: number;
  name: string;
  englishName: string | null;
  category: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
};

type Props = {
  /** 目标餐次名，只用于标题文案（早餐 / 午餐 / 晚餐） */
  mealLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (pick: PlanFoodPick) => void;
};

/** 一行个人食物选项 */
function FoodRow({ food, onPick }: { food: Food; onPick: (food: Food) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(food)}
      className="flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors hover:bg-muted"
    >
      <div>
        <div className="flex items-center gap-1.5 font-medium">
          {food.isFavorite && <Star className="size-3.5 fill-foreground text-foreground" aria-hidden />}
          {food.name}
        </div>
        <div className="text-xs text-muted-foreground">
          {Math.round(food.calories)} 千卡/100g · 蛋白 {Math.round(food.protein)}g
          {food.servingGrams ? ` · 一份 ${food.servingGrams}g` : ""}
        </div>
      </div>
    </button>
  );
}

/** 结果绑定关键词；清理时同时取消请求并屏蔽迟到响应（含失败）。 */
function useFoodSearch<T>(query: string, path: string, open: boolean) {
  const term = query.trim();
  const [result, setResult] = useState<{
    query: string;
    foods: T[];
    error: string | null;
  } | null>(null);

  useEffect(() => {
    if (!open || !term) return;
    let active = true;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const data = await api<{ foods: T[] }>(`${path}?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });
        if (active) setResult({ query: term, foods: data.foods, error: null });
      } catch (error) {
        if (active) {
          setResult({
            query: term,
            foods: [],
            error: error instanceof Error ? error.message : "搜索失败，请重新输入后重试",
          });
        }
      }
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [term, path, open]);

  const current = open && term && result?.query === term ? result : null;
  return {
    results: current?.foods ?? [],
    searching: Boolean(open && term && !current),
    error: current?.error ?? null,
  };
}

export function PlanFoodPicker({ mealLabel, open, onOpenChange, onSelect }: Props) {
  // 四个来源的数据
  const [recents, setRecents] = useState<Food[]>([]);
  const [favorites, setFavorites] = useState<Food[]>([]);
  const [q, setQ] = useState("");
  const { results, searching, error: searchError } = useFoodSearch<Food>(q, "/api/v1/foods", open);

  // 参考库的搜索与抄录状态
  const [refQ, setRefQ] = useState("");
  const { results: refResults, searching: refSearching, error: refError } =
    useFoodSearch<ReferenceFood>(refQ, "/api/v1/foods/reference", open);
  const [importing, setImporting] = useState(false);

  // 每次重新打开时清掉上一次的搜索词（渲染期对比 prop，避免在 effect 里级联 setState）
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQ("");
      setRefQ("");
    }
  }

  /** 打开时拉取“最近吃过”和“收藏” */
  useEffect(() => {
    if (!open) return;
    api<{ foods: Food[] }>("/api/v1/foods/recents")
      .then((d) => setRecents(d.foods))
      .catch(() => {});
    api<{ foods: Food[] }>("/api/v1/foods?favorite=true")
      .then((d) => setFavorites(d.foods))
      .catch(() => {});
  }, [open]);

  /** 选中个人食物：只回调给计划表单，不写库 */
  function pick(food: Food) {
    onSelect({
      foodId: food.id,
      name: food.name,
      per100g: {
        calories: food.calories,
        protein: food.protein,
        carbs: food.carbs,
        fat: food.fat,
      },
    });
    onOpenChange(false);
  }

  /** 从参考库选中：库里已有同名食物就直接复用，否则抄录一条新的（与日记页同一套接口与提示） */
  async function pickReference(reference: ReferenceFood) {
    setImporting(true);
    try {
      const { foods } = await api<{ foods: Food[] }>(
        `/api/v1/foods?q=${encodeURIComponent(reference.name)}`,
      );
      const existing = foods.find((f) => f.name === reference.name);
      if (existing) {
        toast.success(`「${reference.name}」已在你的食物库，直接选用`);
        pick(existing);
        return;
      }

      const { food } = await api<{ food: Food }>("/api/v1/foods", {
        method: "POST",
        body: JSON.stringify({
          name: reference.name,
          brand: null,
          calories: reference.calories ?? 0,
          protein: reference.protein ?? 0,
          carbs: reference.carbs ?? 0,
          fat: reference.fat ?? 0,
          servingGrams: null,
        }),
      });
      toast.success(`「${reference.name}」已加入你的食物库`);
      pick(food);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      setImporting(false);
    }
  }

  // 搜索词清空时列表立即视为空：渲染期派生，不在 effect 里清状态
  const visibleResults = q.trim() === "" ? [] : results;
  const visibleRefResults = refQ.trim() === "" ? [] : refResults;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>为{mealLabel}选择食物</DialogTitle>
          <DialogDescription>
            选中后加入计划里的这一餐，克数稍后在计划里改；这里不会写入饮食记录。
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="recents">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="recents">
              <History className="size-4" aria-hidden />
              最近
            </TabsTrigger>
            <TabsTrigger value="favorites">
              <Star className="size-4" aria-hidden />
              收藏
            </TabsTrigger>
            <TabsTrigger value="search">
              <Search className="size-4" aria-hidden />
              搜索
            </TabsTrigger>
            <TabsTrigger value="reference">
              <BookOpen className="size-4" aria-hidden />
              参考库
            </TabsTrigger>
          </TabsList>

          <TabsContent value="recents" className="mt-3 space-y-2">
            {recents.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                还没有记录过，去“搜索”或食物库添加吧
              </p>
            )}
            {recents.map((f) => (
              <FoodRow key={f.id} food={f} onPick={pick} />
            ))}
          </TabsContent>

          <TabsContent value="favorites" className="mt-3 space-y-2">
            {favorites.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                在食物库里点星标即可收藏常用食物
              </p>
            )}
            {favorites.map((f) => (
              <FoodRow key={f.id} food={f} onPick={pick} />
            ))}
          </TabsContent>

          <TabsContent value="search" className="mt-3 space-y-2">
            <Input
              autoFocus
              placeholder="搜索食物库名称…"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
            {searching && <p className="py-4 text-center text-sm text-muted-foreground">搜索中…</p>}
            {searchError && <p role="alert" className="py-4 text-sm text-destructive">{searchError}</p>}
            {!searching && !searchError && q.trim() !== "" && results.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">
                没找到，可以去
                <a href="/foods" className="mx-0.5 underline underline-offset-2">
                  食物库
                </a>
                新增
              </p>
            )}
            {visibleResults.map((f) => (
              <FoodRow key={f.id} food={f} onPick={pick} />
            ))}
          </TabsContent>

          <TabsContent value="reference" className="mt-3 space-y-2">
            <Input
              autoFocus
              placeholder="搜索《中国食物成分表》1677 种食物…"
              value={refQ}
              onChange={(e) => setRefQ(e.target.value)}
            />
            {refSearching && (
              <p className="py-4 text-center text-sm text-muted-foreground">搜索中…</p>
            )}
            {refError && <p role="alert" className="py-4 text-sm text-destructive">{refError}</p>}
            {!refSearching && !refError && refQ.trim() !== "" && refResults.length === 0 && (
              <p className="py-6 text-center text-sm text-muted-foreground">参考库里也没有</p>
            )}
            {visibleRefResults.map((r) => (
              <button
                key={r.id}
                type="button"
                disabled={importing}
                onClick={() => pickReference(r)}
                className="flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors hover:bg-muted disabled:opacity-50"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{r.name}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {r.category}
                    {r.englishName ? ` · ${r.englishName}` : ""}
                  </div>
                </div>
                <div className="shrink-0 pl-2 text-right text-xs tabular-nums text-muted-foreground">
                  {r.calories != null ? (
                    <>
                      <span className="font-medium text-foreground">{Math.round(r.calories)}</span>{" "}
                      千卡/100g
                      <br />
                      蛋白 {r.protein ?? "-"} · 碳水 {r.carbs ?? "-"} · 脂肪 {r.fat ?? "-"}
                    </>
                  ) : (
                    "无能量数据"
                  )}
                </div>
              </button>
            ))}
            <p className="pt-1 text-center text-[11px] text-muted-foreground">
              选中后自动抄录到你的食物库 · 数据：中国食物成分表（标准版第6版）
            </p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
