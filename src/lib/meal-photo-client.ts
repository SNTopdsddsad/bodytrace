/**
 * 浏览器端的照片预处理：先缩到长边 1600 再上传。
 *
 * 这样做有三个好处：手机原图不会把 8MB 上限撑爆；iPhone 的 HEIC 在 Safari 里
 * 可以先解码再转成 WebP；上传流量和服务器 sharp 的压力都更小。
 * 服务端仍然会重新解码、校验并去 EXIF，不信任这里的处理结果。
 */
import { api, apiForm, ApiError } from "./api-client";
import { withRequestTimeout } from "./request-timeout";
import { MEAL_PHOTO_MAX_BYTES } from "./meal-photo";
import type { MealPhotoDto, MealSlot } from "./meal-photo";

const MAX_EDGE = 1600;

export type PreparedMealPhoto = {
  file: File;
  previewUrl: string;
};

function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    return createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => loadWithImageElement(file));
  }
  return loadWithImageElement(file);
}

function loadWithImageElement(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("当前浏览器无法读取这张照片，请转换为 JPG 后重试"));
    };
    image.src = url;
  });
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("照片转码失败，请换一张再试"))),
      type,
      quality,
    );
  });
}

export async function prepareMealPhoto(file: File): Promise<PreparedMealPhoto> {
  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await loadImage(file);
  } catch {
    throw new Error("当前浏览器无法读取这张照片，请转换为 JPG 后重试");
  }

  const width = source.width;
  const height = source.height;
  if (!width || !height) {
    if (source instanceof ImageBitmap) source.close();
    throw new Error("无法读取这张照片的尺寸，请换一张再试");
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) {
    if (source instanceof ImageBitmap) source.close();
    throw new Error("当前浏览器不支持照片处理，请换一个浏览器");
  }
  context.drawImage(source, 0, 0, targetWidth, targetHeight);
  if (source instanceof ImageBitmap) source.close();

  let blob: Blob;
  try {
    blob = await toBlob(canvas, "image/webp", 0.82);
  } catch {
    blob = await toBlob(canvas, "image/jpeg", 0.85);
  }
  if (blob.size > MEAL_PHOTO_MAX_BYTES) {
    throw new Error("压缩后的照片仍然超过 8 MB，请换一张再试");
  }

  const extension = blob.type === "image/png" ? "png" : blob.type === "image/jpeg" ? "jpg" : "webp";
  return {
    file: new File([blob], `meal-photo.${extension}`, { type: blob.type }),
    previewUrl: URL.createObjectURL(blob),
  };
}

export async function uploadMealPhoto(
  slot: MealSlot,
  file: File,
  requestId: string,
  signal?: AbortSignal,
): Promise<MealPhotoDto> {
  const path = "/api/v1/meal-photos";
  const combined = (timeout: AbortSignal) => signal ? AbortSignal.any([signal, timeout]) : timeout;
  const lookup = () => withRequestTimeout(async (timeout) => {
    signal?.throwIfAborted();
    const data = await api<{ photo: MealPhotoDto | null }>(
      `${path}?requestId=${encodeURIComponent(requestId)}`, { signal: combined(timeout) },
    );
    if (!("photo" in data)) throw new Error("暂时无法核对照片，请稍后重试");
    if (data.photo && (data.photo.date !== slot.date || data.photo.mealType !== slot.mealType)) {
      throw new ApiError("本次上传编号已用于其他餐次，请重新选择照片", 409);
    }
    return data.photo;
  });

  // 每次重试先查权威状态。查询失败时不继续创建，避免把“未知”当成“不存在”。
  const existing = await lookup();
  if (existing) return existing;
  try {
    return await withRequestTimeout(async (timeout) => {
      signal?.throwIfAborted();
      const form = new FormData();
      form.append("date", slot.date);
      form.append("mealType", slot.mealType);
      form.append("file", file);
      form.append("requestId", requestId);
      const data = await apiForm<{ photo: MealPhotoDto }>(path, form, { signal: combined(timeout) });
      if (!data.photo?.id) throw new Error("照片上传结果尚未确认，请重试核对");
      return data.photo;
    }, 60_000);
  } catch (error) {
    signal?.throwIfAborted();
    if (error instanceof ApiError && error.status < 500) throw error;
    // 网络/网关失败可能发生在提交之后；这里只查询，不自动重发 POST。
    const confirmed = await lookup();
    if (confirmed) return confirmed;
    throw error;
  }
}
