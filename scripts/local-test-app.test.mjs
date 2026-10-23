import assert from "node:assert/strict";
import test from "node:test";
import { resolveTestDatabaseUrl } from "./lib/local-test-app.mjs";

test("默认测试连接不采用云 DATABASE_URL，也不采用现有应用地址", () => {
  const url = new URL(resolveTestDatabaseUrl({
    DATABASE_URL: "mysql://user:example@cloud.example.com:3306/production",
    SMOKE_BASE_URL: "http://localhost:3000",
  }));
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "3307");
  assert.equal(url.pathname, "/bodytrace");
});

test("仅显式的本地 TEST_DATABASE_URL 可以修改测试库", () => {
  const url = new URL(resolveTestDatabaseUrl({ TEST_DATABASE_URL: "mysql://test:example@localhost:3310/isolated_test" }));
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.port, "3310");
  assert.equal(url.pathname, "/isolated_test");
});

test("拒绝云库、伪装的本地主机名、其他协议和缺少库名的配置", () => {
  for (const url of [
    "mysql://test:example@cloud.example.com:3306/body",
    "mysql://test:example@127.0.0.1.example.com:3306/body",
    "mysql://test:example@192.168.1.2:3306/body",
    "postgresql://test:example@localhost:5432/body",
    "mysql://test:example@localhost:3307/",
    "not-a-url",
  ]) {
    assert.throws(() => resolveTestDatabaseUrl({ TEST_DATABASE_URL: url }), /TEST_DATABASE_URL/);
  }
});

test("远程测试库必须显式开关、库名含 test 且不能复用生产库名", () => {
  const remote = "mysql://test:example@cloud.example.com:3306/body_test";
  assert.throws(
    () => resolveTestDatabaseUrl({ TEST_DATABASE_URL: remote }),
    /ALLOW_REMOTE_TEST_DATABASE=1/,
  );
  assert.throws(
    () => resolveTestDatabaseUrl({
      TEST_DATABASE_URL: "mysql://test:example@cloud.example.com:3306/body",
      ALLOW_REMOTE_TEST_DATABASE: "1",
    }),
    /必须包含 test/,
  );
  assert.throws(
    () => resolveTestDatabaseUrl({
      TEST_DATABASE_URL: remote,
      ALLOW_REMOTE_TEST_DATABASE: "1",
      DATABASE_URL: "mysql://prod:example@cloud.example.com:3306/body_test",
    }),
    /同一个库/,
  );

  const url = new URL(resolveTestDatabaseUrl({
    TEST_DATABASE_URL: remote,
    ALLOW_REMOTE_TEST_DATABASE: "1",
    DATABASE_URL: "mysql://prod:example@cloud.example.com:3306/body",
  }));
  assert.equal(url.hostname, "cloud.example.com");
  assert.equal(url.pathname, "/body_test");
});
