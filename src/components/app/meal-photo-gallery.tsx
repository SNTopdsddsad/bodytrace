"use client";

/**
 * 某天某餐的照片缩略图、添加/查看/删除入口。
 *
 * 上传按“选中的文件逐个压缩并上传”处理，失败的文件会保留下来，
 * 可以点“重试未上传的照片”继续，不需要重新选择。
 */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { MEAL_PHOTO_ACCEPT, MEAL_PHOTO_MAX } from "@/lib/meal-photo";
import type { MealPhotoDto, MealSlot } from "@/lib/meal-photo";
import { prepareMealPhoto, uploadMealPhoto } from "@/lib/meal-photo-client";

type PendingPhoto = { requestId: string; original: File; prepared?: File };

export function MealPhotoGallery({
  date,
  mealType,
  mealLabel,
  photos,
  disabled = false,
}: {
  date: string;
  mealType: MealSlot["mealType"];
  mealLabel: string;
  photos: MealPhotoDto[];
  disabled?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const deletingRef = useRef(false);
  const [viewerOpen, setViewerOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [failed, setFailed] = useState<PendingPhoto[]>([]);
  const active = useRef(true);
  const uploadController = useRef<AbortController | null>(null);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      uploadController.current?.abort();
    };
  }, []);

  const remaining = Math.max(0, MEAL_PHOTO_MAX - photos.length);
  const canAdd = !disabled && !uploading && failed.length === 0 && remaining > 0;

  async function uploadFiles(items: PendingPhoto[]) {
    if (items.length === 0 || disabled || uploadController.current || !active.current) return;
    const controller = new AbortController();
    uploadController.current = controller;
    setUploading(true);
    setError("");
    const nextFailed: PendingPhoto[] = [];
    let uploaded = 0;

    try {
      for (const item of items) {
        if (!active.current) break;
        try {
          if (!item.prepared) {
            const prepared = await prepareMealPhoto(item.original);
            item.prepared = prepared.file;
            // 卡片补传不展示本地预览，立即释放 URL；失败时保留同一份文件与编号。
            URL.revokeObjectURL(prepared.previewUrl);
          }
          if (!active.current) break;
          await uploadMealPhoto({ date, mealType }, item.prepared, item.requestId, controller.signal);
          uploaded += 1;
        } catch (uploadError) {
          if (!active.current) break;
          nextFailed.push(item);
          setError(uploadError instanceof Error ? uploadError.message : "有照片没有上传成功");
        }
      }
    } finally {
      uploadController.current = null;
      if (active.current) {
        setFailed(nextFailed);
        setUploading(false);
        if (uploaded > 0) toast.success(`已上传 ${uploaded} 张照片`);
        router.refresh();
      }
    }
  }

  function choose(files: FileList | null) {
    if (!files?.length || !canAdd) return;
    const accepted = Array.from(files).slice(0, Math.max(remaining, 0));
    if (files.length > remaining) toast.error(`这一餐还可以添加 ${Math.max(remaining, 0)} 张照片`);
    void uploadFiles(accepted.map((original) => ({ original, requestId: crypto.randomUUID() })));
  }

  async function remove(photoId: string) {
    if (deletingRef.current) return;
    if (!window.confirm("确定删除这张照片吗？")) return;
    deletingRef.current = true;
    setDeletingId(photoId);
    setError("");
    try {
      await api(`/api/v1/meal-photos/${encodeURIComponent(photoId)}`, {
        method: "DELETE",
      });
      toast.success("已删除照片");
      if (photos.length <= 1) setViewerOpen(false);
      router.refresh();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "删除失败，请重试");
    } finally {
      deletingRef.current = false;
      setDeletingId(null);
    }
  }

  return (
    <div className="mt-2">
      <p className="mb-2 text-xs text-muted-foreground">照片（可选） · 已添加 {photos.length} 张 · 每餐最多 {MEAL_PHOTO_MAX} 张</p>
      <div className="flex flex-wrap items-center gap-1.5">
        {photos.slice(0, 3).map((photo, index) => (
          <button
            key={photo.id}
            type="button"
            onClick={() => setViewerOpen(true)}
            className="size-14 shrink-0 overflow-hidden rounded-lg border bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`查看${mealLabel}的第 ${index + 1} 张照片`}
          >
            {/* 公开桶地址，直接用 img，避免 next/image 远程域名与签名缓存问题 */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo.thumbUrl}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className="size-full object-cover"
            />
          </button>
        ))}
        {photos.length > 3 && (
          <button
            type="button"
            onClick={() => setViewerOpen(true)}
            className="flex size-14 shrink-0 items-center justify-center rounded-lg border bg-muted text-xs font-medium tabular-nums text-muted-foreground hover:bg-secondary"
            aria-label={`查看全部 ${photos.length} 张照片`}
          >
            +{photos.length - 3}
          </button>
        )}

        {canAdd && (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-dashed text-muted-foreground transition-colors hover:border-primary/40 hover:bg-secondary/40 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`为${mealLabel}添加照片`}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" aria-hidden />
            ) : (
              <ImagePlus className="size-4" aria-hidden />
            )}
          </button>
        )}

        {canAdd && (
          <button type="button" onClick={() => cameraRef.current?.click()}
            className="flex size-14 shrink-0 items-center justify-center rounded-lg border border-dashed text-muted-foreground hover:bg-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            aria-label={`为${mealLabel}拍照`}>
            <Camera className="size-4" aria-hidden />
          </button>
        )}

        <input
          ref={inputRef}
          type="file"
          accept={MEAL_PHOTO_ACCEPT}
          aria-label={`${mealLabel}照片文件`}
          disabled={!canAdd}
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            choose(event.target.files);
            event.target.value = "";
          }}
        />
        <input ref={cameraRef} type="file" accept="image/*" capture="environment"
          aria-label={`${mealLabel}拍照文件`} disabled={!canAdd} className="sr-only" tabIndex={-1}
          onChange={(event) => { choose(event.target.files); event.target.value = ""; }} />
      </div>

      {uploading && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground" aria-live="polite">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          正在上传照片…
        </p>
      )}
      {error && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2">
          <p role="alert" className="text-[11px] text-destructive">
            {error}
          </p>
          {failed.length > 0 && (
            <button
              type="button"
              className="text-[11px] font-medium text-primary underline underline-offset-2"
              disabled={disabled || uploading}
              onClick={() => void uploadFiles(failed)}
            >
              重试未上传的照片
            </button>
          )}
          {failed.length > 0 && !uploading && (
            <button type="button" className="text-[11px] underline underline-offset-2"
              onClick={() => { setFailed([]); setError(""); }}>
              放弃待上传照片
            </button>
          )}
        </div>
      )}

      <Dialog open={viewerOpen} onOpenChange={setViewerOpen}>
        <DialogContent className="max-h-[85svh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>{mealLabel} 的照片</DialogTitle>
            <DialogDescription>
              {date} · 共 {photos.length} 张，新上传限每餐最多 {MEAL_PHOTO_MAX} 张。
            </DialogDescription>
          </DialogHeader>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}

          {photos.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">还没有照片</p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {photos.map((photo, index) => (
                <li key={photo.id} className="overflow-hidden rounded-xl border bg-muted/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={photo.url}
                    alt={`${mealLabel}的第 ${index + 1} 张照片`}
                    loading="lazy"
                    referrerPolicy="no-referrer"
                    className="max-h-[55svh] w-full object-contain"
                  />
                  <div className="flex items-center justify-between gap-2 border-t bg-card px-3 py-2">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      第 {index + 1} 张 · {photo.width}×{photo.height}
                    </span>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-10 text-destructive hover:text-destructive"
                      disabled={deletingId !== null}
                      onClick={() => void remove(photo.id)}
                    >
                      {deletingId === photo.id ? (
                        <Loader2 className="size-3.5 animate-spin" aria-hidden />
                      ) : (
                        <Trash2 className="size-3.5" aria-hidden />
                      )}
                      删除
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {canAdd && (
            <Button variant="outline" onClick={() => inputRef.current?.click()} disabled={uploading}>
              <Camera className="size-4" aria-hidden />
              继续添加照片
            </Button>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
