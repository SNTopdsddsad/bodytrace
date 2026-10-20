import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";
import { runInNewContext } from "node:vm";

const source = stripTypeScriptTypes(readFileSync(new URL("../src/services/sms-rate-limit.ts", import.meta.url), "utf8"), {
  mode: "transform",
}).replace(/^import .+;\r?$/gm, "").replace(/^export /gm, "");
const phone = "+8613800138000";

/** 运行真实服务函数，仅替换数据库 I/O；虚拟时钟避免靠等待时间造成测试抖动。 */
function createQuotaHarness({ beforeLock = async () => {} } = {}) {
  let timestamp = Date.parse("2026-10-20T00:00:00.000Z");
  let committed = new Map();
  let tail = Promise.resolve();
  const locks = [];
  class ClockDate extends Date {
    constructor(value = timestamp) { super(value); }
    static now() { return timestamp; }
  }
  const clock = { advance: milliseconds => { timestamp += milliseconds; }, now: () => timestamp };
  const sql = strings => ({ text: strings.join("?"), mapWith() { return this; } });
  const table = { id: "id", windowStartedAt: "windowStartedAt" };
  const resolveDate = value => value instanceof Date ? value : new ClockDate();
  const db = {
    async transaction(callback) {
      const previous = tail;
      const completion = Promise.withResolvers();
      tail = completion.promise;
      await previous;
      const rows = new Map([...committed].map(([id, record]) => [id, { ...record }]));
      const tx = {
        insert() {
          return {
            values(value) {
              return {
                async onDuplicateKeyUpdate() {
                  if (!rows.has(value.id)) rows.set(value.id, {
                    ...value,
                    windowStartedAt: resolveDate(value.windowStartedAt),
                    nextAllowedAt: resolveDate(value.nextAllowedAt),
                  });
                },
              };
            },
          };
        },
        select(fields) {
          return {
            from() {
              return {
                where(id) {
                  if (fields) return Promise.resolve([{ now: new ClockDate() }]);
                  return {
                    async for(strength) {
                      assert.equal(strength, "update");
                      locks.push(id.split(":")[0]);
                      await beforeLock(id, clock);
                      return [{ ...rows.get(id) }];
                    },
                  };
                },
              };
            },
          };
        },
        update() {
          return {
            set(value) {
              return { async where(id) { rows.set(id, { ...rows.get(id), ...value }); } };
            },
          };
        },
      };
      try {
        const result = await callback(tx);
        committed = rows;
        return result;
      } finally {
        completion.resolve();
      }
    },
  };
  const api = runInNewContext(`${source}\n({ reserveSmsQuota, SmsRateLimitError });`, {
    createHmac, eq: (_column, id) => id, sql, db, smsRateLimit: table,
    getSmsCodeSettings: () => ({ rateLimitSeconds: 1 }),
    process: { env: { BETTER_AUTH_SECRET: "synthetic-quota-test-secret" } }, Date: ClockDate,
  });
  return {
    ...api, clock, locks,
    records: prefix => [...committed.values()].filter(record => record.id.startsWith(`${prefix}:`)),
  };
}

test("等待号码锁超过重发间隔后，紧随请求仍被冷却限制，来源额度随拒绝回滚", async () => {
  const waiting = Promise.withResolvers();
  const release = Promise.withResolvers();
  let delayed = false;
  const quota = createQuotaHarness({
    beforeLock: async (id, clock) => {
      if (id.startsWith("phone:") && !delayed) {
        delayed = true;
        clock.advance(1_200);
        waiting.resolve();
        await release.promise;
      }
    },
  });
  const first = quota.reserveSmsQuota(phone, "source-a");
  await waiting.promise;
  const second = quota.reserveSmsQuota(phone, "source-a");
  release.resolve();
  await first;
  await assert.rejects(second, error => {
    assert(error instanceof quota.SmsRateLimitError);
    assert.equal(error.retryAfterSeconds, 1);
    return true;
  });
  assert.equal(quota.records("phone")[0].nextAllowedAt.getTime(), quota.clock.now() + 1_000);
  assert.equal(quota.records("phone")[0].windowStartedAt.getTime(), quota.clock.now());
  assert.equal(quota.records("phone")[0].count, 1);
  assert.equal(quota.records("ip")[0].count, 1);
  assert.deepEqual(quota.locks, ["ip", "phone", "ip", "phone"]);
});

test("重发间隔精确结束后可再次占用额度", async () => {
  const quota = createQuotaHarness();
  await quota.reserveSmsQuota(phone, "source-a");
  quota.clock.advance(999);
  await assert.rejects(quota.reserveSmsQuota(phone, "source-a"), error => {
    assert.equal(error.retryAfterSeconds, 1);
    return true;
  });
  quota.clock.advance(1);
  await quota.reserveSmsQuota(phone, "source-a");
  assert.equal(quota.records("phone")[0].count, 2);
});

test("来源一分钟最多五次，窗口结束后重新计数", async () => {
  const quota = createQuotaHarness();
  for (let index = 0; index < 5; index += 1) {
    await quota.reserveSmsQuota(`+861380013800${index}`, "source-a");
  }
  await assert.rejects(quota.reserveSmsQuota("+8613800138005", "source-a"), error => {
    assert(error instanceof quota.SmsRateLimitError);
    assert.equal(error.retryAfterSeconds, 60);
    return true;
  });
  assert.equal(quota.records("phone").length, 5);
  quota.clock.advance(60_000);
  await quota.reserveSmsQuota("+8613800138005", "source-a");
  assert.equal(quota.records("ip")[0].count, 1);
});

test("单号二十四小时最多十次，换来源不能绕过限制", async () => {
  const quota = createQuotaHarness();
  for (let index = 0; index < 10; index += 1) {
    await quota.reserveSmsQuota(phone, `source-${index}`);
    quota.clock.advance(1_000);
  }
  await assert.rejects(quota.reserveSmsQuota(phone, "source-extra"), error => {
    assert(error instanceof quota.SmsRateLimitError);
    assert.equal(error.retryAfterSeconds, 86_390);
    return true;
  });
  assert.equal(quota.records("phone")[0].count, 10);
  assert.equal(quota.records("ip").length, 10);
  quota.clock.advance(86_390_000);
  await quota.reserveSmsQuota(phone, "source-extra");
  assert.equal(quota.records("phone")[0].count, 1);
});
