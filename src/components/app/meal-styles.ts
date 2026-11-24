import { Sunrise, Sun, Moon, Cookie, type LucideIcon } from "lucide-react";
import type { MealType } from "@/lib/nutrition";

type MealStyle = { icon: LucideIcon; chip: string };

export const MEAL_STYLES: Record<MealType, MealStyle> = {
  breakfast: { icon: Sunrise, chip: "bg-[#f7efdf] text-[#9a7228] dark:bg-amber-950/50 dark:text-amber-300" },
  lunch: { icon: Sun, chip: "bg-[#eaf0e5] text-[#456b4b] dark:bg-green-950/50 dark:text-green-300" },
  dinner: { icon: Moon, chip: "bg-[#e9eef4] text-[#55708f] dark:bg-slate-800 dark:text-slate-300" },
  snack: { icon: Cookie, chip: "bg-[#f6eae4] text-[#a56b56] dark:bg-orange-950/50 dark:text-orange-300" },
};
