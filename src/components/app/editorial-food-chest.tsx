"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, History, Loader2, Plus, Search, Star, Utensils } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import type { Food, MealEntry } from "@/db/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api-client";
import { withRequestTimeout } from "@/lib/request-timeout";
import { MEAL_LABELS, MEAL_ORDER, type MealType } from "@/lib/nutrition";
import {
  findReferenceCopy,
  referenceFoodValues,
  useReferenceFoodSearch,
  type ReferenceFood,
} from "@/lib/reference-food-client";
import { SOFT_SPRING, TAB_SPRING, TAP_SPRING } from "./motion-provider";

type CapsuleTab = "recents" | "favorites" | "all";
const REF_GRAMS_OPTIONS = [50, 100, 150, 200] as const;

type WriteReview = { message: string; href: string; label: string };

class UnconfirmedWrite extends Error {
  constructor(readonly review: WriteReview) {
    super(review.message);
  }
}

// 两个百宝箱共用一次写入状态，关闭移动浮层或刷新日记时仍可核对。
export function useFoodChestWrite() {
  const router = useRouter();
  const locked = useRef(false);
  const [loggingKey, setLoggingKey] = useState<string | null>(null);
  const [review, setReview] = useState<WriteReview | null>(null);

  async function run(key: string, action: () => Promise<void>) {
    if (locked.current) return;
    locked.current = true;
    setLoggingKey(key);
    try {
      await action();
    } catch (error) {
      if (error instanceof UnconfirmedWrite) {
        setReview(error.review);
        router.refresh();
        return;
      }
      toast.error(error instanceof Error ? error.message : "保存失败，请重试");
    } finally {
      setLoggingKey(null);
    }
    locked.current = false;
  }

  return { run, loggingKey, review };
}

type CreatedResource = { entry: Pick<MealEntry, "id" | "name" | "grams">; food: Food };

async function postForReview<K extends keyof CreatedResource>(
  path: string, body: object, key: K, review: WriteReview,
): Promise<CreatedResource[K]> {
  try {
    const result = await withRequestTimeout(signal =>
      api<Pick<CreatedResource, K>>(path, { method: "POST", body: JSON.stringify(body), signal }),
    );
    if (!result[key]?.id) throw new Error("缺少保存结果");
    return result[key];
  } catch (error) {
    if (error instanceof ApiError && error.status < 500) throw error;
    throw new UnconfirmedWrite(review);
  }
}

