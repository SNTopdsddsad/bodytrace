import type { Food } from "@/db/schema";
import type { NutritionDraft } from "@/lib/deepseek-client";

export type EditableDraft = NutritionDraft & {
  localId: string;
  selected: boolean;
  saveToLibrary: boolean;
  expanded: boolean;
  gramsText: string;
  calText: string;
  proText: string;
  carbText: string;
  fatText: string;
  loggedSummary: string | null;
  savedFood: Food | null;
};

export function makeEditableDraft(draft: NutritionDraft, localId: string): EditableDraft {
  return {
    ...draft,
    localId,
    selected: true,
    saveToLibrary: draft.source !== "personal" && draft.suggestSaveToLibrary,
    expanded: false,
    gramsText: String(draft.grams),
    calText: String(draft.per100g.calories),
    proText: String(draft.per100g.protein),
    carbText: String(draft.per100g.carbs),
    fatText: String(draft.per100g.fat),
    loggedSummary: null,
    savedFood: null,
  };
}

/** 按本地编号合并完整修订清单；已记项保留，未返回的待记项移除。 */
export function revisePendingDrafts(previous: EditableDraft[], revisions: NutritionDraft[], newId: () => string): EditableDraft[] {
  const byId = new Map<string, NutritionDraft>();
  const additions: EditableDraft[] = [];
  const hasWrites = previous.some(draft => draft.loggedSummary || draft.savedFood);
  for (const item of revisions) {
    const matches = item.previousDraftId
      ? previous.filter(draft => draft.localId === item.previousDraftId)
      : previous.filter(draft => (item.matchedFoodId && item.matchedFoodId === draft.matchedFoodId) ||
          draft.name.trim().toLowerCase() === item.name.trim().toLowerCase());
    const match = matches[0];
    if (matches.length > 1 || (match && byId.has(match.localId)) || (!match && item.previousDraftId)) {
      throw new Error("未能对应原有食物，已保留上一轮草稿，请重新估算。");
    }
    if (match) {
      byId.set(match.localId, item);
    } else {
      additions.push({ ...makeEditableDraft(item, newId()), selected: !hasWrites });
    }
  }
  return previous.flatMap(draft => {
    if (draft.loggedSummary) return [draft];
    const revision = byId.get(draft.localId);
    if (!revision) return [];
    const sameBasis = !revision.basisChanged && revision.name.trim() === draft.name.trim();
    const updated = makeEditableDraft(sameBasis ? {
      ...revision,
      source: draft.source,
      matchedFoodId: draft.matchedFoodId,
      matchedReferenceCode: draft.matchedReferenceCode,
      per100g: draft.per100g,
    } : revision, draft.localId);
    return [{
      ...updated,
      selected: draft.selected,
      saveToLibrary: draft.saveToLibrary,
      savedFood: draft.savedFood,
      matchedFoodId: draft.savedFood?.id ?? updated.matchedFoodId,
    }];
  }).concat(additions);
}

export function draftCommitPayload(draft: EditableDraft, foods: Food[]) {
  const food = foods.find(item => item.id === draft.matchedFoodId) ?? draft.savedFood;
  const name = draft.name.trim();
  const matchesLibrary = food && food.name === name &&
    food.calories === draft.per100g.calories && food.protein === draft.per100g.protein &&
    food.carbs === draft.per100g.carbs && food.fat === draft.per100g.fat;
  return {
    name,
    grams: draft.grams,
    servingGrams: draft.servingGrams,
    ...draft.per100g,
    matchedFoodId: matchesLibrary ? food.id : null,
    saveToLibrary: !draft.matchedFoodId && draft.saveToLibrary,
  };
}

export type AiDraftCommitPayload = ReturnType<typeof draftCommitPayload>;

export function prefillUnchangedField(current: string, initial: string, suggested: number): string {
  return current === initial ? String(suggested) : current;
}
