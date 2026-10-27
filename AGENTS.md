<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# BodyTrace Agent 协作约定

本文件适用于整个仓库。沟通、说明和新增项目文档默认使用中文；代码标识符沿用现有英文命名。按用户当前任务增量开发，一次完成一条可用、可验证的流程。

## 开工前先确认

- 先看 `git status --short`，保留用户已有的修改；不要覆盖、回滚或顺手整理与任务无关的内容。
- 阅读 `package.json`、相关源码和必要文档，以仓库实际安装版本及实现为准。修改 Next.js 代码前必须读本机 `node_modules/next/dist/docs/` 中对应指南，保留本文件顶部的 Next.js 自动维护区块。
- [README.md](README.md)：当前已实现功能、本地环境、命令和接口入口。
- [开发指南](docs/BodyTrace_Nextjs_MySQL_Development_Guide.md)：架构、数据语义、权限、迁移和后续路线。
- [产品与界面设计指南](docs/BodyTrace_Product_UI_Design_Guide.md)：产品方向、视觉、交互状态和页面验收。
- [API 参考](docs/BodyTrace_API_Reference.md)：已实现业务接口按模块分类的契约、参数校验与响应示例。
- 两份指南包含后续规划。当前已实现体重、体脂率、血压持续记录；训练已支持力量逐组与有氧、自动保存草稿、补录和历史维护；报告、时间线、OCR、助手和 SwiftUI 客户端仍是规划，也不要为无关任务提前添加空接口、占位入口或新目录体系。
- 开始修改前简要说明用户行为、变更范围和验证方式；遇到会影响范围或数据契约的冲突，说明差异并按当前任务对齐。

## 当前技术与目录

- 运行时使用 Node.js 24 LTS（≥24.22.1）。仓库根目录的 `.nvmrc`（`24`）与 `package.json` 的 `engines` 固定主版本，本机、构建机与服务器保持同一大版本，切换前先 `nvm use` / `fnm use`；服务器升级 Node 后要 `pm2 delete` 再 `pm2 start`，否则仍可能跑旧解释器。包管理使用 npm 和 `package-lock.json`，已有锁文件时用 `npm ci` 安装。新增或调整依赖时说明用途，并同步锁文件；不要同时引入其他包管理器的锁文件。
- 当前框架为 Next.js 16 App Router、React 19、TypeScript strict。UI 使用 Tailwind CSS v4、shadcn/ui（`base-nova` / Base UI）、Lucide 和 Recharts。
- 数据库使用 MySQL、Drizzle ORM 和 mysql2；认证使用 Better Auth；输入校验使用 Zod。具体依赖版本以 `package.json` 和锁文件为准。

| 路径 | 职责 |
| --- | --- |
| `src/app/(auth)/` | 登录、注册、密码找回与重置页面 |
| `src/app/(app)/` | 需要登录的业务页面及共用布局 |
| `src/app/api/auth/[...all]/` | Better Auth 路由入口 |
| `src/app/api/v1/` | 网页客户端与未来 App 共用的业务 HTTP API |
| `src/services/` | 共用业务规则、资源归属、事务和查询；目前 Zod schema 也在这里 |
| `src/db/` | 表定义、连接配置、连接池和注册预置数据 |
| `src/lib/` | 认证、API 封装、日期、营养、计划和资料计算等共用工具 |
| `src/components/app/` | 业务交互与展示组件 |
| `src/components/ui/` | shadcn 基础组件，先复用，必要时再修改 |
| `drizzle/mysql/` | 当前 MySQL SQL 迁移及元数据 |
| `scripts/` | 维护、导入和测试脚本，`scripts/lib/` 提供隔离测试应用 |
| `data/` | 公开食物参考数据；保留来源，不混入用户资料 |

## 代码与接口边界

- 沿用现有风格与 `@/` 路径别名（指向 `src/`）。保持明确类型，避免用 `any`、类型断言或关闭 lint 来掩盖错误。
- 页面与布局默认使用 Server Components；只有事件、状态、浏览器 API 等交互部分添加 `"use client"`。客户端不能导入数据库、服务端认证或密钥模块。
- 服务端页面直接调用 `src/services/`，不要通过 HTTP 请求自己的 `/api/v1`。浏览器业务请求优先复用 `src/lib/api-client.ts`；认证复用 `auth-client.ts` 和已有请求超时工具。
- Route Handler 负责会话、参数解析、运行时校验、HTTP 状态与响应；业务规则、归属检查和事务放在服务层，避免页面与 API 各自维护一套计算。
- 动态路由的 `params`、页面 `searchParams` 及 `headers()`、`cookies()` 按当前 Next.js 文档使用异步 API。当前 `next.config.ts` 关闭 `cacheComponents`；改缓存策略前确认会话和按用户读取数据的行为。
- 业务接口沿用 `/api/v1`、camelCase 和现有响应封装（如 `{ foods }`、`{ entry }`、`{ error }`）。API 已面向未来客户端，不为方便页面随意改变字段、单位或响应类型。
- 服务端使用 Zod 校验请求体，校验查询参数和路由参数；客户端校验不能替代服务端校验。沿用 `invalidBody()`、`unauthorized()` 等共用处理，保留明确的 400、401、404 等状态。

