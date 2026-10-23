"use client";

/**
 * 添加记录时的照片选择区：只负责选图和预览，上传由父组件在记录创建后执行。
 * 多选时一次加入，父组件负责压缩、逐张上传和失败重试。
 */
import { useRef } from "react";
import { Camera, ImagePlus, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MEAL_PHOTO_ACCEPT, MEAL_PHOTO_MAX } from "@/lib/meal-photo";

export type SelectedMealPhoto = {
  /** 本次选择的 UUID，所有上传重试复用此编号。 */
  id: string;
  file: File;
  previewUrl: string;
};

export function MealPhotoPicker({
  photos,
  max = MEAL_PHOTO_MAX,
  disabled = false,
  preparing = false,
  onAdd,
  onRemove,
}: {
  photos: SelectedMealPhoto[];
  max?: number;
  disabled?: boolean;
  preparing?: boolean;
  onAdd: (files: File[]) => void;
  onRemove: (id: string) => void;
}) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const albumRef = useRef<HTMLInputElement>(null);
  const full = photos.length >= max;

  function choose(files: FileList | null) {
    if (!files?.length) return;
    onAdd(Array.from(files));
  }

  return (
    <section className="space-y-3 rounded-xl border bg-muted/20 p-3" aria-labelledby="meal-photo-title">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h3 id="meal-photo-title" className="text-sm font-medium">
            照片 <span className="font-normal text-muted-foreground">（可选）</span>
          </h3>
          <p className="mt-1 text-[11px] text-muted-foreground">
            最多 {max} 张，支持 JPG / PNG / WebP；iPhone 照片会先转码
          </p>
        </div>
        <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
          {photos.length} / {max}
        </span>
      </div>

      {photos.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {photos.map((photo, index) => (
            <li key={photo.id} className="group relative aspect-square overflow-hidden rounded-lg border bg-card">
              {/* 预览是本地 blob，不需要 next/image 的远程配置 */}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photo.previewUrl}
                alt={`待上传照片 ${index + 1}`}
                className="size-full object-cover"
              />
              <button
                type="button"
                onClick={() => onRemove(photo.id)}
                disabled={disabled}
                className="absolute right-1 top-1 flex size-7 items-center justify-center rounded-full bg-black/65 text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:opacity-50"
                aria-label={`移除第 ${index + 1} 张待上传照片`}
              >
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={cameraRef}
          type="file"
          accept={MEAL_PHOTO_ACCEPT}
          capture="environment"
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            choose(event.target.files);
            event.target.value = "";
          }}
        />
        <input
          ref={albumRef}
          type="file"
          accept={MEAL_PHOTO_ACCEPT}
          multiple
          className="sr-only"
          tabIndex={-1}
          onChange={(event) => {
            choose(event.target.files);
            event.target.value = "";
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || full || preparing}
          onClick={() => cameraRef.current?.click()}
        >
          {preparing ? (
            <Loader2 className="size-4 animate-spin" aria-hidden />
          ) : (
            <Camera className="size-4" aria-hidden />
          )}
          拍照
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={disabled || full || preparing}
          onClick={() => albumRef.current?.click()}
        >
          <ImagePlus className="size-4" aria-hidden />
          从相册选择
        </Button>
        {full && <span className="text-xs text-muted-foreground">已达上限</span>}
      </div>
    </section>
  );
}
