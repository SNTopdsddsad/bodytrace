import { randomUUID } from "node:crypto";
import { isDeepStrictEqual } from "node:util";
import { and, desc, eq, gte, isNull, not, sql } from "drizzle-orm";
import { db } from "@/db";
import { trainingRecord, user } from "@/db/schema";
import { shiftDate, todayStr } from "@/lib/date";
import type { TrainingFilter, TrainingInput, TrainingRange, TrainingRecord } from "@/lib/training";

type Row = typeof trainingRecord.$inferSelect;
type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
export type TrainingQuery = {
  range: TrainingRange;
  kind: TrainingFilter;
  status: "all" | "inProgress" | "completed";
};

export class TrainingConflict extends Error {}

const owned = (userId: string) => and(eq(trainingRecord.userId, userId), isNull(trainingRecord.deletedAt));
const order = [desc(trainingRecord.date), desc(trainingRecord.time), desc(trainingRecord.createdAt), desc(trainingRecord.id)];

function dto(row: Row): TrainingRecord {
  return {
    id: row.id, title: row.title, date: row.date, time: row.time, timeZone: row.timeZone,
    mode: row.mode, status: row.status, startedAt: row.startedAt?.toISOString() ?? null,
    durationMinutes: row.durationMinutes, note: row.note, items: row.items,
    version: row.version, createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

function fields(input: TrainingInput) {
  return {
    title: input.title, date: input.date, time: input.time, mode: input.mode, status: input.status,
    startedAt: input.startedAt ? new Date(input.startedAt) : null,
    durationMinutes: input.durationMinutes, note: input.note, items: input.items,
  };
}

function matches(row: Row, input: TrainingInput) {
  // MySQL JSON 会重排对象键；比较结构，保持项目和组的数组顺序。
  return isDeepStrictEqual(fields(dto(row)), fields(input));
}

async function lockOwner(tx: Transaction, userId: string) {
  const [owner] = await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
  return Boolean(owner);
}

export async function listTrainingRecords(userId: string, query: TrainingQuery): Promise<TrainingRecord[]> {
  const from = query.range === "all" ? undefined : shiftDate(todayStr(), -(Number(query.range) - 1));
  const hasStrength = sql`JSON_SEARCH(${trainingRecord.items}, 'one', 'strength', NULL, '$[*].kind') IS NOT NULL`;
  const hasCardio = sql`JSON_SEARCH(${trainingRecord.items}, 'one', 'cardio', NULL, '$[*].kind') IS NOT NULL`;
  const kindFilter = query.kind === "mixed" ? and(hasStrength, hasCardio)
    : query.kind === "strength" ? and(hasStrength, not(hasCardio))
    : query.kind === "cardio" ? and(hasCardio, not(hasStrength)) : undefined;
  const rows = await db.select().from(trainingRecord).where(and(
    owned(userId), from ? gte(trainingRecord.date, from) : undefined, kindFilter,
    query.status === "all" ? undefined : eq(trainingRecord.status, query.status),
  )).orderBy(...order);
  return rows.map(dto);
}

export async function getTrainingRecord(userId: string, id: string): Promise<TrainingRecord | null> {
  const [row] = await db.select().from(trainingRecord).where(and(owned(userId), eq(trainingRecord.id, id)));
  return row ? dto(row) : null;
}

export async function getTrainingByRequestId(userId: string, requestId: string): Promise<TrainingRecord | null> {
  const [row] = await db.select().from(trainingRecord)
    .where(and(eq(trainingRecord.userId, userId), eq(trainingRecord.requestId, requestId)));
  if (row?.deletedAt) throw new TrainingConflict("这次训练已删除，请重新开始录入。");
  return row ? dto(row) : null;
}

export async function createTrainingRecord(userId: string, requestId: string, input: TrainingInput) {
  return db.transaction(async tx => {
    // 与清空记录保持一致的锁顺序，防止清空过程中漏入整次训练。
    if (!await lockOwner(tx, userId)) throw new TrainingConflict("账号已不可用，请重新登录。");
    const [previous] = await tx.select().from(trainingRecord)
      .where(and(eq(trainingRecord.userId, userId), eq(trainingRecord.requestId, requestId))).for("update");
    if (previous) {
      if (previous.deletedAt) throw new TrainingConflict("这次训练已删除，请重新开始录入。");
      if (!matches(previous, input)) throw new TrainingConflict("本次提交标识已用于其他内容，请核对已保存的训练。");
      return { entry: dto(previous), created: false };
    }
    const id = randomUUID();
    await tx.insert(trainingRecord).values({
      id, userId, requestId, ...fields(input), timeZone: process.env.APP_TIMEZONE ?? "Asia/Shanghai",
    });
    const [row] = await tx.select().from(trainingRecord).where(and(owned(userId), eq(trainingRecord.id, id)));
    return { entry: dto(row), created: true };
  });
}

export async function updateTrainingRecord(userId: string, id: string, version: number, input: TrainingInput) {
  return db.transaction(async tx => {
    if (!await lockOwner(tx, userId)) return null;
    const [row] = await tx.select().from(trainingRecord).where(and(owned(userId), eq(trainingRecord.id, id))).for("update");
    if (!row) return null;
    // 同一版本更新成功而响应丢失时，紧接的相同重试直接回读结果。
    if (row.version === version + 1 && matches(row, input)) return dto(row);
    if (row.version !== version) throw new TrainingConflict("这次训练已被修改，请核对最新内容后再保存。");
    if (row.mode !== input.mode || row.startedAt?.getTime() !== fields(input).startedAt?.getTime()) {
      throw new TrainingConflict("不能修改训练的录入方式或计时起点；日期、时间和总时长可以更正。");
    }
    await tx.update(trainingRecord).set({ ...fields(input), version: version + 1, updatedAt: new Date() })
      .where(and(owned(userId), eq(trainingRecord.id, id)));
    const [updated] = await tx.select().from(trainingRecord).where(and(owned(userId), eq(trainingRecord.id, id)));
    return dto(updated);
  });
}

export async function deleteTrainingRecord(userId: string, id: string, version: number) {
  return db.transaction(async tx => {
    if (!await lockOwner(tx, userId)) return false;
    const [row] = await tx.select().from(trainingRecord)
      .where(and(eq(trainingRecord.userId, userId), eq(trainingRecord.id, id))).for("update");
    if (!row) return false;
    if (row.deletedAt) return row.version === version + 1;
    if (row.version !== version) throw new TrainingConflict("这次训练已被修改，请刷新后再删除。");
    const now = new Date();
    await tx.update(trainingRecord).set({ deletedAt: now, updatedAt: now, version: version + 1 })
      .where(and(owned(userId), eq(trainingRecord.id, id)));
    return true;
  });
}
