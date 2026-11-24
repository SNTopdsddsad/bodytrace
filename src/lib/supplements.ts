import { z } from "zod";
import { isValidDateStr, shiftDate } from "./date";

export const SUPPLEMENT_SLOTS = [
  "morningEmpty",
  "breakfast",
  "lunch",
  "dinner",
  "workout",
  "bedtime",
  "anytime",
] as const;

export const SUPPLEMENT_BATCH_LIMIT = 30;

export type SupplementSlot = (typeof SUPPLEMENT_SLOTS)[number];

export const SUPPLEMENT_SLOT_LABELS: Record<SupplementSlot, string> = {
  morningEmpty: "晨起空腹",
  breakfast: "随早餐",
  lunch: "随午餐",
  dinner: "随晚餐",
  workout: "训练前后",
  bedtime: "睡前",
  anytime: "随时",
};

export const SUPPLEMENT_MODES = ["scheduled", "asNeeded"] as const;
export type SupplementMode = (typeof SUPPLEMENT_MODES)[number];

export const SUPPLEMENT_STATUSES = ["active", "paused"] as const;
export type SupplementStatus = (typeof SUPPLEMENT_STATUSES)[number];

export const SUPPLEMENT_UNIT_PRESETS = ["粒", "片", "勺", "袋", "滴", "ml", "g"] as const;

/** 0=周一 … 6=周日，与项目历史周计划约定一致。 */
export const WEEKDAY_LABELS = ["周一", "周二", "周三", "周四", "周五", "周六", "周日"] as const;
export const WEEKDAY_SHORT_LABELS = ["一", "二", "三", "四", "五", "六", "日"] as const;

export type SupplementScheduleItem = {
  slot: SupplementSlot;
  quantity: number;
};

