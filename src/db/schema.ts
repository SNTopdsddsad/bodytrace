/**
 * 数据库表定义（schema）。
 *
 * Drizzle 的玩法：这里用 TypeScript “描述”数据库里有哪些表和字段，
 * - `drizzle-kit generate` 能据此生成建表 SQL（存到 /drizzle 目录）
 * - 代码里查询结果的类型也自动推导出来，写错字段名会直接报编译错误
 */
import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  mysqlTable,
  mysqlEnum,
  text,
  boolean,
  int,
  double,
  varchar,
  datetime,
  date,
  index,
  unique,
} from "drizzle-orm/mysql-core";

/**
 * better-auth 要求的四张认证表。
 * 字段名与 better-auth 默认 schema 对齐，适配器无需额外映射。
 */
export const user = mysqlTable("bodytrace_user", {
  id: varchar("id", { length: 255 }).primaryKey().notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});

export const session = mysqlTable("bodytrace_session", {
  id: varchar("id", { length: 255 }).primaryKey().notNull(),
  expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
  token: varchar("token", { length: 255 }).notNull().unique(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
});

export const account = mysqlTable("bodytrace_account", {
  id: varchar("id", { length: 255 }).primaryKey().notNull(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: varchar("user_id", { length: 255 })
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: datetime("access_token_expires_at", { mode: "date", fsp: 3 }),
  refreshTokenExpiresAt: datetime("refresh_token_expires_at", { mode: "date", fsp: 3 }),
  scope: text("scope"),
  password: text("password"),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});

export const verification = mysqlTable("bodytrace_verification", {
  id: varchar("id", { length: 255 }).primaryKey().notNull(),
  identifier: varchar("identifier", { length: 255 }).notNull(),
  value: text("value").notNull(),
  expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
  createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});

/* ---------------- 业务表 ---------------- */

const mealTypes = [
  "breakfast",
  "lunch",
  "dinner",
  "snack",
] as const;

/** 食物库：营养值统一按每 100g 记录，servingGrams 定义“一份”的克数便于快捷录入。 */
export const food = mysqlTable(
  "bodytrace_food",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(randomUUID),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    brand: text("brand"),
    calories: double("calories").notNull(),
    protein: double("protein").notNull().default(0),
    carbs: double("carbs").notNull().default(0),
    fat: double("fat").notNull().default(0),
    servingGrams: double("serving_grams"),
    isFavorite: boolean("is_favorite").notNull().default(false),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [index("food_user_idx").on(t.userId)],
);

/**
 * 饮食记录：营养值为写入时刻的快照（按实际克数折算），
 * 之后修改/删除食物库不影响历史记录。
 */
export const mealEntry = mysqlTable(
  "bodytrace_meal_entry",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(randomUUID),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    mealType: mysqlEnum("meal_type", mealTypes).notNull(),
    foodId: varchar("food_id", { length: 36 }).references(() => food.id, { onDelete: "set null" }),
    name: varchar("name", { length: 255 }).notNull(),
    grams: double("grams").notNull(),
    calories: double("calories").notNull(),
    protein: double("protein").notNull().default(0),
    carbs: double("carbs").notNull().default(0),
    fat: double("fat").notNull().default(0),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [index("meal_entry_user_date_idx").on(t.userId, t.date)],
);

/** 每用户一行每日目标，未设置时按代码里的默认值展示。 */
export const dailyGoal = mysqlTable("bodytrace_daily_goal", {
  userId: varchar("user_id", { length: 255 })
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  calories: int("calories").notNull().default(2000),
  protein: int("protein").notNull().default(120),
  carbs: int("carbs").notNull().default(220),
  fat: int("fat").notNull().default(60),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});

const genders = ["male", "female", "other"] as const;

/**
 * 每用户一行身体数据（个人资料）。字段全部可空：
 * 允许先填一部分，缺项时相关估算（如 BMI）就不展示。
 */
export const userProfile = mysqlTable("bodytrace_user_profile", {
  userId: varchar("user_id", { length: 255 })
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  gender: mysqlEnum("gender", genders),
  heightCm: double("height_cm"),
  weightKg: double("weight_kg"),
  targetWeightKg: double("target_weight_kg"),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});

/* ---------------- 饮食计划 ---------------- */

const dayTypes = ["high", "medium", "low"] as const;

/**
 * 饮食计划（当前只有碳循环）：每用户至多一条。
 * startDate 之前的日子不受计划影响，仍走 daily_goal 兜底。
 */
export const dietPlan = mysqlTable(
  "bodytrace_diet_plan",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(randomUUID),
    userId: varchar("user_id", { length: 255 })
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    startDate: date("start_date", { mode: "string" }).notNull(),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [unique("diet_plan_user_unique").on(t.userId)],
);

/**
 * 计划里一周七天的安排：weekday 0=周一 … 6=周日。
 * 目标按天存（同一日型的天数值相同），按天取用时无需再按日型换算。
 */
export const dietPlanDay = mysqlTable(
  "bodytrace_diet_plan_day",
  {
    id: varchar("id", { length: 36 }).primaryKey().$defaultFn(randomUUID),
    planId: varchar("plan_id", { length: 36 })
      .notNull()
      .references(() => dietPlan.id, { onDelete: "cascade" }),
    weekday: int("weekday").notNull(),
    dayType: mysqlEnum("day_type", dayTypes).notNull(),
    calories: int("calories").notNull(),
    protein: int("protein").notNull(),
    carbs: int("carbs").notNull(),
    fat: int("fat").notNull(),
  },
  (t) => [unique("diet_plan_day_plan_weekday_unique").on(t.planId, t.weekday)],
);

/**
 * 食物参考库：官方《中国食物成分表（标准版第6版）》的 1677 种食物，
 * 全体用户共享、只读。用户从这里“抄”数据到自己的 food 表。
 * 数据来源：github.com/Sanotsu/china-food-composition-data（个人学习研究用途）。
 */
export const foodReference = mysqlTable(
  "bodytrace_food_reference",
  {
    id: int("id").primaryKey().autoincrement(),
    foodCode: varchar("food_code", { length: 32 }).notNull().unique(),
    name: varchar("name", { length: 255 }).notNull(),
    englishName: text("english_name"),
    category: text("category"),
    /** 以下营养值均为每 100g 可食部 */
    calories: double("calories"),
    protein: double("protein"),
    carbs: double("carbs"),
    fat: double("fat"),
    dietaryFiber: double("dietary_fiber"),
    edible: double("edible"),
  },
  (t) => [index("food_reference_name_idx").on(t.name)],
);

export type Food = typeof food.$inferSelect;
export type MealEntry = typeof mealEntry.$inferSelect;
export type DailyGoal = typeof dailyGoal.$inferSelect;
export type UserProfile = typeof userProfile.$inferSelect;
