# BodyTrace · 饮食与健身记录

记录每天的饮食、训练和身体变化。多用户，邮箱注册即可使用。

当前版本（v1）支持**饮食与身体指标记录**：食物库、四餐记录、每日目标、营养趋势，以及体重、体脂率和血压的持续记录。健身记录是二期计划。

## 功能

- **今日总览**：热量环 + 蛋白/碳水/脂肪进度条，一眼看到"今天还能吃多少"
- **饮食日记**：按日期翻阅，早/午/晚/加餐四区；添加食物支持 **最近吃过 / 收藏 / 搜索 / 官方参考库** 四个入口；克数可改可删，营养值自动重算
- **食物参考库**：内置《中国食物成分表（标准版第6版）》1677 种食物（数据来自 [Sanotsu/china-food-composition-data](https://github.com/Sanotsu/china-food-composition-data)，个人学习研究用途），添加食物时可搜索官方数值一键抄录进自己的库
- **食物库**：响应式卡片网格，平板、桌面和大屏每行展示 2 / 3 / 4 种食物，窄屏单列；营养按每 100g 录入（照抄包装袋营养成分表即可）；可设"一份 = 多少克"快捷录入；注册时自动预置 24 种常见食物
- **每日目标** + **30 天趋势图**（热量柱状 + 蛋白质折线 + 目标参考线）
- **饮食计划**：按天编写一周饮食：每天四个目标 + 早/午/晚三餐食物，摄入由食物库实时折算；支持停用（保留配置）与删除计划；无版本历史，保存会整体覆盖起始日之后所有日期（含过去）
- **个人资料**：身高/性别/目标体重，可分次填写；体重来自最新测量，数据齐全时自动计算 BMI（中国成人标准分级）和目标体重差距
- **身体变化**：持续记录体重、体脂率和血压，支持补录、同日多次测量、备注、修改和删除；血压分晨间/夜间记录，趋势同屏对比。按近 7 / 30 / 90 天或全部回看趋势和历史。最新体重同步到个人资料；原资料体重仅保留作参考，不自动生成历史。
- **数据管理**：个人资料页一键清空全部饮食记录与身体指标（二次确认后同一事务硬删除）；个人食物库、目标、计划与资料保持不变。
- **忘记密码**：登录页进入找回流程，使用一次性链接设置新密码；当前暂不发送邮件，本地开发时链接输出到终端。
- **历史不篡改**：饮食记录存营养快照，改/删食物库不影响旧记录

## 技术栈

| 用途 | 选型 |
|---|---|
| 框架 | Next.js 16（App Router）+ React 19 + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui（base-nova 风格）+ Recharts |
| 数据库 | MySQL 8.0 / 8.4 + Drizzle ORM + mysql2 |
| 认证 | better-auth（邮箱密码；Web 走 cookie，已启用 bearer 插件支持未来 App） |
| 校验 | zod |

## 本地开发

### 1. 准备数据库

开发运行时使用 Node.js 24 LTS。项目根目录已带 `docker-compose.yml`（MySQL 8.4 LTS，端口 3307，数据落在 `D:\docker\bodytrace-mysql`）：

```bash
docker compose up -d mysql     # 启动；停止用 docker compose stop mysql
```

使用云 MySQL 时，直接把 `.env` 里的 `DATABASE_URL` 换成云库连接串，无需启动 Docker。应用表统一使用 `bodytrace_` 前缀，与云库里其他应用的同名表分开；这个前缀不替代开发、预发和生产的数据库隔离。

### 2. 配置环境变量

```bash
cp .env.example .env   # Windows: copy .env.example .env
```

编辑 `.env`：

```
DATABASE_URL=mysql://bodytrace:bodytrace@localhost:3307/bodytrace
BETTER_AUTH_SECRET=<随机长字符串， openssl rand -base64 32 生成>
BETTER_AUTH_URL=http://localhost:3000
APP_TIMEZONE=Asia/Shanghai
```

云库格式为 `mysql://账号:URL编码后的密码@地址:3306/数据库名`。账号和密码只保存在本地 `.env` 或部署平台的密钥配置中。服务商启用 TLS 后设置 `DATABASE_SSL=require`；需要私有 CA 时设置 `DATABASE_SSL_CA_FILE`。连接会验证服务器证书，不默认放行自签名证书。每个应用连接的驱动及数据库会话时区统一为 UTC，饮食日期仍保存为 `YYYY-MM-DD`。

> 注意：`BETTER_AUTH_URL` 必须和你实际访问的地址（协议+域名+端口）一致，
> 换端口跑（如 3001）时要同步修改它，否则登录会因为 Origin 校验失败。

认证限流默认不读取客户端的转发 IP 头，缺少可信地址时使用共享限流桶。生产部署在受控反向代理后时，可以设置 `AUTH_TRUSTED_IP_HEADER`（例如 `x-bodytrace-client-ip`）按真实客户端 IP 限流；代理必须覆盖客户端传入的同名头，并阻止绕过代理直接访问应用。开发模式始终忽略此配置，使用本地共享限流桶。

### 3. 建表 + 启动

```bash
npm install
npm run db:migrate  # 在目标 MySQL 上应用已审查的迁移
npm run dev         # 打开 http://localhost:3000
```

首次使用：注册页创建账号 → 自动预置食物库 → 开始记录。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发模式（改代码自动热更新） |
| `npm run build` / `npm run start` | 生产构建 / 启动生产服务器 |
| `npm run db:push` | 表结构有改动后，把改动推到数据库 |
| `npm run db:generate` | 生成 MySQL SQL 迁移到 `drizzle/mysql/`，执行前审查 |
| `npm run db:migrate` | 应用 `drizzle/mysql/` 中尚未执行的迁移，生产使用此命令 |
| `npm run db:import-reference` | 导入《中国食物成分表》1677 种食物到参考库（数据在 `data/`，可重复执行） |
| `node scripts/smoke-test.mjs` | 端到端冒烟测试（需先 `npm run start`） |
| `node scripts/debug-pages.mjs` | 检查五个页面是否正常渲染 |
| `npm run test:password-reset` | 自行启动独立测试应用，验证有效期、令牌作废、会话失效和伪造 IP 不能绕过限流 |
| `npm run test:mysql` | 自行启动独立测试应用，验证 MySQL 写入、upsert、日期、中文与 emoji、快照、级联删除、账号隔离及七个页面 |
| `npm run test:test-isolation` | 验证测试不会采用云库配置，拒绝非本地测试连接 |
| `npm run test:request-timeout` | 无需数据库，验证登录响应体卡住时 15 秒取消请求，以及正常返回和计时器清理 |
| `npm run test:measurements` | 无需数据库，验证三类指标输入、日期、精度、变化计算和缺失日期 |
| `npm run test:measurement-integration` | 独立本地 MySQL 测试应用，验证记录、重试、编辑冲突、删除与账号隔离 |

MySQL 迁移位于 `drizzle/mysql/`，初始迁移显式采用 InnoDB、utf8mb4 与区分大小写的标识符比较。`drizzle/` 根目录里的旧 PostgreSQL SQL 和 meta 仅作存档，不能应用到 MySQL。后续新表也要审查字符集和排序规则。`db:push` 只用于可重建的开发库；切换驱动不会自动导入 PostgreSQL 的旧账号或记录，旧数据库及其数据目录保留。

MySQL 和密码找回测试不读取 `.env` 的云库连接，也不使用 `DATABASE_URL` 或 `SMOKE_BASE_URL` 指向已运行的应用。**本地 MySQL 统一用 Docker**：测试只连 `docker-compose.yml` 里的 `bodytrace-mysql`，不要装宿主机 MySQL 或连其他实例。先启动容器并确认 `healthy`，再直接执行测试：

```powershell
docker compose up -d mysql   # 等容器 healthy 再往下：docker inspect --format='{{.State.Health.Status}}' bodytrace-mysql
npm run test:mysql
npm run test:password-reset
docker compose stop mysql    # 跑完停掉
```

默认测试库为 `mysql://bodytrace:bodytrace@127.0.0.1:3307/bodytrace`；需要其他本地测试库时设置 `TEST_DATABASE_URL`，只允许 `localhost` 或 `127.0.0.1`，并固定使用回环地址连接。测试会应用 MySQL 迁移，并在参考库为空时导入公开食物数据。不要把需要保留的业务资料放进这个测试库。

每次测试在 `.next/test-projects/` 创建独立应用副本，不复制 `.env`，以相同测试连接启动自己的服务器和 SQL 清理连接。服务器绑定自动端口并记录实际监听 PID，可与用户的 3000 开发服务器同时运行；退出时停止自己的进程、清理合成账号并移除临时副本。每次密码找回测试使用新进程，因此无需等待上一轮限流窗口结束。维护脚本使用 Node.js 24 的内置 TypeScript 支持。

### 本地测试忘记密码

运行 `npm run dev`，从登录页点击“忘记密码？”并填写注册邮箱。终端会输出一个 15 分钟内有效的重置链接，打开链接后输入并确认新密码即可。重置成功后，该账号其他重置链接和旧登录会话都会失效，需要重新登录。

这只是暂不发邮件时的本地调试渠道：只在开发模式、应用地址为 localhost、127.0.0.1 或 ::1 时启用。`npm run start` 的生产模式显示“暂未开放”，接口也不会签发重置链接。以后接入找回渠道时，替换 `src/lib/auth.ts` 中的 `sendResetPassword` 回调，并同步更新找回页提示即可。

## 目录导读（新手向）

```
src/
├─ app/                  页面和 API 都按"文件夹 = 网址路径"组织
│  ├─ (auth)/            登录、注册页（括号目录不影响 URL，仅共享布局）
│  ├─ (app)/             需要登录的页面：layout.tsx 里有登录守卫
│  │  ├─ page.tsx        /            今日总览
│  │  ├─ diary/          /diary       饮食日记
│  │  ├─ foods/          /foods       食物库
│  │  ├─ trends/         /trends      趋势
│  │  └─ goals/          /goals       目标设置
│  ├─ api/auth/[...all]/ better-auth 的认证接口（登录注册登出）
│  └─ api/v1/            业务 REST API（给未来手机 App 用）
├─ components/app/       业务组件（热量环、食物选择弹窗等）
├─ components/ui/        shadcn/ui 生成的基础组件，一般不用动
├─ db/                   schema.ts 定义表；seed.ts 预置食物
├─ lib/                  工具：认证配置、日期、营养计算等
└─ services/             业务逻辑层（页面和 API 共用，规则只写一遍）
```

**页面找数据流**：页面（`src/app/...`）→ 服务（`src/services/...`）→ 数据库（`src/db/...`）。
改业务规则动 services，加页面动 app，加字段动 db/schema.ts 然后 `npm run db:push`。

## REST API 一览（给未来的 App 用）

所有接口需登录：Web 用 cookie；App 在登录后拿 token 放 `Authorization: Bearer <token>` 头（bearer 插件已启用）。注意 better-auth 的 CSRF 防护要求请求带 `Origin` 头。各接口的完整契约（参数校验、响应示例、错误码）见 [API 参考文档](docs/BodyTrace_API_Reference.md)。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/api/v1/foods?q=` | 食物列表/搜索（q 可省略） |
| POST | `/api/v1/foods` | 新增食物 |
| PATCH | `/api/v1/foods/:id` | 修改（含 isFavorite 收藏开关） |
| DELETE | `/api/v1/foods/:id` | 删除 |
| GET | `/api/v1/foods/recents` | 最近吃过的食物 |
| GET | `/api/v1/foods/reference?q=` | 搜索官方参考库（公共只读数据） |
| GET | `/api/v1/meals?date=` | 某天记录 |
| POST | `/api/v1/meals` | 记一笔 `{date, mealType, foodId, grams}` |
| PATCH | `/api/v1/meals/:id` | 改克数（营养按比例重算） |
| DELETE | `/api/v1/meals/:id` | 删除 |
| GET | `/api/v1/summary?date=` | 某天汇总（分餐 + 合计 + 目标） |
| GET | `/api/v1/trends?days=30` | 近 N 天每日合计 |
| GET/PUT | `/api/v1/goals` | 每日目标 |
| GET/PUT/DELETE | `/api/v1/plan` | 饮食计划读取、整体保存与删除 |
| GET/PUT | `/api/v1/profile` | 基础资料；读取的体重优先取最新测量 |
| GET/POST | `/api/v1/measurements` | 身体指标；GET 支持 `range=7/30/90/all`，默认 30 |
| GET/PATCH/DELETE | `/api/v1/measurements/:id` | 指标详情、修改、删除 |
| DELETE | `/api/v1/records` | 一键清空当前用户全部饮食记录与身体指标（不影响食物库、目标、计划与资料） |

身体指标类型为 `weight`、`bodyFat`、`bloodPressure`。新增请求为 `{requestId, measurement}`，`requestId` 是本次操作的 UUID，网络重试复用同一编号；`measurement` 包含 `kind`、`date`、可选的 `time` 和 `note`。体重/体脂率使用十进制字符串 `value`（kg / %，最多两位小数）；血压使用整数 `systolic` 和 `diastolic`（mmHg），两项必须成对填写，并携带 `period`（`morning` 晨间 / `evening` 夜间），其他类型不接受该字段。修改请求为 `{version, measurement}`，删除请求为 `{version}`，旧版本冲突返回 409。

每种指标独立解析最新值；同日优先按测量时间排序，无时间时按录入顺序。图表按日取最近一条，血压的晨间、夜间各自取每天最近一条并画在同一趋势图中对比；概要卡血压的"较上一次"按同时段比较（晨与晨、夜与夜），未标记记录之间互相比较。列表保留全部原记录，缺失日期保持断开。迁移时已有测量时间的旧血压按 12:00 前后回填时段，无时间的保持未标记，编辑时可补选。删除后记录从读取、趋势和最新值中隐藏，保留删除标记避免旧请求重放；删除账号时随用户级联清理。已有测量体重后，个人资料的 `weightKg` 为读取值，更新资料时省略该字段，改体重使用指标接口。

认证相关（better-auth 提供）：`POST /api/auth/sign-up/email`、`POST /api/auth/sign-in/email`、`POST /api/auth/sign-out`、`GET /api/auth/get-session`。

## 部署到自己的服务器

最简单的路线（已有云 MySQL）：

```bash
# 服务器上
git clone <你的仓库> && cd bodytrace
npm ci
npm run build

# 环境变量（生产值）
#   DATABASE_URL=<云库连接串>
#   BETTER_AUTH_SECRET=<新的随机串>
#   BETTER_AUTH_URL=https://你的域名
#   APP_TIMEZONE=Asia/Shanghai

npm run db:migrate     # 应用已审查的 MySQL 迁移

# 用 pm2 守护进程（或写个 systemd unit / Dockerfile 都行）
npm i -g pm2
pm2 start "npm run start" --name bodytrace
```

前面挂 Nginx 或 Caddy 反代到 3000 端口并配 HTTPS 即可。**务必上 HTTPS**，否则登录 cookie 不安全。

## 二期规划

- [ ] 健身记录：动作库、训练日、组数×重量×次数，"复制上次训练"
- [x] 身体指标：体重、体脂率、血压持续记录与曲线
- [ ] 更多身体指标与设备数据接入
- [ ] 复制昨天/常用组合的一键记录
- [ ] 移动 App（直接消费现有 /api/v1）
