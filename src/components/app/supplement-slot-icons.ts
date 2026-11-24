import {
  Clock,
  Coffee,
  Dumbbell,
  Moon,
  Sun,
  Sunrise,
  Utensils,
  type LucideIcon,
} from "lucide-react";
import type { SupplementSlot } from "@/lib/supplements";

export const SUPPLEMENT_SLOT_ICONS: Record<SupplementSlot, LucideIcon> = {
  morningEmpty: Sunrise,
  breakfast: Coffee,
  lunch: Sun,
  dinner: Utensils,
  workout: Dumbbell,
  bedtime: Moon,
  anytime: Clock,
};
