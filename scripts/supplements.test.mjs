import { require as requireTs } from "tsx/cjs/api";
import assert from "node:assert/strict";
import test from "node:test";

const {
  buildSupplementHabitMatrix,
  formatSupplementDose,
  formatWeekdaysLabel,
  isSupplementPlannedOnDate,
  summarizeSupplementDays,
  supplementCreateSchema,
  supplementIntakeSchemas,
  supplementPatchSchema,
  weekdayOfDate,
} = requireTs("../src/lib/supplements.ts", import.meta.url);

const intakeSchemas = supplementIntakeSchemas("2026-11-24");

test("份数下限在入库前验证，最小有效份数为 0.01", () => {
  const base = { name: "合成补剂", unit: "粒", mode: "scheduled", schedule: [{ slot: "lunch", quantity: 1 }] };
  assert.equal(supplementCreateSchema.safeParse({ ...base, defaultQuantity: 1e-10 }).success, false);
  assert.equal(supplementCreateSchema.parse({ ...base, defaultQuantity: 0.01 }).defaultQuantity, 0.01);
  assert.equal(intakeSchemas.adhocIntake.safeParse({ date: "2026-11-24", name: "合成补剂", unit: "粒", quantity: 1e-10 }).success, false);
});

test("补剂计量展示兼容仅数量、单一规格和复方规格", () => {
  assert.equal(formatSupplementDose(1, "片", null), "1 片");
  assert.equal(formatSupplementDose(2, "粒", "1000mg"), "2 粒 × 1000mg");
  assert.equal(formatSupplementDose(0.5, "勺", "5g"), "0.5 勺 × 5g");
  assert.equal(
    formatSupplementDose(1, "粒", "D3 2000IU + K2 100mcg"),
    "1 粒 · D3 2000IU + K2 100mcg",
  );
});

test("补剂库校验支持多时段、不同时段不同份数并规范化排序", () => {
  const created = supplementCreateSchema.parse({
    name: " 甘氨酸镁 ",
    defaultQuantity: 1,
    unit: " 粒 ",
    spec: "  ",
    mode: "scheduled",
    schedule: [
      { slot: "bedtime", quantity: 2 },
      { slot: "breakfast", quantity: 1 },
    ],
    weekdays: [4, 0, 2, 0],
    note: "  睡前助眠 ",
  });
  assert.equal(created.name, "甘氨酸镁");
  assert.equal(created.unit, "粒");
  assert.equal(created.spec, null);
  assert.equal(created.note, "睡前助眠");
  assert.deepEqual(created.schedule, [
    { slot: "breakfast", quantity: 1 },
    { slot: "bedtime", quantity: 2 },
  ]);
  assert.deepEqual(created.weekdays, [0, 2, 4]);
  assert.equal(formatWeekdaysLabel(created.weekdays), "每周一·三·五");

  // 7 天全选归一为每天（null）
  const everyDay = supplementCreateSchema.parse({
    name: "鱼油",
    defaultQuantity: 2,
    unit: "粒",
    mode: "scheduled",
    schedule: [{ slot: "breakfast", quantity: 2 }],
    weekdays: [0, 1, 2, 3, 4, 5, 6],
  });
  assert.equal(everyDay.weekdays, null);
  assert.equal(formatWeekdaysLabel(everyDay.weekdays), "每天");
});

