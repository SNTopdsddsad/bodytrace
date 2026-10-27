import type { TrainingExercise, TrainingRecord } from "@/lib/training";

export function recentTrainingExercises(records: TrainingRecord[]): TrainingExercise[] {
  const exercises: TrainingExercise[] = [];
  const keys = new Set<string>();
  for (const record of records) {
    for (const item of record.items) {
      const key = `${item.kind}:${item.name}:${item.kind === "strength" ? item.mode : ""}`;
      if (keys.has(key)) continue;
      keys.add(key);
      exercises.push(item.kind === "strength" ? { name: item.name, kind: item.kind, mode: item.mode } : { name: item.name, kind: item.kind });
      if (exercises.length >= 16) return exercises;
    }
  }
  return exercises;
}
