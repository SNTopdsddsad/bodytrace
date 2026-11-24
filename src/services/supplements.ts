import { createHash, randomUUID } from "node:crypto";
import { and, asc, eq, gte, isNull, lte } from "drizzle-orm";
import { db } from "@/db";
import { supplement, supplementCreateRequest, supplementIntake, user } from "@/db/schema";
import type { SupplementIntakeRow, SupplementRow } from "@/db/schema";
import { shiftDate, todayStr } from "@/lib/date";
import {
  normalizeSchedule,
  normalizeWeekdays,
  roundQty,
  summarizeSupplementDays,
  validateMergedSupplement,
  type Supplement,
  type SupplementCreateInput,
  type SupplementDashboard,
  type SupplementIntake,
  type SupplementIntakeCreatePayload,
  type SupplementIntakeUpdatePayload,
  type SupplementPatchInput,
  type SupplementRecentDay,
} from "@/lib/supplements";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

// 与清空记录使用相同的锁顺序；锁定已存在的用户行，避免并发首次请求争用索引间隙。
async function lockSupplementOwner(tx: Tx, userId: string) {
  await tx.select({ id: user.id }).from(user).where(eq(user.id, userId)).for("update");
}

export class SupplementConflict extends Error {}
export class SupplementNotFound extends Error {}
export class SupplementValidationError extends Error {}

const ownedIntake = (userId: string) =>
  and(eq(supplementIntake.userId, userId), isNull(supplementIntake.deletedAt));

