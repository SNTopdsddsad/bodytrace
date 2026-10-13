import { z } from "zod";

export const MEASUREMENT_KINDS = ["weight", "bodyFat", "bloodPressure"] as const;
export type MeasurementKind = (typeof MEASUREMENT_KINDS)[number];
export const MEASUREMENT_LABELS: Record<MeasurementKind, string> = {
  weight: "体重", bodyFat: "体脂率", bloodPressure: "血压",
};
export const MEASUREMENT_PERIODS = ["morning", "evening"] as const;
export type MeasurementPeriod = (typeof MEASUREMENT_PERIODS)[number];
export const MEASUREMENT_PERIOD_LABELS: Record<MeasurementPeriod, string> = {
  morning: "晨间", evening: "夜间",
};
export const MEASUREMENT_RANGES = ["7", "30", "90", "all"] as const;
export type MeasurementRange = (typeof MEASUREMENT_RANGES)[number];

/** 小数以十进制字符串传输，日期和可选时间保留用户填写的精度。 */
export type Measurement = {
  id: string;
  kind: MeasurementKind;
  date: string;
  time: string | null;
  timeZone: string;
  value: string | null;
  systolic: number | null;
  diastolic: number | null;
  /** 血压测量时段；迁移前的旧记录可能未标记。 */
  period: MeasurementPeriod | null;
  note: string | null;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type MeasurementDashboard = {
  range: MeasurementRange;
  entries: Measurement[];
  latest: Record<MeasurementKind, Measurement | null>;
  previous: Record<MeasurementKind, Measurement | null>;
  targetWeightKg: number | null;
  legacyWeightKg: number | null;
  today: string;
  timeZone: string;
};

export function isMeasurementDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const decimalValue = (max: number) => z.string()
  .regex(/^\d{1,3}(?:\.\d{1,2})?$/, "请填写有效数值，最多两位小数")
  .refine(value => Number(value) > 0 && Number(value) <= max, `数值应大于 0 且不超过 ${max}`)
  .transform(value => Number(value).toFixed(2));

export function measurementSchemas(today: string) {
  const common = {
    date: z.string().refine(isMeasurementDate, "请填写有效日期")
      .refine(value => value <= today, "不能记录未来日期"),
    time: z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, "时间格式应为 HH:mm")
      .nullable().optional().transform(value => value ?? null),
    note: z.string().trim().max(500, "备注最多 500 字").nullable().optional()
      .transform(value => value || null),
  };
  const payload = z.discriminatedUnion("kind", [
    z.object({ ...common, kind: z.literal("weight"), value: decimalValue(500) }).strict(),
    z.object({ ...common, kind: z.literal("bodyFat"), value: decimalValue(100) }).strict(),
    z.object({
      ...common, kind: z.literal("bloodPressure"),
      period: z.enum(MEASUREMENT_PERIODS, { message: "请选择晨间或夜间" }),
      systolic: z.number().int().min(1).max(400),
      diastolic: z.number().int().min(1).max(400),
    }).strict().refine(value => value.systolic > value.diastolic, {
      message: "收缩压应大于舒张压，请核对输入", path: ["systolic"],
    }),
  ]);
  return {
    payload,
    create: z.object({ requestId: z.string().uuid(), measurement: payload }).strict(),
    update: z.object({ version: z.number().int().min(1), measurement: payload }).strict(),
  };
}

export type MeasurementInput = z.infer<ReturnType<typeof measurementSchemas>["payload"]>;

export function measurementValue(entry: Measurement): string {
  if (entry.kind === "bloodPressure") return `${entry.systolic}/${entry.diastolic}`;
  return Number(entry.value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
}

export function measurementUnit(kind: MeasurementKind): string {
  return kind === "weight" ? "kg" : kind === "bodyFat" ? "%" : "mmHg";
}

/** 血压记录的展示标签：晨间/夜间，旧记录未标记时返回 null。 */
export function measurementPeriodLabel(entry: Pick<Measurement, "kind" | "period">): string | null {
  if (entry.kind !== "bloodPressure") return null;
  return entry.period ? MEASUREMENT_PERIOD_LABELS[entry.period] : "未标记时段";
}

function signed(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  return `${rounded > 0 ? "+" : ""}${rounded}`;
}

export function measurementChange(current: Measurement, previous: Measurement | null): string | null {
  if (!previous || previous.kind !== current.kind) return null;
  if (current.kind === "bloodPressure") {
    return `${signed(current.systolic! - previous.systolic!)} / ${signed(current.diastolic! - previous.diastolic!)} mmHg`;
  }
  return `${signed(Number(current.value) - Number(previous.value))} ${current.kind === "bodyFat" ? "个百分点" : "kg"}`;
}

/** 每天取排序中的最近一条，缺失日期保留 null，让趋势线断开。 */
export function measurementChart(entries: Measurement[], kind: MeasurementKind) {
  const daily = new Map<string, Measurement>();
  for (const entry of entries) {
    if (entry.kind === kind && !daily.has(entry.date)) daily.set(entry.date, entry);
  }
  const ordered = [...daily.values()].sort((a, b) => a.date.localeCompare(b.date));
  if (ordered.length === 0) return [];
  const points: { date: string; value: number | null; systolic: number | null; diastolic: number | null }[] = [];
  for (let index = 0; index < ordered.length; index++) {
    const entry = ordered[index];
    const previous = ordered[index - 1];
    if (previous && Date.parse(entry.date) - Date.parse(previous.date) > 86_400_000) {
      const missing = new Date(`${previous.date}T00:00:00Z`);
      missing.setUTCDate(missing.getUTCDate() + 1);
      points.push({ date: missing.toISOString().slice(0, 10), value: null, systolic: null, diastolic: null });
    }
    points.push({ date: entry.date, value: entry.value != null ? Number(entry.value) : null, systolic: entry.systolic, diastolic: entry.diastolic });
  }
  return points;
}

export type BloodPressurePoint = {
  date: string;
  morningSystolic: number | null;
  morningDiastolic: number | null;
  eveningSystolic: number | null;
  eveningDiastolic: number | null;
};

/** 血压按晨间/夜间各自取每天最近一条合成一行，缺失保持 null 断开；未标记时段的记录不进趋势。 */
export function bloodPressureChart(entries: Measurement[]): BloodPressurePoint[] {
  const daily = new Map<string, { morning: Measurement | null; evening: Measurement | null }>();
  for (const entry of entries) {
    if (entry.kind !== "bloodPressure" || !entry.period) continue;
    const slot = daily.get(entry.date) ?? { morning: null, evening: null };
    if (!slot[entry.period]) slot[entry.period] = entry;
    daily.set(entry.date, slot);
  }
  const rows: BloodPressurePoint[] = [];
  const toRow = (date: string, slot?: { morning: Measurement | null; evening: Measurement | null }): BloodPressurePoint => ({
    date,
    morningSystolic: slot?.morning?.systolic ?? null,
    morningDiastolic: slot?.morning?.diastolic ?? null,
    eveningSystolic: slot?.evening?.systolic ?? null,
    eveningDiastolic: slot?.evening?.diastolic ?? null,
  });
  let previous: string | null = null;
  for (const date of [...daily.keys()].sort()) {
    if (previous && Date.parse(date) - Date.parse(previous) > 86_400_000) {
      const missing = new Date(`${previous}T00:00:00Z`);
      missing.setUTCDate(missing.getUTCDate() + 1);
      rows.push(toRow(missing.toISOString().slice(0, 10)));
    }
    rows.push(toRow(date, daily.get(date)));
    previous = date;
  }
  return rows;
}
