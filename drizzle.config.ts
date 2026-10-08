import "dotenv/config";
import { defineConfig } from "drizzle-kit";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
    // 与 src/db/index.ts 保持一致：DATABASE_SSL=require 时开启
    ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
  },
});
