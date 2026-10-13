/**
 * 个人资料服务：每用户一行身体数据，允许分次填写（字段可空）。
 * 纯类型/文案/估算公式在 lib/profile.ts，这里只做数据库读写。
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { userProfile } from "@/db/schema";
import type { BodyProfile } from "@/lib/profile";
import type { Measurement } from "@/lib/measurements";
import { getLatestMeasurement } from "./measurements";

/** 基础字段可为空；weightKg 兼容旧客户端，新页面从测量记录读取。 */
export const profileSchema = z.object({
  gender: z.enum(["male", "female", "other"]).nullable(),
  heightCm: z.number().min(50).max(280).nullable(),
  weightKg: z.number().min(20).max(500).nullable().optional(),
  targetWeightKg: z.number().min(20).max(500).nullable(),
});

export type Profile = BodyProfile;
export class ProfileWeightConflict extends Error {}

/** 资料连同最新测量体重一次读出，页面可直接区分体重来源，不必再查一次。 */
export type ProfileContext = { profile: Profile; latestWeight: Measurement | null };

export async function getProfileContext(userId: string): Promise<ProfileContext | null> {
  const [[row], latest] = await Promise.all([
    db.select().from(userProfile).where(eq(userProfile.userId, userId)),
    getLatestMeasurement(userId, "weight"),
  ]);
  if (!row && !latest) return null;
  const profile: Profile = {
    gender: row?.gender ?? null,
    heightCm: row?.heightCm ?? null,
    weightKg: latest?.value != null ? Number(latest.value) : row?.weightKg ?? null,
    targetWeightKg: row?.targetWeightKg ?? null,
  };
  return { profile, latestWeight: latest };
}

export async function getProfile(userId: string): Promise<Profile | null> {
  return (await getProfileContext(userId))?.profile ?? null;
}

export async function upsertProfile(userId: string, input: z.infer<typeof profileSchema>) {
  const latest = await getLatestMeasurement(userId, "weight");
  if (latest && input.weightKg !== undefined && input.weightKg !== Number(latest.value)) {
    throw new ProfileWeightConflict("当前体重来自测量记录，请到身体变化页面修改。");
  }
  const values = {
    gender: input.gender, heightCm: input.heightCm, targetWeightKg: input.targetWeightKg,
    ...(!latest && input.weightKg !== undefined ? { weightKg: input.weightKg } : {}),
  };
  await db
    .insert(userProfile)
    .values({ userId, ...values, updatedAt: new Date() })
    .onDuplicateKeyUpdate({
      set: { ...values, updatedAt: new Date() },
    });
  return getProfile(userId);
}
