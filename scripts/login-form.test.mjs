import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";
import ts from "typescript";
import { maskPhoneNumber, normalizeMainlandPhoneNumber } from "../src/lib/phone-number.ts";
import { RequestTimeoutError } from "../src/lib/request-timeout.ts";

const source = ts.transpileModule(readFileSync(new URL("../src/components/app/login-form.tsx", import.meta.url), "utf8"), {
  compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText;

// 运行实际组件的事件处理器，使用内存 hook 状态隔离网络、路由和浏览器计时器。
function createLoginForm({ sendOtp = async () => ({ data: { status: true } }), verify, getSession, smsConfigured = true } = {}) {
  const hooks = [];
  const verifyCalls = [];
  const routeCalls = [];
  let hookIndex = 0;
  let now = 1_000_000;
  const jsx = (type, props) => ({ type, props });
  const exports = {};
  vm.runInNewContext(source, {
    exports,
    Date: { now: () => now },
    require: name => {
      if (name === "react") return {
        useState: initial => {
          const index = hookIndex++;
          if (!(index in hooks)) hooks[index] = initial;
          return [hooks[index], next => { hooks[index] = typeof next === "function" ? next(hooks[index]) : next; }];
        },
        useRef: initial => {
          const index = hookIndex++;
          return hooks[index] ??= { current: initial };
        },
        useEffect: () => {},
      };
      if (name === "react/jsx-runtime") return { jsx, jsxs: jsx, Fragment: "fragment" };
      if (name === "next/navigation") return { useRouter: () => ({ push: path => routeCalls.push(path), refresh: () => {} }) };
      if (name === "@/lib/auth-client") return { authClient: {
        phoneNumber: {
          sendOtp,
          verify: async args => {
            verifyCalls.push(args);
            return verify ? verify(args) : { data: { user: { phoneNumberVerified: true, phoneNumber: args.phoneNumber } } };
          },
        },
        getSession: getSession ?? (async () => ({ data: null })),
      } };
      if (name === "@/lib/phone-number") return { maskPhoneNumber, normalizeMainlandPhoneNumber };
      if (name === "@/lib/request-timeout") return {
        RequestTimeoutError,
        withRequestTimeout: callback => callback(new AbortController().signal),
      };
      return new Proxy({}, { get: (_, component) => component });
    },
  });
  function render() {
    hookIndex = 0;
    return exports.LoginForm({ smsConfigured, smsSettings: { codeLength: 6, expireMinutes: 5, rateLimitSeconds: 60 } });
  }
  function elements(node) {
    if (!node || typeof node !== "object") return [];
    const children = [node.props?.children].flat(Infinity);
    return [node, ...children.flatMap(child => elements(child))];
  }
  const find = predicate => {
    const element = elements(render()).find(predicate);
    assert.ok(element, "找不到预期控件");
    return element;
  };
  const input = id => find(element => element.props?.id === id);
  const sendButton = () => find(element => element.props?.onClick && element.props?.variant === "outline");
  return {
    input,
    sendButton,
    verifyCalls,
    routeCalls,
    changePhone: value => input("login-phone").props.onChange({ target: { value } }),
    changeCode: value => input("login-code").props.onChange({ target: { value } }),
    send: () => sendButton().props.onClick(),
    submit: () => find(element => element.type === "form").props.onSubmit({ preventDefault() {} }),
    advanceTime: milliseconds => { now += milliseconds; },
  };
}

test("刷新后无需本页发码也能填写并验证已有短信", async () => {
  const form = createLoginForm();
  form.changePhone("13800000000");
  assert.equal(form.input("login-code").props.disabled, false);
  form.changeCode("123456");
  await form.submit();
  assert.equal(form.verifyCalls.length, 1);
  assert.equal(form.verifyCalls[0].phoneNumber, "+8613800000000");
  assert.equal(form.verifyCalls[0].code, "123456");
  assert.equal(form.routeCalls[0], "/");
});

test("刷新后重发被 429 拒绝仍保留已有验证码并使用服务端剩余秒数", async () => {
  const form = createLoginForm({ sendOtp: async ({ fetchOptions }) => {
    fetchOptions.onResponse({ response: new Response(null, { status: 429, headers: { "Retry-After": "8" } }) });
    return { error: { status: 429, code: "SMS_RATE_LIMITED" } };
  } });
  form.changePhone("13800000000");
  form.changeCode("123456");
  await form.send();
  assert.equal(form.sendButton().props.children, "8 秒后重发");
  assert.equal(form.input("login-code").props.value, "123456");
  assert.equal(form.input("login-code").props.disabled, false);
  await form.submit();
  assert.equal(form.verifyCalls.length, 1);
});

test("同号冷却按规范化号码保留，换号不沿用其他号码的倒计时", async () => {
  const form = createLoginForm();
  form.changePhone("13800000000");
  await form.send();
  assert.equal(form.sendButton().props.children, "60 秒后重发");
  form.changePhone("13900000000");
  assert.equal(form.sendButton().props.disabled, false);
  await form.send();
  form.advanceTime(5000);
  form.changePhone("+8613800000000");
  assert.equal(form.sendButton().props.children, "55 秒后重发");
  assert.equal(form.sendButton().props.disabled, true);
});

test("明确发送拒绝不重新占用完整冷却，保留输入可重试", async () => {
  const form = createLoginForm({ sendOtp: async () => ({ error: { status: 400, code: "INVALID_PHONE_INPUT" } }) });
  form.changePhone("13800000000");
  form.changeCode("123456");
  await form.send();
  assert.equal(form.sendButton().props.disabled, false);
  assert.equal(form.input("login-code").props.value, "123456");
});

test("支持认证库 X-Retry-After 头", async () => {
  const form = createLoginForm({ sendOtp: async ({ fetchOptions }) => {
    fetchOptions.onResponse({ response: new Response(null, { status: 429, headers: { "X-Retry-After": "13" } }) });
    return { error: { status: 429 } };
  } });
  form.changePhone("13800000000");
  await form.send();
  assert.equal(form.sendButton().props.children, "13 秒后重发");
});

test("供应商失败与网络结果未知保留输入及对应号码的冷却", async () => {
  for (const sendOtp of [
    async () => ({ error: { status: 503, code: "SMS_SEND_FAILED" } }),
    async () => { throw new RequestTimeoutError(); },
  ]) {
    const form = createLoginForm({ sendOtp });
    form.changePhone("13800000000");
    form.changeCode("123456");
    await form.send();
    assert.equal(form.input("login-code").props.value, "123456");
    assert.equal(form.sendButton().props.children, "60 秒后重发");
    form.changePhone("13900000000");
    assert.equal(form.sendButton().props.disabled, false);
    form.changePhone("13800000000");
    assert.equal(form.sendButton().props.disabled, true);
  }
});

test("未发码时仍校验手机号、验证码位数和短信开放状态", async () => {
  const form = createLoginForm();
  form.changePhone("123");
  form.changeCode("123456");
  await form.submit();
  form.changePhone("13800000000");
  form.changeCode("12345");
  await form.submit();
  assert.equal(form.verifyCalls.length, 0);
  const disabled = createLoginForm({ smsConfigured: false });
  disabled.changePhone("13800000000");
  disabled.changeCode("123456");
  await disabled.submit();
  assert.equal(disabled.verifyCalls.length, 0);
});

test("验证结果未知先核对会话，不重新提交验证码", async () => {
  let sessionCalls = 0;
  const form = createLoginForm({
    verify: async () => { throw new RequestTimeoutError(); },
    getSession: async () => { sessionCalls++; return { data: null }; },
  });
  form.changePhone("13800000000");
  form.changeCode("123456");
  await form.submit();
  assert.equal(form.input("login-code").props.disabled, true);
  await form.submit();
  assert.equal(form.verifyCalls.length, 1);
  assert.equal(sessionCalls, 2);
});
