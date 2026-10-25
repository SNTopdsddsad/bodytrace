/**
 * 饮食照片的共享常量（客户端与服务端都可以引用，不包含 Node 专用模块）。
 * 每餐最多 6 张；服务端会再次校验，客户端限制只用于提前提示。
 */
import type { MealType } from "./nutrition";

export type MealSlot = { date: string; mealType: MealType };

export type MealPhotoDto = MealSlot & {
  id: string;
  url: string;
  thumbUrl: string;
  width: number;
  height: number;
  position: number;
};

export const MEAL_PHOTO_MAX = 6;
export const MEAL_PHOTO_MAX_BYTES = 8 * 1024 * 1024;

/** 文件选择框接受的照片格式；HEIC 由客户端先尝试转码。 */
export const MEAL_PHOTO_ACCEPT =
  "image/jpeg,image/png,image/webp,image/avif,image/heic,image/heif";

/** 浏览器 Canvas 转码后统一用 WebP，失败时回退 JPEG。 */
export const MEAL_PHOTO_CLIENT_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif"];

export function formatPhotoBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
