import assert from "node:assert/strict";
import { fork, execFile } from "node:child_process";
import { randomBytes } from "node:crypto";
import { cp, mkdir, mkdtemp, readFile, realpath, rm, symlink, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { createMySqlPool } from "../../src/db/connection.ts";

const run = promisify(execFile);
const workspace = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const runsDirectory = join(workspace, ".next", "test-projects");
const defaultDatabaseUrl = "mysql://bodytrace:bodytrace@127.0.0.1:3307/bodytrace";

/** 测试不读取 .env，也不接受应用的 DATABASE_URL 或 SMOKE_BASE_URL。 */
export function resolveTestDatabaseUrl(env = process.env) {
  let url;
  try {
    url = new URL(env.TEST_DATABASE_URL ?? defaultDatabaseUrl);
  } catch {
    throw new Error("TEST_DATABASE_URL 必须是有效的本地 MySQL 连接串");
  }
  if (url.protocol !== "mysql:" || !["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname.length < 2) {
    throw new Error("TEST_DATABASE_URL 仅允许 localhost 或 127.0.0.1 的 MySQL 测试库");
  }
  // 固定回环地址，避免 localhost 的解析配置把测试连接转向其他机器。
  url.hostname = "127.0.0.1";
  return url.href;
}

async function removeTestProject(project) {
  const root = await realpath(runsDirectory);
  const target = await realpath(project);
  assert(target.startsWith(root + sep), "只能清理本次创建的临时测试目录");
  // 先断开依赖目录链接，递归清理不会触及原项目的 node_modules。
  await unlink(join(project, "node_modules")).catch(error => {
    if (error.code !== "ENOENT") throw error;
  });
  await rm(target, { recursive: true, force: true });
}

/** 独立目录、独立进程、自动端口；应用与清理连接共用同一个测试连接串。 */
export async function startLocalTestApp() {
  const databaseUrl = resolveTestDatabaseUrl();
  const environment = {
    ...process.env,
    DATABASE_URL: databaseUrl,
    DATABASE_SSL: "",
    DATABASE_SSL_CA_FILE: "",
    BETTER_AUTH_SECRET: randomBytes(32).toString("hex"),
    NODE_ENV: "development",
    APP_TIMEZONE: "Asia/Shanghai",
    AUTH_TRUSTED_IP_HEADER: "",
  };
  // 父进程只负责测试 SQL 和清理，配置与子进程完全一致。
  process.env.DATABASE_URL = databaseUrl;
  process.env.DATABASE_SSL = "";
  process.env.DATABASE_SSL_CA_FILE = "";
  const pool = createMySqlPool(1);
  let project;
  let server;
  let listenerPid;
  let stopPromise;
  let exited;

  const stop = () => stopPromise ??= (async () => {
    if (server && server.exitCode === null && server.signalCode === null) {
      if (server.connected) server.send({ type: "shutdown" }, () => {});
      const graceful = await Promise.race([
        exited.then(() => true),
        new Promise(resolveTimeout => {
          const timer = setTimeout(() => resolveTimeout(false), 10_000);
          timer.unref();
        }),
      ]);
      if (!graceful) {
        // worker 本身就是 HTTP 监听进程；只结束我们创建并记录的 PID。
        const ownedPid = listenerPid ?? server.pid;
        assert.equal(ownedPid, server.pid);
        if (process.platform === "win32") {
          await run("taskkill", ["/PID", String(ownedPid), "/T", "/F"], { windowsHide: true });
        } else {
          server.kill("SIGKILL");
        }
        await exited;
      }
    }
    if (project) await removeTestProject(project);
  })();

  try {
    // 先验证本地连接，应用启动前完成迁移和必要的公开参考数据初始化。
    await pool.query("SELECT 1");
    await run(process.execPath, [join(workspace, "node_modules/drizzle-kit/bin.cjs"), "migrate"], {
      cwd: workspace, env: environment, windowsHide: true, timeout: 60_000,
    });
    const [[reference]] = await pool.query("SELECT COUNT(*) AS count FROM bodytrace_food_reference");
    if (reference.count === 0) {
      await run(process.execPath, [join(workspace, "scripts/import-food-reference.mjs")], {
        cwd: workspace, env: environment, windowsHide: true, timeout: 60_000,
      });
    }

    await mkdir(runsDirectory, { recursive: true });
    project = await mkdtemp(join(runsDirectory, "mysql-"));
    for (const path of ["src", "public", "package.json", "package-lock.json", "tsconfig.json", "next.config.ts"]) {
      await cp(join(workspace, path), join(project, path), { recursive: true });
    }
    // 开发编译器会独立读取配置文件，因此根目录也必须写进临时副本。
    const configPath = join(project, "next.config.ts");
    const configSource = await readFile(configPath, "utf8");
    assert(configSource.includes("root: process.cwd(),"), "测试应用需要同步 next.config.ts 的 Turbopack 根目录设置");
    await writeFile(configPath, configSource.replace("root: process.cwd(),", `root: ${JSON.stringify(workspace)},`));
    // 不复制 .env、构建产物或用户资料，只共享安装好的依赖。
    await symlink(join(workspace, "node_modules"), join(project, "node_modules"), process.platform === "win32" ? "junction" : "dir");
    server = fork(join(workspace, "scripts/lib/local-test-server.mjs"), [project, workspace], {
      cwd: project, env: environment, windowsHide: true, stdio: ["ignore", "pipe", "pipe", "ipc"],
    });
    exited = new Promise(resolveExit => server.once("exit", resolveExit));
    let output = "";
    const collect = chunk => { output = (output + chunk.toString()).slice(-12_000); };
    server.stdout.on("data", collect);
    server.stderr.on("data", collect);

    const ready = await new Promise((resolveReady, rejectReady) => {
      const finish = (callback, value) => {
        clearTimeout(timer);
        server.off("error", onError);
        server.off("exit", onExit);
        server.off("message", onMessage);
        callback(value);
      };
      const onError = error => finish(rejectReady, error);
      const onExit = code => finish(rejectReady, new Error(`独立测试应用提前退出 (${code})\n${output}`));
      const onMessage = message => {
        if (message?.type === "ready") {
          finish(resolveReady, message);
        } else if (message?.type === "startup-error") {
          finish(rejectReady, new Error(`独立测试应用启动失败\n${message.message}\n${output}`));
        }
      };
      const timer = setTimeout(() => finish(rejectReady, new Error("独立测试应用启动超时")), 60_000);
      server.once("error", onError);
      server.once("exit", onExit);
      server.on("message", onMessage);
    });
    assert.equal(ready.pid, server.pid, "只接受自己启动的 HTTP 监听进程");
    listenerPid = ready.pid;
    const base = new URL(ready.base);
    assert.equal(base.hostname, "127.0.0.1");
    assert.notEqual(base.port, "3000", "测试不能占用用户的 3000 端口");
    const response = await fetch(new URL("/login", base), { signal: AbortSignal.timeout(45_000) });
    assert.equal(response.status, 200, `独立测试应用无法正常加载\n${output}`);
    console.log(`测试应用 ${base.origin}，监听 PID ${listenerPid}，连接本地 MySQL。`);
    return { base: base.origin, pool, stop };
  } catch (error) {
    try { await stop(); } finally { await pool.end(); }
    throw error;
  }
}
