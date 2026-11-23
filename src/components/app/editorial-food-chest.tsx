"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, History, Loader2, Plus, Search, Star, Utensils } from "lucide-react";
import { toast } from "sonner";
import type { Food } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api-client";
import { MEAL_LABELS, MEAL_ORDER, type MealType } from "@/lib/nutrition";

type ReferenceFood = {
  id: number;
  foodCode: string;
  name: string;
  englishName: string | null;
  category: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  edible: number | null;
};

type CapsuleTab = "recents" | "favorites" | "all";

export function EditorialFoodChest({
  date,
  canRecord,
  targetMeal,
  onTargetMealChange,
  recentFoods,
  myFoods,
  searchInputRef,
  onOpenLibrary,
}: {
  date: string;
  canRecord: boolean;
  targetMeal: MealType;
  onTargetMealChange: (mealType: MealType) => void;
  recentFoods: Food[];
  myFoods: Food[];
  searchInputRef: React.RefObject<HTMLInputElement | null>;
  onOpenLibrary: () => void;
}) {
  const router = useRouter();
  const [capsuleTab, setCapsuleTab] = useState<CapsuleTab>(() =>
    recentFoods.length > 0 ? "recents" : "favorites",
  );
  const [loggingKey, setLoggingKey] = useState<string | null>(null);
  const busyRef = useRef(false);

  // 新建自定义食物折叠表单
  const [customOpen, setCustomOpen] = useState(false);
  const [cfName, setCfName] = useState("");
  const [cfBrand, setCfBrand] = useState("");
  const [cfCal, setCfCal] = useState("");
  const [cfPro, setCfPro] = useState("0");
  const [cfCarb, setCfCarb] = useState("0");
  const [cfFat, setCfFat] = useState("0");
  const [cfServing, setCfServing] = useState("");
  const [creatingFood, setCreatingFood] = useState(false);

  // 官方参考库搜索
  const [refQ, setRefQ] = useState("");
  const [refResults, setRefResults] = useState<ReferenceFood[]>([]);
  const [refSearching, setRefSearching] = useState(false);
  const activeRef = useRef(true);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
    };
  }, []);

  useEffect(() => {
    const trimmed = refQ.trim();
    if (!trimmed) return;
    const timer = setTimeout(async () => {
      setRefSearching(true);
      try {
        const res = await api<{ foods: ReferenceFood[] }>(
          `/api/v1/foods/reference?q=${encodeURIComponent(trimmed)}`,
        );
        if (activeRef.current) setRefResults(res.foods);
      } catch (err) {
        if (activeRef.current) {
          toast.error(err instanceof Error ? err.message : "参考库查询失败");
        }
      } finally {
        if (activeRef.current) setRefSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [refQ]);

  const favoriteFoods = myFoods.filter((f) => f.isFavorite);
  const capsuleList =
    capsuleTab === "recents"
      ? recentFoods.slice(0, 12)
      : capsuleTab === "favorites"
        ? favoriteFoods.slice(0, 18)
        : myFoods.slice(0, 18);

  const mealLabel = MEAL_LABELS[targetMeal];

  async function logMyFood(food: Food) {
    if (!canRecord) {
      toast.error("不能记录未来日期");
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setLoggingKey(food.id);
    const grams = food.servingGrams && food.servingGrams >= 1 ? food.servingGrams : 100;
    try {
      const { entry } = await api<{ entry: { id: string; name: string; grams: number } }>(
        "/api/v1/meals",
        {
          method: "POST",
          body: JSON.stringify({ date, mealType: targetMeal, foodId: food.id, grams }),
        },
      );
      toast.success(`已记入${mealLabel}：${entry.name} ${entry.grams}g`);
      router.refresh();
    } catch (err) {
      const isUnknown = !(err instanceof ApiError && err.status < 500);
      if (isUnknown) {
        toast.error("记录结果未确认，正在刷新核对，避免重复记录。");
        router.refresh();
      } else {
        toast.error(err.message);
      }
    } finally {
      busyRef.current = false;
      setLoggingKey(null);
    }
  }

  async function cloneAndLogReference(ref: ReferenceFood) {
    if (!canRecord) {
      toast.error("不能记录未来日期");
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setLoggingKey(`ref-${ref.id}`);

    try {
      let targetFood = myFoods.find((f) => f.name === ref.name);
      if (!targetFood) {
        const res = await api<{ foods: Food[] }>(
          `/api/v1/foods?q=${encodeURIComponent(ref.name)}`,
        );
        targetFood = res.foods.find((f) => f.name === ref.name);
      }

      let cloned = false;
      if (!targetFood) {
        const created = await api<{ food: Food }>("/api/v1/foods", {
          method: "POST",
          body: JSON.stringify({
            name: ref.name,
            brand: "中国食物成分表",
            calories: ref.calories ?? 0,
            protein: ref.protein ?? 0,
            carbs: ref.carbs ?? 0,
            fat: ref.fat ?? 0,
            servingGrams: 100,
          }),
        });
        targetFood = created.food;
        cloned = true;
      }

      const { entry } = await api<{ entry: { id: string; name: string; grams: number } }>(
        "/api/v1/meals",
        {
          method: "POST",
          body: JSON.stringify({
            date,
            mealType: targetMeal,
            foodId: targetFood.id,
            grams: 100,
          }),
        },
      );

      toast.success(
        cloned
          ? `已转存至食物库并记入${mealLabel}：${entry.name} ${entry.grams}g`
          : `已记入${mealLabel}：${entry.name} ${entry.grams}g`,
      );
      router.refresh();
    } catch (err) {
      const isUnknown = !(err instanceof ApiError && err.status < 500);
      if (isUnknown) {
        toast.error("入账结果未确认，正在刷新核对，避免重复记录。");
        router.refresh();
      } else {
        toast.error(err.message);
      }
    } finally {
      busyRef.current = false;
      setLoggingKey(null);
    }
  }

  async function handleCreateCustomFood(e: React.FormEvent) {
    e.preventDefault();
    if (creatingFood || busyRef.current) return;
    const trimmedName = cfName.trim();
    if (!trimmedName || cfCal.trim() === "") {
      toast.error("请填写食物名称和热量");
      return;
    }

    busyRef.current = true;
    setCreatingFood(true);
    let createdFood: Food | null = null;
    try {
      const created = await api<{ food: Food }>("/api/v1/foods", {
        method: "POST",
        body: JSON.stringify({
          name: trimmedName,
          brand: cfBrand.trim() === "" ? null : cfBrand.trim(),
          calories: Number(cfCal),
          protein: Number(cfPro || 0),
          carbs: Number(cfCarb || 0),
          fat: Number(cfFat || 0),
          servingGrams: cfServing.trim() === "" ? null : Number(cfServing),
        }),
      });
      createdFood = created.food;

      if (canRecord) {
        const grams = createdFood.servingGrams ?? 100;
        await api("/api/v1/meals", {
          method: "POST",
          body: JSON.stringify({
            date,
            mealType: targetMeal,
            foodId: createdFood.id,
            grams,
          }),
        });
        toast.success(`已存入食物库并记入${mealLabel}：${createdFood.name} ${grams}g`);
      } else {
        toast.success(`已存入个人食物库：${createdFood.name}`);
      }

      setCfName("");
      setCfBrand("");
      setCfCal("");
      setCfPro("0");
      setCfCarb("0");
      setCfFat("0");
      setCfServing("");
      setCustomOpen(false);
      router.refresh();
    } catch (err) {
      if (createdFood) {
        toast.error(
          `食物「${createdFood.name}」已存入个人库，但记餐失败：${
            err instanceof Error ? err.message : "请刷新核对"
          }`,
        );
        setCustomOpen(false);
        router.refresh();
      } else {
        toast.error(err instanceof Error ? err.message : "创建自定义食物失败");
      }
    } finally {
      busyRef.current = false;
      setCreatingFood(false);
    }
  }

  const visibleRefResults = refQ.trim() === "" ? [] : refResults;
  const personalMatches = refQ.trim()
    ? myFoods
        .filter((f) => f.name.toLowerCase().includes(refQ.trim().toLowerCase()))
        .slice(0, 4)
    : [];

  return (
    <section
      aria-labelledby="food-chest-title"
      className="space-y-4 rounded-2xl border bg-card p-5 shadow-xs"
    >
      {/* 顶部餐次目标选择器 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id="food-chest-title" className="flex items-center gap-1.5 text-sm font-bold">
            <Utensils className="size-4" aria-hidden />
            <span>食物百宝箱</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            点胶囊一键入账 · 官方库自动克隆转存
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <label htmlFor="chest-target-meal" className="text-muted-foreground">
            记入:
          </label>
          <select
            id="chest-target-meal"
            value={targetMeal}
            onChange={(e) => onTargetMealChange(e.target.value as MealType)}
            className="rounded-xl border bg-background px-2.5 py-1.5 font-semibold text-foreground"
          >
            {MEAL_ORDER.map((m) => (
              <option key={m} value={m}>
                {MEAL_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 第一区：最近常吃 12 / 我的收藏 / 全部 胶囊云 */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
          <div className="flex items-center gap-1 rounded-xl border bg-background p-1">
            <button
              type="button"
              onClick={() => setCapsuleTab("recents")}
              aria-pressed={capsuleTab === "recents"}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 transition-colors ${
                capsuleTab === "recents"
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              <History className="size-3" aria-hidden />
              最近 ({recentFoods.length})
            </button>
            <button
              type="button"
              onClick={() => setCapsuleTab("favorites")}
              aria-pressed={capsuleTab === "favorites"}
              className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1 transition-colors ${
                capsuleTab === "favorites"
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              <Star className="size-3" aria-hidden />
              收藏 ({favoriteFoods.length})
            </button>
            <button
              type="button"
              onClick={() => setCapsuleTab("all")}
              aria-pressed={capsuleTab === "all"}
              className={`rounded-lg px-2.5 py-1 transition-colors ${
                capsuleTab === "all"
                  ? "bg-primary font-semibold text-primary-foreground"
                  : "font-medium text-muted-foreground hover:text-foreground"
              }`}
            >
              全部 ({myFoods.length})
            </button>
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            点击按常用份量入账
          </span>
        </div>

        <div className="flex flex-wrap gap-1.5 pt-0.5">
          {capsuleList.length === 0 ? (
            <div className="w-full rounded-xl border border-dashed bg-background p-3 text-center text-xs text-muted-foreground">
              {capsuleTab === "recents"
                ? "近期暂无饮食记录，可切换到「全部」或下方搜索食物。"
                : capsuleTab === "favorites"
                  ? "暂无收藏食物，可在「我的食物库」点星标收藏。"
                  : "食物库为空，点击下方新建自定义食物或搜索官方库。"}
            </div>
          ) : (
            capsuleList.map((f) => {
              const isBusy = loggingKey === f.id;
              return (
                <button
                  key={f.id}
                  type="button"
                  disabled={!canRecord || loggingKey !== null}
                  onClick={() => void logMyFood(f)}
                  className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary disabled:opacity-45"
                  title={`每100g ${Math.round(f.calories)} kcal · 点击记入${mealLabel}`}
                >
                  {isBusy ? (
                    <Loader2 className="size-3 animate-spin" aria-hidden />
                  ) : f.isFavorite ? (
                    <Star className="size-3 fill-foreground text-foreground" aria-hidden />
                  ) : null}
                  <span>{f.name}</span>
                  <span className="font-mono text-muted-foreground">
                    {f.servingGrams ?? 100}g
                  </span>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* 第二区：官方成分表检索 + 新建自定义食物 */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-bold">
            <BookOpen className="size-3.5" aria-hidden />
            <span>《中国食物成分表》官方库</span>
            <span className="font-mono font-normal text-muted-foreground">(1677种)</span>
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onOpenLibrary}
              className="rounded-lg border bg-background px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              管理库
            </button>
            <button
              type="button"
              onClick={() => setCustomOpen((v) => !v)}
              aria-expanded={customOpen}
              className="inline-flex items-center gap-1 rounded-lg border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary"
            >
              <Plus className="size-3" aria-hidden />
              自定义食物
            </button>
          </div>
        </div>

        {/* 行内新建自定义食物表单 */}
        {customOpen && (
          <form
            onSubmit={handleCreateCustomFood}
            className="space-y-2.5 rounded-xl border border-primary bg-background p-3 text-xs"
          >
            <div className="flex items-center justify-between font-semibold">
              <span>新建个人食物 (每 100g 营养值)</span>
              <button
                type="button"
                onClick={() => setCustomOpen(false)}
                className="text-muted-foreground hover:text-foreground"
              >
                收起 ✕
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label htmlFor="cf-name" className="sr-only">
                  食物名称
                </Label>
                <Input
                  id="cf-name"
                  required
                  placeholder="食物名称 (必填)"
                  value={cfName}
                  disabled={creatingFood}
                  onChange={(e) => setCfName(e.target.value)}
                  className="h-8 bg-card text-xs"
                />
              </div>
              <div>
                <Label htmlFor="cf-brand" className="sr-only">
                  品牌/备注
                </Label>
                <Input
                  id="cf-brand"
                  placeholder="品牌/备注 (可选)"
                  value={cfBrand}
                  disabled={creatingFood}
                  onChange={(e) => setCfBrand(e.target.value)}
                  className="h-8 bg-card text-xs"
                />
              </div>
            </div>
            <div className="grid grid-cols-5 gap-1.5 font-mono">
              <label className="space-y-0.5">
                <span className="text-[11px] text-muted-foreground">热量kcal*</span>
                <Input
                  type="number"
                  min={0}
                  max={2000}
                  step="0.1"
                  required
                  value={cfCal}
                  disabled={creatingFood}
                  onChange={(e) => setCfCal(e.target.value)}
                  className="h-8 bg-card px-2 text-xs"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[11px] text-muted-foreground">蛋白g</span>
                <Input
                  type="number"
                  min={0}
                  max={200}
                  step="0.1"
                  value={cfPro}
                  disabled={creatingFood}
                  onChange={(e) => setCfPro(e.target.value)}
                  className="h-8 bg-card px-2 text-xs"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[11px] text-muted-foreground">碳水g</span>
                <Input
                  type="number"
                  min={0}
                  max={200}
                  step="0.1"
                  value={cfCarb}
                  disabled={creatingFood}
                  onChange={(e) => setCfCarb(e.target.value)}
                  className="h-8 bg-card px-2 text-xs"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[11px] text-muted-foreground">脂肪g</span>
                <Input
                  type="number"
                  min={0}
                  max={200}
                  step="0.1"
                  value={cfFat}
                  disabled={creatingFood}
                  onChange={(e) => setCfFat(e.target.value)}
                  className="h-8 bg-card px-2 text-xs"
                />
              </label>
              <label className="space-y-0.5">
                <span className="text-[11px] text-muted-foreground">单份g</span>
                <Input
                  type="number"
                  min={1}
                  max={5000}
                  placeholder="100"
                  value={cfServing}
                  disabled={creatingFood}
                  onChange={(e) => setCfServing(e.target.value)}
                  className="h-8 bg-card px-2 text-xs"
                />
              </label>
            </div>
            <Button type="submit" size="sm" className="w-full text-xs" disabled={creatingFood}>
              {creatingFood
                ? "保存中…"
                : canRecord
                  ? `存入个人食物库并记入${mealLabel}`
                  : "存入个人食物库"}
            </Button>
          </form>
        )}

        {/* 搜索框 */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchInputRef}
            type="search"
            aria-label="检索个人库或中国食物成分表"
            placeholder="搜官方成分表或个人库：如 里脊、草鱼、豆腐、燕麦…"
            value={refQ}
            onChange={(e) => setRefQ(e.target.value)}
            className="h-9 rounded-xl bg-background pl-8 text-xs"
          />
        </div>

        {/* 检索结果列表 */}
        <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
          {refQ.trim() === "" ? (
            <p className="rounded-xl border border-dashed bg-background px-3 py-6 text-center text-xs text-muted-foreground">
              输入食物关键词，实时检索个人食物库与《中国食物成分表（标准版第6版）》
            </p>
          ) : (
            <>
              {personalMatches.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-mono text-[11px] text-muted-foreground">我的食物库匹配</p>
                  {personalMatches.map((f) => {
                    const grams = f.servingGrams ?? 100;
                    const isBusy = loggingKey === f.id;
                    return (
                      <div
                        key={f.id}
                        className="flex items-center justify-between gap-2 rounded-xl border bg-background p-2.5 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{f.name}</div>
                          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                            {Math.round(f.calories)} kcal/100g · P:{f.protein}g C:{f.carbs}g F:{f.fat}g
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!canRecord || loggingKey !== null}
                          onClick={() => void logMyFood(f)}
                          className="shrink-0 rounded-lg border bg-card px-2.5 py-1.5 font-mono font-medium transition-colors hover:border-primary disabled:opacity-45"
                        >
                          {isBusy ? "记入中…" : `+ ${grams}g 入账`}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {refSearching && (
                <div className="flex items-center justify-center gap-1.5 py-4 text-xs text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" aria-hidden />
                  正在检索官方成分表…
                </div>
              )}

              {!refSearching && visibleRefResults.length === 0 && personalMatches.length === 0 && (
                <p className="py-5 text-center text-xs text-muted-foreground">
                  未找到匹配食物，可点击上方「+ 自定义食物」快速录入。
                </p>
              )}

              {visibleRefResults.length > 0 && (
                <div className="space-y-1.5">
                  <p className="font-mono text-[11px] text-muted-foreground">
                    官方成分表（点击自动转存至个人库并入账）
                  </p>
                  {visibleRefResults.map((r) => {
                    const isBusy = loggingKey === `ref-${r.id}`;
                    return (
                      <div
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded-xl border bg-background p-2.5 text-xs"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-semibold">
                            {r.name}{" "}
                            <span className="font-mono font-normal text-muted-foreground">
                              [{r.foodCode}]
                            </span>
                          </div>
                          <div className="mt-0.5 font-mono text-[11px] text-muted-foreground">
                            {r.calories != null ? `${Math.round(r.calories)} kcal/100g` : "无能量数据"} · P:
                            {r.protein ?? "-"}g C:{r.carbs ?? "-"}g F:{r.fat ?? "-"}g
                            {r.edible != null ? ` · 可食部 ${r.edible}%` : ""}
                          </div>
                        </div>
                        <button
                          type="button"
                          disabled={!canRecord || loggingKey !== null}
                          onClick={() => void cloneAndLogReference(r)}
                          className="shrink-0 rounded-lg border bg-card px-2.5 py-1.5 font-mono font-medium transition-colors hover:border-primary disabled:opacity-45"
                        >
                          {isBusy ? "入账中…" : "+ 100g 入账"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </section>
  );
}
