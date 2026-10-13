import { readFileSync } from "node:fs";
import mysql from "mysql2";
import type { PoolOptions } from "mysql2";

/** 应用、迁移和维护脚本共用同一套 MySQL 连接配置。 */
export function getMySqlConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("请配置 MySQL DATABASE_URL");

  const url = new URL(connectionString);
  if (url.protocol !== "mysql:") {
    throw new Error("DATABASE_URL 必须使用 mysql:// 连接串");
  }
  const database = decodeURIComponent(url.pathname.slice(1));
  if (!database) throw new Error("DATABASE_URL 必须包含数据库名");

  const sslMode = process.env.DATABASE_SSL;
  if (sslMode && sslMode !== "require") {
    throw new Error("DATABASE_SSL 仅支持 require；本地不使用 TLS 时请留空");
  }

  return {
    host: url.hostname,
    port: url.port ? Number(url.port) : 3306,
    user: decodeURIComponent(url.username),
    password: decodeURIComponent(url.password),
    database,
    charset: "utf8mb4",
    timezone: "Z",
    // DATE 保持 YYYY-MM-DD，不能因为驱动转成 Date 而改变记录日期。
    dateStrings: ["DATE"],
    connectionLimit: 10,
    connectTimeout: 10_000,
    enableKeepAlive: true,
    keepAliveInitialDelay: 10_000,
    ssl: sslMode === "require" ? {
      rejectUnauthorized: true,
      ...(process.env.DATABASE_SSL_CA_FILE
        ? { ca: readFileSync(process.env.DATABASE_SSL_CA_FILE, "utf8") }
        : {}),
    } : undefined,
  } satisfies PoolOptions;
}

export function createMySqlPool(connectionLimit = 10) {
  const pool = mysql.createPool({
    ...getMySqlConfig(),
    connectionLimit,
    // mysql2 只有在 maxIdle < connectionLimit 时才启动空闲回收任务。
    // 尽早关闭闲置连接，避免再次登录时复用已被云库或网络断开的连接。
    maxIdle: Math.max(0, Math.min(5, connectionLimit - 1)),
    idleTimeout: 30_000,
  });
  pool.on("connection", (connection) => {
    // timezone: Z 控制驱动转换；会话时区还要统一，保证数据库默认时间也是 UTC。
    connection.query("SET time_zone = '+00:00'", (error) => {
      if (error) connection.destroy();
    });
  });
  return pool.promise();
}
