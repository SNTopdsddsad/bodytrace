import { createHmac, timingSafeEqual } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { verification } from "@/db/schema";
import { getSmsCodeSettings } from "@/lib/sms-config";

const allowedAttempts = 3;
const challengeValue = z.object({
  codeHash: z.string().regex(/^[a-f0-9]{64}$/),
  attempts: z.number().int().min(0).max(allowedAttempts),
}).strict();

export type SmsVerificationResult = "valid" | "invalid" | "expired" | "missing" | "attempts-exceeded";

function parseChallengeValue(value: string): z.infer<typeof challengeValue> | null {
  try {
    const parsed = challengeValue.safeParse(JSON.parse(value));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

function verificationContext(phoneNumber: string, code: string) {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (!secret) throw new Error("短信验证码需要配置认证密钥");
  const digest = (value: string) => createHmac("sha256", secret).update(value).digest("hex");
  return {
    // 与 Better Auth 按手机号存储的记录隔离，插件后续清理不会删除刚重发的新码。
    id: `sms-login:${digest(`phone:${phoneNumber}`)}`,
    codeHash: digest(`code:${phoneNumber}:${code}`),
  };
}

/** 固定主键的原子替换与验证共用行锁；只保存带服务端密钥的摘要。 */
export async function saveSmsVerification(phoneNumber: string, code: string): Promise<void> {
  const { id, codeHash } = verificationContext(phoneNumber, code);
  const expiresInMs = getSmsCodeSettings().expireMinutes * 60_000;
  await db.transaction(async tx => {
    const insertedAt = new Date();
    await tx.insert(verification).values({
      id, identifier: id, value: "", expiresAt: insertedAt,
      createdAt: insertedAt, updatedAt: insertedAt,
    }).onDuplicateKeyUpdate({ set: { id: sql`${verification.id}` } });
    // insert/upsert 已取得主键行锁，排队时间不能消耗新验证码的有效期。
    const now = new Date();
    await tx.update(verification).set({
      value: JSON.stringify({ codeHash, attempts: 0 }),
      expiresAt: new Date(now.getTime() + expiresInMs),
      createdAt: now,
      updatedAt: now,
    }).where(eq(verification.id, id));
  });
}

/** 事务提交后才由认证层抛错，保证错误次数不会随 APIError 回滚。 */
export async function consumeSmsVerification(phoneNumber: string, code: string): Promise<SmsVerificationResult> {
  const { id, codeHash } = verificationContext(phoneNumber, code);
  return db.transaction(async tx => {
    const [record] = await tx.select().from(verification).where(eq(verification.id, id)).for("update");
    if (!record) return "missing";
    const now = new Date();
    if (record.expiresAt.getTime() <= now.getTime()) {
      await tx.delete(verification).where(eq(verification.id, id));
      return "expired";
    }
    const value = parseChallengeValue(record.value);
    if (!value) {
      await tx.delete(verification).where(eq(verification.id, id));
      return "missing";
    }
    if (value.attempts >= allowedAttempts) {
      await tx.delete(verification).where(eq(verification.id, id));
      return "attempts-exceeded";
    }
    if (!timingSafeEqual(Buffer.from(value.codeHash, "hex"), Buffer.from(codeHash, "hex"))) {
      // 不删除再插入，避免错误校验把已被重发替换的旧验证码重新写回。
      await tx.update(verification).set({
        value: JSON.stringify({ codeHash: value.codeHash, attempts: value.attempts + 1 }),
        updatedAt: now,
      }).where(eq(verification.id, id));
      return "invalid";
    }
    await tx.delete(verification).where(eq(verification.id, id));
    return "valid";
  });
}
