"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import NumberFlow from "@number-flow/react";
import { Camera, ImagePlus, Loader2, Pencil, Plus, X } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { toast } from "sonner";
import type { Food, MealEntry } from "@/db/schema";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api-client";
import { MEAL_PHOTO_ACCEPT, MEAL_PHOTO_MAX, type MealPhotoDto } from "@/lib/meal-photo";
import { prepareMealPhoto, uploadMealPhoto } from "@/lib/meal-photo-client";
import { round1, type MealType } from "@/lib/nutrition";
import { InlineConfirmButton } from "./inline-confirm-button";
import { MEAL_STYLES } from "./meal-styles";
import { SOFT_SPRING, TAB_SPRING, TAP_SPRING } from "./motion-provider";

type MealGroup = {
  mealType: MealType;
  label: string;
  entries: MealEntry[];
  photos: MealPhotoDto[];
};

type PendingPhoto = { requestId: string; original: File; prepared?: File };

function validGrams(grams: number) {
  return Number.isFinite(grams) && grams >= 1 && grams <= 5000;
}

function MealCard({
  date,
  meal,
  canRecord,
  isTargetMeal,
  foodServingMap,
  onPickMeal,
}: {
  date: string;
  meal: MealGroup;
  canRecord: boolean;
  isTargetMeal: boolean;
  foodServingMap: Map<string, number>;
  onPickMeal: (mealType: MealType) => void;
}) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // 克数行内编辑状态
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editGrams, setEditGrams] = useState<string>("");
  const [busyEntryId, setBusyEntryId] = useState<string | null>(null);

  // 照片上传与灯箱状态
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [failedPhotos, setFailedPhotos] = useState<PendingPhoto[]>([]);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [deletingPhotoId, setDeletingPhotoId] = useState<string | null>(null);

  const activeRef = useRef(true);
  const uploadControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    activeRef.current = true;
    return () => {
      activeRef.current = false;
      uploadControllerRef.current?.abort();
    };
  }, [date]);

  const mealCal = Math.round(meal.entries.reduce((sum, entry) => sum + entry.calories, 0));
  const style = MEAL_STYLES[meal.mealType];
  const MealIcon = style.icon;
  const remainingPhotos = Math.max(0, MEAL_PHOTO_MAX - meal.photos.length);
  const canAddPhoto = canRecord && !uploading && failedPhotos.length === 0 && remainingPhotos > 0;
  const showPhotoStrip =
    meal.photos.length > 0 || dragging || uploading || failedPhotos.length > 0 || Boolean(photoError);

  async function updateEntryGrams(entryId: string, grams: number) {
    if (!canRecord || busyEntryId || !validGrams(grams)) return;
    setBusyEntryId(entryId);
    try {
      await api(`/api/v1/meals/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify({ grams }),
      });
      setEditingId(null);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "修改克数失败");
    } finally {
      setBusyEntryId(null);
    }
  }

  async function deleteEntry(entry: MealEntry) {
    if (!canRecord || busyEntryId) return;
    setBusyEntryId(entry.id);
    try {
      await api(`/api/v1/meals/${entry.id}`, { method: "DELETE" });
      toast.success(`已删除「${entry.name}」`);
      router.refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "删除失败");
    } finally {
      setBusyEntryId(null);
    }
  }

  async function uploadPhotoItems(items: PendingPhoto[]) {
    if (items.length === 0 || !canRecord || uploadControllerRef.current || !activeRef.current) return;
    const controller = new AbortController();
    uploadControllerRef.current = controller;
    setUploading(true);
    setPhotoError("");
    const nextFailed: PendingPhoto[] = [];
    let uploaded = 0;

    try {
      for (const item of items) {
        if (!activeRef.current) break;
        try {
          if (!item.prepared) {
            const prepared = await prepareMealPhoto(item.original);
            item.prepared = prepared.file;
            URL.revokeObjectURL(prepared.previewUrl);
          }
          if (!activeRef.current) break;
          await uploadMealPhoto(
            { date, mealType: meal.mealType },
            item.prepared,
            item.requestId,
            controller.signal,
          );
          uploaded += 1;
        } catch (err) {
          if (!activeRef.current) break;
          nextFailed.push(item);
          setPhotoError(err instanceof Error ? err.message : "照片上传失败");
        }
      }
    } finally {
      uploadControllerRef.current = null;
      if (activeRef.current) {
        setFailedPhotos(nextFailed);
        setUploading(false);
        if (uploaded > 0) toast.success(`已上传 ${uploaded} 张${meal.label}照片`);
        router.refresh();
      }
    }
  }

  function handleChooseFiles(files: FileList | File[] | null) {
    if (!files || !canAddPhoto) return;
    const list = Array.from(files).filter((f) => f.type.startsWith("image/"));
    if (list.length === 0) {
      toast.error("请选择图片文件");
      return;
    }
    const accepted = list.slice(0, remainingPhotos);
    if (list.length > remainingPhotos) {
      toast.error(`${meal.label}最多还可添加 ${remainingPhotos} 张照片`);
    }
    void uploadPhotoItems(
      accepted.map((original) => ({ original, requestId: crypto.randomUUID() })),
    );
  }

  async function removePhoto(photoId: string) {
    if (deletingPhotoId) return;
    setDeletingPhotoId(photoId);
    setPhotoError("");
    try {
      await api(`/api/v1/meal-photos/${encodeURIComponent(photoId)}`, { method: "DELETE" });
      toast.success("已删除餐照");
      if (meal.photos.length <= 1) setViewerOpen(false);
      router.refresh();
    } catch (err) {
      setPhotoError(err instanceof Error ? err.message : "删除失败，请重试");
    } finally {
      setDeletingPhotoId(null);
    }
  }

  return (
    <motion.section
      id={`meal-${meal.mealType}`}
      animate={{ scale: dragging ? 1.01 : 1 }}
      transition={TAP_SPRING}
      onDragOver={(e) => {
        if (!canAddPhoto) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (canAddPhoto) handleChooseFiles(e.dataTransfer.files);
      }}
      className={`space-y-2.5 rounded-2xl border bg-card p-4 shadow-[0_2px_12px_-8px_#233e2e26] transition-colors ${
        dragging
          ? "border-primary ring-2 ring-primary/20"
          : isTargetMeal
            ? "border-primary/45 ring-1 ring-primary/10"
            : "border-border"
      }`}
    >
      {/* 隐藏文件选择控件 */}
      <input
        ref={fileInputRef}
        type="file"
        accept={MEAL_PHOTO_ACCEPT}
        multiple
        disabled={!canAddPhoto}
        className="sr-only"
        tabIndex={-1}
        aria-label={`${meal.label}照片文件`}
        onChange={(e) => {
          handleChooseFiles(e.target.files);
          e.target.value = "";
        }}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={!canAddPhoto}
        className="sr-only"
        tabIndex={-1}
        aria-label={`${meal.label}拍照文件`}
        onChange={(e) => {
          handleChooseFiles(e.target.files);
          e.target.value = "";
        }}
      />

      {/* 餐次标题栏 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className={`flex size-8 shrink-0 items-center justify-center rounded-xl ${style.chip}`}>
            <MealIcon className="size-4" strokeWidth={1.8} aria-hidden />
          </span>
          <div>
            <h3 className="text-sm font-bold">{meal.label}</h3>
            <p className="text-[11px] text-muted-foreground">
              {meal.entries.length > 0 ? `${meal.entries.length} 项食物` : "暂无食物"}
              {meal.photos.length > 0 ? ` · ${meal.photos.length} 张餐照` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="mr-1 font-mono text-sm font-bold tabular-nums">
            <NumberFlow value={mealCal} /> kcal
          </span>

          {/* 无照片时收进标题栏的轻量传照入口 */}
          {canAddPhoto && !showPhotoStrip && (
            <motion.button
              type="button"
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.92 }}
              transition={TAP_SPRING}
              onClick={() => fileInputRef.current?.click()}
              className="flex size-7 items-center justify-center rounded-lg border bg-background text-muted-foreground transition-colors hover:border-primary/40 hover:bg-secondary/70 hover:text-primary"
              title={`为${meal.label}上传餐照（也可直接拖入图片）`}
              aria-label={`为${meal.label}上传餐照`}
            >
              <ImagePlus className="size-3.5" aria-hidden />
            </motion.button>
          )}

          <motion.button
            type="button"
            whileHover={{ y: -1 }}
            whileTap={{ scale: 0.94 }}
            transition={TAP_SPRING}
            disabled={!canRecord}
            onClick={() => onPickMeal(meal.mealType)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-45 ${
              isTargetMeal
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background hover:border-primary/40 hover:bg-secondary/70"
            }`}
          >
            <Plus className="size-3.5" aria-hidden />
            记食物
          </motion.button>
        </div>
      </div>

      {/* 横向圆角微缩相册条：仅在已有餐照、拖拽图片、上传中或出错时弹性展开 */}
      <AnimatePresence initial={false}>
        {showPhotoStrip && (
          <motion.div
            key="photo-strip"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={SOFT_SPRING}
            className="overflow-hidden"
          >
            <div className="space-y-1.5 pt-0.5">
              {dragging && meal.photos.length === 0 ? (
                <div className="flex h-16 items-center justify-center gap-2 rounded-xl border border-dashed border-primary bg-secondary/50 text-xs font-medium text-primary">
                  <ImagePlus className="size-4" aria-hidden />
                  <span>松手即可上传到{meal.label}（还可添加 {remainingPhotos} 张）</span>
                </div>
              ) : (
                <div className="flex items-center gap-2 overflow-x-auto pb-1">
                  <AnimatePresence initial={false}>
                    {meal.photos.map((photo, idx) => (
                      <motion.div
                        key={photo.id}
                        layout
                        initial={{ opacity: 0, scale: 0.88 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.85 }}
                        transition={SOFT_SPRING}
                        className="group relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border bg-background"
                      >
                        <button
                          type="button"
                          onClick={() => setViewerOpen(true)}
                          className="size-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          aria-label={`查看${meal.label}第 ${idx + 1} 张照片`}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={photo.thumbUrl}
                            alt={`${meal.label}照片 ${idx + 1}`}
                            loading="lazy"
                            referrerPolicy="no-referrer"
                            className="size-full object-cover transition-transform duration-300 group-hover:scale-105"
                          />
                        </button>
                        <div className="absolute right-1 top-1">
                          <InlineConfirmButton
                            disabled={deletingPhotoId !== null}
                            onConfirm={() => removePhoto(photo.id)}
                            ariaLabel={`删除${meal.label}第 ${idx + 1} 张照片`}
                            confirmText="删"
                            icon={<X className="size-3" aria-hidden />}
                            className="flex size-5 items-center justify-center rounded-full bg-black/65 p-0 text-white opacity-90 hover:bg-destructive hover:text-white sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                            confirmClassName="rounded-full px-1.5 py-0.5 text-[10px]"
                          />
                        </div>
                      </motion.div>
                    ))}
                  </AnimatePresence>

                  {canAddPhoto && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="flex h-16 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed bg-background px-3 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground"
                    >
                      <span className="inline-flex items-center gap-1 font-medium">
                        {uploading ? (
                          <Loader2 className="size-3.5 animate-spin" aria-hidden />
                        ) : (
                          <ImagePlus className="size-3.5" aria-hidden />
                        )}
                        传餐照 ({meal.photos.length}/{MEAL_PHOTO_MAX})
                      </span>
                      <span className="text-[11px] opacity-75">点击或拖入</span>
                    </button>
                  )}

                  {canAddPhoto && (
                    <button
                      type="button"
                      onClick={() => cameraInputRef.current?.click()}
                      className="flex h-16 w-12 shrink-0 items-center justify-center rounded-xl border border-dashed bg-background text-muted-foreground transition-colors hover:border-primary hover:text-foreground sm:hidden"
                      aria-label={`为${meal.label}拍照`}
                    >
                      <Camera className="size-4" aria-hidden />
                    </button>
                  )}
                </div>
              )}

              {uploading && (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-live="polite">
                  <Loader2 className="size-3 animate-spin" aria-hidden />
                  正在压缩并上传餐照…
                </p>
              )}

              {photoError && (
                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span role="alert" className="text-destructive">
                    {photoError}
                  </span>
                  {failedPhotos.length > 0 && (
                    <>
                      <button
                        type="button"
                        disabled={!canRecord || uploading}
                        onClick={() => void uploadPhotoItems(failedPhotos)}
                        className="font-medium text-primary underline underline-offset-2"
                      >
                        重试未上传的照片
                      </button>
                      <button
                        type="button"
                        disabled={uploading}
                        onClick={() => {
                          setFailedPhotos([]);
                          setPhotoError("");
                        }}
                        className="text-muted-foreground underline underline-offset-2"
                      >
                        放弃
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 食物条目列表 */}
      <div className="space-y-2">
        {meal.entries.length === 0 ? (
          <motion.button
            type="button"
            whileTap={{ scale: 0.99 }}
            transition={TAP_SPRING}
            disabled={!canRecord}
            onClick={() => onPickMeal(meal.mealType)}
            className="w-full rounded-xl border border-dashed px-3 py-2.5 text-center text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-background hover:text-foreground disabled:pointer-events-none"
          >
            点「+ 记食物」或从右侧食物百宝箱一键添加 · 图片可直接拖入本卡
          </motion.button>
        ) : (
          <AnimatePresence initial={false}>
            {meal.entries.map((entry) => {
              const baseGrams =
                (entry.foodId ? foodServingMap.get(entry.foodId) : undefined) ?? 100;
              const multipliers = [
                { label: "0.5x", grams: baseGrams * 0.5 },
                { label: "1x", grams: baseGrams },
                { label: "1.5x", grams: baseGrams * 1.5 },
              ];
              const isEditing = editingId === entry.id;
              const isBusy = busyEntryId === entry.id;

              return (
                <motion.div
                  key={entry.id}
                  layout
                  initial={{ opacity: 0, y: -8, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{
                    opacity: 0,
                    scale: 0.96,
                    height: 0,
                    marginTop: 0,
                    paddingTop: 0,
                    paddingBottom: 0,
                  }}
                  transition={SOFT_SPRING}
                  className="flex flex-wrap items-center justify-between gap-2.5 overflow-hidden rounded-xl border bg-background p-3"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs font-semibold">{entry.name}</span>
                      <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-primary">
                        <NumberFlow value={Math.round(entry.calories)} /> kcal
                      </span>
                    </div>

                    <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
                      {isEditing ? (
                        <form
                          className="inline-flex items-center gap-1"
                          onSubmit={(event) => {
                            event.preventDefault();
                            void updateEntryGrams(entry.id, Number(editGrams));
                          }}
                        >
                          <Input
                            type="number"
                            min={1}
                            max={5000}
                            required
                            step="any"
                            autoFocus
                            aria-label={`${entry.name}克数`}
                            value={editGrams}
                            disabled={isBusy}
                            onChange={(ev) => setEditGrams(ev.target.value)}
                            onKeyDown={(ev) => {
                              if (ev.key === "Escape") {
                                setEditingId(null);
                              }
                            }}
                            className="h-6 w-20 bg-card px-1.5 py-0 text-xs font-mono"
                          />
                          <button
                            type="submit"
                            disabled={isBusy || !validGrams(Number(editGrams))}
                            className="rounded bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground disabled:opacity-50"
                          >
                            确定
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setEditingId(null)}
                            className="rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                          >
                            取消
                          </button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          disabled={!canRecord || isBusy}
                          onClick={() => {
                            setEditingId(entry.id);
                            setEditGrams(String(entry.grams));
                          }}
                          className="inline-flex items-center gap-1 rounded border bg-card px-1.5 py-0.5 font-semibold text-foreground transition-colors hover:border-primary disabled:opacity-50"
                          title="点击直接输入精确克数 (1~5000g)"
                        >
                          <span>{entry.grams}g</span>
                          <Pencil className="size-2.5" aria-hidden />
                        </button>
                      )}

                      <span>
                        · P:{round1(entry.protein)}g C:{round1(entry.carbs)}g F:{round1(entry.fat)}g
                      </span>
                    </div>
                  </div>

                  {/* 0.5x / 1x / 1.5x 倍率胶囊 + 行内二次确认删除 */}
                  <div className="flex shrink-0 items-center gap-1">
                    {multipliers.map((btn) => {
                      const active = entry.grams === btn.grams;
                      return (
                        <motion.button
                          key={btn.label}
                          type="button"
                          whileTap={{ scale: 0.92 }}
                          transition={TAP_SPRING}
                          disabled={!canRecord || isBusy || !validGrams(btn.grams)}
                          onClick={() => void updateEntryGrams(entry.id, btn.grams)}
                          title={`切换为 ${btn.grams}g`}
                          className={`relative rounded-lg border px-2 py-1 font-mono text-xs transition-colors disabled:opacity-45 ${
                            active
                              ? "border-primary font-bold text-primary-foreground"
                              : "bg-card text-muted-foreground hover:border-primary hover:text-foreground"
                          }`}
                        >
                          {active && (
                            <motion.span
                              layoutId={`meal-mult-${entry.id}`}
                              transition={TAB_SPRING}
                              className="absolute inset-0 rounded-[7px] bg-primary"
                              aria-hidden
                            />
                          )}
                          <span className="relative z-10">{btn.label}</span>
                        </motion.button>
                      );
                    })}
                    <InlineConfirmButton
                      disabled={!canRecord || isBusy}
                      onConfirm={() => deleteEntry(entry)}
                      ariaLabel={`删除${entry.name}`}
                      confirmText="确认删除"
                      className="ml-0.5"
                    />
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* 餐照灯箱弹窗 */}
      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto rounded-2xl sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{meal.label} 的餐次照片</DialogTitle>
            <DialogDescription>
              {date} · 共 {meal.photos.length} 张（每餐上限 {MEAL_PHOTO_MAX} 张）
            </DialogDescription>
          </DialogHeader>
          {meal.photos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">暂无照片</p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {meal.photos.map((photo, idx) => (
                <li key={photo.id} className="overflow-hidden rounded-xl border bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={`${meal.label}第 ${idx + 1} 张照片`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="max-h-[55svh] w-full object-contain"
                  />
                  <div className="flex items-center justify-between gap-2 border-t bg-card px-3 py-2">
                    <span className="font-mono text-xs tabular-nums text-muted-foreground">
                      #{idx + 1} · {photo.width}×{photo.height}
                    </span>
                    <InlineConfirmButton
                      disabled={deletingPhotoId !== null}
                      onConfirm={() => removePhoto(photo.id)}
                      ariaLabel={`删除${meal.label}第 ${idx + 1} 张照片`}
                      confirmText="确认删除"
                      className="px-2 py-1 text-destructive"
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </motion.section>
  );
}

export function EditorialMealsStream({
  date,
  canRecord,
  byMeal,
  myFoods,
  targetMeal,
  onPickMeal,
}: {
  date: string;
  canRecord: boolean;
  byMeal: MealGroup[];
  myFoods: Food[];
  targetMeal: MealType;
  onPickMeal: (mealType: MealType) => void;
}) {
  const foodServingMap = new Map<string, number>();
  for (const f of myFoods) {
    if (f.servingGrams != null && f.servingGrams > 0) {
      foodServingMap.set(f.id, f.servingGrams);
    }
  }

  return (
    <div className="space-y-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card px-4 py-3 shadow-[0_2px_12px_-8px_#233e2e26]">
        <div>
          <h2 className="text-sm font-bold">四餐饮食手账</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            点 <span className="font-mono text-primary">0.5x/1x/1.5x</span> 快切份量，或点克数精调；照片可拖入餐卡
          </p>
        </div>
        <span className="rounded-lg border border-primary/15 bg-secondary/75 px-2.5 py-1 text-xs font-medium text-secondary-foreground">
          {canRecord ? "修改份量自动重算" : "未来日期不可记录"}
        </span>
      </div>

      <div className="space-y-3.5">
        {byMeal.map((meal) => (
          <MealCard
            key={`${date}:${meal.mealType}`}
            date={date}
            meal={meal}
            canRecord={canRecord}
            isTargetMeal={targetMeal === meal.mealType}
            foodServingMap={foodServingMap}
            onPickMeal={onPickMeal}
          />
        ))}
      </div>
    </div>
  );
}