function supplementDto(row: SupplementRow): Supplement {
  return {
    id: row.id,
    name: row.name,
    defaultQuantity: roundQty(Number(row.defaultQuantity)),
    unit: row.unit,
    spec: row.spec ?? null,
    mode: row.mode,
    status: row.status,
    schedule: normalizeSchedule(Array.isArray(row.schedule) ? row.schedule : []),
    weekdays: normalizeWeekdays(Array.isArray(row.weekdays) ? row.weekdays : null),
    note: row.note ?? null,
    startDate: row.startDate,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function intakeDto(row: SupplementIntakeRow): SupplementIntake {
  return {
    id: row.id,
    supplementId: row.supplementId ?? null,
    date: row.date,
    slot: row.slot,
    takenTime: row.takenTime ?? null,
    timeZone: row.timeZone,
    name: row.name,
    quantity: roundQty(Number(row.quantity)),
    unit: row.unit,
    spec: row.spec ?? null,
    note: row.note ?? null,
    isAdhoc: row.isAdhoc,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function isFromLibrary(
  input: SupplementIntakeCreatePayload,
): input is Extract<SupplementIntakeCreatePayload, { supplementId: string }> {
  return typeof input.supplementId === "string";
}

function matchesCreateInput(row: SupplementIntakeRow, input: SupplementIntakeCreatePayload): boolean {
  if (
    row.date !== input.date ||
    row.slot !== input.slot ||
    (row.takenTime ?? null) !== (input.takenTime ?? null) ||
    (row.note ?? null) !== (input.note ?? null)
  ) {
    return false;
  }
  if (isFromLibrary(input)) {
    if (row.isAdhoc || row.supplementId !== input.supplementId) return false;
    if (input.quantity !== undefined && roundQty(Number(row.quantity)) !== roundQty(input.quantity)) {
      return false;
    }
    return true;
  }
  return (
    row.isAdhoc &&
    row.supplementId === null &&
    row.name === input.name &&
    roundQty(Number(row.quantity)) === roundQty(input.quantity) &&
    row.unit === input.unit &&
    (row.spec ?? null) === (input.spec ?? null)
  );
}

function matchesUpdateInput(row: SupplementIntakeRow, input: SupplementIntakeUpdatePayload): boolean {
  return (
    row.date === input.date &&
    row.slot === input.slot &&
    roundQty(Number(row.quantity)) === roundQty(input.quantity) &&
    (row.takenTime ?? null) === (input.takenTime ?? null) &&
    (row.note ?? null) === (input.note ?? null)
  );
}

export async function listSupplements(userId: string): Promise<Supplement[]> {
  const rows = await db
    .select()
    .from(supplement)
    .where(eq(supplement.userId, userId))
    .orderBy(asc(supplement.status), asc(supplement.sortOrder), asc(supplement.createdAt), asc(supplement.id));
  return rows.map(supplementDto);
}

export async function createSupplement(
  userId: string,
  input: SupplementCreateInput,
): Promise<{ supplement: Supplement; created: boolean }> {
  const { requestId, ...values } = input;
  const payloadHash = createHash("sha256").update(JSON.stringify(values)).digest("hex");
  const id = randomUUID();
  const startDate = todayStr();
  return db.transaction(async (tx) => {
    if (requestId) {
      await lockSupplementOwner(tx, userId);
      const [prior] = await tx.select().from(supplementCreateRequest).where(and(
        eq(supplementCreateRequest.userId, userId), eq(supplementCreateRequest.requestId, requestId),
      ));
      if (prior) {
        if (prior.payloadHash !== payloadHash) throw new SupplementConflict("本次提交编号已用于其他内容");
        if (!prior.supplementId) throw new SupplementConflict("这项补剂已删除");
        const [row] = await tx.select().from(supplement).where(and(eq(supplement.userId, userId), eq(supplement.id, prior.supplementId)));
        return { supplement: supplementDto(row), created: false };
      }
    }
    await tx.insert(supplement).values({
      id,
      userId,
      name: input.name,
      defaultQuantity: input.defaultQuantity.toFixed(2),
      unit: input.unit,
      spec: input.spec,
      mode: input.mode,
      status: input.status,
      schedule: input.schedule,
      weekdays: input.weekdays,
      note: input.note,
      startDate,
      sortOrder: 0,
    });
    if (requestId) {
      await tx.insert(supplementCreateRequest).values({ userId, requestId, payloadHash, supplementId: id });
    }
    const [row] = await tx
      .select()
      .from(supplement)
      .where(and(eq(supplement.id, id), eq(supplement.userId, userId)));
    return { supplement: supplementDto(row), created: true };
  });
}

export async function updateSupplement(
  userId: string,
  id: string,
  patch: SupplementPatchInput,
): Promise<Supplement | null> {
  return db.transaction(async (tx) => {
    const [existing] = await tx
      .select()
      .from(supplement)
      .where(and(eq(supplement.id, id), eq(supplement.userId, userId)))
      .for("update");
    if (!existing) return null;

    const current = supplementDto(existing);
    const nextMode = patch.mode ?? current.mode;
    const nextSchedule = patch.schedule ?? current.schedule;
    const nextWeekdays = patch.weekdays !== undefined ? patch.weekdays : current.weekdays;

    const validated = validateMergedSupplement({
      mode: nextMode,
      schedule: nextSchedule,
      weekdays: nextWeekdays,
    });
    if (!validated.ok) {
      throw new SupplementValidationError(validated.message);
    }

    const nextDefaultQuantity =
      patch.defaultQuantity !== undefined ? patch.defaultQuantity : current.defaultQuantity;

    await tx
      .update(supplement)
      .set({
        name: patch.name ?? current.name,
        defaultQuantity: nextDefaultQuantity.toFixed(2),
        unit: patch.unit ?? current.unit,
        spec: patch.spec !== undefined ? patch.spec : current.spec,
        mode: nextMode,
        status: patch.status ?? current.status,
        schedule: validated.schedule,
        weekdays: validated.weekdays,
        note: patch.note !== undefined ? patch.note : current.note,
        updatedAt: new Date(),
      })
      .where(and(eq(supplement.id, id), eq(supplement.userId, userId)));

    const [updated] = await tx
      .select()
      .from(supplement)
      .where(and(eq(supplement.id, id), eq(supplement.userId, userId)));
    return supplementDto(updated);
  });
}

export async function deleteSupplement(userId: string, id: string): Promise<boolean> {
  const [result] = await db
    .delete(supplement)
    .where(and(eq(supplement.id, id), eq(supplement.userId, userId)));
  return result.affectedRows > 0;
}

async function insertIntakeInTx(
  tx: Tx,
  userId: string,
  requestId: string,
  input: SupplementIntakeCreatePayload,
): Promise<{ entry: SupplementIntake; created: boolean }> {
  const [existing] = await tx
    .select()
    .from(supplementIntake)
    .where(and(eq(supplementIntake.userId, userId), eq(supplementIntake.requestId, requestId)));

  if (existing) {
    if (existing.deletedAt) {
      throw new SupplementConflict("这次记录已删除，请重新记录。");
    }
    if (!matchesCreateInput(existing, input)) {
      throw new SupplementConflict("本次提交标识已用于其他内容，请重新操作。");
    }
    return { entry: intakeDto(existing), created: false };
  }

  let snapshotName: string;
  let snapshotUnit: string;
  let snapshotSpec: string | null;
  let snapshotQuantity: number;
  let supplementId: string | null = null;
  let isAdhoc = false;

  if (isFromLibrary(input)) {
    const [supRow] = await tx
      .select()
      .from(supplement)
      .where(and(eq(supplement.id, input.supplementId), eq(supplement.userId, userId)))
      .for("share");
    if (!supRow) {
      throw new SupplementNotFound("补剂不存在");
    }
    const sup = supplementDto(supRow);
    const slotMatch = sup.schedule.find((item) => item.slot === input.slot);
    supplementId = sup.id;
    snapshotName = sup.name;
    snapshotUnit = sup.unit;
    snapshotSpec = sup.spec;
    snapshotQuantity = input.quantity ?? slotMatch?.quantity ?? sup.defaultQuantity;
  } else {
    isAdhoc = true;
    snapshotName = input.name;
    snapshotUnit = input.unit;
    snapshotSpec = input.spec;
    snapshotQuantity = input.quantity;
  }

  const id = randomUUID();
  const timeZone = process.env.APP_TIMEZONE ?? "Asia/Shanghai";

  await tx
    .insert(supplementIntake)
    .values({
      id,
      userId,
      supplementId,
      date: input.date,
      slot: input.slot,
      takenTime: input.takenTime,
      timeZone,
      name: snapshotName,
      quantity: snapshotQuantity.toFixed(2),
      unit: snapshotUnit,
      spec: snapshotSpec,
      note: input.note,
      isAdhoc,
      requestId,
    });

  const [row] = await tx
    .select()
    .from(supplementIntake)
    .where(and(eq(supplementIntake.userId, userId), eq(supplementIntake.id, id)));

  return { entry: intakeDto(row), created: true };
}

export async function createSupplementIntake(
  userId: string,
  requestId: string,
  input: SupplementIntakeCreatePayload,
): Promise<{ entry: SupplementIntake; created: boolean }> {
  return db.transaction(async tx => {
    await lockSupplementOwner(tx, userId);
    return insertIntakeInTx(tx, userId, requestId, input);
  });
}

export async function createSupplementIntakesBatch(
  userId: string,
  items: Array<{ requestId: string; intake: SupplementIntakeCreatePayload }>,
): Promise<{ entries: SupplementIntake[]; created: boolean }> {
  return db.transaction(async (tx) => {
    await lockSupplementOwner(tx, userId);
    const entries: SupplementIntake[] = [];
    let created = false;
    for (const item of items) {
      const result = await insertIntakeInTx(tx, userId, item.requestId, item.intake);
      entries.push(result.entry);
      if (result.created) created = true;
    }
    return { entries, created };
  });
}

export async function updateSupplementIntake(
  userId: string,
  id: string,
  version: number,
  input: SupplementIntakeUpdatePayload,
): Promise<SupplementIntake | null> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(supplementIntake)
      .where(and(ownedIntake(userId), eq(supplementIntake.id, id)))
      .for("update");
    if (!row) return null;

    if (row.version === version + 1 && matchesUpdateInput(row, input)) {
      return intakeDto(row);
    }
    if (row.version !== version) {
      throw new SupplementConflict("这条记录已被修改，请刷新后核对最新内容。");
    }

    await tx
      .update(supplementIntake)
      .set({
        date: input.date,
        slot: input.slot,
        quantity: input.quantity.toFixed(2),
        takenTime: input.takenTime,
        note: input.note,
        version: version + 1,
        updatedAt: new Date(),
      })
      .where(and(ownedIntake(userId), eq(supplementIntake.id, id)));

    const [updated] = await tx
      .select()
      .from(supplementIntake)
      .where(and(ownedIntake(userId), eq(supplementIntake.id, id)));
    return intakeDto(updated);
  });
}

export async function deleteSupplementIntake(
  userId: string,
  id: string,
  version: number,
): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .select()
      .from(supplementIntake)
      .where(and(eq(supplementIntake.userId, userId), eq(supplementIntake.id, id)))
      .for("update");
    if (!row) return false;

    if (row.deletedAt) {
      if (row.version === version + 1) return true;
      return false;
    }
    if (row.version !== version) {
      throw new SupplementConflict("这条记录已被修改，请刷新后再删除。");
    }

    await tx
      .update(supplementIntake)
      .set({
        deletedAt: new Date(),
        updatedAt: new Date(),
        version: version + 1,
      })
      .where(and(eq(supplementIntake.userId, userId), eq(supplementIntake.id, id)));
    return true;
  });
}

