import assert from "node:assert/strict";
import test from "node:test";
import { normalizeMainlandPhoneNumber, maskPhoneNumber } from "../src/lib/phone-number.ts";

test("大陆手机号统一为 +86，兼容首尾空白", () => {
  assert.equal(normalizeMainlandPhoneNumber("13800000000"), "+8613800000000");
  assert.equal(normalizeMainlandPhoneNumber(" +8619900000000 "), "+8619900000000");
});

test("拒绝海外号、短号、分隔符及非法字符，避免同号多种身份", () => {
  for (const input of ["", "+85299999999", "12345678901", "8613800000000", "138 0000 0000", "1380000000", "138000000000", "13800000000x"]) {
    assert.equal(normalizeMainlandPhoneNumber(input), null);
  }
});

test("手机号用于展示时脱敏", () => {
  assert.equal(maskPhoneNumber("+8613800000000"), "138****0000");
  assert.equal(maskPhoneNumber("invalid"), "未填写");
});
