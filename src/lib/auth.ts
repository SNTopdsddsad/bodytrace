/**
 * 认证配置（better-auth）。
 *
 * 负责所有和“你是谁”有关的事：注册、登录、登出、会话管理。
 * - 邮箱 + 密码登录，密码加密后存在 account 表
 * - 登录后浏览器持有 cookie；加了 bearer 插件后，未来手机 app
 *   也可以用 Authorization: Bearer <token> 头调同一套 API
 */
import { randomUUID } from "node:crypto";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { bearer, phoneNumber } from "better-auth/plugins";
import { and, eq, like } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  user as userTable,
  session as sessionTable,
  account as accountTable,
  verification as verificationTable,
} from "@/db/schema";
import { seedCommonFoods } from "@/db/seed";
import { isLocalPasswordResetEnabled } from "@/lib/password-reset";
import { isSmsConfigured, sendLoginSms } from "@/lib/aliyun-sms";
import { normalizeMainlandPhoneNumber } from "@/lib/phone-number";
import { getSmsCodeSettings } from "@/lib/sms-config";
import { reserveSmsQuota, SmsRateLimitError } from "@/services/sms-rate-limit";
import { consumeSmsVerification, saveSmsVerification } from "@/services/sms-verification";

// 只有受控生产代理覆盖的 IP 头才可信；开发模式不读取客户端传来的转发头。
const trustedIpHeader = process.env.NODE_ENV === "production"
  ? process.env.AUTH_TRUSTED_IP_HEADER?.trim().toLowerCase()
  : undefined;

const phoneInput = z.string().max(32).transform((value, ctx) => {
  const normalized = normalizeMainlandPhoneNumber(value);
  if (normalized) return normalized;
  ctx.addIssue({ code: "custom", message: "请输入中国大陆手机号。" });
  return z.NEVER;
});
const sendSmsInput = z.object({ phoneNumber: phoneInput }).strict();
const smsSettings = getSmsCodeSettings();
// 不开放绑定/改号或用户字段写入，避免验证码登录意外修改旧账号。
const verifySmsInput = z.object({
  phoneNumber: phoneInput,
  code: z.string().regex(new RegExp(`^\\d{${smsSettings.codeLength}}$`)),
}).strict();

export const auth = betterAuth({
  // 告诉 better-auth 用 MySQL 存用户/会话数据（表结构见 src/db/schema.ts）
  database: drizzleAdapter(db, {
    provider: "mysql",
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
  disabledPaths: [
    "/sign-in/phone-number",
    "/phone-number/request-password-reset",
    "/phone-number/reset-password",
  ],
  hooks: {
    before: createAuthMiddleware(async ctx => {
      // 邮箱入口只沿用既有字段，不允许通过注册或资料更新抢占手机号。
      if (["/sign-up/email", "/update-user"].includes(ctx.path)
        && ctx.body && ("phoneNumber" in ctx.body || "phoneNumberVerified" in ctx.body)) {
        throw new APIError("BAD_REQUEST", { code: "PHONE_UPDATE_DISABLED", message: "暂不支持绑定或修改手机号。" });
      }
      if (!["/phone-number/send-otp", "/phone-number/verify"].includes(ctx.path)) return;
      const parsed = (ctx.path === "/phone-number/send-otp" ? sendSmsInput : verifySmsInput).safeParse(ctx.body);
      if (!parsed.success) {
        throw new APIError("BAD_REQUEST", { code: "INVALID_PHONE_INPUT", message: "请输入中国大陆手机号和正确格式的验证码。" });
      }
      if (!isSmsConfigured()) {
        throw new APIError("SERVICE_UNAVAILABLE", { code: "SMS_UNAVAILABLE", message: "短信登录暂未开放，请稍后再试；原邮箱账号可使用邮箱登录。" });
      }
      if (ctx.path === "/phone-number/send-otp") {
        try {
          await reserveSmsQuota(parsed.data.phoneNumber, trustedIpHeader ? ctx.headers?.get(trustedIpHeader) ?? null : null);
        } catch (error) {
          if (!(error instanceof SmsRateLimitError)) throw error;
          throw new APIError("TOO_MANY_REQUESTS", {
            code: "SMS_RATE_LIMITED", message: error.message,
          }, { "Retry-After": String(error.retryAfterSeconds) });
        }
      }
      return { context: { body: parsed.data } };
    }),
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
      "/phone-number/send-otp": { window: 60, max: 10 },
      "/phone-number/verify": { window: 60, max: 20 },
    },
  },
  // bearer 插件让未来的移动 app 可以用 Authorization: Bearer <token>
  // 调同一套 API，Web 端继续走 cookie，互不影响
  plugins: [bearer(), phoneNumber({
    otpLength: smsSettings.codeLength,
    expiresIn: smsSettings.expireMinutes * 60,
    allowedAttempts: 3,
    phoneNumberValidator: value => normalizeMainlandPhoneNumber(value) === value,
    sendOTP: async ({ phoneNumber, code }) => {
      await saveSmsVerification(phoneNumber, code);
      // 插件会先创建明文验证码；实际验证只读取独立的摘要记录。
      await db.delete(verificationTable).where(eq(verificationTable.identifier, phoneNumber));
      try {
        await sendLoginSms(phoneNumber, code);
      } catch {
        // SDK 的异常可能带请求参数，不能直接写日志或返回给浏览器。
        throw new APIError("SERVICE_UNAVAILABLE", { code: "SMS_SEND_FAILED", message: "短信发送暂未成功，请稍后重试。若已收到验证码，可直接填写。" });
      }
    },
    verifyOTP: async ({ phoneNumber, code }) => {
      const result = await consumeSmsVerification(phoneNumber, code);
      if (result === "valid") return true;
      if (result === "attempts-exceeded") {
        throw new APIError("FORBIDDEN", { code: "TOO_MANY_ATTEMPTS", message: "验证码尝试次数过多，请重新获取。" });
      }
      const errors = {
        invalid: { code: "INVALID_OTP", message: "验证码不正确。" },
        expired: { code: "OTP_EXPIRED", message: "验证码已过期。" },
        missing: { code: "OTP_NOT_FOUND", message: "验证码已失效，请重新获取。" },
      };
      throw new APIError("BAD_REQUEST", errors[result]);
    },
    signUpOnVerification: {
      getTempEmail: () => `${randomUUID()}@phone.bodytrace.invalid`,
      getTempName: phone => `用户${phone.slice(-4)}`,
    },
  })],
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