export function EditorialFoodChest({
  date,
  canRecord,
  write,
  targetMeal,
  onTargetMealChange,
  recentFoods,
  myFoods,
  searchInputRef,
  onOpenLibrary,
  scope = "desktop",
  embedded = false,
  onLogged,
}: {
  date: string;
  canRecord: boolean;
  write: ReturnType<typeof useFoodChestWrite>;
  targetMeal: MealType;
  onTargetMealChange: (mealType: MealType) => void;
  recentFoods: Food[];
  myFoods: Food[];
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  onOpenLibrary: () => void;
  scope?: "desktop" | "mobile";
  embedded?: boolean;
  onLogged?: () => void;
}) {
  const router = useRouter();
  const favoriteFoods = myFoods.filter((f) => f.isFavorite);
  const [capsuleTab, setCapsuleTab] = useState<CapsuleTab>(() =>
    recentFoods.length > 0 ? "recents" : favoriteFoods.length > 0 ? "favorites" : "all",
  );
  const { loggingKey, review } = write;
  const writeBlocked = loggingKey !== null || review !== null;

  // 新建自定义食物折叠表单
  const [customOpen, setCustomOpen] = useState(false);
  const [cfName, setCfName] = useState("");
  const [cfBrand, setCfBrand] = useState("");
  const [cfCal, setCfCal] = useState("");
  const [cfPro, setCfPro] = useState("0");
  const [cfCarb, setCfCarb] = useState("0");
  const [cfFat, setCfFat] = useState("0");
  const [cfServing, setCfServing] = useState("");
  const creatingFood = loggingKey === "custom";

  // 官方参考库搜索与份量档位（使用共用防抖/中止 Hook）
  const [refQ, setRefQ] = useState("");
  const [refGrams, setRefGrams] = useState<number>(100);
  const {
    foods: visibleRefResults,
    searching: refSearching,
    error: refSearchError,
    retry: retryRefSearch,
  } = useReferenceFoodSearch(refQ);

  const capsuleList =
    capsuleTab === "recents"
      ? recentFoods.slice(0, 12)
      : capsuleTab === "favorites"
        ? favoriteFoods.slice(0, 18)
        : myFoods.slice(0, 18);

  const mealLabel = MEAL_LABELS[targetMeal];

  function recordMeal(food: Food, grams: number) {
    return postForReview(
      "/api/v1/meals", { date, mealType: targetMeal, foodId: food.id, grams }, "entry",
      {
        message: `${date} ${mealLabel}「${food.name}」${grams}g 的保存结果待确认。`,
        href: `/diary?date=${date}#meal-${targetMeal}`,
        label: "查看当天餐次并核对",
      },
    );
  }

  function createFood(values: Pick<Food, "name" | "brand" | "calories" | "protein" | "carbs" | "fat" | "servingGrams">) {
    return postForReview("/api/v1/foods", values, "food", {
      message: `「${values.name}」存入食物库的结果待确认，记餐尚未开始。`,
      href: "/foods",
      label: "查看食物库并核对",
    });
  }

  async function logMyFood(food: Food) {
    if (!canRecord) return;
    await write.run(food.id, async () => {
      const grams = food.servingGrams && food.servingGrams >= 1 ? food.servingGrams : 100;
      const entry = await recordMeal(food, grams);
      toast.success(`已记入${mealLabel}：${entry.name} ${entry.grams}g`);
      onLogged?.();
      router.refresh();
    });
  }

  async function cloneAndLogReference(ref: ReferenceFood) {
    if (!canRecord) return;
    await write.run(`ref-${ref.id}`, async () => {
      let targetFood = findReferenceCopy(myFoods, ref);
      if (!targetFood) {
        const { foods } = await withRequestTimeout(signal => api<{ foods: Food[] }>(
          `/api/v1/foods?q=${encodeURIComponent(ref.name)}`, { signal },
        ));
        targetFood = findReferenceCopy(foods, ref);
      }
      const cloned = !targetFood;
      targetFood ??= await createFood(referenceFoodValues(ref));
      const entry = await recordMeal(targetFood, refGrams);
      toast.success(
        cloned
          ? `已转存至食物库并记入${mealLabel}：${entry.name} ${entry.grams}g`
          : `已记入${mealLabel}：${entry.name} ${entry.grams}g`,
      );
      onLogged?.();
      router.refresh();
    });
  }

  async function handleCreateCustomFood(e: React.FormEvent) {
    e.preventDefault();
    const trimmedName = cfName.trim();
    if (!trimmedName || cfCal.trim() === "") {
      toast.error("请填写食物名称和热量");
      return;
    }
    await write.run("custom", async () => {
      const food = await createFood({
        name: trimmedName,
        brand: cfBrand.trim() || null,
        calories: Number(cfCal),
        protein: Number(cfPro || 0),
        carbs: Number(cfCarb || 0),
        fat: Number(cfFat || 0),
        servingGrams: cfServing.trim() === "" ? null : Number(cfServing),
      });
      if (canRecord) {
        const grams = food.servingGrams ?? 100;
        try {
          await recordMeal(food, grams);
        } catch (error) {
          setCustomOpen(false);
          if (error instanceof UnconfirmedWrite) throw error;
          router.refresh();
          throw new Error(`食物「${food.name}」已存入个人库，记餐失败：${error instanceof Error ? error.message : "请重试"}`);
        }
        toast.success(`已存入食物库并记入${mealLabel}：${food.name} ${grams}g`);
      } else {
        toast.success(`已存入个人食物库：${food.name}`);
      }
      setCfName("");
      setCfBrand("");
      setCfCal("");
      setCfPro("0");
      setCfCarb("0");
      setCfFat("0");
      setCfServing("");
      setCustomOpen(false);
      onLogged?.();
      router.refresh();
    });
  }

  const personalMatches = refQ.trim()
    ? myFoods
        .filter((f) => f.name.toLowerCase().includes(refQ.trim().toLowerCase()))
        .slice(0, 4)
    : [];

  function handleSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.nativeEvent.isComposing) return;
    if (e.key === "Escape") {
      setRefQ("");
      e.currentTarget.blur();
      return;
    }
    if (e.key === "Enter" && refQ.trim() !== "") {
      e.preventDefault();
      if (personalMatches.length > 0) {
        void logMyFood(personalMatches[0]);
      } else if (visibleRefResults.length > 0) {
        void cloneAndLogReference(visibleRefResults[0]);
      }
    }
  }

  const containerClass = embedded
    ? "space-y-4"
    : "space-y-4 rounded-2xl border bg-card p-5 shadow-[0_2px_12px_-8px_#233e2e26]";

  return (
    <section aria-labelledby={embedded ? undefined : "food-chest-title"} className={containerClass}>
      {review && (
        <div role="alert" className="space-y-1 rounded-lg border bg-background p-3 text-sm">
          <p>{review.message}</p>
          <a className="font-medium text-primary underline" href={review.href}>{review.label}</a>
        </div>
      )}
      {/* 顶部餐次目标选择器 */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 id={embedded ? undefined : "food-chest-title"} className="flex items-center gap-1.5 text-sm font-bold">
            <Utensils className="size-4 text-primary" aria-hidden />
            <span>食物百宝箱</span>
          </h3>
          <p className="mt-0.5 text-xs text-muted-foreground">
            点胶囊一键记入 · 搜索官方库自动转存
          </p>
        </div>

        <div className="flex items-center gap-1.5 text-xs">
          <label htmlFor={`chest-target-meal-${scope}`} className="text-muted-foreground">
            记入:
          </label>
          <select
            id={`chest-target-meal-${scope}`}
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
            {(
              [
                { id: "recents", label: `最近 (${recentFoods.length})`, icon: History },
                { id: "favorites", label: `收藏 (${favoriteFoods.length})`, icon: Star },
                { id: "all", label: `全部 (${myFoods.length})`, icon: null },
              ] as const
            ).map((tab) => {
              const active = capsuleTab === tab.id;
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setCapsuleTab(tab.id)}
                  aria-pressed={active}
                  className={`relative inline-flex items-center gap-1 rounded-lg px-2.5 py-1 transition-colors ${
                    active
                      ? "font-semibold text-primary-foreground"
                      : "font-medium text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {active && (
                    <motion.span
                      layoutId={`chest-capsule-tab-${scope}`}
                      transition={TAB_SPRING}
                      className="absolute inset-0 rounded-lg bg-primary"
                      aria-hidden
                    />
                  )}
                  <span className="relative z-10 inline-flex items-center gap-1">
                    {Icon && <Icon className="size-3" aria-hidden />}
                    {tab.label}
                  </span>
                </button>
              );
            })}
          </div>
          <span className="font-mono text-[11px] text-muted-foreground">
            点击按常用份量入账
          </span>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={capsuleTab}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
            className="flex flex-wrap gap-1.5 pt-0.5"
          >
            {capsuleList.length === 0 ? (
              <div className="w-full rounded-xl border border-dashed bg-background p-3 text-center text-xs text-muted-foreground">
                {capsuleTab === "recents"
                  ? "近期暂无饮食记录，可切换到「全部」或下方搜索食物。"
                  : capsuleTab === "favorites"
                    ? "暂无收藏食物，可在「我的食物库」点星标收藏。"
                    : "食物库为空，点击下方新建自定义食物或搜索官方库。"}
              </div>
            ) : (
              capsuleList.map((f, idx) => {
                const isBusy = loggingKey === f.id;
                return (
                  <motion.button
                    key={f.id}
                    type="button"
                    initial={{ opacity: 0, scale: 0.94 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.16, delay: Math.min(idx * 0.012, 0.15) }}
                    whileHover={{ y: -1.5, scale: 1.02 }}
                    whileTap={{ scale: 0.94 }}
                    disabled={!canRecord || writeBlocked}
                    onClick={() => void logMyFood(f)}
                    className="inline-flex items-center gap-1 rounded-full border bg-background px-3 py-1.5 text-xs font-medium transition-colors hover:border-primary/40 hover:bg-secondary/75 disabled:opacity-45"
                    title={`每100g ${Math.round(f.calories)} kcal · 点击记入${mealLabel}`}
                  >
                    {isBusy ? (
                      <Loader2 className="size-3 animate-spin" aria-hidden />
                    ) : f.isFavorite ? (
                      <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
                    ) : null}
                    <span>{f.name}</span>
                    <span className="font-mono text-muted-foreground">
                      {f.servingGrams ?? 100}g
                    </span>
                  </motion.button>
                );
              })
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      {/* 第二区：官方成分表检索 + 新建自定义食物 */}
      <div className="space-y-3 border-t pt-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="inline-flex items-center gap-1 text-xs font-bold">
            <BookOpen className="size-3.5 text-primary" aria-hidden />
            <span>《中国食物成分表》官方库</span>
            <span className="font-mono font-normal text-muted-foreground">(1677种)</span>
          </span>
          <div className="flex items-center gap-1.5">
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              transition={TAP_SPRING}
              onClick={onOpenLibrary}
              className="rounded-lg border bg-background px-2 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
            >
              管理库
            </motion.button>
            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              transition={TAP_SPRING}
              onClick={() => setCustomOpen((v) => !v)}
              aria-expanded={customOpen}
              className="inline-flex items-center gap-1 rounded-lg border bg-background px-2.5 py-1 text-xs font-medium transition-colors hover:border-primary"
            >
              <Plus className="size-3" aria-hidden />
              自定义食物
            </motion.button>
          </div>
        </div>

        {/* 行内新建自定义食物表单 */}
        <AnimatePresence initial={false}>
          {customOpen && (
            <motion.form
              key="custom-food-form"
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: "auto", y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              transition={SOFT_SPRING}
              onSubmit={handleCreateCustomFood}
              className="overflow-hidden"
            >
              <div className="space-y-2.5 rounded-xl border border-primary bg-background p-3 text-xs">
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
                    <Label htmlFor={`cf-name-${scope}`} className="sr-only">
                      食物名称
                    </Label>
                    <Input
                      id={`cf-name-${scope}`}
                      required
                      placeholder="食物名称 (必填)"
                      value={cfName}
                      disabled={creatingFood}
                      onChange={(e) => setCfName(e.target.value)}
                      className="h-8 bg-card text-xs"
                    />
                  </div>
                  <div>
                    <Label htmlFor={`cf-brand-${scope}`} className="sr-only">
                      品牌/备注
                    </Label>
                    <Input
                      id={`cf-brand-${scope}`}
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
                <Button type="submit" size="sm" className="w-full text-xs" disabled={writeBlocked}>
                  {creatingFood
                    ? "保存中…"
                    : canRecord
                      ? `存入个人食物库并记入${mealLabel}`
                      : "存入个人食物库"}
                </Button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>

        {/* 搜索框 + 快捷键提示 */}
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            ref={searchInputRef}
            type="search"
            aria-label="检索个人库或中国食物成分表"
            placeholder="搜官方成分表或个人库：里脊、豆腐、燕麦…"
            value={refQ}
            onChange={(e) => setRefQ(e.target.value)}
            onKeyDown={handleSearchKeyDown}
            className="h-9 rounded-xl bg-background pl-8 pr-3 text-xs xl:pr-16"
          />
          {refQ === "" && !embedded && (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border bg-card px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground xl:inline-block">
              / · ⌘K
            </kbd>
          )}
        </div>

        {/* 检索结果列表 */}
        <div className="max-h-[380px] space-y-2 overflow-y-auto pr-1">
          {refQ.trim() === "" ? (
            <p className="rounded-xl border border-dashed bg-background px-3 py-5 text-center text-xs text-muted-foreground">
              输入关键词检索个人库与《中国食物成分表》，按回车可快速记入首条结果
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
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.94 }}
                          transition={TAP_SPRING}
                          disabled={!canRecord || writeBlocked}
                          onClick={() => void logMyFood(f)}
                          className="shrink-0 rounded-lg border bg-card px-2.5 py-1.5 font-mono font-medium transition-colors hover:border-primary disabled:opacity-45"
                        >
                          {isBusy ? "记入中…" : `+ ${grams}g 入账`}
                        </motion.button>
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

              {refSearchError && (
                <div className="flex items-center justify-center gap-2 py-4 text-xs text-destructive">
                  <span role="alert">{refSearchError}</span>
                  <button
                    type="button"
                    onClick={retryRefSearch}
                    className="font-medium text-primary underline underline-offset-2"
                  >
                    重试
                  </button>
                </div>
              )}

              {!refSearching && !refSearchError && visibleRefResults.length === 0 && personalMatches.length === 0 && (
                <p className="py-5 text-center text-xs text-muted-foreground">
                  未找到匹配食物，可点击上方「+ 自定义食物」快速录入。
                </p>
              )}

              {visibleRefResults.length > 0 && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-mono text-[11px] text-muted-foreground">
                      官方成分表 · 快捷份量
                    </p>
                    <div className="flex items-center gap-0.5 rounded-lg border bg-background p-0.5 text-[11px]">
                      {REF_GRAMS_OPTIONS.map((g) => {
                        const active = refGrams === g;
                        return (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setRefGrams(g)}
                            aria-pressed={active}
                            className={`relative rounded-md px-2 py-0.5 font-mono transition-colors ${
                              active
                                ? "font-semibold text-primary-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {active && (
                              <motion.span
                                layoutId={`ref-grams-${scope}`}
                                transition={TAB_SPRING}
                                className="absolute inset-0 rounded-md bg-primary"
                                aria-hidden
                              />
                            )}
                            <span className="relative z-10">{g}g</span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

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
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.94 }}
                          transition={TAP_SPRING}
                          disabled={!canRecord || writeBlocked}
                          onClick={() => void cloneAndLogReference(r)}
                          className="shrink-0 rounded-lg border bg-card px-2.5 py-1.5 font-mono font-medium transition-colors hover:border-primary disabled:opacity-45"
                        >
                          {isBusy ? "入账中…" : `+ ${refGrams}g 入账`}
                        </motion.button>
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
