import assert from "node:assert/strict";
import test from "node:test";
import Dysmsapi from "@alicloud/dysmsapi20170525";
import { createLoginSmsSender, isSmsConfigured, SmsDeliveryError } from "../src/lib/aliyun-sms.ts";

const environment = {
  ALIYUN_ACCESS_KEY_ID: "synthetic-access-key",
  ALIYUN_ACCESS_KEY_SECRET: "synthetic-secret",
  ALIYUN_SMS_SIGN_NAME: "测试签名",
  ALIYUN_SMS_TEMPLATE_CODE: "SMS_SYNTHETIC",
};
const phoneNumber = "+8613800138000";
const code = "012345";

function senderFor(response) {
  return createLoginSmsSender({
    environment,
    createClient: () => ({ sendSmsWithOptions: async () => response }),
  });
}

test("只在必需短信配置完整且非空时开放登录，STS token 可选", () => {
  assert.equal(isSmsConfigured(environment), true);
  assert.equal(isSmsConfigured({ ...environment, ALIYUN_SECURITY_TOKEN: "synthetic-token" }), true);
  for (const key of Object.keys(environment)) {
    assert.equal(isSmsConfigured({ ...environment, [key]: undefined }), false);
    assert.equal(isSmsConfigured({ ...environment, [key]: "  " }), false);
  }
});

test("用固定 code 模板参数发送单个大陆号码，启用 HTTPS 和证书校验，禁用重试并复用客户端", async () => {
  let created = 0;
  let sent = 0;
  const send = createLoginSmsSender({
    environment: { ...environment, ALIYUN_SECURITY_TOKEN: "synthetic-token" },
    createClient: config => {
      created += 1;
      assert.equal(config.endpoint, "dysmsapi.aliyuncs.com");
      assert.equal(config.protocol, "HTTPS");
      assert.equal(config.accessKeyId, environment.ALIYUN_ACCESS_KEY_ID);
      assert.equal(config.accessKeySecret, environment.ALIYUN_ACCESS_KEY_SECRET);
      assert.equal(config.securityToken, "synthetic-token");
      assert.equal(config.retryOptions.retryable, false);
      return {
        sendSmsWithOptions: async (request, runtime) => {
          sent += 1;
          assert.equal(request.phoneNumbers, "13800138000");
          assert.equal(request.signName, "测试签名");
          assert.equal(request.templateCode, "SMS_SYNTHETIC");
          assert.equal(request.templateParam, '{"code":"012345"}');
          assert.equal(runtime.autoretry, false);
          assert.equal(runtime.maxAttempts, 1);
          assert.equal(runtime.ignoreSSL, false);
          assert(runtime.connectTimeout >= 1_000 && runtime.connectTimeout <= 5_000);
          assert(runtime.readTimeout >= 1_000 && runtime.readTimeout <= 5_000);
          return { statusCode: 200, body: { code: "OK" } };
        },
      };
    },
  });
  await send(phoneNumber, code);
  await send(phoneNumber, code);
  assert.equal(created, 1);
  assert.equal(sent, 2);
});

test("Node.js 原生 TypeScript 能创建真实 SDK 客户端，替换发送方法后全程不访问网络", async context => {
  const Client = typeof Dysmsapi === "function" ? Dysmsapi : Dysmsapi.default;
  let sent = 0;
  context.mock.method(Client.prototype, "sendSmsWithOptions", async function (request) {
    sent += 1;
    assert.equal(this._endpoint, "dysmsapi.aliyuncs.com");
    assert.equal(this._protocol, "HTTPS");
    assert.equal(this._retryOptions.retryable, false);
    assert.equal(request.phoneNumbers, "13800138000");
    return { statusCode: 200, body: { code: "OK" } };
  });
  await createLoginSmsSender({ environment })(phoneNumber, code);
  assert.equal(sent, 1);
});

test("传输层接受 4 到 6 位数字验证码并保留前导零", async () => {
  const sentCodes = [];
  const send = createLoginSmsSender({
    environment,
    createClient: () => ({
      sendSmsWithOptions: async request => {
        sentCodes.push(JSON.parse(request.templateParam).code);
        return { statusCode: 200, body: { code: "OK" } };
      },
    }),
  });
  for (const otp of ["0123", "01234", "012345"]) await send(phoneNumber, otp);
  assert.deepEqual(sentCodes, ["0123", "01234", "012345"]);
});

