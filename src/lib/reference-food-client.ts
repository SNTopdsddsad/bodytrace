import { useEffect, useState } from "react";
import type { Food } from "@/db/schema";
import { api } from "./api-client";

export type ReferenceFood = {
  id: number;
  foodCode: string;
  name: string;
  englishName: string | null;
  category: string | null;
  calories: number | null;
  protein: number | null;
  carbs: number | null;
  fat: number | null;
  edible: number | null;
};

export function referenceFoodValues(ref: ReferenceFood) {
  return {
    name: ref.name,
    brand: `中国食物成分表 · ${ref.foodCode}`,
    calories: ref.calories ?? 0, protein: ref.protein ?? 0,
    carbs: ref.carbs ?? 0, fat: ref.fat ?? 0,
    servingGrams: 100,
  };
}

export function findReferenceCopy(foods: Food[], ref: ReferenceFood) {
  const values = referenceFoodValues(ref);
  return foods.find(food =>
    food.name === values.name && food.brand === values.brand &&
    food.calories === values.calories && food.protein === values.protein &&
    food.carbs === values.carbs && food.fat === values.fat
  );
}

export function useReferenceFoodSearch(input: string) {
  const query = input.trim();
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<{
    query: string; attempt: number; foods: ReferenceFood[]; error: string;
  } | null>(null);
  useEffect(() => {
    if (!query) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const { foods } = await api<{ foods: ReferenceFood[] }>(
          `/api/v1/foods/reference?q=${encodeURIComponent(query)}`, { signal: controller.signal },
        );
        if (!controller.signal.aborted) setResult({ query, attempt, foods, error: "" });
      } catch (error) {
        if (!controller.signal.aborted) {
          setResult({ query, attempt, foods: [], error: error instanceof Error ? error.message : "参考库查询失败" });
        }
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query, attempt]);

  const current = result?.query === query && result.attempt === attempt ? result : null;
  return {
    foods: current?.foods ?? [], searching: Boolean(query && !current),
    error: current?.error, retry: () => setAttempt(previous => previous + 1),
  };
}