## 认证与数据归属

- 读取接口通过 `getSession()` 验证身份；写入接口复用 `requireSession(request)` 的会话与 Origin 检查。认证配置和 bearer 支持集中在 `src/lib/auth.ts`，不要另建平行认证流程。
- `userId` 来自服务端验证的会话，不接受客户端指定的数据所有者。服务函数接收明确的 `userId`，所有私人数据的列表、搜索、聚合、更新和删除都加归属条件。
- 对单条资源同时检查资源 ID 与用户 ID；对引用的食物等关联资源同样核对归属。沿用“不存在”的返回方式处理他人的资源，避免泄露其存在。
- `(app)/layout.tsx` 的登录守卫不能替代页面数据读取、API 和服务层的检查。公共食物参考库是共享只读资料，不代表个人食物库可以跨账号访问。
- 不通过关闭 CSRF、放宽 Origin、信任任意转发 IP 或吞掉错误让测试通过。`AUTH_TRUSTED_IP_HEADER` 仅用于受控生产代理，开发模式保持忽略客户端转发 IP 的现有行为。
- 当前密码找回只在开发模式且应用地址为回环地址时输出链接，生产尚未开放。维护时保留一次性令牌、过期、其他令牌作废与旧会话失效行为，不把重置链接写进交付说明或测试截图。

## 业务数据约定

- 食物库营养值按每 100g 保存；实际摄入按克数折算，热量为 kcal，蛋白质、碳水和脂肪为 g。复用 `src/lib/nutrition.ts` 的换算、舍入和餐次定义。
- 饮食记录保存写入时的食物名称和营养快照。改食物或删食物不能回写旧记录；改记录克数按该记录已有快照缩放，食物已删除时仍应可操作。
- 当日目标统一通过 `getGoalsForDate()` 解析：生效的饮食计划按日期对应的周几取目标，否则回落到每日目标。首页、日记和趋势必须保持一致。
- 计划里的三餐食物只保存食物引用、名称与克数，营养按食物库当前值实时折算，不存快照；食物被删后该行保留名称与克数、营养为空，不能当成 0 计入合计。
- 当前饮食计划没有历史版本模型，历史目标会按当前配置解析；开发指南中的“保留历史目标”是后续要求。涉及计划版本或历史语义的任务须一并设计数据迁移和验证，不能仅修改文案就声称已经支持。
- 业务日期保存为 `YYYY-MM-DD`，今天按 `APP_TIMEZONE`（默认 `Asia/Shanghai`）计算，日期工具集中在 `src/lib/date.ts`。MySQL DATE 保持字符串，事件时间、驱动及数据库会话使用 UTC；不要让服务器本地时区改变饮食日期。
- 新增饮食记录沿用不能记录未来日期的校验。日期、跨月、跨年和跨午夜行为有变化时覆盖相应样例。
- 资料中的 `null` 表示未填写，0 表示真实数值；缺少资料时不伪造 BMI 或目标差距。当前饮食趋势的按日补零只表示已记录摄入的汇总，不代表全天记录完整或实际没有摄入。

## 数据库与环境