test("拒绝重复时段、无时段常规计划、按需带时段或越界数量", () => {
  assert.equal(
    supplementCreateSchema.safeParse({
      name: "重复时段",
      defaultQuantity: 1,
      unit: "粒",
      mode: "scheduled",
      schedule: [
        { slot: "breakfast", quantity: 1 },
        { slot: "breakfast", quantity: 2 },
      ],
    }).success,
    false,
  );
  assert.equal(
    supplementCreateSchema.safeParse({
      name: "无时段",
      defaultQuantity: 1,
      unit: "粒",
      mode: "scheduled",
      schedule: [],
    }).success,
    false,
  );
  assert.equal(
    supplementCreateSchema.safeParse({
      name: "按需带时段",
      defaultQuantity: 1,
      unit: "粒",
      mode: "asNeeded",
      schedule: [{ slot: "bedtime", quantity: 1 }],
    }).success,
    false,
  );
  assert.equal(
    supplementCreateSchema.safeParse({
      name: "超精度",
      defaultQuantity: 1.123,
      unit: "粒",
      mode: "asNeeded",
      schedule: [],
    }).success,
    false,
  );
  assert.equal(supplementPatchSchema.safeParse({}).success, false);
});

test("服用记录校验拒绝未来日期、非法日历、非法时间和多余字段", () => {
  const reqId = "00000000-0000-4000-8000-000000000001";
  const supId = "00000000-0000-4000-8000-000000000002";

  assert.equal(
    intakeSchemas.createItem.safeParse({
      requestId: reqId,
      intake: { supplementId: supId, date: "2026-11-25", slot: "breakfast" },
    }).success,
    false,
  );
  assert.equal(
    intakeSchemas.createItem.safeParse({
      requestId: reqId,
      intake: { supplementId: supId, date: "2026-02-30", slot: "breakfast" },
    }).success,
    false,
  );
  assert.equal(
    intakeSchemas.createItem.safeParse({
      requestId: reqId,
      intake: { supplementId: supId, date: "2026-11-24", slot: "breakfast", takenTime: "24:00" },
    }).success,
    false,
  );
  assert.equal(
    intakeSchemas.createItem.safeParse({
      requestId: reqId,
      userId: "evil",
      intake: { supplementId: supId, date: "2026-11-24", slot: "breakfast" },
    }).success,
    false,
  );
  // 批量中禁止重复 requestId
  assert.equal(
    intakeSchemas.batchCreate.safeParse({
      items: [
        { requestId: reqId, intake: { supplementId: supId, date: "2026-11-24", slot: "breakfast" } },
        { requestId: reqId, intake: { supplementId: supId, date: "2026-11-24", slot: "bedtime" } },
      ],
    }).success,
    false,
  );
});

test("按星期映射与跨月跨年日期一致", () => {
  // 2026-11-23 是周一（0），2026-11-24 是周二（1），2026-11-29 是周日（6）
  assert.equal(weekdayOfDate("2026-11-23"), 0);
  assert.equal(weekdayOfDate("2026-11-24"), 1);
  assert.equal(weekdayOfDate("2026-11-29"), 6);
  const monWedFri = {
    startDate: "2026-11-23",
    mode: "scheduled",
    status: "active",
    schedule: [{ slot: "breakfast", quantity: 1 }],
    weekdays: [0, 2, 4],
  };
  assert.equal(isSupplementPlannedOnDate(monWedFri, "2026-11-23"), true);
  assert.equal(isSupplementPlannedOnDate(monWedFri, "2026-11-24"), false);
  assert.equal(isSupplementPlannedOnDate({ ...monWedFri, status: "paused" }, "2026-11-23"), false);
});

