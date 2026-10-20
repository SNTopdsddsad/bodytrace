import { createHmac } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { smsRateLimit } from "@/db/schema";
import { getSmsCodeSettings } from "@/lib/sms-config";

export class SmsRateLimitError extends Error {
  constructor(public readonly retryAfterSeconds: number) {
    super("短信请求过于频繁，请稍后再试。");
  }
}

/** 在生成验证码前占用额度。失败与结果未知也计数，避免并发/超时造成重复计费。 */
export async function reserveSmsQuota(phoneNumber: string, trustedIp: string | null): Promise<void> {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("短信频控需要配置认证密钥");
  const digest = (value: string) => createHmac("sha256", secret).update(value).digest("hex").slice(0, 56);
  const day = 24 * 60 * 60 * 1000;
  // 顺序固定，所有实例先锁来源、再锁号码，避免锁顺序不同导致死锁。
  const buckets = [
    { id: `ip:${digest(trustedIp ?? "shared")}`, duration: 60_000, max: 5, cooldown: 0 },
    { id: `phone:${digest(phoneNumber)}`, duration: day, max: 10, cooldown: getSmsCodeSettings().rateLimitSeconds * 1000 },
  ];
  await db.transaction(async tx => {
    for (const bucket of buckets) {
      await tx.insert(smsRateLimit).values({
        id: bucket.id, windowStartedAt: sql`UTC_TIMESTAMP(3)`, count: 0, nextAllowedAt: sql`UTC_TIMESTAMP(3)`,
      }).onDuplicateKeyUpdate({ set: { id: sql`${smsRateLimit.id}` } });
      const [record] = await tx.select().from(smsRateLimit).where(eq(smsRateLimit.id, bucket.id)).for("update");
      // 获取连接和行锁都可能排队；持锁后读取数据库时钟，避免冷却时间在获准发送前已经过期。
      const [{ now }] = await tx.select({
        now: sql`UTC_TIMESTAMP(3)`.mapWith(smsRateLimit.windowStartedAt),
      }).from(smsRateLimit).where(eq(smsRateLimit.id, bucket.id));
      const expired = record.count === 0 || now.getTime() >= record.windowStartedAt.getTime() + bucket.duration;
      const count = expired ? 0 : record.count;
      const waitUntil = Math.max(
        record.nextAllowedAt.getTime(),
        count >= bucket.max ? record.windowStartedAt.getTime() + bucket.duration : 0,
      );
      if (waitUntil > now.getTime()) {
        throw new SmsRateLimitError(Math.max(1, Math.ceil((waitUntil - now.getTime()) / 1000)));
      }
      await tx.update(smsRateLimit).set({
        windowStartedAt: expired ? now : record.windowStartedAt,
        count: count + 1,
        nextAllowedAt: new Date(now.getTime() + bucket.cooldown),
      }).where(eq(smsRateLimit.id, bucket.id));
    }
  });
}
