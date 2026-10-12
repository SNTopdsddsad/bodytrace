import "dotenv/config";
import { defineConfig } from "drizzle-kit";
import { getMySqlConfig } from "./src/db/connection";

const connection = getMySqlConfig();

export default defineConfig({
  schema: "./src/db/schema.ts",
  // 旧 PostgreSQL 迁移留在 drizzle 根目录存档，不用于 MySQL。
  out: "./drizzle/mysql",
  dialect: "mysql",
  dbCredentials: {
    host: connection.host,
    port: connection.port,
    user: connection.user,
    password: connection.password,
    database: connection.database,
    ssl: connection.ssl,
  },
});
