/** 中国大陆手机号统一为 E.164；不猜测其他国家或地区的号码。 */
export function normalizeMainlandPhoneNumber(value: string): string | null {
  const input = value.trim();
  const national = input.startsWith("+86") ? input.slice(3) : input;
  return /^1[3-9]\d{9}$/.test(national) ? `+86${national}` : null;
}

export function maskPhoneNumber(value: string): string {
  const normalized = normalizeMainlandPhoneNumber(value);
  return normalized ? `${normalized.slice(3, 6)}****${normalized.slice(-4)}` : "未填写";
}
