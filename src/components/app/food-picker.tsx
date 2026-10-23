"use client";

/**
 * 添加食物的弹窗：三选一来源（最近吃过 / 收藏 / 搜索），
 * 选中后输入克数，实时预览热量，确认写入。
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Search, Star, History, BookOpen, Loader2 } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { api } from "@/lib/api-client";
import { prepareMealPhoto, uploadMealPhoto } from "@/lib/meal-photo-client";
import { MEAL_PHOTO_MAX } from "@/lib/meal-photo";
import { MealPhotoPicker } from "./meal-photo-picker";
import type { SelectedMealPhoto } from "./meal-photo-picker";
import type { MealType } from "@/lib/nutrition";

/** 参考库条目（《中国食物成分表》公共只读数据） */
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
};

type Props = {
  date: string;
  mealType: MealType;
  mealLabel: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

/** 一行食物选项 */ 
function FoodRow({ food, onPick }: { food: Food; onPick: (f: Food) => void }) {
  return (
    <button
      type="button"
      onClick={() => onPick(food)}
      className="flex w-full items-center justify-between rounded-md border p-3 text-left transition-colors hover:bg-muted"
    >
      <div>
        <div className="flex items-center gap-1.5 font-medium">
          {food.isFavorite && (
            <Star className="size-3.5 fill-foreground text-foreground" aria-hidden />
          )}
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

export function FoodPicker(props: Props) {
  // 每次打开使用独立组件实例；关闭后的异步回调不能复用下一次录入的状态。
  return props.open ? <FoodPickerForm key={`${props.date}:${props.mealType}`} {...props} /> : null;
}

function FoodPickerForm({ date, mealType, mealLabel, open, onOpenChange }: Props) {
  const router = useRouter();

  // 第一步：选食物；第二步：定克数
  const [picked, setPicked] = useState<Food | null>(null);
  const [grams, setGrams] = useState(100);
  const [saving, setSaving] = useState(false);

  // 照片先在本地预览/压缩，记录创建成功后再逐张上传；创建过记录后不再重复创建。
  const [selectedPhotos, setSelectedPhotos] = useState<SelectedMealPhoto[]>([]);
  const [preparingPhotos, setPreparingPhotos] = useState(false);
  const [createdEntry, setCreatedEntry] = useState<{ id: string; name: string; grams: number } | null>(null);
  const [photoError, setPhotoError] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const photosRef = useRef<SelectedMealPhoto[]>([]);

  const active = useRef(true);
  const savingRef = useRef(false);
  const preparingRef = useRef(false);
  const creatingRef = useRef(false);
  const uploadController = useRef<AbortController | null>(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      uploadController.current?.abort();
      photosRef.current.forEach((photo) => URL.revokeObjectURL(photo.previewUrl));
    };
  }, []);

  function replacePhotos(photos: SelectedMealPhoto[]) {
    photosRef.current = photos;
    setSelectedPhotos(photos);
  }

  // 三个列表的数据源
  const [recents, setRecents] = useState<Food[]>([]);
  const [favorites, setFavorites] = useState<Food[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Food[]>([]);
  const [searching, setSearching] = useState(false);

  // 参考库（《中国食物成分表》）的搜索状态
  const [refQ, setRefQ] = useState("");
  const [refResults, setRefResults] = useState<ReferenceFood[]>([]);
  const [refSearching, setRefSearching] = useState(false);
  const [importing, setImporting] = useState(false);

  /** 弹窗每次打开时拉取“最近吃过”和“收藏” */
  useEffect(() => {
    if (!open) return;
    api<{ foods: Food[] }>("/api/v1/foods/recents").then((d) => { if (active.current) setRecents(d.foods); }).catch(() => {});
    api<{ foods: Food[] }>("/api/v1/foods?favorite=true")
      .then((d) => { if (active.current) setFavorites(d.foods); })
      .catch(() => {});
  }, [open]);

  /** 搜索输入防抖：停 300ms 才发请求，避免每敲一个字查一次库 */
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (q.trim() === "") return;
    clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      setSearching(true);
      try {
        const d = await api<{ foods: Food[] }>(
          `/api/v1/foods?q=${encodeURIComponent(q.trim())}`,
        );
        if (active.current) setResults(d.foods);
      } finally {
        if (active.current) setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer.current);
  }, [q]);

  function pick(f: Food) {
    if (!active.current || savingRef.current || createdEntry) return;
    setPicked(f);
    // 默认克数：有“一份”定义就用一份，否则 100g
    setGrams(f.servingGrams ?? 100);
  }

  function closeDialog() {
    if (creatingRef.current) return;
    active.current = false;
    uploadController.current?.abort();
    onOpenChange(false);
    if (createdEntry) router.refresh();
  }

  async function addPhotos(files: File[]) {
    if (!active.current || createdEntry || savingRef.current || preparingRef.current) return;
    const remaining = MEAL_PHOTO_MAX - photosRef.current.length;
    if (files.length > remaining) toast.error(`每条记录最多 ${MEAL_PHOTO_MAX} 张照片，已保留前 ${Math.max(remaining, 0)} 张`);
    const accepted = files.slice(0, Math.max(remaining, 0));
    if (accepted.length === 0) return;
    preparingRef.current = true;
    setPreparingPhotos(true);
    for (const file of accepted) {
      if (!active.current) break;
      try {
        const id = crypto.randomUUID();
        const prepared = await prepareMealPhoto(file);
        if (!active.current) {
          URL.revokeObjectURL(prepared.previewUrl);
          break;
        }
        replacePhotos([...photosRef.current, { id, ...prepared }]);
      } catch (error) {
        if (active.current) toast.error(error instanceof Error ? error.message : "这张照片无法读取");
      }
    }
    preparingRef.current = false;
    if (active.current) setPreparingPhotos(false);
  }

  function removePhoto(id: string) {
    if (createdEntry || savingRef.current) return;
    const target = photosRef.current.find((photo) => photo.id === id);
    if (target) URL.revokeObjectURL(target.previewUrl);
    replacePhotos(photosRef.current.filter((photo) => photo.id !== id));
  }

  async function uploadSelected(entryId: string, items: SelectedMealPhoto[], signal: AbortSignal) {
    setUploadProgress({ done: 0, total: items.length });
    for (let index = 0; index < items.length; index++) {
      if (!active.current) return;
      const item = items[index];
      await uploadMealPhoto(entryId, item.file, item.id, signal);
      if (!active.current) return;
      URL.revokeObjectURL(item.previewUrl);
      replacePhotos(photosRef.current.filter((photo) => photo.id !== item.id));
      setUploadProgress({ done: index + 1, total: items.length });
    }
    setUploadProgress(null);
  }

  /** 从参考库选中：库里已有同名食物就直接复用，否则抄录一条新的 */
  async function pickReference(r: ReferenceFood) {
    setImporting(true);
    try {
      const { foods } = await api<{ foods: Food[] }>(
        `/api/v1/foods?q=${encodeURIComponent(r.name)}`,
      );
      if (!active.current) return;
      const existing = foods.find((f) => f.name === r.name);
      if (existing) {
        toast.success(`「${r.name}」已在你的食物库，直接选用`);
        pick(existing);
        return;
      }

      const { food } = await api<{ food: Food }>("/api/v1/foods", {
        method: "POST",
        body: JSON.stringify({
          name: r.name,
          brand: null,
          calories: r.calories ?? 0,
          protein: r.protein ?? 0,
          carbs: r.carbs ?? 0,
          fat: r.fat ?? 0,
          servingGrams: null,
        }),
      });
      if (!active.current) return;
      toast.success(`「${r.name}」已加入你的食物库`);
      pick(food);
    } catch (e) {
      if (active.current) toast.error(e instanceof Error ? e.message : "导入失败");
    } finally {
      if (active.current) setImporting(false);
    }
  }

  /** 参考库搜索，同样 300ms 防抖 */
  const refTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    if (refQ.trim() === "") return;
    clearTimeout(refTimer.current);
    refTimer.current = setTimeout(async () => {
      setRefSearching(true);
      try {
        const d = await api<{ foods: ReferenceFood[] }>(
          `/api/v1/foods/reference?q=${encodeURIComponent(refQ.trim())}`,
        );
        if (active.current) setRefResults(d.foods);
      } finally {
        if (active.current) setRefSearching(false);
      }
    }, 300);
    return () => clearTimeout(refTimer.current);
  }, [refQ]);

  async function handleSave() {
    if (!active.current || !picked || savingRef.current || preparingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setPhotoError("");
    let entry = createdEntry;
    const pendingPhotos = photosRef.current;
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      if (!entry) {
        creatingRef.current = true;
        const data = await api<{ entry: { id: string; name: string; grams: number } }>("/api/v1/meals", {
          method: "POST",
          body: JSON.stringify({ date, mealType, foodId: picked.id, grams }),
        });
        entry = data.entry;
        creatingRef.current = false;
        if (!active.current) { router.refresh(); return; }
        setCreatedEntry(entry);
        setGrams(entry.grams);
      }
      if (pendingPhotos.length > 0) await uploadSelected(entry.id, pendingPhotos, controller.signal);
      if (!active.current) return;
      toast.success(`已记录到${mealLabel}：${entry.name} ${entry.grams}g${pendingPhotos.length > 0 ? `，上传 ${pendingPhotos.length} 张照片` : ""}`);
      closeDialog();
      router.refresh();
    } catch (error) {
      if (!active.current) return;
      if (entry) {
        setPhotoError(`记录已保存，但照片上传没有完成：${error instanceof Error ? error.message : "请稍后重试"}`);
        setUploadProgress(null);
        router.refresh();
      } else {
        toast.error(error instanceof Error ? error.message : "保存失败");
      }
    } finally {
      creatingRef.current = false;
      savingRef.current = false;
      if (active.current) setSaving(false);
    }
  }

  // 搜索词清空时列表立即视为空：渲染期派生，代替在 effect 里清状态
  const visibleResults = q.trim() === "" ? [] : results;
  const visibleRefResults = refQ.trim() === "" ? [] : refResults;

  // 第二步的实时预览：每100g值 × 克数/100
  const preview = picked
    ? {
        calories: Math.round((picked.calories * grams) / 100),
        protein: Math.round((picked.protein * grams) / 10) / 10,
      }
    : null;

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? onOpenChange(true) : closeDialog())}>
      <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{picked ? `记入${mealLabel}` : `添加到${mealLabel}`}</DialogTitle>
          <DialogDescription>
            {createdEntry ? `已保存 ${createdEntry.name} ${createdEntry.grams}g，份量可关闭后在记录中调整` : picked ? "输入克数，确认记录" : "从食物库选择，或搜索"}
          </DialogDescription>
        </DialogHeader>

        {!picked ? (
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
              {searching && (
                <p className="py-4 text-center text-sm text-muted-foreground">搜索中…</p>
              )}
              {!searching && q.trim() !== "" && results.length === 0 && (
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
              {!refSearching && refQ.trim() !== "" && refResults.length === 0 && (
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
                        <span className="font-medium text-foreground">
                          {Math.round(r.calories)}
                        </span>{" "}
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
        ) : (
          <div className="space-y-4">
            <div className="rounded-lg border p-3">
              <div className="font-medium">{picked.name}</div>
              <div className="text-xs text-muted-foreground">
                {picked.calories} 千卡/100g · 蛋白 {picked.protein}g · 碳水 {picked.carbs}g ·
                脂肪 {picked.fat}g
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  type="number"
                  min={1}
                  max={5000}
                  value={grams}
                  aria-label="食物克数"
                  disabled={saving || Boolean(createdEntry)}
                  onChange={(e) => setGrams(Number(e.target.value) || 0)}
                  className="flex-1"
                  autoFocus
                />
                <span className="flex items-center text-sm text-muted-foreground">克</span>
              </div>
              {/* 常用克数快捷按钮 */}
              <div className="flex flex-wrap gap-2">
                {[...new Set([picked.servingGrams, 50, 100, 150, 200])]
                  .filter((g): g is number => g != null)
                  .map((g) => (
                    <Button
                      key={g}
                      type="button"
                      variant={grams === g ? "default" : "secondary"}
                      size="sm"
                      disabled={saving || Boolean(createdEntry)}
                      onClick={() => setGrams(g)}
                    >
                      {g === picked.servingGrams ? `一份(${g}g)` : `${g}g`}
                    </Button>
                  ))}
              </div>
            </div>

            {preview && (
              <p className="text-sm text-muted-foreground">
                约含 <span className="font-semibold text-foreground">{preview.calories}</span>{" "}
                千卡 · 蛋白 {preview.protein}g
              </p>
            )}

            <MealPhotoPicker
              photos={selectedPhotos}
              disabled={saving || Boolean(createdEntry)}
              preparing={preparingPhotos}
              onAdd={addPhotos}
              onRemove={removePhoto}
            />

            {photoError && (
              <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-xs leading-5 text-destructive">
                {photoError}
                {<br />}
                记录已保存，可重试未上传的照片，或关闭后从这条记录继续添加。
              </p>
            )}

            {uploadProgress && (
              <p className="flex items-center gap-2 text-xs text-muted-foreground" aria-live="polite">
                <Loader2 className="size-3.5 animate-spin" aria-hidden />
                正在上传照片 {Math.min(uploadProgress.done + 1, uploadProgress.total)} / {uploadProgress.total}…
              </p>
            )}

            <div className="flex gap-2">
              <Button
                variant="outline"
                className="flex-1"
                disabled={saving && !createdEntry}
                onClick={() => (createdEntry ? closeDialog() : setPicked(null))}
              >
                {createdEntry ? "关闭" : "返回重选"}
              </Button>
              <Button
                className="flex-1"
                disabled={saving || preparingPhotos || !picked || grams < 1}
                onClick={handleSave}
              >
                {saving
                  ? "保存中…"
                  : createdEntry
                    ? selectedPhotos.length > 0
                      ? "重试上传照片"
                      : "完成"
                    : "确认记录"}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
