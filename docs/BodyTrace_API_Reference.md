# BodyTrace API 参考

本文档整理**当前已实现**的 HTTP 接口，按业务模块分类，供网页客户端与未来移动 App 共用。契约以代码为准（`src/app/api/v1/` 路由 + `src/services/` 校验），新增或修改接口时同步更新本文档。规划中尚未实现的接口见[开发指南](BodyTrace_Nextjs_MySQL_Development_Guide.md)第 5 节。

本文中的示例数据均为虚构合成数据，不代表任何真实用户。

## 目录

- [通用约定](#通用约定)
- [认证（auth）](#认证auth)
- [食物库（foods）](#食物库foods)
- [饮食记录与汇总（meals / summary / trends）](#饮食记录与汇总)
- [饮食照片接口](#饮食照片接口)
- [目标与计划（goals / plan）](#目标与计划)
- [身体指标（measurements）](#身体指标measurements)
- [训练记录（training-records）](#训练记录training-records)
- [个人资料（profile）](#个人资料profile)
- [数据管理（records）](#数据管理records)

## 通用约定

| 项 | 约定 |
| --- | --- |
| Base URL | 应用部署地址，业务接口统一前缀 `/api/v1`，认证接口前缀 `/api/auth` |
| 认证 | 所有业务接口需登录。网页走 cookie 会话；App 登录后可携带 `Authorization: Bearer <token>`（better-auth bearer 插件已启用） |
| 业务接口 CSRF | `/api/v1` 写方法（POST/PATCH/PUT/DELETE）携带非空 `Origin` 头时，URL 的 host（主机及端口）必须与应用地址相同，否则 401；当前守卫在没有 Origin 时仍继续会话校验，不代表请求可以免登录 |
| 认证接口 CSRF | `/api/auth` 使用 Better Auth 自身的可信源与 CSRF 校验，包含协议、Origin/Referer 与 Fetch Metadata 规则；来源校验失败返回 403，不能套用业务接口的 host 比较和 401 约定 |
| 命名 | 请求与响应 JSON 均为 camelCase |
| 成功响应 | 业务数据通常包在语义键里，如 `{ foods }`、`{ entry }`、`{ goals }`；summary、trends 和 measurements 面板按各自示例返回对象 |
| 业务错误响应 | `/api/v1` 的预期业务错误为 `{ "error": "说明" }`，配合 400 / 401 / 404 / 409 等状态码；照片接口另有 413 / 502 / 503 |
| 认证错误响应 | `/api/auth` 采用 Better Auth 的 `{ "code": "错误代码", "message": "说明" }`；可返回 400 / 401 / 403 / 404 / 429 / 503 等状态，详见认证章节 |
| 业务日期 | 真实日历日期 `YYYY-MM-DD`，拒绝 `2026-02-30` 等溢出日期；按 `APP_TIMEZONE`（默认 `Asia/Shanghai`）计算"今天" |
| 测量时间 | `HH:mm` 字符串，可空；创建/更新时间戳为 ISO-8601 UTC |
| 营养单位 | 热量 kcal，蛋白质/碳水/脂肪 g；食物库营养值按**每 100g** 保存，饮食记录按实际克数折算为快照 |
| 所有权 | `userId` 一律来自服务端会话；单条资源访问他人数据按 404 处理，计划中的无效引用按该接口约定整单返回 400，不泄露其存在 |

身体指标写入接口拒绝多余 JSON 字段；其他业务写入接口会忽略 schema 未定义的字段，这些字段不会被保存。手机号接口同样拒绝多余字段。客户端仍应只提交各接口定义的请求字段，不能依赖返回的 ORM 字段作为可写字段。

以下为 `/api/v1` 常见错误码（各接口不再重复列出，仅列特有行为）；错误说明供人阅读，不作为稳定的机器错误代码：

| 状态码 | 含义 |
| --- | --- |
| 400 | 请求体或参数校验失败；请求体错误通常为 `字段路径: 说明`，路径由实际校验结果决定 |
| 401 | 未登录、会话过期，或写方法 Origin 校验失败 |
| 404 | 资源不存在或不属于当前用户 |
| 409 | 并发或幂等冲突（版本号、请求编号、体重来源等） |

## 认证（auth）

认证由 [better-auth](https://www.better-auth.com/) 提供并托管在 `/api/auth/*`，请求/响应字段以 better-auth 文档为准。当前应用实际使用以下端点：

Cookie 认证的写请求应携带可信 `Origin`（协议、主机、端口与应用地址一致）；缺少有效 Origin/Referer 或来源不可信时可能得到 `403`，错误代码如 `MISSING_OR_NULL_ORIGIN`、`INVALID_ORIGIN`。原生 App 不携带浏览器 Cookie 和 Fetch Metadata 时可使用 Bearer 调用，不能据此推断 Cookie 请求也跳过来源校验。认证错误直接返回 `{code, message}`，例如短信未开放时为 `503 {"code":"SMS_UNAVAILABLE","message":"短信登录暂未开放，请稍后再试；原邮箱账号可使用邮箱登录。"}`。

| 方法与路径 | 用途 |
| --- | --- |
| `POST /api/auth/phone-number/send-otp` | 发送登录验证码，`{phoneNumber}`；支持大陆 11 位号码或 `+86` 格式，内部统一为 `+86`，成功返回 `{message:"code sent"}`，不返回验证码 |
| `POST /api/auth/phone-number/verify` | 验证并登录，`{phoneNumber, code}`；`code` 为数字字符串，位数由 `SMS_CODE_LENGTH` 决定（默认 6 位）；首次验证自动注册，成功返回 `{status:true, token, user}` 并设置会话 cookie |
| `POST /api/auth/sign-up/email` | 保留的邮箱注册 API，`{name, email, password}`；网页注册入口已统一到手机号，不接受手机号相关字段 |
| `POST /api/auth/sign-in/email` | 登录，`{email, password}`；App 可从响应取 token 供 Bearer 调用 |
| `POST /api/auth/sign-out` | 退出登录，作废当前会话 |
| `GET /api/auth/get-session` | 查询当前会话与用户，未登录返回 `null` |
| `POST /api/auth/request-password-reset` | 申请密码重置，`{email, redirectTo}`；仅在开发模式且应用地址为回环地址时启用，链接输出到服务端终端，不发送邮件 |
| `POST /api/auth/reset-password` | 使用一次性令牌设置新密码，`{token, newPassword}`；成功后旧会话全部失效 |

密码长度为 8–128 字符；密码找回令牌 15 分钟有效，成功后其他重置令牌和旧会话作废。申请接口仅在 `NODE_ENV=development` 且 `BETTER_AUTH_URL` 的主机为 `localhost`、`127.0.0.1` 或 `::1` 时开放，其他环境返回 `400 {"code":"RESET_PASSWORD_DISABLED","message":"Reset password isn't enabled"}`，不会签发链接。

手机号验证码接口只接受表中字段，不开放 `updatePhoneNumber`、`disableSession` 或额外用户字段。手机号仅支持大陆 +86；`/sign-in/phone-number`（手机密码登录）、`/phone-number/request-password-reset` 和 `/phone-number/reset-password` 未开放，返回 404。不支持邮箱账号绑定手机号、改号或账号合并，旧邮箱账号继续使用邮箱登录。

验证码有效期由 `SMS_CODE_EXPIRE_MINUTES` 决定（默认 5 分钟），最多 3 次错误尝试、成功一次性消费，重发作废旧码。验证码摘要和错误次数在独立命名空间按固定主键保存，通过事务行锁处理重发与验证；错误次数原地更新，不能复活被重发替换的旧码。格式错误返回 400 `INVALID_PHONE_INPUT`；错码/过期/已消费返回 `INVALID_OTP`、`OTP_EXPIRED`、`OTP_NOT_FOUND` 等 400，尝试耗尽返回 403 `TOO_MANY_ATTEMPTS`。未配置短信返回 503 `SMS_UNAVAILABLE`，发送失败或结果未知返回 503 `SMS_SEND_FAILED`；收到短信后仍可验证，不自动重发，也不要求本次页面曾发起发送。

同号发送间隔由 `SMS_RATE_LIMIT_SECONDS` 决定（默认 60 秒），另有同号每 24 小时 10 次、同来源每分钟 5 次的限制。窗口从首次占用起计算，失败/结果未知也占额度。数据库频控返回 429 `SMS_RATE_LIMITED` 并带 `Retry-After` 秒数；另有 Better Auth 自身接口限流。只有受控生产代理配置的来源头会被信任，否则使用共享桶。

上述配置均为整数：`SMS_CODE_LENGTH` 允许 4–6（遵循[阿里云验证码模板变量规范](https://help.aliyun.com/zh/sms/user-guide/verification-code-template-specifications/)），`SMS_CODE_EXPIRE_MINUTES` 允许 1–30，`SMS_RATE_LIMIT_SECONDS` 允许 1–3600；非法配置会报错。登录页使用服务端传入的同一份配置。

手机注册用户的 `user` 含 `phoneNumber`（规范化 `+86` 号码）和 `phoneNumberVerified:true`；`email` 为兼容认证模型而生成的内部 `.invalid` 地址，不能用于邮件联系或当作已填写邮箱展示。旧邮箱用户的 `phoneNumber` 可为 null，业务归属仍统一使用 `user.id`。请求与响应包含私人身份信息，不能记录验证码、会话 token 或完整手机号。

## 食物库（foods）

个人食物库按用户隔离；`/reference` 为全体用户共享的官方只读参考库。

### GET /api/v1/foods

搜索自己的食物库。查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `q` | 否 | 去除首尾空白后按名称做不区分大小写的 SQL LIKE 包含匹配；省略或空白返回全部，`%` / `_` 保留 LIKE 通配符含义 |
| `favorite` | 否 | 只有字符串 `true` 启用收藏筛选；省略或其他值不筛选，不返回参数错误 |

排序：收藏优先，再按名称升序。

例如 `GET /api/v1/foods?q=鸡胸`：

```json
{
  "foods": [
    {
      "id": "0b6b2c6e-6d61-4b0f-9e6f-0b9e6f0b9e6f",
      "userId": "3RglEM0eLzPXnXkm8jKYJptuY",
      "name": "鸡胸肉",
      "brand": null,
      "calories": 118,
      "protein": 24.6,
      "carbs": 0.6,
      "fat": 1.9,
      "servingGrams": 150,
      "isFavorite": true,
      "createdAt": "2026-10-01T08:00:00.000Z",
      "updatedAt": "2026-10-01T08:00:00.000Z"
    }
  ]
}
```

### POST /api/v1/foods

新增食物。营养值按每 100g 填写。

```json
{ "name": "鸡胸肉", "brand": "某品牌", "calories": 118, "protein": 24.6, "carbs": 0.6, "fat": 1.9, "servingGrams": 150 }
```

| 字段 | 类型 | 校验 |
| --- | --- | --- |
| `name` | string | 必填，去空格后 1–100 字 |
| `brand` | string \| null | 可选，≤50 字 |
| `calories` | number | 必填，0–2000 |
| `protein` / `carbs` / `fat` | number | 可选，默认 0，0–200 |
| `servingGrams` | number \| null | 可选，1–5000，"一份"的克数 |

成功 `201`，返回 `{ food }`（结构同上）。

### PATCH /api/v1/foods/:id

部分更新，未提交的字段保持原值；`isFavorite` 用于收藏开关。

```json
{ "isFavorite": true }
```

| 字段 | 类型 | 校验 |
| --- | --- | --- |
| 同 POST 的全部字段 | — | 均可选；`protein`/`carbs`/`fat` 不再默认 0，省略即保持原值 |
| `isFavorite` | boolean | 可选 |

成功返回 `{ food }`；食物不存在或不属于当前用户返回 `404 {"error":"食物不存在"}`。

### DELETE /api/v1/foods/:id

删除食物。历史饮食记录保留写入时的营养快照，不受影响。成功返回 `{ "ok": true }`，不存在返回 404。

### GET /api/v1/foods/recents

最近吃过的食物：按当前用户全部饮食记录中的 `createdAt` 求每种食物最近一次录入时间，倒序返回最多 12 种；时间相同时按食物 `id` 升序稳定排序。先去重再取 12 种，不截断原始记录数量；不按饮食业务日期排序。只返回本人食物库中仍存在的食物，已删除的食物不返回。返回 `{ foods }`，元素结构同上。

### GET /api/v1/foods/reference?q=

搜索官方参考库《中国食物成分表（标准版第6版）》1677 种食物（数据来自 [Sanotsu/china-food-composition-data](https://github.com/Sanotsu/china-food-composition-data)）。`q` 省略或去除首尾空白后为空时返回空数组；名称匹配方式同个人食物搜索（含 LIKE 通配符），按名称排序，最多 20 条。营养值为每 100g 可食部，个别字段可能为 `null`。

```json
{
  "foods": [
    {
      "id": 810,
      "foodCode": "08-1-101",
      "name": "鸡蛋（红皮）",
      "englishName": "Egg, red shell",
      "category": "蛋类及制品",
      "calories": 156,
      "protein": 12.8,
      "carbs": 2.4,
      "fat": 11.1,
      "dietaryFiber": 0,
      "edible": 88
    }
  ]
}
```

## 饮食记录与汇总

记录保存写入时刻的食物名称与营养快照；修改克数按记录内已有快照等比缩放，与食物库当前状态无关。餐次固定为 `breakfast` / `lunch` / `dinner` / `snack`。照片独立归属用户、日期和餐次，每餐最多上传 6 张有效照片；照片文件存腾讯云 COS，数据库只保存对象 key 与尺寸等元数据。

### GET /api/v1/meals?date=YYYY-MM-DD

某天的全部记录，按创建顺序排列。`date` 必填且格式合法，否则 400。

```json
{
  "entries": [
    {
      "id": "5a1f7c2e-1111-4c8a-9d3d-2f4b5a6c7d8e",
      "userId": "3RglEM0eLzPXnXkm8jKYJptuY",
      "date": "2026-10-18",
      "mealType": "breakfast",
      "foodId": "0b6b2c6e-6d61-4b0f-9e6f-0b9e6f0b9e6f",
      "name": "鸡胸肉",
      "grams": 200,
      "calories": 236,
      "protein": 49.2,
      "carbs": 1.2,
      "fat": 3.8,
      "createdAt": "2026-10-18T00:30:00.000Z"
    }
  ],
  "photos": [
    {
      "id": "9b7f2a41-2222-4a9b-8c1d-3e4f5a6b7c8d",
      "date": "2026-10-18",
      "mealType": "breakfast",
      "url": "https://images.example.com/main.webp",
      "thumbUrl": "https://images.example.com/thumb.webp",
      "width": 1600,
      "height": 1200,
      "position": 0
    }
  ]
}
```

`foodId` 在食物被删除后为 `null`，记录仍可改克数、可删除。顶层 `photos` 为当天全部照片，按早/午/晚/加餐及餐内 `position` 排序，始终是数组，没有照片时为空数组；元素结构和排序见[饮食照片接口](#饮食照片接口)。

照片默认放在“公有读、私有写”的 COS 桶，`url` / `thumbUrl` 是对象地址；如果部署改为私有读桶，设置 `COS_PHOTO_ACCESS=signed` 后会返回带时效的签名地址。客户端不应缓存或长期保存这两个字段，页面刷新会重新解析。`url` 用于大图，`thumbUrl` 用于列表缩略图。

### POST /api/v1/meals

记一笔。只能使用自己食物库里的食物。

```json
{ "date": "2026-10-18", "mealType": "breakfast", "foodId": "0b6b2c6e-6d61-4b0f-9e6f-0b9e6f0b9e6f", "grams": 200 }
```

| 字段 | 类型 | 校验 |
| --- | --- | --- |
| `date` | string | 合法日历日期，且不能是未来日期 |
| `mealType` | enum | `breakfast` / `lunch` / `dinner` / `snack` |
| `foodId` | uuid | 必须存在于本人食物库 |
| `grams` | number | 1–5000 |

成功 `201` 返回 `{ entry }`（营养按克数折算后的快照，不含 `photos`）；食物不存在或非本人返回 `404 {"error":"食物不存在"}`。

### PATCH /api/v1/meals/:id

修改克数，营养值按新旧克数比例重算。请求 `{ "grams": 300 }`（1–5000）。成功返回 `{ entry }`（不含 `photos`），不存在返回 404。

### DELETE /api/v1/meals/:id

删除一条记录，返回 `{ "ok": true }`；不存在（含重复删除）返回 404。该餐的照片及删除标记不受影响，即使删除最后一条食物记录也保留照片。

### 饮食照片接口

照片属于 `(userId, date, mealType)`，一餐可以只有照片。三个接口均需登录；POST / DELETE 沿用 Origin 检查，`userId` 只来自服务端会话。旧 `/api/v1/meals/:id/photos` 及其删除子路由已移除。

| 方法 | 路径 | 用途 |
| --- | --- | --- |
| POST | `/api/v1/meal-photos` | 上传单张照片，支持按 `requestId` 幂等重试 |
| GET | `/api/v1/meal-photos?requestId=UUID` | 核对一次上传是否已经保存 |
| DELETE | `/api/v1/meal-photos/:photoId` | 删除本人照片 |

照片列表从 `GET /api/v1/meals?date=` 的顶层 `photos`、`GET /api/v1/summary?date=` 的 `byMeal[].photos` 读取。食物记录对象不再附带 `photos`。照片不产生热量或营养估计。

**照片对象 `MealPhotoDto`**

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | UUID string | 照片 ID，与上传的请求编号不同 |
| `date` | string | 业务日期 `YYYY-MM-DD` |
| `mealType` | enum | breakfast / lunch / dinner / snack |
| `url` / `thumbUrl` | string | WebP 主图 / 缩略图地址 |
| `width` / `height` | number | 主图宽高，单位 px |
| `position` | number | 餐内排序值，从 0 递增；删除后不重排，可能不连续或大于 5 |

响应不包含凭证、对象 key、文件摘要或 `requestId`。列表只包含未删除照片；地址生成失败时仅隐藏该张，不使整页失败。签名地址不能长期缓存，刷新时重新获取。

#### POST /api/v1/meal-photos

请求类型为 `multipart/form-data`：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `date` | 是 | 真实日历日期 `YYYY-MM-DD`，不能晚于 `APP_TIMEZONE`（默认 Asia/Shanghai）的今天 |
| `mealType` | 是 | breakfast / lunch / dinner / snack |
| `requestId` | 否，新客户端必传 | UUID；当前用户内唯一；重试复用编号和同一份实际上传文件字节 |
| `file` | 是 | 单张非空文件，1 B–8 MiB |

输入实际解码支持 JPEG / PNG / WebP / AVIF，最多 40,000,000 像素；HEVC 编码的 HEIC 需客户端先转换。服务端按 EXIF 方向旋转、去 EXIF/GPS、转 WebP，主图长边最多 1600px，缩略图最多 480px，小图不放大。每餐最多六张有效照片；迁移得到的历史超额照片保留，但不允许继续上传。

为每张照片生成一次请求编号，重新压缩可能改变摘要，不应在重试时重新压缩。省略编号仍可上传，但不具备幂等保证。

```bash
curl --request POST "$BASE_URL/api/v1/meal-photos" \
  --header "Authorization: Bearer $SESSION_TOKEN" \
  --form "date=$MEAL_DATE" \
  --form "mealType=lunch" \
  --form "requestId=$PHOTO_REQUEST_ID" \
  --form "file=@./synthetic-photo.png;type=image/png"
```

使用合成图片；变量只在本地设置，勿提交真实会话。不要手动设置 multipart Content-Type。

首次成功为 `201 { photo }`；相同用户、编号、日期、餐次及文件重放为 `200 { photo }`，即使满六张仍可重放。相同文件配新编号是新上传；不同用户可以使用相同编号。

| 状态 | 场景 |
| --- | --- |
| 400 | 日期/餐次/UUID 非法、未来日期、非 multipart、缺少或空文件、解码/格式/像素数失败、该餐满六张 |
| 401 | 未登录、会话过期或 Origin 校验失败 |
| 404 | 上传提交前用户已被删除 |
| 409 | 编号用于其他日期/餐次/文件，或对应照片已删除 |
| 413 | 文件超过 8 MiB，或 Content-Length 超过 8 MiB + 512 KiB multipart 开销 |
| 502 | COS、读取地址或数据库结果无法确认；不能据此认定未保存 |
| 503 | 新上传所需 COS 配置不完整 |

预期错误均为 `{ "error": "说明" }`。

#### GET /api/v1/meal-photos?requestId=UUID

只按当前用户和编号核对，不需要传日期、餐次或文件，不比较文件摘要。已保存且未删除返回 `200 { photo }`；尚未查到（含只有其他用户使用过该编号）返回 `200 { "photo": null }`。缺少或非法编号为 400，未登录为 401，照片已删除为 409，数据库或地址生成暂不可用为 502。

`null` 不代表旧请求已取消，它可能仍在执行。查询错误、超时、非 JSON 响应不能当成 `null`。

客户端为每张照片保存 `date + mealType + requestId + file`。重试先 GET 核对，核对到照片时检查所属餐次并视为完成；返回 `null` 才用原编号、原文件 POST。POST 结果未知时先查询，核对失败保留待重试项，不自动重建。409 不得通过更换编号静默重传。关闭页面或取消请求不撤销服务端上传，重新进入时刷新照片列表。

#### DELETE /api/v1/meal-photos/:photoId

无请求体。成功为 `200 { "ok": true }`；非法 UUID 为 400，未登录或 Origin 失败为 401；不存在、非本人或已删除（含重复删除）均为 404。

事务内设置删除标记，提交后尽力清理 COS 主图和缩略图，清理失败由孤儿清理脚本兜底。删除释放有效照片配额，保留原编号和排序位置；旧编号 GET / POST 返回 409。删除食物不会删除照片。一键清空则硬删除所有照片及标记，边界见下文数据管理。

### GET /api/v1/summary?date=YYYY-MM-DD

某天汇总：按餐次分组的记录 + 全天合计 + 当天生效目标。首页与日记共用。

```json
{
  "date": "2026-10-18",
  "byMeal": [
    { "mealType": "breakfast", "label": "早餐", "entries": [ /* MealEntry */ ], "photos": [ /* MealPhotoDto */ ] },
    { "mealType": "lunch", "label": "午餐", "entries": [], "photos": [] },
    { "mealType": "dinner", "label": "晚餐", "entries": [], "photos": [] },
    { "mealType": "snack", "label": "加餐", "entries": [], "photos": [] }
  ],
  "totals": { "calories": 236, "protein": 49.2, "carbs": 1.2, "fat": 3.8 },
  "goals": { "calories": 2200, "protein": 140, "carbs": 230, "fat": 70 },
  "goalSource": "plan"
}
```

目标按日期解析：启用中的饮食计划且日期在起始日（含）之后按当天计划目标取值（`goalSource: "plan"`）；否则回落到每日目标（`goalSource: "base"`）。`date` 必填且格式合法，否则 400。

> 契约变更：本响应**不再包含** `goalDayType`（高/中/低碳日型概念已从计划中移除）。

### GET /api/v1/trends?days=30

最近 N 天每天的营养合计与当天生效的热量目标。`days` 为 7–180 的整数，非法时回落 30。无记录的日期补 0（仅表示当天没有已记录的摄入，不代表完整记录）。

```json
{
  "days": 30,
  "trends": [
    { "date": "2026-09-19", "calories": 0, "protein": 0, "carbs": 0, "fat": 0, "goalCalories": 2200 },
    { "date": "2026-09-20", "calories": 1980.5, "protein": 132.4, "carbs": 210.1, "fat": 58.3, "goalCalories": 2400 }
  ]
}
```

## 目标与计划

### GET /api/v1/goals

查询每日目标，返回 `{ goals }`。从未设置过时使用默认值且不落库：

```json
{ "goals": { "calories": 2000, "protein": 120, "carbs": 220, "fat": 60 } }
```

### PUT /api/v1/goals

整体保存每日目标，upsert 语义，返回 `{ goals }`。

```json
{ "calories": 2200, "protein": 140, "carbs": 230, "fat": 70 }
```

| 字段 | 校验 |
| --- | --- |
| `calories` | 整数，500–8000 |
| `protein` | 整数，0–600 |
| `carbs` | 整数，0–1200 |
| `fat` | 整数，0–500 |

### GET /api/v1/plan

查询饮食计划（每用户至多一条），没有时返回 `{ "plan": null }`。`weekday` 序号 0=周一 … 6=周日：`weekdays` 按序号升序返回；`items` 先按 `weekday` 升序、再按餐次（早餐 → 午餐 → 晚餐 → 加餐）、最后按保存时的请求数组顺序返回。`items` 在同一 `weekday` + `mealType` 内的相对顺序由 PUT 请求数组顺序决定并稳定保存，客户端应保持用户看到的顺序提交。

计划是**逐天手写**的：七天各带自己的四个目标数值（`calories`/`protein`/`carbs`/`fat`），每天的三餐（含加餐）另挂在 `items` 里，写具体食物与克数。食物项**不存营养快照**：每次读取都按食物库当前每 100g 数值实时折算（保留 1 位小数，与饮食记录一致），所以食物库数值改了，计划里显示的摄入量也随之变化。计划**没有版本或生效区间模型**，只有当前这一条：任一时刻“某天生效的目标”都由同一条计划按周几解析，历史上没有别的计划快照可回溯。

```json
{
  "plan": {
    "startDate": "2026-10-12",
    "isActive": true,
    "weekdays": [
      { "calories": 2600, "protein": 140, "carbs": 320, "fat": 60 },
      { "calories": 2200, "protein": 140, "carbs": 230, "fat": 70 },
      { "calories": 2200, "protein": 140, "carbs": 230, "fat": 70 },
      { "calories": 2600, "protein": 140, "carbs": 320, "fat": 60 },
      { "calories": 2200, "protein": 140, "carbs": 230, "fat": 70 },
      { "calories": 2200, "protein": 140, "carbs": 230, "fat": 70 },
      { "calories": 2200, "protein": 140, "carbs": 230, "fat": 70 }
    ],
    "items": [
      {
        "id": "6c1e9d0a-6f1b-4a2e-9c33-0f0d8a7b41c2",
        "weekday": 0,
        "mealType": "breakfast",
        "foodId": "9a1c4b8e-2f57-4c6a-8d10-7b3c5e9f2a44",
        "name": "燕麦片",
        "grams": 50,
        "per100g": { "calories": 379, "protein": 13, "carbs": 60.8, "fat": 6.8 },
        "calories": 189.5,
        "protein": 6.5,
        "carbs": 30.4,
        "fat": 3.4
      },
      {
        "id": "b7e2c4f1-8a03-4d95-b6d7-1c2e3f4a5b60",
        "weekday": 0,
        "mealType": "dinner",
        "foodId": null,
        "name": "已从食物库删除的菜",
        "grams": 120,
        "per100g": null,
        "calories": null,
        "protein": null,
        "carbs": null,
        "fat": null
      }
    ]
  }
}
```

`per100g` 返回食物库当前每 100g 的原始营养（`calories`/`protein`/`carbs`/`fat`），供客户端编辑克数时直接折算；不能从已舍入的食物项营养反推。该字段只在响应中提供，不接受客户端指定，也不存为快照。

**失效项兜底**：食物被删除后该行 `foodId` 变为 `null`，`name` 与 `grams` 仍按原样返回，`per100g` 和四个营养字段返回 `null`（不是 0）。客户端要展示名称与克数并标注“食物已删除”，`null` 既不能计入合计，也不能当成 0 参与换算。

### PUT /api/v1/plan

整体保存（全量替换七天目标与全部食物项），事务内完成：计划行 upsert → 七天目标先删后插 → 食物项先删后插。`startDate` 之前的日子不受计划影响，仍走每日目标。

```json
{
  "startDate": "2026-10-12",
  "isActive": true,
  "weekdays": [
    { "calories": 2600, "protein": 140, "carbs": 320, "fat": 60 },
    { "calories": 2200, "protein": 140, "carbs": 230, "fat": 70 },
    { "calories": 2200, "protein": 140, "carbs": 230, "fat": 70 },
    { "calories": 2600, "protein": 140, "carbs": 320, "fat": 60 },
    { "calories": 2200, "protein": 140, "carbs": 230, "fat": 70 },
    { "calories": 2200, "protein": 140, "carbs": 230, "fat": 70 },
    { "calories": 2200, "protein": 140, "carbs": 230, "fat": 70 }
  ],
  "items": [
    { "weekday": 0, "mealType": "breakfast", "foodId": "9a1c4b8e-2f57-4c6a-8d10-7b3c5e9f2a44", "grams": 50 },
    { "weekday": 0, "mealType": "lunch", "foodId": "3f8b1d2c-5e64-4a17-9b28-c0d1e2f3a4b5", "grams": 200 }
  ]
}
```

| 字段 | 校验 |
| --- | --- |
| `startDate` | 合法日历日期 `YYYY-MM-DD` |
| `isActive` | boolean；`false` 表示停用但保留配置 |
| `weekdays` | 恰好 7 项；四个目标均为整数，范围同每日目标（热量 500–8000、蛋白 0–600、碳水 0–1200、脂肪 0–500） |
| `items` | 最多 400 项（七天 × 三餐都写满仍有余量），可为空数组（这一天只记目标不记食物）；每项 `weekday` 为 0–6、`mealType` 为 `breakfast`/`lunch`/`dinner`/`snack`、`foodId` 为 uuid 或 `null`、`grams` 为 1–5000、`id` 可选（uuid） |
| `items[].foodId` | 为 uuid 时引用食物库里的食物；为 `null` 时表示保留一条已失效的行（食物已删除），此时必须带 `id` |
| `items[].id` | `foodId` 为 `null` 时必填，取该项在 GET 响应里的 `id`；`foodId` 为 uuid 时可选（新增行不带） |
| `items[].name` | 不可写，客户端传入会被忽略：`foodId` 为 uuid 时名称以食物库为准，`foodId` 为 `null` 时名称沿用当前计划里那一行原有的值 |

**归属校验**：`items[].foodId` 为 uuid 的项必须全部是当前用户食物库里的食物。服务端用一次查询校验全部引用，只要有一项不存在或不属于当前用户就**整单拒绝**，返回 `400 {"error":"计划中的食物不存在或不属于当前用户，请刷新食物库后重试"}`；此时计划、七天目标与食物项都保持原样，不存在部分写入。

**失效项兜底（读-改-写）**：GET 返回的 `foodId: null` 行可以原样 PUT 回来，语义是「保留这一条已失效的行」，名称与克数照旧落库。服务端在当前计划的既有行里找 `id` 匹配且 `food_id IS NULL` 的行，沿用它的 `name` 写入新行（新行会得到新的 `id`，以 PUT 的读回值为准）。以下情况整单拒绝、旧计划不被改写，返回 `400`：

| 情况 | 返回 |
| --- | --- |
| `foodId: null` 但缺 `id` | `400 {"error":"items.<下标>: 食物项格式不正确；食物已删除的项要带上它在计划里的 id 才能保留"}`（Zod union 校验阶段；下标从 0 开始） |
| `foodId: null` 的 `id` 不是当前计划里的失效行（别的计划的行、已失效又被替换的行、随便的 uuid） | `400 {"error":"要保留的失效食物项在当前计划里不存在，请刷新页面后重试"}` |
| 混入他人的食物或已删除食物（`foodId` 为 uuid） | `400 {"error":"计划中的食物不存在或不属于当前用户，请刷新食物库后重试"}` |

两种情况都只按「不存在」处理，不透露别人的资源是否存在。

成功返回 `{ plan }`，是保存后**读回**的完整计划（不是回显请求体）：`weekdays` 不含 `weekday` 序号，数组顺序即周一到周日；`items` 带展开后的食物名与按当前食物库实时折算的营养，客户端可直接用它刷新界面。

**同餐顺序**：`items` 在同一 `weekday` + `mealType` 内的相对顺序由请求数组顺序决定，服务端按数组下标保存并在读取时原样返回，重复保存同一数组不会改变顺序。顺序是服务端保存的副作用，客户端不需要传任何顺序字段，但必须保持用户看到的顺序提交——不要先按名称排序或按其他集合顺序重组后再提交。

保存是全量覆盖，会改写 `startDate`（含）之后**所有**日期的目标与食物项，包括已经过去的日期：接口不保留旧目标，也没有计划版本历史。饮食记录保存的是写入时的摄入快照，不随目标变化；但趋势、日记中这些日期用来对照的目标会变成新保存的数值。客户端在改写历史时必须在界面上明示，不能只靠本接口的返回值暗示。

### DELETE /api/v1/plan

删除计划（七天目标与食物项级联清理），之后所有日期回落到每日目标。返回 `{ "status": true }`。

## 身体指标（measurements）

指标类型 `kind`：`weight`（体重 kg）、`bodyFat`（体脂率 %）、`bloodPressure`（血压 mmHg）。小数值以十进制字符串传输（最多两位小数，保存统一补齐为两位，如 `"79.50"`）；血压两项成对保存并必填测量时段。

记录带 `version` 版本号：每次修改或删除递增。修改和删除请求中的 `version` 必填，必须为 ≥1 的整数；冲突及重试行为见各接口。

### GET /api/v1/measurements?range=30

读取指标面板数据。`range` 为 `7` / `30` / `90` / `all`，默认 `30`，其他值 400。

```json
{
  "range": "30",
  "entries": [ /* Measurement[]，按日期/时间/创建时间倒序 */ ],
  "latest": { "weight": { /* Measurement */ }, "bodyFat": null, "bloodPressure": null },
  "previous": { "weight": null, "bodyFat": null, "bloodPressure": null },
  "targetWeightKg": 70,
  "legacyWeightKg": 80,
  "today": "2026-10-18",
  "timeZone": "Asia/Shanghai"
}
```

- `entries` 按 `range` 筛选，日期、测量时间、创建时间和 `id` 均倒序；同日有测量时间的记录排在没有测量时间的记录之前。
- `latest` / `previous`：始终从全部未删除记录中按上述顺序独立解析，不受 `range` 限制；血压的"上一次"按同时段（晨与晨、夜与夜，未标记与未标记）比较。
- `targetWeightKg` 来自个人资料；`legacyWeightKg` 为旧资料体重，仅作参考展示，不自动生成历史测量。

`Measurement` 结构：

```json
{
  "id": "9c2d4e6f-2222-4a9b-8e7c-1a2b3c4d5e6f",
  "kind": "weight",
  "date": "2026-10-18",
  "time": "08:15",
  "timeZone": "Asia/Shanghai",
  "value": "79.50",
  "systolic": null,
  "diastolic": null,
  "period": null,
  "note": "晨起",
  "version": 1,
  "createdAt": "2026-10-18T00:20:00.000Z",
  "updatedAt": "2026-10-18T00:20:00.000Z"
}
```

血压记录的 `value` 为 `null`，`systolic`/`diastolic` 有值并带 `period`（`morning` 晨间 / `evening` 夜间）；迁移前的旧血压可能 `period` 为 `null`（未标记时段），编辑时必须补选。体重/体脂的 `systolic`/`diastolic`/`period` 恒为 `null`。

### POST /api/v1/measurements

新增一条测量。`requestId` 是本次操作的 UUID，在当前用户内唯一；幂等编号放在 JSON 请求体中，不读取 `Idempotency-Key` 请求头。网络重试复用同一编号：内容与该记录当前保存值一致时返回同一记录（`200`），首次创建返回 `201`；相同编号换内容、或该编号对应的记录仍有软删除标记时返回 409。记录编辑后，重试原先的旧内容也会冲突；一键清空会移除幂等编号，见数据管理章节。

```json
{
  "requestId": "7f3a9c1e-3333-4d8a-b6f5-9e8d7c6b5a4f",
  "measurement": { "kind": "weight", "date": "2026-10-18", "time": "08:15", "value": "79.5", "note": "晨起" }
}
```

`measurement` 校验（按 `kind` 互斥，多余字段拒绝）：

| 字段 | weight | bodyFat | bloodPressure |
| --- | --- | --- | --- |
| `value` | 十进制字符串，>0 且 ≤500，≤2 位小数 | 同左，≤100 | 不接受 |
| `systolic` / `diastolic` | 不接受 | 不接受 | 整数 1–400，且收缩压 > 舒张压 |
| `period` | 不接受 | 不接受 | 必填，`morning` / `evening` |
| `date` | 合法日历日期，不能是未来日期（三者相同） | | |
| `time` | 可选，`HH:mm` 或 `null`，省略存为 `null`（三者相同） | | |
| `note` | 可选，去除首尾空白后 ≤500 字，可为 `null`；省略或空字符串存为 `null`（三者相同） | | |

成功返回 `{ entry }`。

### GET /api/v1/measurements/:id

单条详情。`:id` 非 UUID 返回 400；不存在、已删除或非本人返回 404。返回 `{ entry }`。

### PATCH /api/v1/measurements/:id

修改一条记录，乐观并发控制。

```json
{ "version": 1, "measurement": { "kind": "weight", "date": "2026-10-18", "time": "09:00", "value": "78.9", "note": null } }
```

- `measurement` 校验同 POST。
- 成功返回 `{ entry }`，`version` 递增为提交值 +1。
- 提交旧 `version` 得到 409（记录已被他人/其他标签页修改）；丢失响应后同内容重试（`version` 差 1 且内容一致）直接返回最新结果。
- 修改时不能更换 `kind`，需新增另一条。
- 不存在返回 404。

### DELETE /api/v1/measurements/:id

软删除一条记录（从读取、趋势和最新值中隐藏，保留删除标记避免旧请求重放）。请求体 `{ "version": 1 }`：

- 成功返回 `{ "ok": true }`；相同 `version` 的重试幂等地返回 200，不产生其他变更。
- 记录不存在（含已被一键清空硬删除）返回 404。
- 已删除记录搭配不匹配的 `version` 返回 404；未删除记录 `version` 不匹配返回 409。

## 训练记录（training-records）

每条记录代表一次训练，包含有序力量／有氧项目。`status=inProgress` 表示进行中或补录草稿，`completed` 表示用户已核对结束；未完成项目仍保留，不计入完成数。请求和项目对象均严格校验，不接受 `userId` 等额外字段。JSON 请求体最大 256 KiB（按实际字节读取，超出返回 413）。

网页在训练请求中携带初始账号的 `X-BodyTrace-User`，服务端仅将其与当前验证会话比较：不一致返回 401，防止其他标签切换账号后把旧输入提交给新账号。此头不授予权限、不决定资源归属；原生客户端可省略，身份始终来自会话。

### GET /api/v1/training-records

查询参数 `range=7|30|90|all`（默认 30）、`kind=all|strength|cardio|mixed`（默认 all）、`status=all|inProgress|completed`（默认 all）。类型为互斥分类：strength 仅纯力量，cardio 仅纯有氧，mixed 包含两者；空草稿只在 all 中出现。返回 `{ entries: TrainingRecord[] }`，按业务日期、时间、创建时间、ID 倒序，不包含删除记录。尚无游标分页。

使用 `?requestId=UUID` 核对一次新增，返回 `{ entry: TrainingRecord | null }`；尚未查到（含编号属于其他账号）返回 null，属于本人且已删除返回 409。非法参数返回 400。

### GET /api/v1/training-records/clock

登录后返回 `{ serverNow: "2026-10-27T12:00:00.000Z" }`，为当前服务端 UTC 时刻，响应使用 `Cache-Control: private, no-store`，不读取或创建训练记录。沿用 `X-BodyTrace-User` 账号核对；未登录或账号已切换返回 401。

网页在首次创建、后续保存和结束核对前校准服务端时间，再按单调计时器的经过时间计算当前日期、时间与实时开始时刻，避免设备时钟偏快、偏慢或被调整影响录入。未来时间校验保持严格；原生客户端也可使用该接口校准。未知 POST 的核对与重试始终保留原 `requestId` 和原 `training`，不能重新取时刻后更换同一次请求的内容。

### POST /api/v1/training-records

请求 `{ requestId: UUID, training: TrainingInput }`。首次创建返回 `201 { entry }`，同编号同内容返回同一记录 `200 { entry }`；同编号换内容、记录已被修改为其他内容或已单条删除时返回 409。未知结果先 GET 按编号核对，确认未保存才用原编号和原内容重试。

合成示例：

```json
{
  "requestId": "d2b35b3d-412d-4687-a5e9-5aba7b929010",
  "training": {
    "title": "力量与跑步",
    "date": "2026-10-26",
    "time": "18:30",
    "mode": "manual",
    "status": "completed",
    "startedAt": null,
    "durationMinutes": 60,
    "note": null,
    "items": [
      {
        "id": "405a702f-914c-4fc0-a090-71d105431010",
        "kind": "strength",
        "name": "杠铃卧推",
        "mode": "weighted",
        "sets": [{
          "id": "405a702f-914c-4fc0-a090-71d105431011",
          "weightKg": 40,
          "reps": 10,
          "durationSeconds": null,
          "completed": true
        }]
      },
      {
        "id": "405a702f-914c-4fc0-a090-71d105431012",
        "kind": "cardio",
        "name": "跑步",
        "durationMinutes": 20,
        "distanceKm": 2.5,
        "completed": true
      }
    ]
  }
}
```

`TrainingInput` 字段必须全部提供，可空字段明确传 null：

| 字段 | 契约 |
| --- | --- |
| title | 去首尾空白后 1–80 字 |
| date / time | 真实日期 `YYYY-MM-DD`，不早于 1000-01-01、不晚于应用今天；时间为 `HH:mm` 或 null，同日时间不能晚于当前应用时间 |
| mode | live 实时／manual 补录，创建后不能修改 |
| startedAt | live 必须提供带时区 ISO 时刻，规范化为 UTC，不能在未来且 UTC 年份为1000–9999；manual 必须 null，创建后不能修改 |
| status | inProgress／completed；完成状态至少有一组力量或一项有氧已完成 |
| durationMinutes | 整场整数分钟 1–1440 或 null，与有氧时长独立，不能由分项简单相加 |
| note | 去首尾空白后最多 1000 字，空串归一为 null |
| items | 0–50 项；每个项目名称 1–80 字，项目与组的 UUID 在整场内不得重复 |

力量项目 `kind=strength`、`mode=weighted|bodyweight|timed`，`sets` 为 1–50 组；每组必须提供 `id`、`weightKg`、`reps`、`durationSeconds`、`completed`。重量 0–1000 kg，最多两位小数；次数为 1–10000 整数，持续秒数为 1–86400 整数，数值可为 null。次数动作的秒数必须 null；计时动作的重量与次数必须 null。完成组中，weighted 要求正重量和次数，bodyweight 要求次数且允许不填额外重量，timed 要求秒数。未完成组可缺值，但非空值仍需符合范围。

有氧项目 `kind=cardio`，字段为 `id`、`name`、`durationMinutes`（1–1440 整数或 null）、`distanceKm`（0–1000、最多两位小数或 null）、`completed`。完成有氧必须填写时长，距离可未知。

`TrainingRecord` 在上述字段基础上增加 `id`、`timeZone`（创建时的服务端应用时区）、`version`、`createdAt` 和 `updatedAt`；不返回用户 ID、requestId 和删除标记。业务日期按开始日归档，不从 createdAt 推导。复制由客户端取本人原记录并新建：新项目／组编号、实际值清空、完成状态清空，源数值单独展示为参考。

### GET /api/v1/training-records/:id

返回 `{ entry }`。未登录 401，非法 UUID 为 400；不存在、已删除或属于其他用户都返回 404。

### PATCH /api/v1/training-records/:id

请求 `{ version: 正整数, training: TrainingInput }`，整次训练的项目、组、顺序与版本原子更新。成功 `{ entry }`，version 增加 1；旧版本返回 409，紧接的一次相同版本／相同内容重试返回已有结果。`mode` 与 `startedAt` 固定；日期、时间、总时长可以更正。状态可以调整，但每次进入 completed 都需满足完成校验。

草稿自动保存须串行提交；保存期间新增的本地改动在当前请求确认后再提交。超时先读取详情：仅当版本恰好推进一次且内容一致时确认刚才成功；版本未变才能重试原请求；其他情况保留本地输入并让用户核对冲突。不能将 GET 任意返回的数据当作本次保存成功。

### DELETE /api/v1/training-records/:id

请求 `{ version: 正整数 }`；成功 `{ ok: true }`。软删除并递增版本，不再出现在列表／详情。重复同一删除请求成功；旧版本冲突 409，不存在或不可访问 404。保留请求编号以拒绝旧 POST 重放。创建、更新、删除与清空先取得同一用户行锁；一键清空会硬删除训练及编号，语义见下节。

## 个人资料（profile）

每用户一行，字段可空（`null` 表示未填写），允许分次填写资料；PUT 仍按下表提交必填字段，`null` 不等于可以省略。

### GET /api/v1/profile

```json
{ "profile": { "gender": "male", "heightCm": 175, "weightKg": 79.5, "targetWeightKg": 70 } }
```

从未填写时返回全 `null` 字段。已有测量记录时 `weightKg` 为最新测量体重；无测量时为旧资料值。

### PUT /api/v1/profile

保存时 `gender`、`heightCm`、`targetWeightKg` 必须同时提交，未填写的字段传 `null`；不是 PATCH 语义，传 `null` 会清空相应旧值。只有 `weightKg` 可以省略，省略时保留旧资料体重。

```json
{ "gender": "male", "heightCm": 175, "weightKg": 79.5, "targetWeightKg": 70 }
```

| 字段 | 校验 |
| --- | --- |
| `gender` | 必填，`male` / `female` / `other` 或 `null` |
| `heightCm` | 必填，50–280 或 `null` |
| `weightKg` | 20–500 或 `null`；**可选**，兼容旧客户端 |
| `targetWeightKg` | 必填，20–500 或 `null` |

已有测量体重时，提交 `weightKg` 且与最新测量值不同返回 `409`（体重应通过身体指标接口修改）；省略该字段或值一致则正常保存。成功返回 `{ profile }`（读取语义同 GET）。

## 数据管理（records）

### DELETE /api/v1/records

一键清空当前用户的**全部饮食记录、餐次照片、身体指标与训练**：同一事务内硬删除，包含训练草稿及此前软删除行。个人食物库、每日目标、饮食计划和个人资料不受影响。重复调用成功；两次之间没有新写入时返回数量 0。清空与照片、训练写入先锁同一用户行，在事务内取得对象 key 并删除记录，COS 对象在事务提交后批量清理；对象清理失败只记录日志，不影响清空结果。

返回的 `cleared.measurements` / `cleared.mealPhotos` 包括各自已软删除的行，所以可能大于清空前界面可见的指标数。硬删除会清除测量和照片的 `requestId` 占用与删除标记；清空后重放旧新增请求可能重新创建记录，客户端应停止上传、丢弃待重试的旧新增操作并刷新状态。用户行锁只保证事务串行，不会使尚在转码/上传或其他设备保留的旧请求失效；这些请求在清空后提交仍可能创建照片。跨设备阻止恢复需要另外的服务端失效机制。

```json
{ "ok": true, "cleared": { "mealEntries": 42, "measurements": 17, "mealPhotos": 8, "trainingRecords": 3 } }
```

`cleared.trainingRecords` 同样包含删除标记。训练硬清空会释放 requestId，旧新增重试可能重新创建记录；应停止其他设备的训练录入、丢弃旧创建请求。已创建草稿的旧 PATCH 在清空后返回 404，不可自动改用 POST 重建。
