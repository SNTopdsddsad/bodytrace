/**
 * 四餐的专属配色和图标：早餐琥珀（晨光）、午餐天蓝（正午）、
 * 晚餐紫罗兰（夜幕）、加餐玫瑰（小零嘴）。
 *
 * 注意：这里的 Tailwind 类必须是完整字符串写死在源码里，
 * Tailwind 靠扫描源码生成样式，动态拼接的类名它认不出来。
 */
import { Sunrise, Sun, Moon, Cookie, type LucideIcon } from "lucide-react";
import type { MealType } from "@/lib/nutrition";

export type MealStyle = {
  icon: LucideIcon;
  /** 图标圆片：彩色底 + 彩色图标 */
  chip: string;
  /** 区块左侧的彩色竖条 */
  bar: string;
  /** 卡片顶部的彩色横条（今日页小卡用） */
  topBar: string;
  /** 数值文字颜色 */
  value: string;
};

export const MEAL_STYLES: Record<MealType, MealStyle> = {
  breakfast: {
    icon: Sunrise,
    chip: "bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400",
    bar: "border-l-amber-400",
    topBar: "border-t-amber-400",
    value: "text-amber-600 dark:text-amber-400",
  },
  lunch: {
    icon: Sun,
    chip: "bg-sky-100 text-sky-600 dark:bg-sky-950/50 dark:text-sky-400",
    bar: "border-l-sky-400",
    topBar: "border-t-sky-400",
    value: "text-sky-600 dark:text-sky-400",
  },
  dinner: {
    icon: Moon,
    chip: "bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-400",
    bar: "border-l-violet-400",
    topBar: "border-t-violet-400",
    value: "text-violet-600 dark:text-violet-400",
  },
  snack: {
    icon: Cookie,
    chip: "bg-rose-100 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400",
    bar: "border-l-rose-400",
    topBar: "border-t-rose-400",
    value: "text-rose-600 dark:text-rose-400",
  },
};
