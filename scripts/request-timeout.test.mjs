import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createAuthClient } from "better-auth/react";
import { RequestTimeoutError, withRequestTimeout } from "../src/lib/request-timeout.ts";

async function withAuthServer(handler, run) {
  const server = createServer(handler);
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const client = createAuthClient({ baseURL: `http://127.0.0.1:${server.address().port}` });
  try {
    await run(client);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
}

function signIn(client, signal) {
  return client.signIn.email({
    email: "test@example.com", password: "password", fetchOptions: { signal },
  });
}

test("响应头已返回但 JSON 响应体卡住时，15 秒结束等待并断开请求", { timeout: 20_000 }, async () => {
  let closed;
  const connectionClosed = new Promise(resolve => { closed = resolve; });
  await withAuthServer((request, response) => {
    request.resume();
    response.on("close", closed);
    response.writeHead(200, { "Content-Type": "application/json" });
    response.write('{"token":');
    // 永远不结束响应，复现响应头之后的网络停滞。
  }, async client => {
    const started = performance.now();
    await assert.rejects(withRequestTimeout(signal => signIn(client, signal)), RequestTimeoutError);
    const elapsed = performance.now() - started;
    assert(elapsed >= 14_900 && elapsed < 18_000, `实际等待 ${elapsed}ms`);
    await Promise.race([
      connectionClosed,
      delay(1_000).then(() => { throw new Error("超时后底层连接仍未关闭"); }),
    ]);
  });
});

test("响应头未返回时同样能超时", async () => {
  await withAuthServer(request => request.resume(), async client => {
    await assert.rejects(withRequestTimeout(signal => signIn(client, signal), 100), RequestTimeoutError);
  });
});

test("成功和 401 仍使用认证客户端的正常返回值", async () => {
  for (const status of [200, 401]) {
    await withAuthServer((request, response) => {
      request.resume();
      response.writeHead(status, { "Content-Type": "application/json" });
      response.end(status === 200 ? '{"token":"test","user":{"id":"test"}}' : '{"message":"Invalid password"}');
    }, async client => {
      const result = await withRequestTimeout(signal => signIn(client, signal));
      assert.equal(result.error?.status ?? 200, status);
    });
  }
});

test("完成后清理计时器，不会随后取消已成功的操作", async () => {
  let requestSignal;
  assert.equal(await withRequestTimeout(async signal => {
    requestSignal = signal;
    return "ok";
  }, 30), "ok");
  await delay(60);
  assert.equal(requestSignal.aborted, false);
});

test("即使操作忽略取消信号，也会结束等待", async () => {
  await assert.rejects(withRequestTimeout(() => new Promise(() => {}), 30), RequestTimeoutError);
});

test("网络错误原样传递，且清理计时器", async () => {
  const error = new TypeError("fetch failed");
  let requestSignal;
  await assert.rejects(withRequestTimeout(async signal => {
    requestSignal = signal;
    throw error;
  }, 30), caught => caught === error);
  await delay(60);
  assert.equal(requestSignal.aborted, false);
});
