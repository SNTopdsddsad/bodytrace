"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { Food, MealEntry } from "@/db/schema";
import { Button } from "@/components/ui/button";
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
import { MEAL_STYLES } from "./meal-styles";

type MealGroup = {
  mealType: MealType;
  label: string;
  entries: MealEntry[];
  photos: MealPhotoDto[];
};

type PendingPhoto = { requestId: string; original: File; prepared?: File };

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

  async function updateEntryGrams(entryId: string, grams: number) {
    if (!canRecord || busyEntryId) return;
    const clamped = Math.max(1, Math.min(5000, Math.round(grams)));
    setBusyEntryId(entryId);
    try {
      await api(`/api/v1/meals/${entryId}`, {
        method: "PATCH",
        body: JSON.stringify({ grams: clamped }),
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
    if (!window.confirm(`确定删除「${entry.name} ${entry.grams}g」吗？`)) return;
    setBusyEntryId(entry.id);
    try {
      await api(`/api/v1/meals/${entry.id}`, { method: "DELETE" });
      toast.success("已删除饮食记录");
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
    if (!window.confirm("确定删除这张餐照吗？")) return;
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
    <section
      id={`meal-${meal.mealType}`}
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
      className={`space-y-3 rounded-2xl border bg-card p-4 shadow-xs transition-colors ${
        dragging
          ? "border-primary ring-2 ring-primary/20"
          : isTargetMeal
            ? "border-primary/45"
            : "border-border"
      }`}
    >
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
              {meal.photos.length > 0 ? ` · ${meal.photos.length} 张照片` : ""}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="font-mono text-sm font-bold tabular-nums">{mealCal} kcal</span>
          <button
            type="button"
            disabled={!canRecord}
            onClick={() => onPickMeal(meal.mealType)}
            className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-45 ${
              isTargetMeal
                ? "border-primary bg-primary text-primary-foreground"
                : "bg-background hover:border-primary"
            }`}
          >
            <Plus className="size-3.5" aria-hidden />
            记食物
          </button>
        </div>
      </div>

      {/* 横向圆角微缩相册条 */}
      <div className="space-y-1.5">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {meal.photos.map((photo, idx) => (
            <div
              key={photo.id}
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
                  className="size-full object-cover"
                />
              </button>
              <button
                type="button"
                disabled={deletingPhotoId !== null}
                onClick={() => void removePhoto(photo.id)}
                className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/65 text-white opacity-90 transition hover:bg-destructive sm:opacity-0 sm:group-hover:opacity-100 sm:focus-visible:opacity-100"
                title="删除餐照"
                aria-label={`删除${meal.label}第 ${idx + 1} 张照片`}
              >
                <X className="size-3" aria-hidden />
              </button>
            </div>
          ))}

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
              <span className="text-[11px] opacity-75">点击或拖入图片</span>
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
        </div>

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

      {/* 食物条目列表 */}
      <div className="space-y-2">
        {meal.entries.length === 0 ? (
          <button
            type="button"
            disabled={!canRecord}
            onClick={() => onPickMeal(meal.mealType)}
            className="w-full rounded-xl border border-dashed py-4 text-center text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:pointer-events-none"
          >
            本餐暂无食物记录，点「+ 记食物」或从右侧「食物百宝箱」一键添加
          </button>
        ) : (
          meal.entries.map((entry) => {
            const baseGrams =
              (entry.foodId ? foodServingMap.get(entry.foodId) : undefined) ?? 100;
            const multipliers = [
              { label: "0.5x", grams: Math.max(1, Math.round(baseGrams * 0.5)) },
              { label: "1x", grams: Math.max(1, Math.round(baseGrams)) },
              { label: "1.5x", grams: Math.max(1, Math.round(baseGrams * 1.5)) },
            ];
            const isEditing = editingId === entry.id;
            const isBusy = busyEntryId === entry.id;

            return (
              <div
                key={entry.id}
                className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border bg-background p-3"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-semibold">{entry.name}</span>
                    <span className="shrink-0 font-mono text-xs font-bold tabular-nums text-primary">
                      {Math.round(entry.calories)} kcal
                    </span>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-2 font-mono text-xs text-muted-foreground">
                    {isEditing ? (
                      <span className="inline-flex items-center gap-1">
                        <Input
                          type="number"
                          min={1}
                          max={5000}
                          autoFocus
                          aria-label={`${entry.name}克数`}
                          value={editGrams}
                          disabled={isBusy}
                          onChange={(ev) => setEditGrams(ev.target.value)}
                          onKeyDown={(ev) => {
                            if (ev.key === "Enter") {
                              ev.preventDefault();
                              void updateEntryGrams(entry.id, Number(editGrams));
                            } else if (ev.key === "Escape") {
                              setEditingId(null);
                            }
                          }}
                          className="h-6 w-20 bg-card px-1.5 py-0 text-xs font-mono"
                        />
                        <button
                          type="button"
                          disabled={isBusy || Number(editGrams) < 1 || Number(editGrams) > 5000}
                          onClick={() => void updateEntryGrams(entry.id, Number(editGrams))}
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
                      </span>
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

                {/* 0.5x / 1x / 1.5x 倍率胶囊 + 删除 */}
                <div className="flex shrink-0 items-center gap-1">
                  {multipliers.map((btn) => {
                    const active = entry.grams === btn.grams;
                    return (
                      <button
                        key={btn.label}
                        type="button"
                        disabled={!canRecord || isBusy}
                        onClick={() => void updateEntryGrams(entry.id, btn.grams)}
                        title={`切换为 ${btn.grams}g`}
                        className={`rounded-lg border px-2 py-1 font-mono text-xs transition-colors disabled:opacity-45 ${
                          active
                            ? "border-primary bg-primary font-bold text-primary-foreground"
                            : "bg-card text-muted-foreground hover:border-primary hover:text-foreground"
                        }`}
                      >
                        {btn.label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    disabled={!canRecord || isBusy}
                    onClick={() => void deleteEntry(entry)}
                    className="ml-0.5 rounded p-1.5 text-muted-foreground transition-colors hover:text-destructive disabled:opacity-45"
                    title="删除该条饮食记录"
                    aria-label={`删除${entry.name}`}
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                  </button>
                </div>
              </div>
            );
          })
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
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 text-destructive hover:text-destructive"
                      disabled={deletingPhotoId !== null}
                      onClick={() => void removePhoto(photo.id)}
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                      删除
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </section>
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border bg-card px-4 py-3 shadow-xs">
        <div>
          <h2 className="text-sm font-bold">四餐饮食手账 (早 / 午 / 晚 / 加餐)</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            点 <span className="font-mono text-foreground">0.5x/1x/1.5x</span> 秒切份量，或
            <span className="font-medium text-foreground">点击克数</span>
            精确输入；照片支持直接拖入卡片
          </p>
        </div>
        <span className="rounded-lg border bg-background px-2 py-1 font-mono text-xs text-muted-foreground">
          {canRecord ? "快照等比缩放" : "未来日期不可记录"}
        </span>
      </div>

      <div className="space-y-4">
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
