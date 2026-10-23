import assert from "node:assert/strict";
import test from "node:test";
import { isValidDateStr, shiftDate, todayStr } from "../src/lib/date.ts";

test("业务日期拒绝自动进位的日期，接受真实闰日与月末", () => {
  for (const date of ["2024-02-29", "2000-02-29", "2026-04-30", "2026-12-31"]) {
    assert.equal(isValidDateStr(date), true, date);
  }
  for (const date of ["2026-02-29", "2026-02-30", "1900-02-29", "2026-04-31", "2026-00-01", "2026-13-01", "2026-01-00", "2026-01-32", "2026-1-01", "2026-01-01T00:00:00Z", " 2026-01-01", ""]) {
    assert.equal(isValidDateStr(date), false, date);
  }
});

test("日期平移覆盖闰年、跨月与跨年", () => {
  assert.equal(shiftDate("2024-03-01", -1), "2024-02-29");
  assert.equal(shiftDate("2026-03-01", -1), "2026-02-28");
  assert.equal(shiftDate("2026-04-30", 1), "2026-05-01");
  assert.equal(shiftDate("2026-12-31", 1), "2027-01-01");
  assert.equal(shiftDate("2026-01-01", -1), "2025-12-31");
});

test("今天按应用时区在午夜切换，不受服务器本地时区影响", t => {
  const originalTimeZone = process.env.APP_TIMEZONE;
  t.after(() => {
    if (originalTimeZone === undefined) delete process.env.APP_TIMEZONE;
    else process.env.APP_TIMEZONE = originalTimeZone;
    t.mock.timers.reset();
  });
  t.mock.timers.enable({ apis: ["Date"], now: Date.parse("2026-12-31T15:59:59Z") });
  process.env.APP_TIMEZONE = "Asia/Shanghai";
  assert.equal(todayStr(), "2026-12-31");
  t.mock.timers.tick(1000);
  assert.equal(todayStr(), "2027-01-01");
  process.env.APP_TIMEZONE = "America/Los_Angeles";
  assert.equal(todayStr(), "2026-12-31");
  delete process.env.APP_TIMEZONE;
  assert.equal(todayStr(), "2027-01-01");
});
