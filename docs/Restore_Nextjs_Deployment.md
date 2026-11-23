# 从 Go 切回 Next.js

在维护窗口将网页、认证和业务 API 切换到同一域名下的 Next.js 服务。先在独立预发环境用受控备份演练迁移与回滚。

## 准备发布目录和数据库

1. 记录当前 Go 镜像摘要、Compose 项目及服务名、发布环境文件、两个业务域名的 Caddy 配置和实际监听端口。保留能启动旧版本的文件。备份数据库和 Caddy 配置，验证数据库备份可以恢复。
2. 在服务器独立发布目录检出选定的 Next.js 提交。核对 Node 24 LTS（至少 24.22.1）、npm 和 PM2，在该机执行 `npm ci`、`npm run lint` 和 `npm run build`。发布前核对框架提示的安全更新。
3. 按 `.env.example` 核对数据库、公开 HTTPS 应用地址、认证签名密钥、时区、COS 桶、对象前缀和短信配置。确认 Node 进程可读 TLS 所需的 CA 文件。保留原有会话签名和照片地址。端口 3307 是本地开发配置，生产服务使用核实的数据库地址。
4. 读取 `SELECT id, hash, created_at FROM __drizzle_migrations ORDER BY created_at`，逐项比对 `drizzle/mysql/meta/_journal.json` 的时间戳和对应 SQL 的 SHA-256。通过 `SHOW CREATE TABLE bodytrace_meal_photo` 检查枚举顺序和索引。Go 版可能已在枚举末尾追加 `body`。若账本只到 `0008`，本次迁移还会运行 `0009` 建立历史训练表，随后 `0010` 将照片分组登记为五个值。若账本与实际结构有出入，先在预发副本查明原因。
5. 通知 App 维护者关闭身材照入口。`GET /api/v1/body-photos` 会返回 404，带 `type=body` 的上传会返回 400。历史身材照保留，普通餐次照片继续可用。

## 维护、迁移和启动

1. 两个域名使用同一维护条件。Go 仓库的 `deploy/caddy/bodytrace.Caddyfile` 使用 `/etc/caddy/bodytrace-maintenance` 作为开关。先建立标志，将规则合并到实际站点，执行 `sudo caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile` 并重载。对两个域名分别执行 Go 仓库的 `scripts/check-deployment.sh --maintenance https://域名`，确认网页、API 和写请求均返回 503。
2. 等在途上传、写请求与清理任务结束，再从原发布目录停止已核实的 Go API 服务。仓库的 Compose 部署使用 `docker compose --env-file .env.release stop --timeout 90 api`。确认旧上游已停止接单。
3. 在 Next.js 发布目录加载核对过的生产环境，执行一次 `npm run db:migrate`。检查新增迁移记录、照片枚举和历史训练表。若执行失败，保持维护并核对已生效的 DDL。MySQL 可能已提交其中一部分。
4. 启动单个 Node 上游。若旧 PM2 条目绑定了旧解释器，核对该应用后重新创建条目。可使用 `pm2 start npm --name bodytrace -- run start -- --hostname 127.0.0.1 --port 3000`，通过 `pm2 describe bodytrace` 核对工作目录和解释器。
5. 在维护规则之后，将网页、`/_next/*`、`/api/auth/*` 和 `/api/v1/*` 统一反代到 `127.0.0.1:3000`。移除旧版按 API 分流和其余路径返回 404 的规则，保留其他站点。保持 Host、HTTPS 协议和上传超时。启用 `AUTH_TRUSTED_IP_HEADER` 时，由受控代理覆盖同名头。校验、重载 Caddy，再次证明公网仍返回 503。

## 验收和放行

- 维护期间直连新上游核对登录页、静态资源和受保护接口的 401。使用合成账号、正确的 Host 和公开 Origin 核对会话、饮食和每日目标，分别验证浏览器 cookie 和 App 的 Bearer 调用。
- 使用合成记录验证餐次照片、身体指标和趋势，核对照片接口的 `Cache-Control: private, no-store`。确认训练、计划和身材照接口返回 404。
- 确认只有 Next.js 接受业务写入，移除维护标志。分别验证两个域名的网页与 App 读写，记录切换时刻、应用提交和迁移位置。

## 回滚

重新建立维护标志并确认两个域名均返回 503。等待在途请求结束，停止本次启动的 PM2 应用。用保留的镜像和匹配环境恢复 Go 服务，检查本机 `/readyz`。恢复带维护规则的原 Caddy 分流，校验并重载。用合成账号验证旧版 API 与会话后解除维护。

应用回滚保留新增训练表、扩展后的照片枚举和已经提交的数据。若需要恢复数据库，先保存故障现场及切换后的写入，由数据库负责人核对恢复点与数据差额。