- 环境变量以 `.env.example` 为入口；不覆盖用户已有 `.env`，不提交或输出连接密码、认证密钥、cookie、token、真实健康资料。开发和测试使用合成数据。
- 应用表统一带 `bodytrace_` 前缀；该前缀不能替代环境隔离。数据库操作前核对目标库，真实库的写入或迁移必须在用户授权的任务范围内。
- 连接复用 `src/db/index.ts` 与 `src/db/connection.ts`。维护脚本也使用同一连接配置，保留 utf8mb4、UTC、连接池上限及 TLS 证书验证，不为每个请求创建新池。
- schema 变更流程：修改 `src/db/schema.ts` → `npm run db:generate` → 审查 `drizzle/mysql/` 的 SQL 与元数据 → 在本地测试库（或显式开启的独立云测试库）执行 `npm run db:migrate` 并验证。SQL 审查包括数据保留、外键、唯一约束、索引、字符集和排序规则。
- `db:push` 仅用于可重建的开发库；不要对真实业务库执行 reset、无条件清空、强制覆盖或试验性结构变更。已应用迁移通过新迁移修正，不随意改写历史。
- `drizzle/` 根目录的 PostgreSQL SQL 与 meta 仅作存档，不能应用到 MySQL，也不要因切换数据库删除旧数据目录。
- MySQL 不支持 PostgreSQL 的 `.returning()`；沿用 `$returningId()`、事务内回读及 `onDuplicateKeyUpdate()`。多步写入与并发修改保留必要的事务和行锁。
- **本地 MySQL 统一用 Docker**：本地开发与默认测试都连 `docker-compose.yml` 里的 `bodytrace-mysql`（MySQL 8.4，宿主机端口 3307），不要装宿主机 MySQL、不要连别人的本地实例，也不要为跑测试另起数据库。确需云端独立测试库时，按验证章节的 `TEST_DATABASE_URL` + `ALLOW_REMOTE_TEST_DATABASE=1` + `_test` 库名规则执行，不得指向生产库。启动顺序为 `docker compose up -d mysql`，等容器 `healthy`（`docker inspect --format='{{.State.Health.Status}}' bodytrace-mysql`）再执行命令；跑完用 `docker compose stop mysql` 停掉。
- `docker-compose.yml` 的数据卷目前是 Windows 路径 `D:/docker/bodytrace-mysql`；在 macOS/Linux 使用前核对并配置合适的本地挂载，不直接假定可用，也不要重建或清除已有数据卷。

## 界面与交互

- 界面改动先读设计指南相关章节，沿用 `src/app/globals.css` 的语义令牌、白色背景和黑色对比色，优先复用现有业务组件及 Base UI 组件 API。
- 手机优先，核对桌面、手机导航和安全区域；交互元素使用正确语义，输入有标签和单位，图标按钮有可访问名称，键盘焦点可见。
- 完整处理正常、空状态、输入错误、保存中和失败状态；保存期间防止重复提交，失败后保留可重试的输入。不能只展示 toast 或静态假成功代替真实保存结果。
- 请求结果未知时先核对服务端状态，不自动重复创建。新增入口、导航和数据展示必须对应实际能力；设计指南的目标导航按具体任务推进。
- 日期、单位和来源明确展示，目标与实际分开；不把记录汇总或简单同期变化包装成健康评分、医学结论或计划效果保证。

## 开发服务器使用约定

- 3000 端口留给用户自己的 `npm run dev`。注意：Next 16 对同一项目目录加锁，**整个目录同时只能跑一个 dev server**——用户 server 在跑时，自己在别的端口也起不来。
- 验证/冒烟前先用 `netstat` 检查 3000：已有监听（用户的 server）就直接对它发请求（dev 按请求编译当前工作区代码，即是最新）；没有监听才自己启动，并在启动后记录监听 PID。
- 结束时只停自己启动的进程（按记录的 PID）；**永远不要杀 3000 端口上的进程**——它可能是用户自己起的。
- 后台任务的 TaskStop 只能杀掉 npm 外壳，node 子进程会存活；所以必须记录真实监听 PID，而不是依赖任务停止。

执行时遵循以下步骤：

1. 先检查 3000 的监听状态：macOS 用 `netstat -anv -p tcp`，Linux 用 `netstat -ltnp`，Windows 用 `netstat -ano`。确认监听地址、端口和状态，不能因一次 HTTP 超时就判断没有服务器。
2. 3000 已有用户服务器时直接复用，首次请求可能触发编译。若监听进程并非本项目，不关闭该进程，也不把它当成 BodyTrace 的验证结果。
3. 需要自己启动且确认当前项目没有 dev server 时，选择空闲的非 3000 端口（例如 3001）。macOS/Linux 可用 `BETTER_AUTH_URL=http://localhost:3001 npm run dev -- --port 3001`，只在该进程环境中覆盖地址，避免改用户的 `.env`。
4. `BETTER_AUTH_URL` 与实际访问的协议、主机和端口保持一致；`localhost` 与 `127.0.0.1` 不混用。启动后记录真正监听的 Node PID；macOS 可用 `lsof -nP -iTCP:3001 -sTCP:LISTEN` 辅助确认进程归属。
5. 锁冲突时查明现有实例，不删除锁文件或清空 `.next` 绕过限制。结束时仅按记录的 PID 停止自己启动的实例，并确认退出；不使用按端口批量杀进程或 `pkill node`。

独立测试脚本使用 `.next/test-projects/` 内的应用副本，具有独立目录、锁和自动端口，因此可以与用户的 3000 开发服务器并行；不要把这些测试改成在原项目目录另起一个 dev server。

