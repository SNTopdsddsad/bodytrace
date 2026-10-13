import { randomUUID } from "node:crypto";
import { and, desc, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { measurement, userProfile } from "@/db/schema";
import { shiftDate, todayStr } from "@/lib/date";
import { MEASUREMENT_KINDS } from "@/lib/measurements";
import type { Measurement, MeasurementDashboard, MeasurementInput, MeasurementKind, MeasurementRange } from "@/lib/measurements";

type Row = typeof measurement.$inferSelect;
const order = [desc(measurement.date), desc(measurement.time), desc(measurement.createdAt), desc(measurement.id)];
const owned = (userId: string) => and(eq(measurement.userId, userId), isNull(measurement.deletedAt));

export class MeasurementConflict extends Error {}

function dto(row: Row): Measurement {
  return {
    id: row.id, kind: row.kind, date: row.date, time: row.time, timeZone: row.timeZone,
    value: row.value, systolic: row.systolic, diastolic: row.diastolic, period: row.period, note: row.note,
    version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

function fields(input: MeasurementInput) {
  return {
    kind: input.kind, date: input.date, time: input.time, note: input.note,
    value: input.kind === "bloodPressure" ? null : input.value,
    systolic: input.kind === "bloodPressure" ? input.systolic : null,
    diastolic: input.kind === "bloodPressure" ? input.diastolic : null,
    period: input.kind === "bloodPressure" ? input.period : null,
  };
}

function matches(row: Row, input: MeasurementInput) {
  return Object.entries(fields(input)).every(([key, value]) => row[key as keyof ReturnType<typeof fields>] === value);
}

export async function getLatestMeasurement(userId: string, kind: MeasurementKind) {
  const [row] = await db.select().from(measurement).where(and(owned(userId), eq(measurement.kind, kind))).orderBy(...order).limit(1);
  return row ? dto(row) : null;
}

export async function getMeasurement(userId: string, id: string) {
  const [row] = await db.select().from(measurement).where(and(owned(userId), eq(measurement.id, id)));
  return row ? dto(row) : null;
}

export async function getMeasurementDashboard(userId: string, range: MeasurementRange): Promise<MeasurementDashboard> {
  const today = todayStr();
  const from = range === "all" ? undefined : shiftDate(today, -(Number(range) - 1));
  const recentOf = async (kind: MeasurementKind) => {
    const rows = await db.select().from(measurement).where(and(owned(userId), eq(measurement.kind, kind))).orderBy(...order).limit(2);
    if (kind !== "bloodPressure" || rows.length === 0) return rows;
    // 血压与上一次同时段比较，晨夜生理差异不混入变化值。
    const latest = rows[0];
    const samePeriod = latest.period ? eq(measurement.period, latest.period) : isNull(measurement.period);
    const [previous] = await db.select().from(measurement).where(and(owned(userId), eq(measurement.kind, kind), samePeriod, ne(measurement.id, latest.id))).orderBy(...order).limit(1);
    return previous ? [latest, previous] : [latest];
  };
  const [entries, profile, recent] = await Promise.all([
    db.select().from(measurement).where(and(owned(userId), from ? gte(measurement.date, from) : undefined)).orderBy(...order),
    db.select().from(userProfile).where(eq(userProfile.userId, userId)).limit(1),
    Promise.all(MEASUREMENT_KINDS.map(recentOf)),
  ]);
  const latest = { weight: null, bodyFat: null, bloodPressure: null } as MeasurementDashboard["latest"];
  const previous = { ...latest };
  MEASUREMENT_KINDS.forEach((kind, index) => {
    latest[kind] = recent[index][0] ? dto(recent[index][0]) : null;
    previous[kind] = recent[index][1] ? dto(recent[index][1]) : null;
  });
  return { range, entries: entries.map(dto), latest, previous, today, targetWeightKg: profile[0]?.targetWeightKg ?? null, legacyWeightKg: profile[0]?.weightKg ?? null, timeZone: process.env.APP_TIMEZONE ?? "Asia/Shanghai" };
}

export async function createMeasurement(userId: string, requestId: string, input: MeasurementInput) {
  const id = randomUUID();
  const values = fields(input);
  return db.transaction(async tx => {
    await tx.insert(measurement).values({ id, userId, requestId, ...values, timeZone: process.env.APP_TIMEZONE ?? "Asia/Shanghai" })
      .onDuplicateKeyUpdate({ set: { id: sql`${measurement.id}` } });
    const [row] = await tx.select().from(measurement).where(and(eq(measurement.userId, userId), eq(measurement.requestId, requestId))).for("update");
    if (row.deletedAt) throw new MeasurementConflict("这次记录已删除，请重新开始录入。");
    if (!matches(row, input)) {
      throw new MeasurementConflict("本次提交标识已用于其他内容，请重新开始录入。");
    }
    return { entry: dto(row), created: row.id === id };
  });
}

export async function updateMeasurement(userId: string, id: string, version: number, input: MeasurementInput) {
  return db.transaction(async tx => {
    const [row] = await tx.select().from(measurement).where(and(owned(userId), eq(measurement.id, id))).for("update");
    if (!row) return null;
    // 原请求已成功而响应丢失时，相同内容的紧接一次重试直接返回结果。
    if (row.version === version + 1 && matches(row, input)) return dto(row);
    if (row.version !== version) throw new MeasurementConflict("这条记录已被修改，请刷新后核对最新内容。");
    if (row.kind !== input.kind) throw new MeasurementConflict("修改时不能更换指标类型，请新增另一项指标。");
    await tx.update(measurement).set({ ...fields(input), version: version + 1, updatedAt: new Date() }).where(and(owned(userId), eq(measurement.id, id)));
    const [updated] = await tx.select().from(measurement).where(and(owned(userId), eq(measurement.id, id)));
    return dto(updated);
  });
}

export async function deleteMeasurement(userId: string, id: string, version: number) {
  return db.transaction(async tx => {
    const [row] = await tx.select().from(measurement).where(and(eq(measurement.userId, userId), eq(measurement.id, id))).for("update");
    if (!row) return false;
    if (row.deletedAt) {
      if (row.version === version + 1) return true;
      return false;
    }
    if (row.version !== version) throw new MeasurementConflict("这条记录已被修改，请刷新后再删除。");
    await tx.update(measurement).set({ deletedAt: new Date(), updatedAt: new Date(), version: version + 1 }).where(and(owned(userId), eq(measurement.id, id)));
    return true;
  });
}