export async function getSupplementDashboard(
  userId: string,
  date: string,
): Promise<SupplementDashboard> {
  const today = todayStr();
  const timeZone = process.env.APP_TIMEZONE ?? "Asia/Shanghai";
  const windowStart = shiftDate(today, -29);
  const inWindow = date >= windowStart && date <= today;

  const [supplements, windowRows, extraDayRows] = await Promise.all([
    listSupplements(userId),
    db
      .select()
      .from(supplementIntake)
      .where(
        and(
          ownedIntake(userId),
          gte(supplementIntake.date, windowStart),
          lte(supplementIntake.date, today),
        ),
      )
      .orderBy(asc(supplementIntake.date), asc(supplementIntake.createdAt), asc(supplementIntake.id)),
    inWindow
      ? Promise.resolve<SupplementIntakeRow[] | null>(null)
      : db
          .select()
          .from(supplementIntake)
          .where(and(ownedIntake(userId), eq(supplementIntake.date, date)))
          .orderBy(asc(supplementIntake.createdAt), asc(supplementIntake.id)),
  ]);

  const windowIntakes = windowRows.map(intakeDto);
  const intakes = inWindow
    ? windowIntakes.filter((item) => item.date === date)
    : (extraDayRows ?? []).map(intakeDto);

  const recentDateList = Array.from({ length: 15 }, (_, index) => shiftDate(today, -14 + index));
  const recentDays = summarizeSupplementDays(supplements, windowIntakes, recentDateList);

  return {
    date,
    today,
    timeZone,
    supplements,
    intakes,
    windowIntakes,
    recentDays,
  };
}