test("HTTP 成功仍必须检查业务 Code，异常响应不能视为发送成功", async () => {
  for (const response of [
    { statusCode: 200, body: { code: "isv.BUSINESS_LIMIT_CONTROL" } },
    { statusCode: 200, body: { code: "isv.AMOUNT_NOT_ENOUGH" } },
    { statusCode: 200, body: {} },
    { statusCode: 200 },
    { statusCode: 500, body: { code: "OK" } },
    { statusCode: NaN, body: { code: "OK" } },
    { body: { code: "OK" } },
  ]) {
    await assert.rejects(senderFor(response)(phoneNumber, code), error => {
      assert(error instanceof SmsDeliveryError);
      assert.equal(error.code, "SMS_DELIVERY_FAILED");
      return true;
    });
  }
});

test("配置缺失与非法输入不创建客户端，不尝试发送", async () => {
  let created = 0;
  const createClient = () => { created += 1; throw new Error("不应创建客户端"); };
  await assert.rejects(createLoginSmsSender({ environment: {}, createClient })(phoneNumber, code), { code: "SMS_NOT_CONFIGURED" });
  const send = createLoginSmsSender({ environment, createClient });
  for (const [phone, otp] of [
    ["13800138000", code],
    ["+85212345678", code],
    [phoneNumber + ",13900139000", code],
    [phoneNumber, "123"],
    [phoneNumber, "1234567"],
    [phoneNumber, "12x456"],
  ]) {
    await assert.rejects(send(phone, otp), { code: "INVALID_SMS_INPUT" });
  }
  assert.equal(created, 0);
});

test("SDK 异常不泄漏敏感错误或自动重试", async () => {
  let sent = 0;
  const send = createLoginSmsSender({
    environment,
    createClient: () => ({
      sendSmsWithOptions: async () => {
        sent += 1;
        throw new Error(`private ${phoneNumber} ${code} ${environment.ALIYUN_ACCESS_KEY_SECRET}`);
      },
    }),
  });
  await assert.rejects(send(phoneNumber, code), error => {
    assert(error instanceof SmsDeliveryError);
    assert.equal(error.code, "SMS_DELIVERY_FAILED");
    assert.equal(error.message, "短信发送失败，请稍后重试。");
    assert.equal(error.cause, undefined);
    return true;
  });
  assert.equal(sent, 1);
});

test("请求无响应时结束等待并标记结果未知，迟到响应不触发再次发送", async () => {
  let sent = 0;
  let finish;
  const send = createLoginSmsSender({
    environment,
    timeoutMs: 30,
    createClient: () => ({
      sendSmsWithOptions: () => {
        sent += 1;
        return new Promise(resolve => { finish = resolve; });
      },
    }),
  });
  const started = performance.now();
  await assert.rejects(send(phoneNumber, code), { code: "SMS_DELIVERY_UNKNOWN" });
  assert(performance.now() - started < 1_000);
  finish({ statusCode: 200, body: { code: "OK" } });
  assert.equal(sent, 1);
});

test("SDK 底层超时和连接中断同样标记结果未知，不透传请求地址", async () => {
  for (const networkError of [
    Object.assign(new Error("含敏感查询参数的内部地址"), { name: "RequestTimeoutError" }),
    Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }),
  ]) {
    const send = createLoginSmsSender({
      environment,
      createClient: () => ({ sendSmsWithOptions: async () => { throw networkError; } }),
    });
    await assert.rejects(send(phoneNumber, code), error => {
      assert.equal(error.code, "SMS_DELIVERY_UNKNOWN");
      assert.equal(error.message, "短信发送结果暂时无法确认，请等待片刻后再试。");
      return true;
    });
  }
});

test("拒绝超过十秒或无效的等待时间", () => {
  for (const timeoutMs of [0, -1, 10_001, NaN, Infinity]) {
    assert.throws(() => createLoginSmsSender({ timeoutMs }), RangeError);
  }
});
