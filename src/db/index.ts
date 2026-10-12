/**
 * 数据库连接入口。
 * Drizzle ORM 负责把 TypeScript 代码翻译成 SQL，mysql2 是底层驱动。
 * 整个应用都从这里 import { db } 来读写数据库。
 */
import { drizzle } from "drizzle-orm/mysql2";
import { createMySqlPool } from "./connection";
import * as schema from "./schema";

const globalDb = globalThis as unknown as {
  bodytraceMySqlPool?: ReturnType<typeof createMySqlPool>;
};
const client = globalDb.bodytraceMySqlPool ?? createMySqlPool();
if (process.env.NODE_ENV !== "production") globalDb.bodytraceMySqlPool = client;

export const db = drizzle(client, { schema, mode: "default" });
