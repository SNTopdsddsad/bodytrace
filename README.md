# BodyTrace · 饮食与健身记录

记录每天的饮食、训练和身体变化。多用户，邮箱注册即可使用。

当前版本（v1）聚焦**饮食记录**：食物库、四餐记录、每日目标、30 天趋势。健身记录是二期计划（数据库已预留扩展方式）。

## 功能

- **今日总览**：热量环 + 蛋白/碳水/脂肪进度条，一眼看到"今天还能吃多少"
- **饮食日记**：按日期翻阅，早/午/晚/加餐四区；添加食物支持 **最近吃过 / 收藏 / 搜索 / 官方参考库** 四个入口；克数可改可删，营养值自动重算
- **食物参考库**：内置《中国食物成分表（标准版第6版）》1677 种食物（数据来自 [Sanotsu/china-food-composition-data](https://github.com/Sanotsu/china-food-composition-data)，个人学习研究用途），添加食物时可搜索官方数值一键抄录进自己的库
- **食物库**：营养按每 100g 录入（照抄包装袋营养成分表即可）；可设"一份 = 多少克"快捷录入；注册时自动预置 24 种常见食物
- **每日目标** + **30 天趋势图**（热量柱状 + 蛋白质折线 + 目标参考线）
- **饮食计划·碳循环**：一周七天安排高/中/低碳日（提供三种模板），每种日型独立目标（默认按每日目标推导：高碳日碳水 ×1.5 脂肪减半、低碳日碳水减半脂肪 ×1.3）；生效后首页、日记按日期显示当天目标与日型徽标，趋势图目标线按天变化；支持停用（保留配置）与删除
- **个人资料**：身高/体重/性别/目标体重，可分次填写；数据齐全时自动计算 BMI（中国成人标准分级）和目标体重差距
- **忘记密码**：登录页进入找回流程，使用一次性链接设置新密码；当前暂不发送邮件，本地开发时链接输出到终端。
- **历史不篡改**：饮食记录存营养快照，改/删食物库不影响旧记录

## 技术栈

| 用途 | 选型 |
|---|---|
| 框架 | Next.js 16（App Router）+ React 19 + TypeScript |
| UI | Tailwind CSS v4 + shadcn/ui（base-nova 风格）+ Recharts |
| 数据库 | PostgreSQL + Drizzle ORM |
| 认证 | better-auth（邮箱密码；Web 走 cookie，已启用 bearer 插件支持未来 App） |
| 校验 | zod |

## 本地开发

### 1. 准备数据库

项目根目录已带 `docker-compose.yml`（Postgres 16，端口 5433，数据通过 bind mount 落在 `D:\docker\bodytrace-pg`，删容器不丢数据）：

```bash
docker compose up -d     # 启动；停止用 docker compose down
```

或者直接用你的云 Postgres——把 `.env` 里的 `DATABASE_URL` 换成云库连接串即可。

### 2. 配置环境变量

```bash
cp .env.example .env   # Windows: copy .env.example .env
```

编辑 `.env`：

```
DATABASE_URL=postgresql://postgres:postgres@localhost:5433/bodytrace
BETTER_AUTH_SECRET=<随机长字符串， openssl rand -base64 32 生成>
BETTER_AUTH_URL=http://localhost:3000
APP_TIMEZONE=Asia/Shanghai
```

> 注意：`BETTER_AUTH_URL` 必须和你实际访问的地址（协议+域名+端口）一致，
> 换端口跑（如 3001）时要同步修改它，否则登录会因为 Origin 校验失败。

认证限流默认不读取客户端的转发 IP 头，缺少可信地址时使用共享限流桶。生产部署在受控反向代理后时，可以设置 `AUTH_TRUSTED_IP_HEADER`（例如 `x-bodytrace-client-ip`）按真实客户端 IP 限流；代理必须覆盖客户端传入的同名头，并阻止绕过代理直接访问应用。开发模式始终忽略此配置，使用本地共享限流桶。

### 3. 建表 + 启动

```bash
npm install
npm run db:push     # 把 src/db/schema.ts 的表结构推进数据库
npm run dev         # 打开 http://localhost:3000
```

首次使用：注册页创建账号 → 自动预置食物库 → 开始记录。

## 常用命令

| 命令 | 作用 |
|---|---|
| `npm run dev` | 开发模式（改代码自动热更新） |
| `npm run build` / `npm run start` | 生产构建 / 启动生产服务器 |
| `npm run db:push` | 表结构有改动后，把改动推到数据库 |
| `npm run db:generate` | 生成 SQL 迁移文件（存档建表语句，备查） |
| `npm run db:import-reference` | 导入《中国食物成分表》1677 种食物到参考库（数据在 `data/`，可重复执行） |
| `node scripts/smoke-test.mjs` | 端到端冒烟测试（需先 `npm run start`） |
| `node scripts/debug-pages.mjs` | 检查五个页面是否正常渲染 |
| `npm run test:password-reset` | 验证有效期、令牌作废、会话失效和伪造 IP 不能绕过限流；需本地 `npm run dev`，重复运行需间隔一分钟 |

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

所有接口需登录：Web 用 cookie；App 在登录后拿 token 放 `Authorization: Bearer <token>` 头（bearer 插件已启用）。注意 better-auth 的 CSRF 防护要求请求带 `Origin` 头。

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

认证相关（better-auth 提供）：`POST /api/auth/sign-up/email`、`POST /api/auth/sign-in/email`、`POST /api/auth/sign-out`、`GET /api/auth/get-session`。

## 部署到自己的服务器

最简单的路线（假设已有云 Postgres）：

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

npm run db:push        # 首次部署建表

# 用 pm2 守护进程（或写个 systemd unit / Dockerfile 都行）
npm i -g pm2
pm2 start "npm run start" --name bodytrace
```

前面挂 Nginx 或 Caddy 反代到 3000 端口并配 HTTPS 即可。**务必上 HTTPS**，否则登录 cookie 不安全。

## 二期规划

- [ ] 健身记录：动作库、训练日、组数×重量×次数，"复制上次训练"
- [ ] 身体指标：体重/体脂/围度 + 曲线
- [ ] 复制昨天/常用组合的一键记录
- [ ] 移动 App（直接消费现有 /api/v1）
