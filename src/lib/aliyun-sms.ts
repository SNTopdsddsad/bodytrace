import Dysmsapi, { SendSmsRequest } from "@alicloud/dysmsapi20170525";
import { $OpenApiUtil } from "@alicloud/openapi-core";
import { RuntimeOptions } from "@darabonba/typescript";

type SmsEnvironment = Readonly<{
  [name: string]: string | undefined;
  ALIYUN_ACCESS_KEY_ID?: string;
  ALIYUN_ACCESS_KEY_SECRET?: string;
  ALIYUN_SECURITY_TOKEN?: string;
  ALIYUN_SMS_SIGN_NAME?: string;
  ALIYUN_SMS_TEMPLATE_CODE?: string;
}>;

interface SmsResponse {
  statusCode?: number;
  body?: { code?: string };
}

export interface LoginSmsClient {
  sendSmsWithOptions(request: SendSmsRequest, runtime: RuntimeOptions): Promise<SmsResponse>;
}

type SmsDeliveryErrorCode = "SMS_NOT_CONFIGURED" | "INVALID_SMS_INPUT" | "SMS_DELIVERY_FAILED" | "SMS_DELIVERY_UNKNOWN";

export class SmsDeliveryError extends Error {
  readonly code: SmsDeliveryErrorCode;

  constructor(code: SmsDeliveryErrorCode, message: string) {
    super(message);
    this.name = "SmsDeliveryError";
    this.code = code;
  }
}

function readSmsConfiguration(environment: SmsEnvironment) {
  const accessKeyId = environment.ALIYUN_ACCESS_KEY_ID?.trim();
  const accessKeySecret = environment.ALIYUN_ACCESS_KEY_SECRET?.trim();
  const signName = environment.ALIYUN_SMS_SIGN_NAME?.trim();
  const templateCode = environment.ALIYUN_SMS_TEMPLATE_CODE?.trim();
  if (!accessKeyId || !accessKeySecret || !signName || !templateCode) return null;
  return {
    accessKeyId,
    accessKeySecret,
    securityToken: environment.ALIYUN_SECURITY_TOKEN?.trim() || undefined,
    signName,
    templateCode,
  };
}

/** 只返回是否可用，调用方不接触短信密钥或缺失项。 */
export function isSmsConfigured(environment: SmsEnvironment = process.env): boolean {
  return readSmsConfiguration(environment) !== null;
}

// 官方 SDK 发布为 CommonJS；兼容 Next.js 打包与 Node.js 原生 TypeScript 测试。
function getClientConstructor(module: typeof Dysmsapi | { default: typeof Dysmsapi }): typeof Dysmsapi {
  return "default" in module ? module.default : module;
}

/** 注入客户端仅用于隔离测试；实际运行始终使用阿里云官方 SDK。 */
export function createLoginSmsSender(options: {
  environment?: SmsEnvironment;
  createClient?: (config: $OpenApiUtil.Config) => LoginSmsClient;
  timeoutMs?: number;
} = {}): (phoneNumber: string, code: string) => Promise<void> {
  const timeoutMs = options.timeoutMs ?? 8_000;
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || timeoutMs > 10_000) {
    throw new RangeError("短信发送等待时间必须在 0 到 10000 毫秒之间。");
  }
  let client: LoginSmsClient | undefined;

  return async (phoneNumber, code) => {
    const configuration = readSmsConfiguration(options.environment ?? process.env);
    if (!configuration) throw new SmsDeliveryError("SMS_NOT_CONFIGURED", "手机号登录暂未开放，请使用邮箱登录。");
    if (!/^\+861[3-9]\d{9}$/.test(phoneNumber) || !/^\d{4,6}$/.test(code)) {
      throw new SmsDeliveryError("INVALID_SMS_INPUT", "手机号或验证码格式不正确。");
    }

    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      client ??= (options.createClient ?? (config => {
        const Client = getClientConstructor(Dysmsapi);
        return new Client(config);
      }))(new $OpenApiUtil.Config({
        accessKeyId: configuration.accessKeyId,
        accessKeySecret: configuration.accessKeySecret,
        securityToken: configuration.securityToken,
        endpoint: "dysmsapi.aliyuncs.com",
        protocol: "HTTPS",
        connectTimeout: 3_000,
        readTimeout: 5_000,
        retryOptions: { retryable: false, retryCondition: [], noRetryCondition: [] },
      }));
      const request = new SendSmsRequest({
        phoneNumbers: phoneNumber.slice(3),
        signName: configuration.signName,
        templateCode: configuration.templateCode,
        templateParam: JSON.stringify({ code }),
      });
      // SendSms 没有幂等能力；网络或接口错误均不自动重试，以免重复发送和计费。
      const runtime = new RuntimeOptions({
        autoretry: false,
        maxAttempts: 1,
        connectTimeout: 3_000,
        readTimeout: 5_000,
        ignoreSSL: false,
      });
      const response = await Promise.race([
        client.sendSmsWithOptions(request, runtime),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new SmsDeliveryError(
            "SMS_DELIVERY_UNKNOWN",
            "短信发送结果暂时无法确认，请等待片刻后再试。",
          )), timeoutMs);
        }),
      ]);
      if (response.statusCode === undefined || !(response.statusCode >= 200 && response.statusCode < 300) || response.body?.code !== "OK") {
        throw new SmsDeliveryError("SMS_DELIVERY_FAILED", "短信发送失败，请稍后重试。");
      }
    } catch (error) {
      if (error instanceof SmsDeliveryError) throw error;
      if (error instanceof Error && (
        error.name === "RequestTimeoutError"
        || ("code" in error && ["ETIMEDOUT", "ECONNRESET", "ESOCKETTIMEDOUT", "RequestTimeout"].includes(String(error.code)))
      )) {
        throw new SmsDeliveryError("SMS_DELIVERY_UNKNOWN", "短信发送结果暂时无法确认，请等待片刻后再试。");
      }
      // SDK 错误可能包含手机号、请求参数或鉴权信息，不能透传或写入日志。
      throw new SmsDeliveryError("SMS_DELIVERY_FAILED", "短信发送失败，请稍后重试。");
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };
}

const loginSmsSender = createLoginSmsSender();

export async function sendLoginSms(phoneNumber: string, code: string): Promise<void> {
  await loginSmsSender(phoneNumber, code);
}
