# BodyTrace API 参考

本文档整理**当前已实现**的 HTTP 接口，按业务模块分类，供网页客户端与未来移动 App 共用。契约以代码为准（`src/app/api/v1/` 路由 + `src/services/` 校验），新增或修改接口时同步更新本文档。规划中尚未实现的接口见[开发指南](BodyTrace_Nextjs_MySQL_Development_Guide.md)第 5 节。

本文中的示例数据均为虚构合成数据，不代表任何真实用户。

## 目录

- [通用约定](#通用约定)
- [认证（auth）](#认证auth)
- [食物库（foods）](#食物库foods)
- [饮食记录与汇总（meals / summary / trends）](#饮食记录与汇总)
- [目标与计划（goals / plan）](#目标与计划)
- [身体指标（measurements）](#身体指标measurements)
- [个人资料（profile）](#个人资料profile)
- [数据管理（records）](#数据管理records)

## 通用约定

| 项 | 约定 |
| --- | --- |
| Base URL | 应用部署地址，业务接口统一前缀 `/api/v1`，认证接口前缀 `/api/auth` |
| 认证 | 所有业务接口需登录。网页走 cookie 会话；App 登录后可携带 `Authorization: Bearer <token>`（better-auth bearer 插件已启用） |
| CSRF | 写方法（POST/PATCH/PUT/DELETE）携带 `Origin` 头时必须与应用地址同 host，否则 401；不带 Origin 的请求（脚本、App token 调用）放行 |
| 命名 | 请求与响应 JSON 均为 camelCase |
| 成功响应 | 数据包在语义键里，如 `{ foods }`、`{ entry }`、`{ goals }` |
| 错误响应 | `{ "error": "说明" }`，配合 400 / 401 / 404 / 409 状态码 |
| 业务日期 | `YYYY-MM-DD` 字符串，按 `APP_TIMEZONE`（默认 `Asia/Shanghai`）计算"今天" |
| 测量时间 | `HH:mm` 字符串，可空；创建/更新时间戳为 ISO-8601 UTC |
| 营养单位 | 热量 kcal，蛋白质/碳水/脂肪 g；食物库营养值按**每 100g** 保存，饮食记录按实际克数折算为快照 |
| 所有权 | `userId` 一律来自服务端会话；访问他人资源按 404 处理，不泄露其存在 |

常见错误码（各接口不再重复列出，仅列特有行为）：

| 状态码 | 含义 |
| --- | --- |
| 400 | 请求体或参数未通过 Zod 校验，`error` 形如 `"grams: 数字需在 1 到 5000 之间"` |
| 401 | 未登录、会话过期，或写方法 Origin 校验失败 |
| 404 | 资源不存在或不属于当前用户 |
| 409 | 并发或幂等冲突（版本号、请求编号、体重来源等） |

## 认证（auth）

认证由 [better-auth](https://www.better-auth.com/) 提供并托管在 `/api/auth/*`，请求/响应字段以 better-auth 文档为准。当前应用实际使用以下端点：

| 方法与路径 | 用途 |
| --- | --- |
| `POST /api/auth/sign-up/email` | 注册，`{name, email, password}`，成功返回用户并设置会话 cookie |
| `POST /api/auth/sign-in/email` | 登录，`{email, password}`；App 可从响应取 token 供 Bearer 调用 |
| `POST /api/auth/sign-out` | 退出登录，作废当前会话 |
| `GET /api/auth/get-session` | 查询当前会话与用户，未登录返回 `null` |
| `POST /api/auth/request-password-reset` | 申请密码重置，`{email, redirectTo}`；当前仅在开发模式输出重置链接到服务端终端，不发送邮件 |
| `POST /api/auth/reset-password` | 使用一次性令牌设置新密码，`{token, newPassword}`；成功后旧会话全部失效 |

密码找回的重置链接只通过一次性令牌交付，令牌有过期时间，使用后其他令牌作废。

## 食物库（foods）

个人食物库按用户隔离；`/reference` 为全体用户共享的官方只读参考库。

### GET /api/v1/foods

搜索自己的食物库。查询参数：

| 参数 | 必填 | 说明 |
| --- | --- | --- |
| `q` | 否 | 名称关键词，不区分大小写的包含匹配；省略返回全部 |
| `favorite` | 否 | `true` 时只返回收藏 |

排序：收藏优先，再按名称升序。

```json
// GET /api/v1/foods?q=鸡胸
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

最近吃过的食物：按最近一次记录时间倒序去重，最多 12 个。返回 `{ foods }`，元素结构同上。

### GET /api/v1/foods/reference?q=

搜索官方参考库《中国食物成分表（标准版第6版）》1677 种食物（数据来自 [Sanotsu/china-food-composition-data](https://github.com/Sanotsu/china-food-composition-data)）。`q` 省略或为空返回空数组；按名称排序，最多 20 条。营养值为每 100g 可食部，个别字段可能为 `null`。

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

记录保存写入时刻的食物名称与营养快照；修改克数按记录内已有快照等比缩放，与食物库当前状态无关。餐次固定为 `breakfast` / `lunch` / `dinner` / `snack`。

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
  ]
}
```

`foodId` 在食物被删除后为 `null`，记录仍可改克数、可删除。

### POST /api/v1/meals

记一笔。只能使用自己食物库里的食物。

```json
{ "date": "2026-10-18", "mealType": "breakfast", "foodId": "0b6b2c6e-...", "grams": 200 }
```

| 字段 | 类型 | 校验 |
| --- | --- | --- |
| `date` | string | 合法日历日期，且不能是未来日期 |
| `mealType` | enum | `breakfast` / `lunch` / `dinner` / `snack` |
| `foodId` | uuid | 必须存在于本人食物库 |
| `grams` | number | 1–5000 |

成功 `201` 返回 `{ entry }`（营养按克数折算后的快照）；食物不存在或非本人返回 `404 {"error":"食物不存在"}`。

### PATCH /api/v1/meals/:id

修改克数，营养值按新旧克数比例重算。请求 `{ "grams": 300 }`（1–5000）。成功返回 `{ entry }`，不存在返回 404。

### DELETE /api/v1/meals/:id

删除一条记录，返回 `{ "ok": true }`；不存在（含重复删除）返回 404。

### GET /api/v1/summary?date=YYYY-MM-DD

某天汇总：按餐次分组的记录 + 全天合计 + 当天生效目标。首页与日记共用。

```json
{
  "date": "2026-10-18",
  "byMeal": [
    { "mealType": "breakfast", "label": "早餐", "entries": [ /* MealEntry */ ] },
    { "mealType": "lunch", "label": "午餐", "entries": [] },
    { "mealType": "dinner", "label": "晚餐", "entries": [] },
    { "mealType": "snack", "label": "加餐", "entries": [] }
  ],
  "totals": { "calories": 236, "protein": 49.2, "carbs": 1.2, "fat": 3.8 },
  "goals": { "calories": 2200, "protein": 140, "carbs": 230, "fat": 70 },
  "goalSource": "plan",
  "goalDayType": "medium"
}
```

目标按日期解析：启用中的碳循环计划且日期在起始日（含）之后按当天日型取值（`goalSource: "plan"`，`goalDayType` 为该日 `high`/`medium`/`low`）；否则回落到每日目标（`goalSource: "base"`，`goalDayType: null`）。`date` 必填且格式合法，否则 400。

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

查询每日目标。从未设置过时返回默认值（不落库）：`{ calories: 2000, protein: 120, carbs: 220, fat: 60 }`。

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

查询碳循环计划（每用户至多一条），没有时返回 `{ "plan": null }`。`weekday` 序号 0=周一 … 6=周日，按序号升序返回。

```json
{
  "plan": {
    "startDate": "2026-10-12",
    "isActive": true,
    "weekdays": [
      { "weekday": 0, "dayType": "high", "calories": 2600, "protein": 140, "carbs": 320, "fat": 60 },
      { "weekday": 1, "dayType": "medium", "calories": 2200, "protein": 140, "carbs": 230, "fat": 70 }
      // … 共 7 项
    ]
  }
}
```

### PUT /api/v1/plan

整体保存（全量替换七天），事务内完成。`startDate` 之前的日子不受计划影响，仍走每日目标。

```json
{
  "startDate": "2026-10-12",
  "isActive": true,
  "weekdays": [
    { "dayType": "high", "calories": 2600, "protein": 140, "carbs": 320, "fat": 60 }
    // … 恰好 7 项，顺序为周一到周日
  ]
}
```

| 字段 | 校验 |
| --- | --- |
| `startDate` | 合法日历日期 `YYYY-MM-DD` |
| `isActive` | boolean；`false` 表示停用但保留配置 |
| `weekdays` | 恰好 7 项；每项 `dayType` 为 `high`/`medium`/`low`，宏量同每日目标范围 |

成功返回 `{ plan }`（保存的输入；`weekdays` 不含 `weekday` 序号，数组顺序即周一到周日）。

### DELETE /api/v1/plan

删除计划（七天安排级联清理），之后所有日期回落到每日目标。返回 `{ "status": true }`。

## 身体指标（measurements）

指标类型 `kind`：`weight`（体重 kg）、`bodyFat`（体脂率 %）、`bloodPressure`（血压 mmHg）。小数值以十进制字符串传输（最多两位小数，保存统一补齐为两位，如 `"79.50"`）；血压两项成对保存并必填测量时段。

记录带 `version` 版本号：每次修改或删除递增，客户端提交旧版本会得到 409。

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

- `latest` / `previous`：三个指标各自独立解析；血压的"上一次"按同时段（晨与晨、夜与夜）比较。
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

血压记录的 `value` 为 `null`，`systolic`/`diastolic` 有值并带 `period`（`morning` 晨间 / `evening` 夜间）；迁移前的旧血压可能 `period` 为 `null`（未标记时段），编辑时可补选。体重/体脂的 `systolic`/`diastolic`/`period` 恒为 `null`。

### POST /api/v1/measurements

新增一条测量。`requestId` 是本次操作的 UUID，网络重试复用同一编号实现幂等：相同编号 + 相同内容返回同一记录（`200`），首次创建返回 `201`；相同编号换内容、或该编号对应的记录已删除，返回 409（不会复活已删记录）。

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
| `time` | 可选，`HH:mm`（三者相同） | | |
| `note` | 可选，≤500 字（三者相同） | | |

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

## 个人资料（profile）

每用户一行，字段可空（`null` 表示未填写），允许分次填写。

### GET /api/v1/profile

```json
{ "profile": { "gender": "male", "heightCm": 175, "weightKg": 79.5, "targetWeightKg": 70 } }
```

从未填写时返回全 `null` 字段。已有测量记录时 `weightKg` 为最新测量体重；无测量时为旧资料值。

### PUT /api/v1/profile

```json
{ "gender": "male", "heightCm": 175, "weightKg": 79.5, "targetWeightKg": 70 }
```

| 字段 | 校验 |
| --- | --- |
| `gender` | `male` / `female` / `other` 或 `null` |
| `heightCm` | 50–280 或 `null` |
| `weightKg` | 20–500 或 `null`；**可选**，兼容旧客户端 |
| `targetWeightKg` | 20–500 或 `null` |

已有测量体重时，提交 `weightKg` 且与最新测量值不同返回 `409`（体重应通过身体指标接口修改）；省略该字段或值一致则正常保存。成功返回 `{ profile }`（读取语义同 GET）。

## 数据管理（records）

### DELETE /api/v1/records

一键清空当前用户的**全部饮食记录与身体指标**：同一事务内硬删除，包括此前软删除的测量行。个人食物库、每日目标、碳循环计划和个人资料不受影响。接口可安全重试，重复调用返回数量 0。

```json
{ "ok": true, "cleared": { "mealEntries": 42, "measurements": 17 } }
```