test("14 天规律点阵准确区分全服、部分、未记、非计划日与建档前日期", () => {
  const mag = {
    id: "sup-mag",
    name: "甘氨酸镁",
    defaultQuantity: 1,
    unit: "粒",
    spec: "200mg",
    mode: "scheduled",
    status: "active",
    schedule: [
      { slot: "breakfast", quantity: 1 },
      { slot: "bedtime", quantity: 2 },
    ],
    weekdays: null,
    note: null,
    startDate: "2026-11-21",
    sortOrder: 0,
    createdAt: "2026-11-21T00:00:00Z",
    updatedAt: "2026-11-21T00:00:00Z",
  };
  const vd = {
    id: "sup-vd",
    name: "D3+K2",
    defaultQuantity: 1,
    unit: "粒",
    spec: null,
    mode: "scheduled",
    status: "active",
    schedule: [{ slot: "breakfast", quantity: 1 }],
    weekdays: [0, 2, 4], // 一三五
    note: null,
    startDate: "2026-11-20",
    sortOrder: 1,
    createdAt: "2026-11-20T00:00:00Z",
    updatedAt: "2026-11-20T00:00:00Z",
  };
  const mkIntake = (id, supplementId, date, slot) => ({
    id,
    supplementId,
    date,
    slot,
    takenTime: "08:00",
    timeZone: "Asia/Shanghai",
    name: "test",
    quantity: 1,
    unit: "粒",
    spec: null,
    note: null,
    isAdhoc: false,
    version: 1,
    createdAt: "2026-11-24T00:00:00Z",
    updatedAt: "2026-11-24T00:00:00Z",
  });

  const intakes = [
    // 建档前的补记只算额外服用。
    mkIntake("1", "sup-mag", "2026-11-20", "breakfast"),
    // 11-21：镁只吃早餐 -> partial
    mkIntake("2", "sup-mag", "2026-11-21", "breakfast"),
    // 11-22：镁全服 -> full
    mkIntake("3", "sup-mag", "2026-11-22", "breakfast"),
    mkIntake("4", "sup-mag", "2026-11-22", "bedtime"),
    // 11-23：镁未记 -> missed；VD（周一计划日）已服 -> full
    mkIntake("5", "sup-vd", "2026-11-23", "breakfast"),
    // 11-24（周二非 VD 计划日）：额外吃了一次 VD -> extra
    mkIntake("6", "sup-vd", "2026-11-24", "breakfast"),
  ];

  const matrix = buildSupplementHabitMatrix([mag, vd], intakes, "2026-11-24", 14);
  assert.equal(matrix.dates.length, 14);
  assert.equal(matrix.dates[0], "2026-11-11");
  assert.equal(matrix.dates[13], "2026-11-24");

  const magRow = matrix.rows[0];
  const cellOf = (row, date) => row.cells.find((c) => c.date === date);

  assert.equal(cellOf(magRow, "2026-11-19").status, "beforeStart");
  assert.equal(cellOf(magRow, "2026-11-20").status, "extra");
  assert.equal(cellOf(magRow, "2026-11-21").status, "partial");
  assert.equal(cellOf(magRow, "2026-11-22").status, "full");
  assert.equal(cellOf(magRow, "2026-11-23").status, "missed");
  assert.equal(magRow.plannedDays, 4); // 11-21..11-24
  assert.equal(magRow.fullDays, 1);

  const repeatBreakfast = [...intakes, mkIntake("extra", "sup-mag", "2026-11-21", "breakfast")];
  const repeated = buildSupplementHabitMatrix([mag], repeatBreakfast, "2026-11-24", 14);
  assert.deepEqual(cellOf(repeated.rows[0], "2026-11-21"), {
    date: "2026-11-21", status: "partial", planned: 2, completed: 1, taken: 2,
  });
  assert.equal(isSupplementPlannedOnDate(mag, "2026-11-20"), false);

  const vdRow = matrix.rows[1];
  assert.equal(cellOf(vdRow, "2026-11-20").status, "missed"); // 周五计划日未服
  assert.equal(cellOf(vdRow, "2026-11-21").status, "offDay"); // 周六非计划日
  assert.equal(cellOf(vdRow, "2026-11-23").status, "full"); // 周一计划日已服
  assert.equal(cellOf(vdRow, "2026-11-24").status, "extra"); // 周二非计划日额外服

  const recent = summarizeSupplementDays([mag, vd], intakes, ["2026-11-22", "2026-11-23", "2026-11-24"]);
  assert.deepEqual(recent, [
    { date: "2026-11-22", planned: 2, completed: 2, taken: 2 },
    { date: "2026-11-23", planned: 3, completed: 1, taken: 1 },
    { date: "2026-11-24", planned: 2, completed: 0, taken: 1 },
  ]);
});
