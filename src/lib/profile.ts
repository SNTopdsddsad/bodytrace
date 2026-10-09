/**
 * 个人资料的共享类型与纯函数（客户端/服务端都可安全引用）。
 * 数据库读写见 services/profile.ts。
 */
export type Gender = "male" | "female" | "other";

export type BodyProfile = {
  gender: Gender | null;
  age: number | null;
  heightCm: number | null;
  weightKg: number | null;
  targetWeightKg: number | null;
};

export const GENDER_LABELS: Record<Gender, string> = {
  male: "男",
  female: "女",
  other: "不愿透露",
};

/**
 * Mifflin-St Jeor 公式：BMR = 10×体重kg + 6.25×身高cm − 5×年龄 + 性别常数。
 * 性别常数：男 +5、女 −161；不愿透露取两者中点 −78。
 * 身高/体重/年龄缺任一项就算不出来，返回 null 由调用方隐藏相关展示。
 */
export function estimateBmr(profile: BodyProfile): number | null {
  if (profile.heightCm == null || profile.weightKg == null || profile.age == null) return null;
  const genderOffset = profile.gender === "male" ? 5 : profile.gender === "female" ? -161 : -78;
  return Math.round(10 * profile.weightKg + 6.25 * profile.heightCm - 5 * profile.age + genderOffset);
}

/** BMI = 体重kg ÷ 身高m²，返回一位小数；缺身高或体重时为 null。 */
export function calcBmi(profile: BodyProfile): number | null {
  if (profile.heightCm == null || profile.weightKg == null || profile.heightCm <= 0) return null;
  const m = profile.heightCm / 100;
  return Math.round((profile.weightKg / (m * m)) * 10) / 10;
}

/** 中国成人 BMI 分级（WS/T 428-2013）。 */
export function bmiLabel(bmi: number): string {
  if (bmi < 18.5) return "偏瘦";
  if (bmi < 24) return "正常";
  if (bmi < 28) return "超重";
  return "肥胖";
}
