import assert from "node:assert/strict";
import test from "node:test";
import { getSmsCodeSettings } from "../src/lib/sms-config.ts";

const defaults = { codeLength: 6, expireMinutes: 5, rateLimitSeconds: 60 };
const settings = [
  { variable: "SMS_CODE_LENGTH", field: "codeLength", minimum: 4, maximum: 6 },
  { variable: "SMS_CODE_EXPIRE_MINUTES", field: "expireMinutes", minimum: 1, maximum: 30 },
  { variable: "SMS_RATE_LIMIT_SECONDS", field: "rateLimitSeconds", minimum: 1, maximum: 3600 },
];

test("未提供短信配置时采用 6 位、5 分钟和 60 秒", () => {
  assert.deepEqual(getSmsCodeSettings({}), defaults);
  assert.deepEqual(getSmsCodeSettings({
    SMS_CODE_LENGTH: undefined,
    SMS_CODE_EXPIRE_MINUTES: undefined,
    SMS_RATE_LIMIT_SECONDS: undefined,
  }), defaults);
});

test("读取自定义短信配置并允许整数两侧空白", () => {
  assert.deepEqual(getSmsCodeSettings({
    SMS_CODE_LENGTH: " 4 ",
    SMS_CODE_EXPIRE_MINUTES: " 2 ",
    SMS_RATE_LIMIT_SECONDS: " 15 ",
  }), { codeLength: 4, expireMinutes: 2, rateLimitSeconds: 15 });
});

for (const { variable, field, minimum, maximum } of settings) {
  test(`${variable} 接受上下界且只覆盖对应配置`, () => {
    for (const value of [minimum, maximum]) {
      assert.deepEqual(getSmsCodeSettings({ [variable]: String(value) }), { ...defaults, [field]: value });
    }
  });

  test(`${variable} 拒绝空、非整数及越界值`, () => {
    for (const value of ["", " ", "0", "-1", "1.5", "NaN", "Infinity", "abc", String(minimum - 1), String(maximum + 1)]) {
      assert.throws(() => getSmsCodeSettings({ [variable]: value }), error => {
        assert(error instanceof Error);
        assert(error.message.includes(variable), "配置错误应指出具体环境变量");
        return true;
      }, `${variable}=${JSON.stringify(value)} 不应回落到默认值`);
    }
  });
}