## 验证与交付

按变更风险选择验证；仅修改文档时检查内容、路径、命令与 diff，不需要启动应用或访问数据库。代码变更运行 lint、类型检查和相关测试，交付前完成生产构建；Next.js 16 的 build 不会代替 lint。

| 命令 | 用途与前提 |
| --- | --- |
| `npm run lint` | ESLint 检查；当前没有 `next lint` |
| `npx tsc --noEmit` | TypeScript 检查；新检出缺少生成类型时先执行 `npx next typegen` |
| `npm run build` | 生产编译及路由检查；不能据此认定真实交互已验证 |
| `npm run test:request-timeout` | 无需数据库，验证请求超时、取消与计时器清理 |
| `npm run test:test-isolation` | 无需数据库，验证默认本地连接、显式远程测试库开关与库名保护 |
| `npm run test:mysql` | 默认需要本地 MySQL；也支持显式开启的独立云测试库，验证写入、日期、中文与 emoji、快照、账号隔离和页面 |
| `npm run test:password-reset` | 需要本地 MySQL，验证重置令牌、会话失效与认证限流 |
| `npm run test:mysql-pool` | 需要本地 MySQL，验证空闲回收后重建 UTC 连接，约需 32 秒 |
| `npm run test:measurements` | 无需数据库，验证身体指标校验、精度、变化计算与趋势缺失值 |
| `npm run test:training` | 无需数据库，验证训练规则、服务器校时、导航保护、迟到响应与请求体边界 |
| `npm run test:training-integration` | 需要独立测试 MySQL，验证训练读写、幂等、冲突、账号隔离和清空 |
| `npm run test:measurement-integration` | 需要本地 MySQL，验证身体指标读写、幂等、版本冲突和账号隔离 |

- 当前测试使用 Node.js 内置测试工具和脚本，尚未安装 Vitest 或 Playwright；没有通用 `npm test`。按现有能力验证，不照规划文档运行不存在的命令。
- MySQL 与密码找回测试通过 `scripts/lib/local-test-app.mjs` 创建独立应用；不读取 `.env` 的云库连接，也不使用 `DATABASE_URL` 或 `SMOKE_BASE_URL` 指向已运行应用。
- 默认本地测试库为 `mysql://bodytrace:bodytrace@127.0.0.1:3307/bodytrace`，即上面的 Docker MySQL；改本地库使用 `TEST_DATABASE_URL`，只允许 `localhost` 或 `127.0.0.1`，并固定使用回环地址连接。
- 确需使用云数据库跑集成测试时，必须同时满足：显式设置 `TEST_DATABASE_URL`、设置 `ALLOW_REMOTE_TEST_DATABASE=1`、库名包含 `test`（例如 `body_test`），且不能与 `.env` 的 `DATABASE_URL` 同库。测试会创建和删除合成账号、应用迁移并写入公开参考数据，只能指向独立的测试库，不得指向生产库或其他人的实例。
- 需要数据库的验证优先按 Docker 方式执行：先确认容器 `healthy`，再跑 `npm run test:mysql` 等命令；本地容器不可用时，可使用上述受保护的独立云测试库并记录实际使用的库。容器和云测试库都不可用时，记录原因并将该项列为未验证，不要改用宿主机 MySQL 或生产库顶替。
- 集成测试会应用迁移，参考库为空时导入公开数据，并清理本轮合成账号与测试应用。新测试沿用这一生命周期，失败路径也必须释放自己的连接、服务器和临时副本。
- 旧 `scripts/smoke-test.mjs` 和 `scripts/debug-pages.mjs` 会向目标应用写入账号及业务数据，且没有完整账号清理；前者接受 `SMOKE_BASE_URL`，后者固定请求 3000。优先用隔离测试，不在用户应用或云库上直接运行这两个脚本。
- 业务规则测试覆盖独立预期值、边界、未登录、跨账号和失败路径；不要复制实现公式自证正确。样式修改以浏览器检查为主，HTTP 200 不能代替交互、响应式和键盘操作验证。
- 缺少本地数据库或其他必要环境时，完成可运行检查，明确列出未验证项与原因；可以连接受保护的独立云测试库，但不得连接生产库补测试，也不关闭类型、认证或 TLS 校验绕过失败。
- 完成前检查 `git diff --check` 和 `git diff`，确保只包含任务所需变更；不提交 `.env`、生成类型、构建产物、临时测试文件或日志。行为、命令或配置改变时同步相关文档。
- 交付说明包含用户可见变化、实际运行的检查及结果、未验证项和实际限制。提交、推送与发布按用户的授权范围执行。
