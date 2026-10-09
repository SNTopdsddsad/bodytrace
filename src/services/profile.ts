/**
 * 个人资料服务：每用户一行身体数据，允许分次填写（字段可空）。
 * 纯类型/文案/估算公式在 lib/profile.ts，这里只做数据库读写。
 */
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { userProfile } from "@/db/schema";
import type { BodyProfile } from "@/lib/profile";

/** 各字段都可省略（null = 未填写/清空），填了就必须在合理范围内。 */
export const profileSchema = z.object({
  gender: z.enum(["male", "female", "other"]).nullable(),
  age: z.number().int().min(5).max(120).nullable(),
  heightCm: z.number().min(50).max(280).nullable(),
  weightKg: z.number().min(20).max(500).nullable(),
  targetWeightKg: z.number().min(20).max(500).nullable(),
});

export type Profile = BodyProfile;

export async function getProfile(userId: string): Promise<Profile | null> {
  const [row] = await db.select().from(userProfile).where(eq(userProfile.userId, userId));
  if (!row) return null;
  const { gender, age, heightCm, weightKg, targetWeightKg } = row;
  return { gender, age, heightCm, weightKg, targetWeightKg };
}

export async function upsertProfile(userId: string, input: Profile) {
  await db
    .insert(userProfile)
    .values({ userId, ...input, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: userProfile.userId,
      set: { ...input, updatedAt: new Date() },
    });
  return input;
}
