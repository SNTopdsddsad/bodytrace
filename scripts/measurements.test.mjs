import assert from "node:assert/strict";
import test from "node:test";
import { measurementSchemas, measurementChart, bloodPressureChart, measurementChange, isMeasurementDate } from "../src/lib/measurements.ts";

const schemas = measurementSchemas("2026-10-13");
const base = { date: "2026-10-12", time: "08:15", note: " 晨起测量 " };
const entry = (id, date, value, kind = "weight") => ({ id, kind, date, value, time: "08:15", timeZone: "Asia/Shanghai", systolic: null, diastolic: null, period: null, note: null, version: 1, createdAt: "2026-10-13T00:00:00Z", updatedAt: "2026-10-13T00:00:00Z" });
const pressure = (id, date, period, systolic, diastolic, time) => ({ ...entry(id, date, null, "bloodPressure"), period, systolic, diastolic, time });

test("三类指标有明确字段，十进制字符串保留精度", () => {
  const weight = schemas.payload.parse({ ...base, kind: "weight", value: "65.5" });
  assert.equal(weight.value, "65.50");
  assert.equal(weight.note, "晨起测量");
  assert.equal(schemas.payload.parse({ date: base.date, kind: "bodyFat", value: "20" }).time, null);
  assert.equal(schemas.payload.parse({ ...base, kind: "bloodPressure", period: "morning", systolic: 120, diastolic: 80 }).diastolic, 80);
});

test("日期检查覆盖真实日历、闰年和未来日期", () => {
  assert.equal(isMeasurementDate("2024-02-29"), true);
  for (const date of ["2026-02-29", "2026-02-30", "2026-04-31", "2026-13-01", "2026-1-01"]) assert.equal(isMeasurementDate(date), false);
  assert.equal(schemas.payload.safeParse({ ...base, date: "2026-10-14", kind: "weight", value: "65" }).success, false);
  assert.equal(schemas.payload.safeParse({ ...base, time: "24:00", kind: "weight", value: "65" }).success, false);
});

test("拒绝空值、越界值、精度丢失和不完整血压", () => {
  for (const value of ["0", "-1", "500.01", "65.123", "NaN", ""]) assert.equal(schemas.payload.safeParse({ ...base, kind: "weight", value }).success, false);
  assert.equal(schemas.payload.safeParse({ ...base, kind: "bodyFat", value: "100.01" }).success, false);
  assert.equal(schemas.payload.safeParse({ ...base, kind: "bloodPressure", period: "morning", systolic: 120 }).success, false);
  assert.equal(schemas.payload.safeParse({ ...base, kind: "bloodPressure", period: "morning", systolic: 80, diastolic: 90 }).success, false);
});

test("血压必须选择晨间或夜间，时段只属于血压", () => {
  assert.equal(schemas.payload.safeParse({ ...base, kind: "bloodPressure", systolic: 120, diastolic: 80 }).success, false);
  assert.equal(schemas.payload.safeParse({ ...base, kind: "bloodPressure", period: "noon", systolic: 120, diastolic: 80 }).success, false);
  assert.equal(schemas.payload.safeParse({ ...base, kind: "weight", value: "65", period: "morning" }).success, false);
});

test("提交必须有幂等编号，客户端不能指定所有者或混用指标字段", () => {
  const measurement = { ...base, kind: "weight", value: "65" };
  assert.equal(schemas.create.safeParse({ measurement }).success, false);
  assert.equal(schemas.create.safeParse({ requestId: "00000000-0000-4000-8000-000000000001", measurement, userId: "other" }).success, false);
  assert.equal(schemas.payload.safeParse({ ...measurement, systolic: 120 }).success, false);
});

test("每日图表保留最近一条，同日其他记录和其他指标不会混入", () => {
  const points = measurementChart([entry("late", "2026-10-12", "65.20"), entry("early", "2026-10-12", "66.00"), entry("fat", "2026-10-12", "20.50", "bodyFat")], "weight");
  assert.deepEqual(points, [{ date: "2026-10-12", value: 65.2, systolic: null, diastolic: null }]);
});

test("缺失日用 null 断开；长时间缺口不会生成大量假记录", () => {
  const points = measurementChart([entry("new", "2026-10-12", "65.20"), entry("old", "2026-01-01", "70.00")], "weight");
  assert.equal(points.length, 3);
  assert.equal(points[1].value, null);
  assert.equal(points[1].date, "2026-01-02");
  assert.equal(points.some(point => point.value === 0), false);
  assert.deepEqual(measurementChart([], "weight"), []);
});

test("比较按指标分别计算，体脂变化用百分点", () => {
  assert.equal(measurementChange(entry("new", base.date, "65.20"), entry("old", base.date, "65.50")), "-0.3 kg");
  assert.equal(measurementChange(entry("new", base.date, "21.00", "bodyFat"), entry("old", base.date, "20.00", "bodyFat")), "+1 个百分点");
  assert.equal(measurementChange(entry("new", base.date, "65.20"), null), null);
  assert.equal(measurementChange(pressure("new", base.date, "morning", 122, 78, "08:00"), pressure("old", base.date, "morning", 120, 80, "08:00")), "+2 / -2 mmHg");
});

test("血压趋势按晨间/夜间分别取每日最近一条，未标记不进趋势", () => {
  // 输入按服务端倒序：同日同时段保留时间最晚的，未标记记录被忽略，缺口日补 null 断开。
  const points = bloodPressureChart([
    pressure("unmarked", "2026-10-12", null, 130, 85, "09:00"),
    pressure("am-late", "2026-10-12", "morning", 121, 79, "08:00"),
    pressure("am-early", "2026-10-12", "morning", 122, 80, "07:00"),
    pressure("pm-old", "2026-10-10", "evening", 118, 76, null),
  ]);
  assert.deepEqual(points, [
    { date: "2026-10-10", morningSystolic: null, morningDiastolic: null, eveningSystolic: 118, eveningDiastolic: 76 },
    { date: "2026-10-11", morningSystolic: null, morningDiastolic: null, eveningSystolic: null, eveningDiastolic: null },
    { date: "2026-10-12", morningSystolic: 121, morningDiastolic: 79, eveningSystolic: null, eveningDiastolic: null },
  ]);
  assert.deepEqual(bloodPressureChart([pressure("only", "2026-10-12", null, 120, 80, null)]), []);
});
