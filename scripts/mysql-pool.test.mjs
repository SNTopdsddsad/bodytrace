import assert from "node:assert/strict";
import { setTimeout as delay } from "node:timers/promises";
import test from "node:test";
import { createMySqlPool } from "../src/db/connection.ts";
import { resolveTestDatabaseUrl } from "./lib/local-test-app.mjs";

// 与其他 MySQL 测试共用本地隔离规则；不读取 .env 或访问云数据库。
process.env.DATABASE_URL = resolveTestDatabaseUrl();
process.env.DATABASE_SSL = "";
process.env.DATABASE_SSL_CA_FILE = "";

test("空闲回收后重新建立 UTC 连接，包括单连接池", async () => {
  await Promise.all([10, 1].map(async limit => {
    const pool = createMySqlPool(limit);
    try {
      const [[before]] = await pool.query("SELECT CONNECTION_ID() AS id, @@session.time_zone AS timeZone");
      assert.equal(before.timeZone, "+00:00");
      // 回收任务每秒检查一次，因此覆盖 30 秒空闲阈值及两次检查。
      await delay(32_000);
      const [[after]] = await pool.query("SELECT CONNECTION_ID() AS id, @@session.time_zone AS timeZone");
      assert.notEqual(after.id, before.id, `连接池 ${limit} 必须回收空闲连接`);
      assert.equal(after.timeZone, "+00:00", "新连接仍须初始化 UTC 会话时区");
    } finally {
      await pool.end();
    }
  }));
});