export type SupplementNavSummary = {
  todayPlanned: number;
  todayCompleted: number;
  todayTaken: number;
  recentDays: SupplementRecentDay[];
};

/** 供应用主布局与顶部周历使用的轻量补剂摘要（近 15 天含今天）。 */
export async function getSupplementNavSummary(
  userId: string,
  today: string,
): Promise<SupplementNavSummary> {
  const windowStart = shiftDate(today, -14);
  const [supRows, intakeRows] = await Promise.all([
    db
      .select()
      .from(supplement)
      .where(and(eq(supplement.userId, userId), eq(supplement.status, "active"))),
    db
      .select({
        supplementId: supplementIntake.supplementId,
        date: supplementIntake.date,
        slot: supplementIntake.slot,
      })
      .from(supplementIntake)
      .where(
        and(
          ownedIntake(userId),
          gte(supplementIntake.date, windowStart),
          lte(supplementIntake.date, today),
        ),
      ),
  ]);

  const supplements = supRows.map(supplementDto);
  const recentDateList = Array.from({ length: 15 }, (_, index) => shiftDate(today, -14 + index));
  const recentDays = summarizeSupplementDays(supplements, intakeRows, recentDateList);
  const todaySummary = recentDays[recentDays.length - 1] ?? {
    date: today,
    planned: 0,
    completed: 0,
    taken: 0,
  };

  return {
    todayPlanned: todaySummary.planned,
    todayCompleted: todaySummary.completed,
    todayTaken: todaySummary.taken,
    recentDays,
  };
}