export type Supplement = {
  id: string;
  name: string;
  defaultQuantity: number;
  unit: string;
  spec: string | null;
  mode: SupplementMode;
  status: SupplementStatus;
  schedule: SupplementScheduleItem[];
  /** null 表示每天；数组元素 0=周一 … 6=周日 表示按星期服用。 */
  weekdays: number[] | null;
  note: string | null;
  startDate: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type SupplementIntake = {
  id: string;
  supplementId: string | null;
  date: string;
  slot: SupplementSlot;
  takenTime: string | null;
  timeZone: string;
  name: string;
  quantity: number;
  unit: string;
  spec: string | null;
  note: string | null;
  isAdhoc: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type SupplementRecentDay = {
  date: string;
  planned: number;
  completed: number;
  taken: number;
};

export type SupplementDashboard = {
  date: string;
  today: string;
  timeZone: string;
  supplements: Supplement[];
  intakes: SupplementIntake[];
  /** 近 30 天（含今天）全部有效服用记录，供 14/30 天规律矩阵即时切换。 */
  windowIntakes: SupplementIntake[];
  recentDays: SupplementRecentDay[];
};

export type SupplementTemplate = {
  name: string;
  defaultQuantity: number;
  unit: string;
  spec: string | null;
  mode: SupplementMode;
  schedule: SupplementScheduleItem[];
  note: string | null;
};

export const SUPPLEMENT_TEMPLATES: SupplementTemplate[] = [
  {
    name: "复合维生素",
    defaultQuantity: 1,
    unit: "片",
    spec: null,
    mode: "scheduled",
    schedule: [{ slot: "breakfast", quantity: 1 }],
    note: null,
  },
  {
    name: "维生素 D3 + K2",
    defaultQuantity: 1,
    unit: "粒",
    spec: "D3 2000IU + K2 100mcg",
    mode: "scheduled",
    schedule: [{ slot: "breakfast", quantity: 1 }],
    note: "随含油脂餐吸收更好",
  },
  {
    name: "深海鱼油",
    defaultQuantity: 2,
    unit: "粒",
    spec: "1000mg",
    mode: "scheduled",
    schedule: [{ slot: "breakfast", quantity: 2 }],
    note: "随餐服用",
  },
  {
    name: "甘氨酸镁",
    defaultQuantity: 2,
    unit: "粒",
    spec: "200mg",
    mode: "scheduled",
    schedule: [{ slot: "bedtime", quantity: 2 }],
    note: null,
  },
  {
    name: "一水肌酸",
    defaultQuantity: 1,
    unit: "勺",
    spec: "5g",
    mode: "scheduled",
    schedule: [{ slot: "workout", quantity: 1 }],
    note: null,
  },
  {
    name: "益生菌",
    defaultQuantity: 1,
    unit: "粒",
    spec: null,
    mode: "scheduled",
    schedule: [{ slot: "morningEmpty", quantity: 1 }],
    note: "温凉水送服",
  },
  {
    name: "维生素 B 族",
    defaultQuantity: 1,
    unit: "片",
    spec: null,
    mode: "scheduled",
    schedule: [{ slot: "breakfast", quantity: 1 }],
    note: null,
  },
  {
    name: "维生素 C",
    defaultQuantity: 1,
    unit: "片",
    spec: "500mg",
    mode: "asNeeded",
    schedule: [],
    note: null,
  },
];

const SLOT_ORDER = new Map<SupplementSlot, number>(
  SUPPLEMENT_SLOTS.map((slot, index) => [slot, index]),
);

const SINGLE_UNIT_SPEC_RE = /^\d+(?:\.\d+)?\s*[a-zA-Zµμ%]+$/i;
const TIME_RE = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function roundQty(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatQuantity(value: number): string {
  return roundQty(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

export function formatSupplementDose(quantity: number, unit: string, spec: string | null): string {
  const base = `${formatQuantity(quantity)} ${unit}`;
  const trimmedSpec = spec?.trim();
  if (!trimmedSpec) return base;
  return SINGLE_UNIT_SPEC_RE.test(trimmedSpec)
    ? `${base} × ${trimmedSpec}`
    : `${base} · ${trimmedSpec}`;
}

export function formatWeekdaysLabel(weekdays: number[] | null): string {
  if (!weekdays || weekdays.length === 0 || weekdays.length >= 7) return "每天";
  const sorted = [...new Set(weekdays)].sort((a, b) => a - b);
  return `每周${sorted.map((day) => WEEKDAY_SHORT_LABELS[day]).join("·")}`;
}

/** 业务日期（YYYY-MM-DD）对应的星期索引：0=周一 … 6=周日。 */
export function weekdayOfDate(dateStr: string): number {
  const d = new Date(`${dateStr}T00:00:00Z`);
  return (d.getUTCDay() + 6) % 7;
}

export function isSupplementPlannedOnDate(
  supplement: Pick<Supplement, "mode" | "status" | "schedule" | "weekdays" | "startDate">,
  dateStr: string,
): boolean {
  if (dateStr < supplement.startDate || supplement.mode !== "scheduled" || supplement.status !== "active" || supplement.schedule.length === 0) {
    return false;
  }
  if (!supplement.weekdays || supplement.weekdays.length === 0) return true;
  return supplement.weekdays.includes(weekdayOfDate(dateStr));
}

export function normalizeSchedule(items: SupplementScheduleItem[]): SupplementScheduleItem[] {
  const seen = new Set<SupplementSlot>();
  const normalized: SupplementScheduleItem[] = [];
  for (const item of items) {
    if (seen.has(item.slot)) continue;
    seen.add(item.slot);
    normalized.push({ slot: item.slot, quantity: roundQty(item.quantity) });
  }
  return normalized.sort((a, b) => (SLOT_ORDER.get(a.slot) ?? 99) - (SLOT_ORDER.get(b.slot) ?? 99));
}

export function normalizeWeekdays(weekdays: number[] | null | undefined): number[] | null {
  if (!weekdays || weekdays.length === 0) return null;
  const unique = [...new Set(weekdays)].sort((a, b) => a - b);
  if (unique.length >= 7) return null;
  return unique;
}

/** 计算指定日期列表的补剂完成概况（用于顶部周历与进度摘要）。 */
export function summarizeSupplementDays(
  supplements: Pick<Supplement, "id" | "mode" | "status" | "schedule" | "weekdays" | "startDate">[],
  intakes: Pick<SupplementIntake, "supplementId" | "date" | "slot">[],
  dates: string[],
): SupplementRecentDay[] {
  const intakesByDate = new Map<string, Pick<SupplementIntake, "supplementId" | "date" | "slot">[]>();
  for (const entry of intakes) {
    const bucket = intakesByDate.get(entry.date);
    if (bucket) bucket.push(entry);
    else intakesByDate.set(entry.date, [entry]);
  }

  return dates.map((date) => {
    const dayIntakes = intakesByDate.get(date) ?? [];
    let planned = 0;
    let completed = 0;

    for (const sup of supplements) {
      if (!isSupplementPlannedOnDate(sup, date)) continue;
      for (const item of sup.schedule) {
        planned += 1;
        if (dayIntakes.some((entry) => entry.supplementId === sup.id && entry.slot === item.slot)) {
          completed += 1;
        }
      }
    }

    return { date, planned, completed, taken: dayIntakes.length };
  });
}

export type HabitCellStatus = "full" | "partial" | "missed" | "offDay" | "beforeStart" | "extra";

export type HabitMatrixCell = {
  date: string;
  status: HabitCellStatus;
  planned: number;
  completed: number;
  taken: number;
};

export type HabitMatrixRow = {
  supplement: Supplement;
  cells: HabitMatrixCell[];
  fullDays: number;
  plannedDays: number;
  takenDays: number;
};

/**
 * 构建近 14 / 30 天按补剂分行的客观服用点阵。
 * - 常规在服补剂全部展示；创建日期之前的空白日标为 beforeStart（微灰点），不误算成未服。
 * - 同一补剂一天多时段时，区分全服（full）、部分（partial）与未记（missed）。
 * - 无常规补剂时，若有按需补剂在窗口内有记录也会展示其实际服用日。
 */
export function buildSupplementHabitMatrix(
  supplements: Supplement[],
  intakes: SupplementIntake[],
  today: string,
  days: 14 | 30,
): { dates: string[]; rows: HabitMatrixRow[] } {
  const dates = Array.from({ length: days }, (_, index) => shiftDate(today, -(days - 1) + index));
  const bySupplementDate = new Map<string, SupplementIntake[]>();
  for (const entry of intakes) {
    if (!entry.supplementId) continue;
    const key = `${entry.supplementId}:${entry.date}`;
    const bucket = bySupplementDate.get(key);
    if (bucket) bucket.push(entry);
    else bySupplementDate.set(key, [entry]);
  }

  const scheduledActive = supplements.filter((s) => s.mode === "scheduled" && s.status === "active");
  const targetSupplements =
    scheduledActive.length > 0
      ? scheduledActive
      : supplements.filter(
          (s) => s.status === "active" && dates.some((date) => bySupplementDate.has(`${s.id}:${date}`)),
        );

  const rows: HabitMatrixRow[] = targetSupplements.map((sup) => {
    let fullDays = 0;
    let plannedDays = 0;
    let takenDays = 0;

    const cells: HabitMatrixCell[] = dates.map((date) => {
      const dayEntries = bySupplementDate.get(`${sup.id}:${date}`) ?? [];
      const taken = dayEntries.length;
      if (taken > 0) takenDays += 1;

      if (sup.mode !== "scheduled") {
        return {
          date,
          status: taken > 0 ? "extra" : date < sup.startDate ? "beforeStart" : "offDay",
          planned: 0,
          completed: 0,
          taken,
        };
      }

      if (date < sup.startDate) {
        return {
          date,
          status: taken > 0 ? "extra" : "beforeStart",
          planned: 0,
          completed: 0,
          taken,
        };
      }

      const plannedToday = isSupplementPlannedOnDate(sup, date);
      if (!plannedToday) {
        return {
          date,
          status: taken > 0 ? "extra" : "offDay",
          planned: 0,
          completed: 0,
          taken,
        };
      }

      plannedDays += 1;
      const planned = sup.schedule.length;
      const completed = sup.schedule.filter((item) =>
        dayEntries.some((entry) => entry.slot === item.slot),
      ).length;

      if (completed === 0) {
        return { date, status: "missed", planned, completed: 0, taken };
      }
      if (completed >= planned) {
        fullDays += 1;
        return { date, status: "full", planned, completed, taken };
      }
      return { date, status: "partial", planned, completed, taken };
    });

    return { supplement: sup, cells, fullDays, plannedDays, takenDays };
  });

  return { dates, rows };
}

/* ───────────────────────────── Zod 校验 Schema ───────────────────────────── */

const quantitySchema = z
  .number()
  .finite("请填写有效数量")
  .min(0.01, "数量至少为 0.01")
  .max(100, "单次数量不能超过 100")
  .refine((v) => Math.abs(v * 100 - Math.round(v * 100)) < 1e-6, "数量最多支持两位小数")
  .transform(roundQty);

const unitSchema = z.string().trim().min(1, "请填写单位").max(16, "单位最多 16 字");

const optionalShortText = (max: number, label: string) =>
  z
    .string()
    .trim()
    .max(max, `${label}最多 ${max} 字`)
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

const scheduleItemSchema = z
  .object({
    slot: z.enum(SUPPLEMENT_SLOTS, { message: "请选择有效的服用时段" }),
    quantity: quantitySchema,
  })
  .strict();

const weekdaysSchema = z
  .array(z.number().int().min(0).max(6))
  .max(7)
  .nullable()
  .optional()
  .transform((value) => normalizeWeekdays(value));

function validateSupplementShape(
  value: {
    mode: SupplementMode;
    schedule: SupplementScheduleItem[];
    weekdays: number[] | null;
  },
  ctx: z.RefinementCtx,
) {
  const slots = value.schedule.map((item) => item.slot);
  if (new Set(slots).size !== slots.length) {
    ctx.addIssue({
      code: "custom",
      path: ["schedule"],
      message: "同一补剂不能重复配置相同服用时段",
    });
  }
  if (value.mode === "scheduled" && value.schedule.length === 0) {
    ctx.addIssue({
      code: "custom",
      path: ["schedule"],
      message: "常规计划至少选择一个服用时段",
    });
  }
  if (value.mode === "asNeeded" && value.schedule.length > 0) {
    ctx.addIssue({
      code: "custom",
      path: ["schedule"],
      message: "按需常备不需要配置固定时段",
    });
  }
  if (value.mode === "asNeeded" && value.weekdays !== null) {
    ctx.addIssue({
      code: "custom",
      path: ["weekdays"],
      message: "按需常备不需要设置星期频率",
    });
  }
}

export const supplementCreateSchema = z
  .object({
    requestId: z.string().uuid("提交编号不合法").optional(),
    name: z.string().trim().min(1, "请填写补剂名称").max(80, "补剂名称最多 80 字"),
    defaultQuantity: quantitySchema,
    unit: unitSchema,
    spec: optionalShortText(80, "规格说明"),
    mode: z.enum(SUPPLEMENT_MODES, { message: "请选择常规计划或按需常备" }),
    status: z.enum(SUPPLEMENT_STATUSES).optional().default("active"),
    schedule: z.array(scheduleItemSchema).max(SUPPLEMENT_SLOTS.length).default([]),
    weekdays: weekdaysSchema,
    note: optionalShortText(200, "备注"),
  })
  .strict()
  .superRefine(validateSupplementShape)
  .transform((value) => ({
    ...value,
    schedule: normalizeSchedule(value.schedule),
  }));

export const supplementPatchSchema = z
  .object({
    name: z.string().trim().min(1, "请填写补剂名称").max(80, "补剂名称最多 80 字").optional(),
    defaultQuantity: quantitySchema.optional(),
    unit: unitSchema.optional(),
    spec: optionalShortText(80, "规格说明").optional(),
    mode: z.enum(SUPPLEMENT_MODES).optional(),
    status: z.enum(SUPPLEMENT_STATUSES).optional(),
    schedule: z.array(scheduleItemSchema).max(SUPPLEMENT_SLOTS.length).optional(),
    weekdays: weekdaysSchema.optional(),
    note: optionalShortText(200, "备注").optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "至少修改一项内容");

export function validateMergedSupplement(merged: {
  mode: SupplementMode;
  schedule: SupplementScheduleItem[];
  weekdays: number[] | null;
}): { ok: true; schedule: SupplementScheduleItem[]; weekdays: number[] | null } | { ok: false; message: string } {
  const slots = merged.schedule.map((item) => item.slot);
  if (new Set(slots).size !== slots.length) {
    return { ok: false, message: "同一补剂不能重复配置相同服用时段" };
  }
  if (merged.mode === "scheduled" && merged.schedule.length === 0) {
    return { ok: false, message: "常规计划至少选择一个服用时段" };
  }
  if (merged.mode === "asNeeded") {
    return { ok: true, schedule: [], weekdays: null };
  }
  return {
    ok: true,
    schedule: normalizeSchedule(merged.schedule),
    weekdays: normalizeWeekdays(merged.weekdays),
  };
}

export function supplementIntakeSchemas(today: string) {
  const dateField = z
    .string()
    .refine(isValidDateStr, "请填写有效日期")
    .refine((value) => value <= today, "不能记录未来日期");

  const takenTimeField = z
    .string()
    .regex(TIME_RE, "时间格式应为 HH:mm")
    .nullable()
    .optional()
    .transform((value) => value ?? null);

  const noteField = optionalShortText(300, "备注");

  const slotField = z.enum(SUPPLEMENT_SLOTS, { message: "请选择有效的服用时段" });

  const fromLibraryIntake = z
    .object({
      supplementId: z.string().uuid("补剂编号不合法"),
      date: dateField,
      slot: slotField,
      quantity: quantitySchema.optional(),
      takenTime: takenTimeField,
      note: noteField,
    })
    .strict();

  const adhocIntake = z
    .object({
      supplementId: z.null().optional(),
      date: dateField,
      slot: slotField.default("anytime"),
      name: z.string().trim().min(1, "请填写补剂名称").max(80, "补剂名称最多 80 字"),
      quantity: quantitySchema,
      unit: unitSchema,
      spec: optionalShortText(80, "规格说明"),
      takenTime: takenTimeField,
      note: noteField,
    })
    .strict();

  const intakePayload = z.union([fromLibraryIntake, adhocIntake]);

  const createItem = z
    .object({
      requestId: z.string().uuid("提交编号不合法"),
      intake: intakePayload,
    })
    .strict();

  const batchCreate = z
    .object({
      items: z
        .array(createItem)
        .min(1, "至少选择一条记录")
        .max(SUPPLEMENT_BATCH_LIMIT, `单次批量记录最多 ${SUPPLEMENT_BATCH_LIMIT} 条`)
        .refine(
          (items) => new Set(items.map((item) => item.requestId)).size === items.length,
          "批量提交中存在重复的提交编号",
        ),
    })
    .strict();

  const updatePayload = z
    .object({
      date: dateField,
      slot: slotField,
      quantity: quantitySchema,
      takenTime: takenTimeField,
      note: noteField,
    })
    .strict();

  const update = z
    .object({
      version: z.number().int().min(1),
      intake: updatePayload,
    })
    .strict();

  const remove = z
    .object({
      version: z.number().int().min(1),
    })
    .strict();

  return {
    createItem,
    batchCreate,
    update,
    updatePayload,
    remove,
    fromLibraryIntake,
    adhocIntake,
  };
}

export type SupplementCreateInput = z.infer<typeof supplementCreateSchema>;
export type SupplementPatchInput = z.infer<typeof supplementPatchSchema>;
export type SupplementIntakeCreatePayload = z.infer<ReturnType<typeof supplementIntakeSchemas>["createItem"]>["intake"];
export type SupplementIntakeUpdatePayload = z.infer<ReturnType<typeof supplementIntakeSchemas>["updatePayload"]>;
