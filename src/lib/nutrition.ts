export type MacroLike = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export function addMacro(a: MacroLike, b: MacroLike): MacroLike {
  return {
    calories: a.calories + b.calories,
    protein: a.protein + b.protein,
    carbs: a.carbs + b.carbs,
    fat: a.fat + b.fat,
  };
}

export const ZERO_MACRO: MacroLike = { calories: 0, protein: 0, carbs: 0, fat: 0 };

/** 每 100g 值 × 克数 → 实际摄入。 */
export function scaleMacro(per100g: MacroLike, grams: number): MacroLike {
  const k = grams / 100;
  return {
    calories: round1(per100g.calories * k),
    protein: round1(per100g.protein * k),
    carbs: round1(per100g.carbs * k),
    fat: round1(per100g.fat * k),
  };
}

export function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

export const MEAL_ORDER = ["breakfast", "lunch", "dinner", "snack"] as const;
export type MealType = (typeof MEAL_ORDER)[number];

export const MEAL_LABELS: Record<MealType, string> = {
  breakfast: "早餐",
  lunch: "午餐",
  dinner: "晚餐",
  snack: "加餐",
};
