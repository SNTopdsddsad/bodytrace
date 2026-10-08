/**
 * 认证配置（better-auth）。
 *
 * 负责所有和“你是谁”有关的事：注册、登录、登出、会话管理。
 * - 邮箱 + 密码登录，密码加密后存在 account 表
 * - 登录后浏览器持有 cookie；加了 bearer 插件后，未来手机 app
 *   也可以用 Authorization: Bearer <token> 头调同一套 API
 */
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer } from "better-auth/plugins";
import { db } from "@/db";
import {
  user as userTable,
  session as sessionTable,
  account as accountTable,
  verification as verificationTable,
} from "@/db/schema";
import { seedCommonFoods } from "@/db/seed";

export const auth = betterAuth({
  // 告诉 better-auth 用我们的 Postgres 存用户/会话数据（表结构见 src/db/schema.ts）
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: userTable,
      session: sessionTable,
      account: accountTable,
      verification: verificationTable,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  // bearer 插件让未来的移动 app 可以用 Authorization: Bearer <token>
  // 调同一套 API，Web 端继续走 cookie，互不影响
  plugins: [bearer()],
  databaseHooks: {
    user: {
      create: {
        after: async (newUser) => {
          // 新用户预置常用食物库，注册完即可直接记录
          await seedCommonFoods(newUser.id);
        },
      },
    },
  },
});

export type Session = typeof auth.$Infer.Session;
