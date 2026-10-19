import { Sunrise, Sun, Moon, Cookie, type LucideIcon } from "lucide-react";
import type { MealType } from "@/lib/nutrition";

type MealStyle = { icon: LucideIcon; chip: string };

export const MEAL_STYLES: Record<MealType, MealStyle> = {
  breakfast: { icon: Sunrise, chip: "bg-secondary text-foreground" },
  lunch: { icon: Sun, chip: "bg-secondary text-foreground" },
  dinner: { icon: Moon, chip: "bg-secondary text-foreground" },
  snack: { icon: Cookie, chip: "bg-secondary text-foreground" },
};
