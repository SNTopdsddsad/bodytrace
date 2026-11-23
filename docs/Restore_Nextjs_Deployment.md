# 从 Go 切回 Next.js

网页统一使用 `https://www.aigcwe.com`，与当前 Go 部署的 `BETTER_AUTH_URL` 一致。`aigcwe.com` 保留旧 App 的 API 地址。先在独立预发环境用受控备份演练迁移与回滚。

## 准备发布目录和数据库

1. 记录当前 Go 镜像摘要、Compose 项目及服务名、发布环境文件、两个业务域名的 Caddy 配置和实际监听端口。保留能启动旧版本的文件。备份数据库和 Caddy 配置，验证数据库备份可以恢复。
2. 在服务器独立发布目录检出选定的 Next.js 提交。核对 Node 24 LTS（至少 24.22.1）、npm 和 PM2，执行 `npm ci` 和 `npm run lint`。发布前核对框架提示的安全更新。
3. 将 Next.js 的 `BETTER_AUTH_URL` 设为 `https://www.aigcwe.com`。以当前 Go 容器实际生效的配置为准，通过部署密钥管理器将 `BETTER_AUTH_SECRET`、数据库及第三方凭据原值注入构建、迁移和 PM2 启动进程。Go Compose 的 `env_file.format: raw` 会保留字面量，Next.js 的 `.env*` 会展开 `$变量`。直接复制 Go 环境文件或用 shell 的 `source` 加载都可能改变签名密钥。发布目录的 `.env*` 中应移除重复的凭据定义。

   若部署系统将原签名密钥挂载为只读文件，且文件仅含一行原值和一个结尾换行，可在发布用的 Bash 会话执行以下命令。在同一环境执行 `npm run build`，并让迁移和 PM2 启动继承这些变量。发布日志和验收记录只记检查结果。

   ```bash
   set +x
   IFS= read -r BETTER_AUTH_SECRET < /run/secrets/bodytrace-auth-key || exit 1
   [ -n "$BETTER_AUTH_SECRET" ] || exit 1
   export BETTER_AUTH_SECRET
   ```

   按 `.env.example` 核对时区、COS 桶、对象前缀和短信配置，确认 Node 进程可读 TLS 所需的 CA 文件。生产服务使用核实的数据库地址，本地开发使用端口 3307。
4. 读取 `SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at`，逐项比对 `drizzle/mysql/meta/_journal.json` 的时间戳和对应 SQL 的 SHA-256。通过 `SHOW CREATE TABLE bodytrace_meal_photo` 检查枚举顺序和索引。Go 版可能已在枚举末尾追加 `body`。若账本只到 `0008`，本次迁移还会运行 `0009` 建立历史训练表，随后 `0010` 将照片分组登记为五个值。若账本与实际结构有出入，先在预发副本查明原因。
5. 通知 App 维护者关闭身材照入口。`GET /api/v1/body-photos` 会返回 404，带 `type=body` 的上传会返回 400。历史身材照保留，普通餐次照片继续可用。
6. 开启维护前，在 Go 上登录合成账号。用其会话调用 `GET /api/auth/get-session`，记录返回的 `user.id`。将此次登录的签名 cookie 或响应头 `set-auth-token` 中的签名 Bearer 保存在受限测试客户端内，留到切换后复验。登录响应正文中的原始 token 无法验证签名密钥是否一致。

## 维护、迁移和启动

1. 两个域名使用同一维护条件。Go 仓库的 `deploy/caddy/bodytrace.Caddyfile` 使用 `/etc/caddy/bodytrace-maintenance` 作为开关。先建立标志，将规则合并到实际站点，执行 `sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` 并重载。对两个域名分别执行 Go 仓库的 `scripts/check-deployment.sh --maintenance https://域名`，确认网页、API 和写请求均返回 503。
2. 等在途上传、写请求与清理任务结束，再从原发布目录停止已核实的 Go API 服务。仓库的 Compose 部署使用 `docker compose --env-file .env.release stop --timeout 90 api`。确认旧上游已停止接单。
3. 在 Next.js 发布目录加载核对过的生产环境，执行一次 `npm run db:migrate`。检查新增迁移记录、照片枚举和历史训练表。若执行失败，保持维护并核对已生效的 DDL。MySQL 可能已提交其中一部分。
4. 启动单个 Node 上游。若旧 PM2 条目绑定了旧解释器，核对该应用后重新创建条目。可使用 `pm2 start npm --name bodytrace -- run start -- --hostname 127.0.0.1 --port 3000`，通过 `pm2 describe bodytrace` 核对工作目录和解释器。
5. 两个域名共用现有 Caddy `route`。保留最前面的维护 503 和公网探针 404，将以下规则放在它们之后、反向代理之前。备用域名的网页请求会携带原路径和查询参数跳到主域名。

   ```caddyfile
   @alternatePage {
       host aigcwe.com
       not path /api /api/*
   }
   redir @alternatePage https://www.aigcwe.com{uri} 307
   ```

6. 把后面的旧 `reverse_proxy @api 127.0.0.1:3100` 改为 `reverse_proxy 127.0.0.1:3000`，删除末尾的兜底 `respond 404`。这样主域名提供网页、静态资源和 API，两个域名的 `/api/*` 都直接到达同一上游。保留原代理的 Host、协议、上传超时和禁用写入重试的配置。由受控代理覆盖 `AUTH_TRUSTED_IP_HEADER` 指定的头，原样传递客户端的 `Origin`。校验、重载 Caddy，再次确认两个域名均返回维护 503。

## 验收和放行

- 维护期间从受控主机直连新上游，使用主域名 Host、公开 Origin 和切换前留存的 Go 签名凭据，全程沿用原会话。要求 `GET /api/auth/get-session` 返回非空对象且 `user.id` 与切换前一致，随后用同一凭据读取 `GET /api/v1/goals` 应返回 200。匿名的 get-session 也可能返回 200 和 `null`。若身份校验失败，保持维护，核对新进程的签名密钥来源、数据库目标及会话有效期后重试。
- 核对登录页、静态资源及匿名受保护接口的 401，分别用合成账号的浏览器 cookie 和 App Bearer 验证饮食和每日目标。
- 使用合成记录验证餐次照片、身体指标和趋势，核对照片接口的 `Cache-Control: private, no-store`。确认训练、计划和身材照接口返回 404。
- 确认只有 Next.js 接受业务写入后移除维护标志。用 `curl -sS -D - -o /dev/null 'https://aigcwe.com/diary?date=2026-11-22'` 检查首个响应为 307，且 `Location` 为 `https://www.aigcwe.com/diary?date=2026-11-22`。从该入口在浏览器登录合成账号，保存每日目标并刷新核对。
- 用旧 App 配置的原 API 域名和 Bearer 会话读取并保存合成账号的每日目标。两个域名的匿名 `GET /api/v1/goals` 都应直接返回 401，已登录的 `GET` 和 `PUT` 应直接返回 200；检查首个响应状态以识别意外重定向。记录切换时刻、应用提交和迁移位置。

## 回滚

重新建立维护标志并确认两个域名均返回 503。等待在途请求结束，停止本次启动的 PM2 应用。用保留的镜像和匹配环境恢复 Go 服务，检查本机 `/readyz`。恢复带维护规则的原 Caddy 分流，校验并重载。用合成账号验证旧版 API 与会话后解除维护。

应用回滚保留新增训练表、扩展后的照片枚举和已经提交的数据。若需要恢复数据库，先保存故障现场及切换后的写入，由数据库负责人核对恢复点与数据差额。
