/**
 * 数据库表定义（schema）。
 *
 * Drizzle 的玩法：这里用 TypeScript “描述”数据库里有哪些表和字段，
 * - `drizzle-kit generate` 能据此生成建表 SQL（存到 /drizzle 目录）
 * - 代码里查询结果的类型也自动推导出来，写错字段名会直接报编译错误
 */
import {
  pgTable,
  pgEnum,
  text,
  boolean,
  integer,
  real,
  uuid,
  timestamp,
  date,
  index,
} from "drizzle-orm/pg-core";

/**
 * better-auth 要求的四张认证表。
 * 字段名与 better-auth 默认 schema 对齐，适配器无需额外映射。
 */
export const user = pgTable("user", {
  id: text("id").primaryKey().notNull(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = pgTable("account", {
  id: text("id").primaryKey().notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey().notNull(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/* ---------------- 业务表 ---------------- */

export const mealTypeEnum = pgEnum("meal_type", [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
]);

/** 食物库：营养值统一按每 100g 记录，servingGrams 定义“一份”的克数便于快捷录入。 */
export const food = pgTable(
  "food",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    brand: text("brand"),
    calories: real("calories").notNull(),
    protein: real("protein").notNull().default(0),
    carbs: real("carbs").notNull().default(0),
    fat: real("fat").notNull().default(0),
    servingGrams: real("serving_grams"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("food_user_idx").on(t.userId)],
);

/**
 * 饮食记录：营养值为写入时刻的快照（按实际克数折算），
 * 之后修改/删除食物库不影响历史记录。
 */
export const mealEntry = pgTable(
  "meal_entry",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    mealType: mealTypeEnum("meal_type").notNull(),
    foodId: uuid("food_id").references(() => food.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    grams: real("grams").notNull(),
    calories: real("calories").notNull(),
    protein: real("protein").notNull().default(0),
    carbs: real("carbs").notNull().default(0),
    fat: real("fat").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("meal_entry_user_date_idx").on(t.userId, t.date)],
);

/** 每用户一行每日目标，未设置时按代码里的默认值展示。 */
export const dailyGoal = pgTable("daily_goal", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  calories: integer("calories").notNull().default(2000),
  protein: integer("protein").notNull().default(120),
  carbs: integer("carbs").notNull().default(220),
  fat: integer("fat").notNull().default(60),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const genderEnum = pgEnum("gender", ["male", "female", "other"]);

/**
 * 每用户一行身体数据（个人资料）。字段全部可空：
 * 允许先填一部分，缺项时相关估算（如基础代谢）就不展示。
 */
export const userProfile = pgTable("user_profile", {
  userId: text("user_id")
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  gender: genderEnum("gender"),
  age: integer("age"),
  heightCm: real("height_cm"),
  weightKg: real("weight_kg"),
  targetWeightKg: real("target_weight_kg"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/**
 * 食物参考库：官方《中国食物成分表（标准版第6版）》的 1677 种食物，
 * 全体用户共享、只读。用户从这里“抄”数据到自己的 food 表。
 * 数据来源：github.com/Sanotsu/china-food-composition-data（个人学习研究用途）。
 */
export const foodReference = pgTable(
  "food_reference",
  {
    id: integer("id").primaryKey().generatedAlwaysAsIdentity(),
    foodCode: text("food_code").notNull().unique(),
    name: text("name").notNull(),
    englishName: text("english_name"),
    category: text("category"),
    /** 以下营养值均为每 100g 可食部 */
    calories: real("calories"),
    protein: real("protein"),
    carbs: real("carbs"),
    fat: real("fat"),
    dietaryFiber: real("dietary_fiber"),
    edible: real("edible"),
  },
  (t) => [index("food_reference_name_idx").on(t.name)],
);

export type Food = typeof food.$inferSelect;
export type MealEntry = typeof mealEntry.$inferSelect;
export type DailyGoal = typeof dailyGoal.$inferSelect;
export type UserProfile = typeof userProfile.$inferSelect;
