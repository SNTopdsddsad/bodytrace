<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# 开发服务器使用约定

- 3000 端口留给用户自己的 `npm run dev`。注意：Next 16 对同一项目目录加锁，**整个目录同时只能跑一个 dev server**——用户 server 在跑时，自己在别的端口也起不来。
- 验证/冒烟前先用 `netstat` 检查 3000：已有监听（用户的 server）就直接对它发请求（dev 按请求编译当前工作区代码，即是最新）；没有监听才自己启动，并在启动后记录监听 PID。
- 结束时只停自己启动的进程（按记录的 PID）；**永远不要杀 3000 端口上的进程**——它可能是用户自己起的。
- 后台任务的 TaskStop 只能杀掉 npm 外壳，node 子进程会存活；所以必须记录真实监听 PID，而不是依赖任务停止。
