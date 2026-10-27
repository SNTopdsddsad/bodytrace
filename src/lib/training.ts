import { z } from "zod";

export const TRAINING_RANGES = ["7", "30", "90", "all"] as const;
export const TRAINING_FILTERS = ["all", "strength", "cardio", "mixed"] as const;
export const TRAINING_STATUSES = ["all", "inProgress", "completed"] as const;
export type TrainingRange = (typeof TRAINING_RANGES)[number];
export type TrainingFilter = (typeof TRAINING_FILTERS)[number];
export type TrainingStatusFilter = (typeof TRAINING_STATUSES)[number];
export type StrengthMode = "weighted" | "bodyweight" | "timed";

export type TrainingSet = {
  id: string;
  weightKg: number | null;
  reps: number | null;
  durationSeconds: number | null;
  completed: boolean;
};
export type StrengthItem = { id: string; kind: "strength"; name: string; mode: StrengthMode; sets: TrainingSet[] };
export type CardioItem = { id: string; kind: "cardio"; name: string; durationMinutes: number | null; distanceKm: number | null; completed: boolean };
export type TrainingItem = StrengthItem | CardioItem;
export type TrainingInput = {
  title: string;
  date: string;
  time: string | null;
  mode: "live" | "manual";
  status: "inProgress" | "completed";
  /** 实时训练开始的真实时刻，用于核对经过时长；补录不伪造时刻。 */
  startedAt: string | null;
  durationMinutes: number | null;
  note: string | null;
  items: TrainingItem[];
};
export type TrainingRecord = TrainingInput & { id: string; timeZone: string; version: number; createdAt: string; updatedAt: string };
export type TrainingExercise = { name: string; kind: "strength"; mode: StrengthMode } | { name: string; kind: "cardio" };

/** 仅提供动作名称与计量方式，不附带训练处方或默认完成量。 */
export const TRAINING_EXERCISES: TrainingExercise[] = [
  { name: "杠铃卧推", kind: "strength", mode: "weighted" },
  { name: "哑铃卧推", kind: "strength", mode: "weighted" },
  { name: "深蹲", kind: "strength", mode: "weighted" },
  { name: "硬拉", kind: "strength", mode: "weighted" },
  { name: "哑铃划船", kind: "strength", mode: "weighted" },
  { name: "高位下拉", kind: "strength", mode: "weighted" },
  { name: "肩上推举", kind: "strength", mode: "weighted" },
  { name: "侧平举", kind: "strength", mode: "weighted" },
  { name: "二头弯举", kind: "strength", mode: "weighted" },
  { name: "腿举", kind: "strength", mode: "weighted" },
  { name: "俯卧撑", kind: "strength", mode: "bodyweight" },
  { name: "引体向上", kind: "strength", mode: "bodyweight" },
  { name: "卷腹", kind: "strength", mode: "bodyweight" },
  { name: "徒手深蹲", kind: "strength", mode: "bodyweight" },
  { name: "平板支撑", kind: "strength", mode: "timed" },
  { name: "靠墙静蹲", kind: "strength", mode: "timed" },
  ...["步行", "跑步", "骑行", "游泳", "椭圆机", "划船机", "其他有氧"].map(name => ({ name, kind: "cardio" as const })),
];

const nullableInteger = (max: number) => z.number().int("请填写整数").min(1, "数值须大于 0").max(max, `数值不能超过 ${max}`).nullable();
const nullableDecimal = (max: number) => z.number().min(0, "数值不能小于 0").max(max, `数值不能超过 ${max}`)
  .refine(value => Math.abs(value * 100 - Math.round(value * 100)) < 0.000001, "最多保留两位小数").nullable();
const setSchema = z.object({
  id: z.string().uuid(), weightKg: nullableDecimal(1000), reps: nullableInteger(10000),
  durationSeconds: nullableInteger(86400), completed: z.boolean(),
}).strict();
const itemSchema = z.discriminatedUnion("kind", [
  z.object({
    id: z.string().uuid(), kind: z.literal("strength"), name: z.string().trim().min(1, "请填写动作名称").max(80, "动作名称最多 80 字"),
    mode: z.enum(["weighted", "bodyweight", "timed"]), sets: z.array(setSchema).min(1, "每个动作至少保留一组").max(50, "每个动作最多 50 组"),
  }).strict(),
  z.object({
    id: z.string().uuid(), kind: z.literal("cardio"), name: z.string().trim().min(1, "请填写有氧类型").max(80, "项目名称最多 80 字"),
    durationMinutes: nullableInteger(1440), distanceKm: nullableDecimal(1000), completed: z.boolean(),
  }).strict(),
]);

