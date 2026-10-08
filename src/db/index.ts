/**
 * 数据库连接入口。
 * Drizzle ORM 负责把 TypeScript 代码翻译成 SQL，postgres.js 是底层驱动。
 * 整个应用都从这里 import { db } 来读写数据库。
 */
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const client = postgres(process.env.DATABASE_URL!, {
  // 连接池上限：自用小站点 10 个连接绰绰有余
  max: 10,
  // 云数据库（如腾讯云）外网连接通常要求 SSL；
  // 在 .env 里设置 DATABASE_SSL=require 即开启（自签证书也放行）
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
});

export const db = drizzle(client, { schema });
