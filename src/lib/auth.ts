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
import { and, eq, like } from "drizzle-orm";
import { db } from "@/db";
import {
  user as userTable,
  session as sessionTable,
  account as accountTable,
  verification as verificationTable,
} from "@/db/schema";
import { seedCommonFoods } from "@/db/seed";
import { isLocalPasswordResetEnabled } from "@/lib/password-reset";

// 只有受控生产代理覆盖的 IP 头才可信；开发模式不读取客户端传来的转发头。
const trustedIpHeader = process.env.NODE_ENV === "production"
  ? process.env.AUTH_TRUSTED_IP_HEADER?.trim().toLowerCase()
  : undefined;

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
    maxPasswordLength: 128,
    resetPasswordTokenExpiresIn: 15 * 60,
    revokeSessionsOnPasswordReset: true,
    onPasswordReset: async ({ user }) => {
      // 不仅消费当前链接，还作废这个账号此前申请的其他重置链接。
      await db.delete(verificationTable).where(and(
        eq(verificationTable.value, user.id),
        like(verificationTable.identifier, "reset-password:%"),
      ));
    },
    // 暂不发送邮件。只有本地 next dev 才会把一次性链接输出到终端。
    sendResetPassword: isLocalPasswordResetEnabled()
      ? async ({ url }) => {
          console.info(`[BodyTrace] 本地密码重置链接（15 分钟内有效）：${url}`);
        }
      : undefined,
  },
  advanced: {
    ipAddress: {
      // 没有可信地址时 better-auth 使用共享限流桶，不允许靠伪造 IP 绕过。
      ipAddressHeaders: trustedIpHeader ? [trustedIpHeader] : [],
    },
  },
  rateLimit: {
    enabled: true,
    customRules: {
      "/request-password-reset": { window: 60, max: 3 },
      "/reset-password": { window: 60, max: 10 },
    },
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