/** 草稿可缺数值；勾选完成才校验实际表现，缺失值从不按零补齐。 */
export function trainingSchemas(today: string, nowTime?: string, nowIso = new Date().toISOString()) {
  const payload = z.object({
    title: z.string().trim().min(1, "请填写训练名称").max(80, "训练名称最多 80 字"),
    date: z.iso.date("请填写有效日期").refine(value => value >= "1000-01-01", "日期须在 1000 年或之后").refine(value => value <= today, "不能记录未来日期"),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "时间格式应为 HH:mm").nullable(),
    mode: z.enum(["live", "manual"]), status: z.enum(["inProgress", "completed"]),
    startedAt: z.iso.datetime({ offset: true }).transform(value => new Date(value).toISOString())
      .refine(value => new Date(value).getUTCFullYear() >= 1000 && new Date(value).getUTCFullYear() <= 9999, "开始时刻超出支持范围").nullable(),
    durationMinutes: nullableInteger(1440),
    note: z.string().trim().max(1000, "备注最多 1000 字").nullable().transform(value => value || null),
    items: z.array(itemSchema).max(50, "一次训练最多 50 个项目"),
  }).strict().superRefine((input, ctx) => {
    const issue = (path: (string | number)[], message: string) => ctx.addIssue({ code: "custom", path, message });
    if (input.date === today && nowTime && input.time && input.time > nowTime) issue(["time"], "不能记录未来时间");
    if (input.mode === "live" && !input.startedAt) issue(["startedAt"], "实时训练需要开始时刻");
    if (input.mode === "manual" && input.startedAt !== null) issue(["startedAt"], "补录不填写实时开始时刻");
    if (input.startedAt && Date.parse(input.startedAt) > Date.parse(nowIso)) issue(["startedAt"], "开始时刻不能在未来");
    const ids = new Set<string>();
    const unique = (id: string, path: (string | number)[]) => {
      if (ids.has(id)) issue(path, "项目和组的编号不能重复");
      ids.add(id);
    };
    input.items.forEach((item, i) => {
      unique(item.id, ["items", i, "id"]);
      if (item.kind === "cardio") {
        if (item.completed && item.durationMinutes === null) issue(["items", i, "durationMinutes"], "完成有氧前请填写实际时长");
        return;
      }
      item.sets.forEach((set, j) => {
        const path = ["items", i, "sets", j];
        unique(set.id, [...path, "id"]);
        if (item.mode === "timed") {
          if (set.weightKg !== null || set.reps !== null) issue(path, "计时动作只填写持续秒数");
          if (set.completed && set.durationSeconds === null) issue([...path, "durationSeconds"], "完成前请填写持续秒数");
        } else {
          if (set.durationSeconds !== null) issue(path, "次数动作不填写持续秒数");
          if (set.completed && set.reps === null) issue([...path, "reps"], "完成前请填写次数");
          if (set.completed && item.mode === "weighted" && (set.weightKg === null || set.weightKg <= 0)) issue([...path, "weightKg"], "负重动作完成前请填写重量");
        }
      });
    });
    const progress = trainingProgress(input);
    if (input.status === "completed" && progress.completedSets + progress.completedCardio === 0) issue(["items"], "请至少记录一组已完成动作或一项已完成有氧");
  });
  return {
    payload,
    create: z.object({ requestId: z.string().uuid(), training: payload }).strict(),
    update: z.object({ version: z.number().int().min(1), training: payload }).strict(),
    remove: z.object({ version: z.number().int().min(1) }).strict(),
  };
}

export function trainingKind(input: Pick<TrainingInput, "items">): "strength" | "cardio" | "mixed" | "empty" {
  const strength = input.items.some(item => item.kind === "strength");
  const cardio = input.items.some(item => item.kind === "cardio");
  return strength && cardio ? "mixed" : strength ? "strength" : cardio ? "cardio" : "empty";
}

export function trainingProgress(input: Pick<TrainingInput, "items">) {
  let totalSets = 0, completedSets = 0, totalCardio = 0, completedCardio = 0;
  for (const item of input.items) {
    if (item.kind === "strength") {
      totalSets += item.sets.length;
      completedSets += item.sets.filter(set => set.completed).length;
    } else { totalCardio++; if (item.completed) completedCardio++; }
  }
  return { completedSets, totalSets, completedCardio, totalCardio };
}

export function newTraining(mode: TrainingInput["mode"], date: string, time: string | null, nowIso: string): TrainingInput {
  return { title: "训练记录", date, time, mode, status: "inProgress", startedAt: mode === "live" ? nowIso : null, durationMinutes: null, note: null, items: [] };
}

/** 复制结构，不把过去的表现记为本次事实。源数据由界面另外显示为参考。 */
export function copyTraining(input: TrainingInput, date: string, time: string | null, newId = () => crypto.randomUUID()): TrainingInput {
  return {
    ...newTraining("manual", date, time, ""), title: input.title,
    items: input.items.map(item => item.kind === "strength"
      ? { ...item, id: newId(), sets: item.sets.map(() => ({ id: newId(), weightKg: null, reps: null, durationSeconds: null, completed: false })) }
      : { ...item, id: newId(), durationMinutes: null, distanceKm: null, completed: false }),
  };
}
