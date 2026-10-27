import assert from "node:assert/strict";
import test from "node:test";
import { copyTraining, newTraining, trainingKind, trainingProgress, trainingSchemas } from "../src/lib/training.ts";
import { createTrainingClock } from "../src/lib/training-clock.ts";

const today = "2026-10-27";
const now = "2026-10-27T12:00:00.000Z";
const schemas = trainingSchemas(today, "20:00", now);
let sequence = 0;
const id = () => `00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
const set = (changes = {}) => ({ id: id(), weightKg: null, reps: null, durationSeconds: null, completed: false, ...changes });
const strength = (changes = {}) => ({ id: id(), kind: "strength", name: "深蹲", mode: "weighted", sets: [set()], ...changes });
const cardio = (changes = {}) => ({ id: id(), kind: "cardio", name: "跑步", durationMinutes: null, distanceKm: null, completed: false, ...changes });
const training = (changes = {}) => ({
  title: "晚间训练", date: "2026-10-26", time: "18:30", mode: "manual", status: "inProgress",
  startedAt: null, durationMinutes: null, note: null, items: [], ...changes,
});
const completedSet = (changes = {}) => set({ weightKg: 42.5, reps: 8, completed: true, ...changes });
const valid = input => schemas.payload.safeParse(input).success;

test("实时开始使用服务端基准，设备快两秒、慢一天或中途调钟都不生成未来时刻", t => {
  let tick = 100;
  const clock = createTrainingClock(now, () => tick);
  for (const wallTime of [Date.parse(now) + 2000, Date.parse(now) - 86400000, Date.parse(now) + 86400000]) {
    t.mock.method(Date, "now", () => wallTime);
    const reading = clock.read("Asia/Shanghai");
    assert.deepEqual(reading, { date: today, time: "20:00", iso: now });
    assert.equal(schemas.payload.safeParse(newTraining("live", reading.date, reading.time, reading.iso)).success, true);
    t.mock.restoreAll();
  }
  tick += 2000;
  assert.equal(clock.read("Asia/Shanghai").iso, "2026-10-27T12:00:02.000Z");
  assert.equal(schemas.payload.safeParse(newTraining("live", today, "20:00", "2026-10-27T12:00:00.001Z")).success, false, "仍须严格拒绝真正的未来开始时刻");
});

test("服务端时钟按应用时区跨午夜，保存前采样可纠正预取或休眠留下的旧基准", () => {
  let tick = 500;
  const clock = createTrainingClock("2026-12-31T15:59:59.000Z", () => tick);
  assert.deepEqual(clock.read("Asia/Shanghai"), { date: "2026-12-31", time: "23:59", iso: "2026-12-31T15:59:59.000Z" });
  tick += 1500;
  assert.deepEqual(clock.read("Asia/Shanghai"), { date: "2027-01-01", time: "00:00", iso: "2026-12-31T16:00:00.500Z" });
  clock.synchronize("2027-01-01T00:00:00.000Z");
  assert.deepEqual(clock.read("America/Los_Angeles"), { date: "2026-12-31", time: "16:00", iso: "2027-01-01T00:00:00.000Z" });
  tick += 60000;
  assert.equal(clock.read("Asia/Shanghai").iso, "2027-01-01T00:01:00.000Z");
  assert.throws(() => clock.synchronize("invalid"), /服务器时间/);
  assert.equal(clock.read("Asia/Shanghai").iso, "2027-01-01T00:01:00.000Z", "无效样本不得污染已校准时钟");
});

test("进行中的训练允许暂时没有项目，缺失数值保持空值", () => {
  const empty = schemas.payload.parse(training());
  assert.deepEqual(empty.items, []);
  assert.equal(empty.durationMinutes, null);
  const draft = schemas.payload.parse(training({ items: [strength(), cardio()] }));
  assert.equal(draft.items[0].sets[0].weightKg, null);
  assert.equal(draft.items[0].sets[0].reps, null);
  assert.equal(draft.items[1].durationMinutes, null);
  assert.equal(draft.items[1].distanceKm, null);
});

test("完成训练至少有一组或一项有氧已完成，不把未完成项目计入完成", () => {
  assert.equal(valid(training({ status: "completed" })), false);
  assert.equal(valid(training({ status: "completed", items: [strength(), cardio()] })), false);
  const input = training({ status: "completed", items: [strength({ sets: [completedSet(), set()] }), cardio()] });
  assert.equal(valid(input), true);
  assert.deepEqual(trainingProgress(input), { completedSets: 1, totalSets: 2, completedCardio: 0, totalCardio: 1 });
});

test("力量组完成时要求实际重量与次数，未完成状态不绕过数值边界", () => {
  assert.equal(valid(training({ items: [strength({ sets: [completedSet()] })] })), true);
  for (const changes of [{ weightKg: null }, { weightKg: 0 }, { weightKg: -1 }, { reps: null }, { reps: 0 }, { reps: 2.5 }]) {
    assert.equal(valid(training({ items: [strength({ sets: [completedSet(changes)] })] })), false, JSON.stringify(changes));
  }
  assert.equal(valid(training({ items: [strength({ sets: [set({ weightKg: -1 })] })] })), false);
});

test("自重按次数、计时动作按秒记录，不强迫填写不适用字段", () => {
  for (const weightKg of [null, 0]) {
    assert.equal(valid(training({ items: [strength({ name: "俯卧撑", mode: "bodyweight", sets: [set({ weightKg, reps: 12, completed: true })] })] })), true);
  }
  assert.equal(valid(training({ items: [strength({ mode: "bodyweight", sets: [set({ reps: null, completed: true })] })] })), false);
  const timed = seconds => training({ items: [strength({ name: "平板支撑", mode: "timed", sets: [set({ durationSeconds: seconds, completed: true })] })] });
  assert.equal(valid(timed(45)), true);
  for (const seconds of [null, 0, -1, 0.5]) assert.equal(valid(timed(seconds)), false);
  assert.equal(valid(training({ items: [strength({ mode: "timed", sets: [set({ durationSeconds: 45, reps: 8, completed: true })] })] })), false);
  assert.equal(valid(training({ items: [strength({ sets: [completedSet({ durationSeconds: 30 })] })] })), false);
});

test("完成有氧必须有整数分钟，距离可未知，重量和距离保留两位精度", () => {
  assert.equal(valid(training({ status: "completed", items: [cardio({ durationMinutes: 20, completed: true })] })), true);
  for (const durationMinutes of [null, 0, -1, 1.5]) {
    assert.equal(valid(training({ items: [cardio({ durationMinutes, completed: true })] })), false);
  }
  assert.equal(valid(training({ items: [cardio({ durationMinutes: 20, distanceKm: 2.75, completed: true })] })), true);
  assert.equal(valid(training({ items: [cardio({ distanceKm: -1 })] })), false);
  assert.equal(valid(training({ items: [cardio({ distanceKm: 2.755 })] })), false);
  assert.equal(valid(training({ items: [strength({ sets: [completedSet({ weightKg: 42.55 })] })] })), true);
  assert.equal(valid(training({ items: [strength({ sets: [completedSet({ weightKg: 42.555 })] })] })), false);
  assert.equal(valid(training({ durationMinutes: 32.5 })), false);
});

test("训练日期按真实日历校验，可补录、不可未来，未知时间不伪造午夜", () => {
  assert.equal(valid(training({ date: "2024-02-29", time: null })), true);
  assert.equal(schemas.payload.parse(training({ time: null })).time, null);
  for (const date of ["0999-12-31", "0001-01-01", "2026-02-29", "2026-02-30", "2026-04-31", "2026-1-01", "2026-10-28"]) {
    assert.equal(valid(training({ date })), false, date);
  }
  for (const time of ["24:00", "08:60", "8:30"]) assert.equal(valid(training({ time })), false, time);
  assert.equal(valid(training({ date: today, time: "20:01" })), false);
  assert.equal(valid(training({ date: today, time: "20:00" })), true);
  assert.equal(valid(training({ date: "2026-10-26", time: "23:59" })), true);
  assert.equal(valid(training({ date: "1000-01-01" })), true);
});

test("现场记录保留真实开始时刻，补录不能伪装现场计时", () => {
  assert.equal(valid(training({ mode: "live", startedAt: "2026-10-26T10:30:00.000Z" })), true);
  assert.equal(valid(training({ mode: "live", startedAt: null })), false);
  assert.equal(valid(training({ startedAt: "2026-10-26T10:30:00.000Z" })), false);
  assert.equal(valid(training({ mode: "live", startedAt: "不是时间" })), false);
  assert.equal(valid(training({ mode: "live", startedAt: "2026-10-28T10:30:00.000Z" })), false);
  assert.equal(valid(training({ mode: "live", startedAt: "0999-12-31T23:59:59Z" })), false);
  assert.equal(valid(training({ mode: "live", startedAt: "1000-01-01T00:00:00+08:00" })), false, "UTC 偏移后早于 MySQL 支持年份也应拒绝");
  assert.equal(valid(training({ mode: "live", startedAt: "1000-01-01T08:00:00+08:00" })), true);
  assert.equal(schemas.payload.parse(training({ mode: "live", startedAt: "2026-10-26T18:30:00+08:00" })).startedAt, "2026-10-26T10:30:00.000Z");
  const live = newTraining("live", today, "20:00", now);
  assert.equal(live.mode, "live");
  assert.equal(live.startedAt, now);
  assert.equal(live.date, today);
  assert.equal(live.time, "20:00");
  assert.equal(newTraining("manual", today, null, now).startedAt, null);
});

test("项目和组编号在整场训练中唯一，不会因重排或混合项目覆盖其他组", () => {
  const first = strength();
  assert.equal(valid(training({ items: [first, { ...cardio(), id: first.id }] })), false);
  assert.equal(valid(training({ items: [first, strength({ sets: [{ ...first.sets[0] }] })] })), false);
  assert.equal(valid(training({ items: [strength({ sets: [set({ id: first.id })], id: first.id })] })), false);
  assert.equal(valid(training({ items: [strength({ id: "not-a-uuid" })] })), false);
});

test("限制单次项目和组数，拒绝客户端归属与不适用字段", () => {
  assert.equal(valid(training({ items: Array.from({ length: 50 }, () => cardio()) })), true);
  assert.equal(valid(training({ items: Array.from({ length: 51 }, () => cardio()) })), false);
  assert.equal(valid(training({ items: [strength({ sets: Array.from({ length: 50 }, () => set()) })] })), true);
  assert.equal(valid(training({ items: [strength({ sets: Array.from({ length: 51 }, () => set()) })] })), false);
  assert.equal(valid({ ...training(), userId: "other-user" }), false);
  assert.equal(valid(training({ items: [{ ...cardio(), weightKg: 10 }] })), false);
  assert.equal(valid(training({ items: [strength({ sets: [set({ userId: "other-user" })] })] })), false);
  assert.equal(schemas.create.safeParse({ training: training() }).success, false);
  assert.equal(schemas.create.safeParse({ requestId: id(), training: training(), userId: "other-user" }).success, false);
  assert.equal(schemas.update.safeParse({ version: 0, training: training() }).success, false);
  assert.equal(schemas.remove.safeParse({ version: 1.5 }).success, false);
  assert.equal(schemas.remove.safeParse({ version: 1, userId: "other-user" }).success, false);
});

test("力量、有氧和混合训练分类独立于完成状态，进度只数已勾选内容", () => {
  assert.equal(trainingKind(training()), "empty");
  assert.equal(trainingKind(training({ items: [strength()] })), "strength");
  assert.equal(trainingKind(training({ items: [cardio()] })), "cardio");
  const mixed = training({ items: [strength({ sets: [completedSet(), set(), completedSet()] }), cardio(), cardio({ durationMinutes: 15, completed: true })] });
  assert.equal(trainingKind(mixed), "mixed");
  assert.deepEqual(trainingProgress(mixed), { completedSets: 2, totalSets: 3, completedCardio: 1, totalCardio: 2 });
  assert.deepEqual(trainingProgress(training()), { completedSets: 0, totalSets: 0, completedCardio: 0, totalCardio: 0 });
});

test("复制训练保留项目结构，更新编号并清除实际数值、完成状态与备注", () => {
  const original = training({
    title: "上肢与跑步 🏃", mode: "live", startedAt: "2026-10-26T10:30:00.000Z", status: "completed", durationMinutes: 75, note: "上一次的实际感受",
    items: [
      strength({ name: "卧推", sets: [completedSet()] }),
      cardio({ durationMinutes: 20, distanceKm: 3.5, completed: true }),
      strength({ name: "平板支撑", mode: "timed", sets: [set({ durationSeconds: 45, completed: true })] }),
    ],
  });
  const before = structuredClone(original);
  const copy = copyTraining(original, today, "19:00", id);
  assert.deepEqual(original, before, "复制不能修改原始记录");
  assert.equal(copy.title, original.title);
  assert.equal(copy.date, today);
  assert.equal(copy.time, "19:00");
  assert.equal(copy.mode, "manual");
  assert.equal(copy.status, "inProgress");
  assert.equal(copy.startedAt, null);
  assert.equal(copy.durationMinutes, null);
  assert.equal(copy.note, null);
  assert.deepEqual(copy.items.map(item => item.name), ["卧推", "跑步", "平板支撑"]);
  assert.notEqual(copy.items[0].id, original.items[0].id);
  assert.notEqual(copy.items[1].id, original.items[1].id);
  assert.notEqual(copy.items[0].sets[0].id, original.items[0].sets[0].id);
  assert.equal(copy.items[0].sets[0].weightKg, null);
  assert.equal(copy.items[0].sets[0].reps, null);
  assert.equal(copy.items[0].sets[0].durationSeconds, null);
  assert.equal(copy.items[1].durationMinutes, null);
  assert.equal(copy.items[1].distanceKm, null);
  assert.equal(copy.items[2].mode, "timed");
  assert.equal(copy.items[2].sets[0].durationSeconds, null);
  assert.notEqual(copy.items[2].sets[0].id, original.items[2].sets[0].id);
  assert.deepEqual(trainingProgress(copy), { completedSets: 0, totalSets: 2, completedCardio: 0, totalCardio: 1 });
});
