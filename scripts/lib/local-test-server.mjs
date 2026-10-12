import assert from "node:assert/strict";
import { createServer } from "node:http";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import next from "next";

const [project, workspace] = process.argv.slice(2);
assert(project && workspace && process.send, "测试服务器只能由测试入口创建");
const database = new URL(process.env.DATABASE_URL);
assert.equal(database.hostname, "127.0.0.1", "测试服务器只能连接固定的本地测试库");
let app;
let handler;
let stopping = false;
const server = createServer((request, response) => {
  if (!handler) {
    response.writeHead(503).end("测试应用正在启动");
    return;
  }
  handler(request, response).catch(error => {
    console.error(error);
    if (!response.headersSent) response.writeHead(500);
    response.end();
  });
});

async function shutdown(code = 0) {
  if (stopping) return;
  stopping = true;
  try {
    const closed = new Promise(resolveClose => server.close(resolveClose));
    server.closeAllConnections();
    await closed;
    await app?.close();
    await globalThis.bodytraceMySqlPool?.end();
  } finally {
    process.exit(code);
  }
}

process.on("message", message => { if (message?.type === "shutdown") void shutdown(); });
process.on("disconnect", () => void shutdown());
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown(130));

try {
  await new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const { port } = server.address();
  assert.notEqual(port, 3000);
  const base = `http://127.0.0.1:${port}`;
  process.env.BETTER_AUTH_URL = base;
  const { default: config } = await import(pathToFileURL(join(project, "next.config.ts")).href);
  app = next({
    dev: true, dir: project, hostname: "127.0.0.1", port, httpServer: server, turbopack: true,
    // 临时目录和共享的依赖都在此根目录内；用户应用的 .next/dev 不会被使用。
    conf: { ...config, turbopack: { ...config.turbopack, root: workspace } },
  });
  await app.prepare();
  handler = app.getRequestHandler();
  process.send({ type: "ready", base, pid: process.pid });
} catch (error) {
  process.send({ type: "startup-error", message: error.message });
  await shutdown(1);
}
