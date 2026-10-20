export interface SmsCodeSettings {
  codeLength: number;
  expireMinutes: number;
  rateLimitSeconds: number;
}

type SmsSettingsEnvironment = Readonly<{
  [name: string]: string | undefined;
  SMS_CODE_LENGTH?: string;
  SMS_CODE_EXPIRE_MINUTES?: string;
  SMS_RATE_LIMIT_SECONDS?: string;
}>;

function integerSetting(name: string, value: string | undefined, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  const trimmed = value.trim();
  const parsed = Number(trimmed);
  if (!/^\d+$/.test(trimmed) || !Number.isSafeInteger(parsed) || parsed < min || parsed > max) {
    throw new Error(`${name} 必须是 ${min} 到 ${max} 之间的整数`);
  }
  return parsed;
}

/** 只在服务端读取环境变量，再把这三个公开参数传给登录表单。 */
export function getSmsCodeSettings(environment: SmsSettingsEnvironment = process.env): SmsCodeSettings {
  return {
    // 阿里云当前单变量验证码模板支持 4～6 位数字。
    codeLength: integerSetting("SMS_CODE_LENGTH", environment.SMS_CODE_LENGTH, 6, 4, 6),
    expireMinutes: integerSetting("SMS_CODE_EXPIRE_MINUTES", environment.SMS_CODE_EXPIRE_MINUTES, 5, 1, 30),
    rateLimitSeconds: integerSetting("SMS_RATE_LIMIT_SECONDS", environment.SMS_RATE_LIMIT_SECONDS, 60, 1, 3600),
  };
}
