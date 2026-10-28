/**
 * 从真实校验 schema 生成 OpenAPI 3.1 接口文档（docs/openapi.yaml）。
 *
 * 运行：npm run docs:api —— 修改接口契约后重新生成，不要手改产物。
 *
 * 请求体与参数直接复用 src/services、src/lib 的 Zod schema（文档与校验代码同源，
 * schema 改了文档就改）；响应结构当前代码没有 zod 校验，按
 * docs/BodyTrace_API_Reference.md 的契约在本文件 response 区声明。
 * 预览：npx @redocly/cli preview-docs docs/openapi.yaml
 */
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { stringify } from "yaml";
import {
  extendZodWithOpenApi,
  OpenAPIRegistry,
  OpenApiGeneratorV31,
} from "@asteasolutions/zod-to-openapi";
import { z } from "zod";
import { todayStr } from "@/lib/date";
import { MEAL_ORDER } from "@/lib/nutrition";
import { mealCreateSchema, mealPatchSchema } from "@/services/meals";
import { mealSlotSchema } from "@/services/meal-slot";
import { foodInputSchema, foodPatchSchema } from "@/services/foods";
import { goalsSchema } from "@/services/goals";
import { planSchema } from "@/services/plan";
import { profileSchema } from "@/services/profile";
import { measurementSchemas } from "@/lib/measurements";
import { trainingSchemas } from "@/lib/training";

extendZodWithOpenApi(z);

const registry = new OpenAPIRegistry();
const uuid = z.string().uuid();
const dateTime = z.string().datetime();

/** 共用描述片段 */
const BUSINESS_DATE = "真实日历日期 YYYY-MM-DD；记录类接口拒绝未来日期";
const TRAILING_NOTE = "服务端仅校验本 schema；以上错误响应均为 { error: 说明 }";

/* ───────────────────────────── 响应（文档契约） ───────────────────────────── */

const ApiError = registry.register(
  "ApiError",
  z.object({ error: z.string().describe("面向人的说明，不作为稳定的机器错误代码") }),
);
const AuthError = registry.register(
  "AuthError",
  z.object({ code: z.string().openapi({ example: "INVALID_OTP" }), message: z.string() }),
);
const OkResult = registry.register("OkResult", z.object({ ok: z.literal(true) }));
const AuthUser = registry.register(
  "AuthUser",
  z.looseObject({
    id: z.string(),
    name: z.string(),
    email: z.string().describe("手机注册用户为内部 .invalid 兼容地址"),
    phoneNumber: z.string().nullable().optional(),
    phoneNumberVerified: z.boolean().optional(),
  }),
);

const Macro = registry.register(
  "Macro",
  z.object({
    calories: z.number().describe("kcal"),
    protein: z.number().describe("g"),
    carbs: z.number().describe("g"),
    fat: z.number().describe("g"),
  }),
);
const Goals = registry.register(
  "Goals",
  z.object({
    calories: z.number().int().min(500).max(8000),
    protein: z.number().int().min(0).max(600),
    carbs: z.number().int().min(0).max(1200),
    fat: z.number().int().min(0).max(500),
  }),
);

const Food = registry.register(
  "Food",
  z.object({
    id: uuid,
    userId: z.string(),
    name: z.string(),
    brand: z.string().nullable(),
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
    servingGrams: z.number().nullable(),
    isFavorite: z.boolean(),
    createdAt: dateTime,
    updatedAt: dateTime,
  }),
);
const ReferenceFood = registry.register(
  "ReferenceFood",
  z.object({
    id: z.number(),
    foodCode: z.string(),
    name: z.string(),
    englishName: z.string().nullable(),
    category: z.string(),
    calories: z.number().nullable(),
    protein: z.number().nullable(),
    carbs: z.number().nullable(),
    fat: z.number().nullable(),
    dietaryFiber: z.number().nullable(),
    edible: z.number().nullable(),
  }),
);

const MealEntry = registry.register(
  "MealEntry",
  z.object({
    id: uuid,
    userId: z.string(),
    date: z.string(),
    mealType: z.enum(MEAL_ORDER),
    foodId: uuid.nullable().describe("食物删除后为 null，记录仍可改克数、可删除"),
    name: z.string(),
    grams: z.number(),
    calories: z.number(),
    protein: z.number(),
    carbs: z.number(),
    fat: z.number(),
    createdAt: dateTime,
  }),
);
const MealPhoto = registry.register(
  "MealPhoto",
  z.object({
    id: uuid,
    date: z.string(),
    mealType: z.enum(MEAL_ORDER),
    url: z.string().describe("WebP 主图；签名地址不能长期缓存"),
    thumbUrl: z.string().describe("WebP 缩略图"),
    width: z.number().int(),
    height: z.number().int(),
    position: z.number().int().describe("餐内排序值从 0 递增；删除后不重排"),
  }),
);

const DaySummary = registry.register(
  "DaySummary",
  z.object({
    date: z.string(),
    byMeal: z.array(
      z.object({
        mealType: z.enum(MEAL_ORDER),
        label: z.string(),
        entries: z.array(MealEntry),
        photos: z.array(MealPhoto),
      }),
    ),
    totals: Macro,
    goals: Goals,
    goalSource: z.enum(["plan", "base"]).describe("plan = 计划的当天目标；base = 每日目标兜底"),
  }),
);

const PlanItem = registry.register(
  "PlanItem",
  z.object({
    id: uuid,
    weekday: z.number().int().min(0).max(6).describe("0=周一 … 6=周日"),
    mealType: z.enum(MEAL_ORDER),
    foodId: uuid.nullable().describe("null 表示食物已删除的失效行"),
    name: z.string(),
    grams: z.number(),
    per100g: Macro.nullable().describe("食物库当前每 100g 原始营养，仅在响应中提供"),
    calories: z.number().nullable(),
    protein: z.number().nullable(),
    carbs: z.number().nullable(),
    fat: z.number().nullable(),
  }),
);
const Plan = registry.register(
  "Plan",
  z.object({
    startDate: z.string(),
    isActive: z.boolean(),
    weekdays: z.array(Goals).length(7).describe("按周一到周日顺序，不含 weekday 序号"),
    items: z.array(PlanItem),
  }),
);

const Measurement = registry.register(
  "Measurement",
  z.object({
    id: uuid,
    kind: z.enum(["weight", "bodyFat", "bloodPressure"]),
    date: z.string(),
    time: z.string().regex(/^\d{2}:\d{2}$/).nullable(),
    timeZone: z.string(),
    value: z.string().nullable().describe('体重/体脂十进制字符串（保存补齐两位，如 "79.50"）；血压为 null'),
    systolic: z.number().int().nullable(),
    diastolic: z.number().int().nullable(),
    period: z.enum(["morning", "evening"]).nullable().describe("血压时段；迁移前旧数据可能为 null"),
    note: z.string().nullable(),
    version: z.number().int().describe("每次修改或删除递增"),
    createdAt: dateTime,
    updatedAt: dateTime,
  }),
);

const trainingDocs = trainingSchemas(todayStr());
const TrainingRecord = registry.register(
  "TrainingRecord",
  z.object({
    id: uuid,
    title: z.string(),
    date: z.string(),
    time: z.string().nullable(),
    mode: z.enum(["live", "manual"]),
    status: z.enum(["inProgress", "completed"]),
    startedAt: z.string().nullable(),
    durationMinutes: z.number().int().nullable(),
    note: z.string().nullable(),
    items: trainingDocs.payload.shape.items,
    timeZone: z.string().describe("创建时的服务端应用时区"),
    version: z.number().int(),
    createdAt: dateTime,
    updatedAt: dateTime,
  }),
);

const Profile = registry.register(
  "Profile",
  z.object({
    gender: z.enum(["male", "female", "other"]).nullable(),
    heightCm: z.number().nullable(),
    weightKg: z.number().nullable().describe("有测量时为最新测量体重"),
    targetWeightKg: z.number().nullable(),
  }),
);

/* ───────────────────────────── 认证 ───────────────────────────── */

const JSON_CONTENT = { "application/json": {} } as const;

registry.registerPath({
  method: "post",
  path: "/api/auth/sign-up/email",
  operationId: "signUpEmail",
  tags: ["认证"],
  summary: "邮箱注册",
  description:
    "保留的邮箱注册 API；网页注册入口已统一到手机号。密码 8–128 字符。",
  security: [],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({ name: z.string(), email: z.string().email(), password: z.string().min(8).max(128) }),
        },
      },
    },
  },
  responses: {
    "200": { description: "注册成功，设置会话 cookie", content: JSON_CONTENT },
    "400": { description: "参数校验失败（如密码长度）", content: { "application/json": { schema: AuthError } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/sign-in/email",
  operationId: "signInEmail",
  tags: ["认证"],
  summary: "邮箱密码登录",
  description: "App 客户端从响应中取 token 字段，供 Authorization: Bearer 调用。",
  security: [],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({ email: z.string().email(), password: z.string() }),
        },
      },
    },
  },
  responses: {
    "200": {
      description: "登录成功，设置会话 cookie；响应含 token",
      content: {
        "application/json": {
          schema: z.looseObject({ token: z.string().optional(), user: AuthUser.optional() }),
        },
      },
    },
    "401": { description: "邮箱或密码错误", content: { "application/json": { schema: AuthError } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/phone-number/send-otp",
  operationId: "sendLoginOtp",
  tags: ["认证"],
  summary: "发送手机号登录验证码",
  description:
    "支持大陆 11 位或 +86 格式，内部统一为 +86；成功不返回验证码。同号间隔默认 60 秒，另有同号每 24 小时 10 次、同来源每分钟 5 次限制（429 带 Retry-After）。",
  security: [],
  request: {
    body: {
      required: true,
      content: {
        "application/json": { schema: z.object({ phoneNumber: z.string().openapi({ example: "13800138000" }) }) },
      },
    },
  },
  responses: {
    "200": {
      description: "已发送",
      content: { "application/json": { schema: z.object({ message: z.string().openapi({ example: "code sent" }) }) } },
    },
    "429": { description: "触发频控", content: { "application/json": { schema: AuthError } } },
    "503": {
      description: "短信未开放（SMS_UNAVAILABLE）或发送失败（SMS_SEND_FAILED）",
      content: { "application/json": { schema: AuthError } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/phone-number/verify",
  operationId: "verifyLoginOtp",
  tags: ["认证"],
  summary: "校验验证码并登录（首次自动注册）",
  description:
    "验证码默认 6 位（SMS_CODE_LENGTH 可配 4–6），有效期默认 5 分钟，最多 3 次错误尝试、成功一次性消费，重发作废旧码。",
  security: [],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({ phoneNumber: z.string(), code: z.string().describe("数字字符串") }),
        },
      },
    },
  },
  responses: {
    "200": {
      description: "返回 {status, token, user} 并设置会话 cookie",
      content: {
        "application/json": {
          schema: z.looseObject({
            status: z.boolean().optional(),
            token: z.string().optional().describe("Bearer 会话令牌（App 用）"),
            user: AuthUser.optional(),
          }),
        },
      },
    },
    "400": {
      description: "INVALID_PHONE_INPUT / INVALID_OTP / OTP_EXPIRED 等",
      content: { "application/json": { schema: AuthError } },
    },
    "403": {
      description: "尝试次数耗尽 TOO_MANY_ATTEMPTS",
      content: { "application/json": { schema: AuthError } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/sign-out",
  operationId: "signOut",
  tags: ["认证"],
  summary: "退出登录",
  description: "作废当前会话。",
  responses: {
    "200": { description: "已退出", content: JSON_CONTENT },
    "400": { description: "会话无效", content: { "application/json": { schema: AuthError } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/auth/get-session",
  operationId: "getCurrentSession",
  tags: ["认证"],
  summary: "查询当前会话与用户",
  security: [],
  responses: {
    "200": {
      description: "会话信息；未登录返回 null",
      content: {
        "application/json": { schema: z.looseObject({ user: AuthUser.optional() }).nullable() },
      },
    },
    "400": { description: "会话 cookie 损坏等客户端异常", content: { "application/json": { schema: AuthError } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/request-password-reset",
  operationId: "requestPasswordReset",
  tags: ["认证"],
  summary: "申请密码重置（仅开发环境）",
  description:
    "仅在 NODE_ENV=development 且应用地址为回环地址时开放，重置链接输出到服务端终端；其他环境返回 400 RESET_PASSWORD_DISABLED。",
  security: [],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({ email: z.string().email(), redirectTo: z.string().optional() }),
        },
      },
    },
  },
  responses: {
    "200": { description: "已受理（是否签发链接取决于环境）", content: JSON_CONTENT },
    "400": {
      description: "环境未开放（RESET_PASSWORD_DISABLED）或参数非法",
      content: { "application/json": { schema: AuthError } },
    },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/auth/reset-password",
  operationId: "resetPassword",
  tags: ["认证"],
  summary: "使用一次性令牌设置新密码",
  description: "令牌 15 分钟有效；成功后其他重置令牌与全部旧会话作废。",
  security: [],
  request: {
    body: {
      required: true,
      content: {
        "application/json": {
          schema: z.object({ token: z.string(), newPassword: z.string().min(8).max(128) }),
        },
      },
    },
  },
  responses: {
    "200": { description: "密码已重置", content: JSON_CONTENT },
    "400": { description: "令牌无效或过期", content: { "application/json": { schema: AuthError } } },
  },
});

/* ───────────────────────────── 食物库 ───────────────────────────── */

registry.registerPath({
  method: "get",
  path: "/api/v1/foods",
  operationId: "listFoods",
  tags: ["食物库"],
  summary: "搜索自己的食物库",
  description: "按名称不区分大小写 LIKE 包含匹配；收藏优先，再按名称升序。",
  request: {
    query: z.object({
      q: z.string().optional().describe("省略或空白返回全部；% 与 _ 保留 LIKE 通配符含义"),
      favorite: z.string().optional().describe('只有字符串 "true" 启用收藏筛选，其他值不筛选'),
    }),
  },
  responses: {
    "200": {
      description: "食物列表",
      content: { "application/json": { schema: z.object({ foods: z.array(Food) }) } },
    },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/foods",
  operationId: "createFood",
  tags: ["食物库"],
  summary: "新增食物",
  description: "营养值按每 100g 填写。",
  request: { body: { required: true, content: { "application/json": { schema: foodInputSchema } } } },
  responses: {
    "201": {
      description: "创建成功",
      content: { "application/json": { schema: z.object({ food: Food }) } },
    },
    "400": { description: TRAILING_NOTE, content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/foods/recents",
  operationId: "listRecentFoods",
  tags: ["食物库"],
  summary: "最近吃过的食物",
  description: "按每种食物最近一次录入时间倒序，最多 12 种；只返回本人食物库中仍存在的食物。",
  responses: {
    "200": {
      description: "食物列表",
      content: { "application/json": { schema: z.object({ foods: z.array(Food) }) } },
    },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/foods/reference",
  operationId: "listReferenceFoods",
  tags: ["食物库"],
  summary: "搜索官方参考食物库",
  description:
    "《中国食物成分表（标准版第6版）》1677 种食物，全体用户共享只读。q 为空返回空数组；按名称排序，最多 20 条。营养为每 100g 可食部，个别字段可能为 null。",
  request: { query: z.object({ q: z.string().optional() }) },
  responses: {
    "200": {
      description: "参考食物列表",
      content: { "application/json": { schema: z.object({ foods: z.array(ReferenceFood) }) } },
    },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/foods/{id}",
  operationId: "updateFood",
  tags: ["食物库"],
  summary: "部分更新食物",
  description: "未提交的字段保持原值；isFavorite 用于收藏开关。",
  request: {
    params: z.object({ id: uuid }),
    body: { required: true, content: { "application/json": { schema: foodPatchSchema } } },
  },
  responses: {
    "200": { description: "更新成功", content: { "application/json": { schema: z.object({ food: Food }) } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
    "404": {
      description: "食物不存在或不属于当前用户",
      content: { "application/json": { schema: ApiError } },
    },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/foods/{id}",
  operationId: "deleteFood",
  tags: ["食物库"],
  summary: "删除食物",
  description: "历史饮食记录保留写入时的营养快照，不受影响。",
  request: { params: z.object({ id: uuid }) },
  responses: {
    "200": { description: "删除成功", content: { "application/json": { schema: OkResult } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
    "404": { description: "不存在或不属于当前用户", content: { "application/json": { schema: ApiError } } },
  },
});

/* ───────────────────────────── 饮食记录 ───────────────────────────── */

registry.registerPath({
  method: "get",
  path: "/api/v1/meals",
  operationId: "listMealsByDate",
  tags: ["饮食记录"],
  summary: "某天的全部饮食记录",
  description:
    "按创建顺序排列；顶层 photos 为当天全部照片（按餐次与餐内 position 排序，始终是数组）。",
  request: { query: z.object({ date: mealSlotSchema.shape.date.describe(BUSINESS_DATE) }) },
  responses: {
    "200": {
      description: "记录与照片",
      content: {
        "application/json": {
          schema: z.object({ entries: z.array(MealEntry), photos: z.array(MealPhoto) }),
        },
      },
    },
    "400": { description: "日期缺失或非法", content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/meals",
  operationId: "createMealEntry",
  tags: ["饮食记录"],
  summary: "记一笔饮食",
  description:
    "只能使用自己食物库里的食物；营养按克数折算后保存为快照，与食物库后续修改无关。",
  request: { body: { required: true, content: { "application/json": { schema: mealCreateSchema } } } },
  responses: {
    "201": {
      description: "创建成功（不含 photos）",
      content: { "application/json": { schema: z.object({ entry: MealEntry }) } },
    },
    "400": { description: "参数校验失败", content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
    "404": {
      description: "食物不存在或非本人",
      content: { "application/json": { schema: ApiError } },
    },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/meals/{id}",
  operationId: "updateMealEntry",
  tags: ["饮食记录"],
  summary: "修改克数",
  description: "营养值按新旧克数比例重算；食物已删除的记录仍可操作。",
  request: {
    params: z.object({ id: uuid }),
    body: { required: true, content: { "application/json": { schema: mealPatchSchema } } },
  },
  responses: {
    "200": { description: "更新成功", content: { "application/json": { schema: z.object({ entry: MealEntry }) } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
    "404": { description: "不存在", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/meals/{id}",
  operationId: "deleteMealEntry",
  tags: ["饮食记录"],
  summary: "删除一条饮食记录",
  description: "该餐的照片不受影响；重复删除返回 404。",
  request: { params: z.object({ id: uuid }) },
  responses: {
    "200": { description: "删除成功", content: { "application/json": { schema: OkResult } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
    "404": { description: "不存在（含重复删除）", content: { "application/json": { schema: ApiError } } },
  },
});

/* ───────────────────────────── 饮食照片 ───────────────────────────── */

registry.registerPath({
  method: "post",
  path: "/api/v1/meal-photos",
  operationId: "uploadMealPhoto",
  tags: ["饮食照片"],
  summary: "上传单张餐次照片",
  description:
    "服务端按 EXIF 方向旋转、去 EXIF/GPS、转 WebP（主图长边 ≤1600px，缩略图 ≤480px）。支持 JPEG/PNG/WebP/AVIF（HEVC 编码 HEIC 需先转换），≤8 MiB、≤4000 万像素，每餐最多 6 张有效照片。" +
    "带 requestId（当前用户内唯一）可幂等重试：首次成功 201，相同用户/编号/日期/餐次/文件重放 200；编号被用于其他日期/餐次/文件返回 409。重试必须复用原编号与同一份文件字节，不要重新压缩。",
  request: {
    body: {
      required: true,
      content: {
        "multipart/form-data": {
          schema: z.object({
            date: mealSlotSchema.shape.date.describe("不能晚于应用时区的今天"),
            mealType: mealSlotSchema.shape.mealType,
            requestId: uuid.optional().describe("新客户端必传；幂等重试复用"),
            file: z.string().openapi({ format: "binary", description: "单张非空图片，1 B–8 MiB" }),
          }),
          encoding: { file: { contentType: "image/jpeg, image/png, image/webp, image/avif" } },
        },
      },
    },
  },
  responses: {
    "201": {
      description: "首次上传成功",
      content: { "application/json": { schema: z.object({ photo: MealPhoto }) } },
    },
    "200": {
      description: "幂等重放，返回已保存的照片",
      content: { "application/json": { schema: z.object({ photo: MealPhoto }) } },
    },
    "400": { description: "日期/餐次/UUID/文件非法，或该餐已满六张", content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录或 Origin 校验失败", content: { "application/json": { schema: ApiError } } },
    "404": { description: "上传提交前用户已被删除", content: { "application/json": { schema: ApiError } } },
    "409": { description: "编号用于其他日期/餐次/文件，或对应照片已删除", content: { "application/json": { schema: ApiError } } },
    "413": { description: "文件超过 8 MiB", content: { "application/json": { schema: ApiError } } },
    "502": {
      description: "COS / 数据库结果无法确认；不能据此认定未保存，应先 GET 核对",
      content: { "application/json": { schema: ApiError } },
    },
    "503": { description: "COS 配置不完整", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/meal-photos",
  operationId: "checkMealPhotoByRequestId",
  tags: ["饮食照片"],
  summary: "按请求编号核对上传结果",
  description:
    "只按当前用户和 requestId 核对。已保存且未删除返回 { photo }；尚未查到返回 { photo: null }——null 不代表旧请求已取消，查询错误/超时不能当成 null。",
  request: { query: z.object({ requestId: uuid }) },
  responses: {
    "200": {
      description: "核对结果",
      content: { "application/json": { schema: z.object({ photo: MealPhoto.nullable() }) } },
    },
    "400": { description: "编号缺失或非法", content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
    "409": { description: "对应照片已删除", content: { "application/json": { schema: ApiError } } },
    "502": { description: "数据库或地址生成暂不可用", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/meal-photos/{photoId}",
  operationId: "deleteMealPhoto",
  tags: ["饮食照片"],
  summary: "删除本人照片",
  description:
    "事务内设置删除标记，提交后尽力清理 COS 对象；释放配额但保留原编号与排序位置（旧编号再访问返回 409）。重复删除返回 404。",
  request: { params: z.object({ photoId: uuid }) },
  responses: {
    "200": { description: "删除成功", content: { "application/json": { schema: OkResult } } },
    "400": { description: "非法 UUID", content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录或 Origin 校验失败", content: { "application/json": { schema: ApiError } } },
    "404": { description: "不存在、非本人或已删除", content: { "application/json": { schema: ApiError } } },
  },
});

/* ───────────────────────────── 汇总与趋势 ───────────────────────────── */

registry.registerPath({
  method: "get",
  path: "/api/v1/summary",
  operationId: "getDaySummaryApi",
  tags: ["汇总与趋势"],
  summary: "某天汇总（首页 / 日记共用）",
  description:
    "按餐次分组的记录 + 全天合计 + 当天生效目标。目标按日期解析：启用中的计划且日期在起始日（含）之后按当天计划目标（goalSource=plan），否则回落每日目标（base）。响应不含 goalDayType（已移除）。",
  request: { query: z.object({ date: mealSlotSchema.shape.date.describe(BUSINESS_DATE) }) },
  responses: {
    "200": { description: "当日汇总", content: { "application/json": { schema: DaySummary } } },
    "400": { description: "日期缺失或非法", content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/trends",
  operationId: "getNutritionTrends",
  tags: ["汇总与趋势"],
  summary: "最近 N 天营养趋势",
  description: "days 为 7–180 整数，非法时回落 30。无记录的日期补 0（仅表示当天没有已记录摄入）。",
  request: {
    query: z.object({ days: z.coerce.number().int().min(7).max(180).optional().default(30) }),
  },
  responses: {
    "200": {
      description: "趋势数据",
      content: {
        "application/json": {
          schema: z.object({
            days: z.number().int(),
            trends: z.array(
              z.object({
                date: z.string(),
                calories: z.number(),
                protein: z.number(),
                carbs: z.number(),
                fat: z.number(),
                goalCalories: z.number().describe("当天生效的热量目标"),
              }),
            ),
          }),
        },
      },
    },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
  },
});

/* ───────────────────────────── 目标与计划 ───────────────────────────── */

registry.registerPath({
  method: "get",
  path: "/api/v1/goals",
  operationId: "getDailyGoals",
  tags: ["目标与计划"],
  summary: "查询每日目标",
  description: "从未设置过时返回默认值（2000/120/220/60）且不落库。",
  responses: {
    "200": {
      description: "每日目标",
      content: { "application/json": { schema: z.object({ goals: Goals }) } },
    },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "put",
  path: "/api/v1/goals",
  operationId: "saveDailyGoals",
  tags: ["目标与计划"],
  summary: "整体保存每日目标",
  description: "upsert 语义。",
  request: { body: { required: true, content: { "application/json": { schema: goalsSchema } } } },
  responses: {
    "200": {
      description: "保存成功",
      content: { "application/json": { schema: z.object({ goals: Goals }) } },
    },
    "400": { description: "参数校验失败", content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/plan",
  operationId: "getDietPlan",
  tags: ["目标与计划"],
  summary: "查询饮食计划",
  description:
    "每用户至多一条，没有时返回 { plan: null }。食物项不存营养快照：每次读取按食物库当前每 100g 值实时折算（1 位小数）。食物已删除的行 foodId/per100g/四个营养字段为 null（不是 0），名称与克数保留。计划没有版本或生效区间模型。",
  responses: {
    "200": {
      description: "当前计划",
      content: { "application/json": { schema: z.object({ plan: Plan.nullable() }) } },
    },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "put",
  path: "/api/v1/plan",
  operationId: "saveDietPlan",
  tags: ["目标与计划"],
  summary: "整体保存饮食计划",
  description:
    "全量替换七天目标与全部食物项（事务：计划行 upsert → 七天目标先删后插 → 食物项先删后插）。会改写 startDate（含）之后所有日期（含过去日期），没有历史版本。" +
    "items[].foodId 为 uuid 时必须全部属于当前用户食物库，任一无效整单拒绝 400、不存在部分写入；为 null 表示保留一条已失效行，必须带它在 GET 响应里的 id。" +
    "同餐顺序由请求数组顺序决定，请保持用户看到的顺序提交；items[].name 不可写，传入会被忽略。成功返回保存后读回的完整计划（带实时折算营养）。",
  request: { body: { required: true, content: { "application/json": { schema: planSchema } } } },
  responses: {
    "200": {
      description: "保存成功，返回读回的完整计划",
      content: { "application/json": { schema: z.object({ plan: Plan }) } },
    },
    "400": {
      description: "食物引用无效或格式错误（整单拒绝，旧计划保持原样）",
      content: { "application/json": { schema: ApiError } },
    },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/plan",
  operationId: "deleteDietPlan",
  tags: ["目标与计划"],
  summary: "删除饮食计划",
  description: "七天目标与食物项级联清理，之后所有日期回落到每日目标。",
  responses: {
    "200": {
      description: "删除成功",
      content: {
        "application/json": { schema: z.object({ status: z.literal(true) }) },
      },
    },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
  },
});

/* ───────────────────────────── 身体指标 ───────────────────────────── */

const measurementDocs = measurementSchemas(todayStr());
/** measurementSchemas 只提供 create/update；软删除只带 version，这里按契约补一个。 */
const measurementDeleteSchema = z.object({ version: z.number().int().min(1) });

registry.registerPath({
  method: "get",
  path: "/api/v1/measurements",
  operationId: "getMeasurementPanel",
  tags: ["身体指标"],
  summary: "读取指标面板数据",
  description:
    "entries 按 range 筛选，日期/时间/创建时间/id 倒序；latest/previous 始终从全部未删除记录解析（血压的上一次按同时段比较），不受 range 限制。targetWeightKg 来自个人资料；legacyWeightKg 为旧资料体重，仅作参考。",
  request: {
    query: z.object({
      range: z.enum(["7", "30", "90", "all"]).optional().default("30"),
    }),
  },
  responses: {
    "200": {
      description: "面板数据",
      content: {
        "application/json": {
          schema: z.object({
            range: z.string(),
            entries: z.array(Measurement),
            latest: z.object({
              weight: Measurement.nullable(),
              bodyFat: Measurement.nullable(),
              bloodPressure: Measurement.nullable(),
            }),
            previous: z.object({
              weight: Measurement.nullable(),
              bodyFat: Measurement.nullable(),
              bloodPressure: Measurement.nullable(),
            }),
            targetWeightKg: z.number().nullable(),
            legacyWeightKg: z.number().nullable(),
            today: z.string(),
            timeZone: z.string(),
          }),
        },
      },
    },
    "400": { description: "range 非法", content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/measurements",
  operationId: "createMeasurement",
  tags: ["身体指标"],
  summary: "新增一条测量",
  description:
    "requestId 为本次操作的 UUID，当前用户内唯一（幂等编号在 JSON 请求体中）。重试复用同一编号：内容一致返回同一记录（200），首次创建 201；同编号换内容或对应记录仍有软删除标记返回 409。" +
    "measurement 按 kind 互斥校验并拒绝多余字段（.strict()）：weight（>0 且 ≤500）、bodyFat（≤100）用 value 十进制字符串（≤2 位小数）；bloodPressure 不接受 value，systolic/diastolic 为 1–400 整数且收缩压须大于舒张压，period 必填。date 不能是未来日期。",
  request: { body: { required: true, content: { "application/json": { schema: measurementDocs.create } } } },
  responses: {
    "201": {
      description: "创建成功",
      content: { "application/json": { schema: z.object({ entry: Measurement }) } },
    },
    "200": {
      description: "幂等重放，返回同一记录",
      content: { "application/json": { schema: z.object({ entry: Measurement }) } },
    },
    "400": { description: "参数校验失败", content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
    "409": { description: "幂等编号冲突", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/measurements/{id}",
  operationId: "getMeasurement",
  tags: ["身体指标"],
  summary: "单条详情",
  request: { params: z.object({ id: uuid.describe("非 UUID 返回 400") }) },
  responses: {
    "200": { description: "测量记录", content: { "application/json": { schema: z.object({ entry: Measurement }) } } },
    "400": { description: "非法 UUID", content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
    "404": { description: "不存在、已删除或非本人", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/measurements/{id}",
  operationId: "updateMeasurement",
  tags: ["身体指标"],
  summary: "修改一条测量（乐观并发）",
  description:
    "version 必填 ≥1 整数；成功后 version 递增为提交值 +1。提交旧 version 得 409；丢失响应后同内容重试（version 差 1 且内容一致）直接返回最新结果。不能更换 kind；不存在返回 404。",
  request: {
    params: z.object({ id: uuid }),
    body: { required: true, content: { "application/json": { schema: measurementDocs.update } } },
  },
  responses: {
    "200": { description: "修改成功", content: { "application/json": { schema: z.object({ entry: Measurement }) } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
    "404": { description: "不存在", content: { "application/json": { schema: ApiError } } },
    "409": { description: "版本冲突", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/measurements/{id}",
  operationId: "deleteMeasurement",
  tags: ["身体指标"],
  summary: "软删除一条测量",
  description:
    "从读取、趋势和最新值中隐藏，保留删除标记避免旧请求重放。相同 version 重试幂等返回 200；已删除记录搭配不匹配 version 返回 404；未删除记录 version 不匹配返回 409。",
  request: {
    params: z.object({ id: uuid }),
    body: { required: true, content: { "application/json": { schema: measurementDeleteSchema } } },
  },
  responses: {
    "200": { description: "删除成功", content: { "application/json": { schema: OkResult } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
    "404": { description: "不存在", content: { "application/json": { schema: ApiError } } },
    "409": { description: "版本冲突", content: { "application/json": { schema: ApiError } } },
  },
});

/* ───────────────────────────── 训练记录 ───────────────────────────── */

const accountHeader = z
  .string()
  .optional()
  .openapi({ description: "网页携带的初始账号标识，服务端仅与当前会话比较（不一致 401）；原生客户端可省略" });

registry.registerPath({
  method: "get",
  path: "/api/v1/training-records",
  operationId: "listTrainingRecords",
  tags: ["训练记录"],
  summary: "查询训练记录列表",
  description:
    "按业务日期、时间、创建时间、ID 倒序，不含删除记录。kind 为互斥分类：strength 仅纯力量、cardio 仅纯有氧、mixed 含两者；空草稿只在 all 中出现。尚无游标分页。" +
    "携带 requestId 时改为核对一次新增：本人且未删除返回 { entry }，尚未查到（含编号属于其他账号）返回 { entry: null }，本人但已删除返回 409。",
  request: {
    headers: z.object({ "x-bodytrace-user": accountHeader }),
    query: z.object({
      range: z.enum(["7", "30", "90", "all"]).optional().default("30"),
      kind: z.enum(["all", "strength", "cardio", "mixed"]).optional().default("all"),
      status: z.enum(["all", "inProgress", "completed"]).optional().default("all"),
      requestId: uuid.optional().describe("提供时改为按编号核对，忽略其余筛选参数"),
    }),
  },
  responses: {
    "200": {
      description: "记录列表，或带 requestId 时的核对结果",
      content: {
        "application/json": {
          schema: z.union([
            z.object({ entries: z.array(TrainingRecord) }),
            z.object({ entry: TrainingRecord.nullable() }),
          ]),
        },
      },
    },
    "400": { description: "参数非法", content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录或账号已切换", content: { "application/json": { schema: ApiError } } },
    "409": { description: "编号对应的记录已删除", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/training-records/clock",
  operationId: "getTrainingClock",
  tags: ["训练记录"],
  summary: "服务端时间校准",
  description:
    "返回当前服务端 UTC 时刻，响应 Cache-Control: private, no-store，不读取或创建训练记录。客户端在创建/保存/结束核对前校准，再按单调计时器计算经过时间，避免设备时钟偏差。",
  request: { headers: z.object({ "x-bodytrace-user": accountHeader }) },
  responses: {
    "200": {
      description: "服务端时刻",
      content: {
        "application/json": {
          schema: z.object({ serverNow: z.string().datetime().openapi({ example: "2026-10-27T12:00:00.000Z" }) }),
        },
      },
    },
    "401": { description: "未登录或账号已切换", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "post",
  path: "/api/v1/training-records",
  operationId: "createTrainingRecord",
  tags: ["训练记录"],
  summary: "新增训练记录",
  description:
    "首次创建 201；同编号同内容重试返回同一记录 200；同编号换内容、记录已被修改或已单条删除返回 409。未知结果先 GET ?requestId= 核对，确认未保存才用原编号和原内容重试，不能重新取时刻后更换内容。请求体最大 256 KiB。",
  request: {
    headers: z.object({ "x-bodytrace-user": accountHeader }),
    body: { required: true, content: { "application/json": { schema: trainingDocs.create } } },
  },
  responses: {
    "201": {
      description: "创建成功",
      content: { "application/json": { schema: z.object({ entry: TrainingRecord }) } },
    },
    "200": {
      description: "幂等重放，返回同一记录",
      content: { "application/json": { schema: z.object({ entry: TrainingRecord }) } },
    },
    "400": { description: "参数校验失败", content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录或账号已切换", content: { "application/json": { schema: ApiError } } },
    "409": { description: "幂等或并发冲突", content: { "application/json": { schema: ApiError } } },
    "413": { description: "请求体超过 256 KiB", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "get",
  path: "/api/v1/training-records/{id}",
  operationId: "getTrainingRecord",
  tags: ["训练记录"],
  summary: "训练记录详情",
  request: {
    headers: z.object({ "x-bodytrace-user": accountHeader }),
    params: z.object({ id: uuid.describe("非 UUID 返回 400") }),
  },
  responses: {
    "200": { description: "训练记录", content: { "application/json": { schema: z.object({ entry: TrainingRecord }) } } },
    "401": { description: "未登录或账号已切换", content: { "application/json": { schema: ApiError } } },
    "404": { description: "不存在、已删除或属于其他用户", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "patch",
  path: "/api/v1/training-records/{id}",
  operationId: "updateTrainingRecord",
  tags: ["训练记录"],
  summary: "更新训练记录（乐观并发）",
  description:
    "{version, training} 整次训练的项目、组、顺序与版本原子更新；成功后 version +1。旧版本返回 409，紧接的一次相同版本/相同内容重试返回已有结果。mode 与 startedAt 固定不可改；每次进入 completed 都需满足完成校验。草稿自动保存须串行提交；超时先读详情，仅当版本恰好推进一次且内容一致才确认成功。",
  request: {
    headers: z.object({ "x-bodytrace-user": accountHeader }),
    params: z.object({ id: uuid }),
    body: { required: true, content: { "application/json": { schema: trainingDocs.update } } },
  },
  responses: {
    "200": { description: "更新成功", content: { "application/json": { schema: z.object({ entry: TrainingRecord }) } } },
    "400": { description: "参数校验失败", content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录或账号已切换", content: { "application/json": { schema: ApiError } } },
    "404": { description: "不存在", content: { "application/json": { schema: ApiError } } },
    "409": { description: "版本冲突", content: { "application/json": { schema: ApiError } } },
    "413": { description: "请求体超过 256 KiB", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "delete",
  path: "/api/v1/training-records/{id}",
  operationId: "deleteTrainingRecord",
  tags: ["训练记录"],
  summary: "删除训练记录（软删除）",
  description:
    "软删除并递增版本，不再出现在列表/详情。重复同一删除请求成功；旧版本 409，不存在 404。保留请求编号以拒绝旧 POST 重放。",
  request: {
    headers: z.object({ "x-bodytrace-user": accountHeader }),
    params: z.object({ id: uuid }),
    body: { required: true, content: { "application/json": { schema: trainingDocs.remove } } },
  },
  responses: {
    "200": { description: "删除成功", content: { "application/json": { schema: OkResult } } },
    "400": { description: "非法参数", content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录或账号已切换", content: { "application/json": { schema: ApiError } } },
    "404": { description: "不存在或不可访问", content: { "application/json": { schema: ApiError } } },
    "409": { description: "版本冲突", content: { "application/json": { schema: ApiError } } },
  },
});

/* ───────────────────────────── 个人资料 ───────────────────────────── */

registry.registerPath({
  method: "get",
  path: "/api/v1/profile",
  operationId: "getProfile",
  tags: ["个人资料"],
  summary: "查询个人资料",
  description: "null 表示未填写。已有测量记录时 weightKg 为最新测量体重，无测量时为旧资料值。",
  responses: {
    "200": {
      description: "个人资料",
      content: { "application/json": { schema: z.object({ profile: Profile }) } },
    },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
  },
});

registry.registerPath({
  method: "put",
  path: "/api/v1/profile",
  operationId: "saveProfile",
  tags: ["个人资料"],
  summary: "保存个人资料",
  description:
    "不是 PATCH 语义：gender/heightCm/targetWeightKg 必须同时提交（未填写的传 null，传 null 会清空旧值）。只有 weightKg 可省略（保留旧值）。已有测量体重时，提交不同的 weightKg 返回 409（体重应通过身体指标接口修改）。",
  request: { body: { required: true, content: { "application/json": { schema: profileSchema } } } },
  responses: {
    "200": {
      description: "保存成功（读取语义同 GET）",
      content: { "application/json": { schema: z.object({ profile: Profile }) } },
    },
    "400": { description: "参数校验失败", content: { "application/json": { schema: ApiError } } },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
    "409": {
      description: "提交的 weightKg 与最新测量体重不一致",
      content: { "application/json": { schema: ApiError } },
    },
  },
});

/* ───────────────────────────── 数据管理 ───────────────────────────── */

registry.registerPath({
  method: "delete",
  path: "/api/v1/records",
  operationId: "clearAllRecords",
  tags: ["数据管理"],
  summary: "一键清空本人全部业务记录",
  description:
    "同一事务内硬删除全部饮食记录、餐次照片、身体指标与训练（含草稿及此前软删除行）。个人食物库、每日目标、饮食计划和个人资料不受影响。重复调用成功；两次之间没有新写入时数量为 0。cleared 含已软删除的行，可能大于界面可见数量。硬删除会清除幂等编号占用：清空后重放旧新增请求可能重新创建记录，客户端应停止上传并刷新状态。",
  responses: {
    "200": {
      description: "清空结果",
      content: {
        "application/json": {
          schema: z.object({
            ok: z.literal(true),
            cleared: z.object({
              mealEntries: z.number().int(),
              measurements: z.number().int(),
              mealPhotos: z.number().int(),
              trainingRecords: z.number().int(),
            }),
          }),
        },
      },
    },
    "401": { description: "未登录", content: { "application/json": { schema: ApiError } } },
  },
});

/* ───────────────────────────── 组装输出 ───────────────────────────── */

registry.registerComponent("securitySchemes", "cookieAuth", {
  type: "apiKey",
  in: "cookie",
  name: "better-auth.session_token",
  description: "网页端登录会话 cookie（better-auth 默认名）；写请求还需携带可信 Origin。",
});
registry.registerComponent("securitySchemes", "bearerAuth", {
  type: "http",
  scheme: "bearer",
  description: "App 登录（sign-in/email 或 phone-number/verify）响应中的 token。",
});

const generator = new OpenApiGeneratorV31(registry.definitions);
const doc = generator.generateDocument({
  openapi: "3.1.0",
  info: {
    title: "BodyTrace API",
    version: "1.0.0",
    description: [
      "BodyTrace（体重 / 饮食 / 训练记录）业务接口，供网页客户端与移动 App 共用。",
      "本文件由 npm run docs:api 从真实校验 schema 生成，请勿手改；契约以代码为准，背景说明见 docs/BodyTrace_API_Reference.md。",
      "",
      "## 通用约定",
      "",
      "- 业务接口前缀 /api/v1，认证接口前缀 /api/auth（better-auth 托管）。",
      "- 所有业务接口需登录：网页走 cookie 会话（写请求还需携带可信 Origin）；App 登录后携带 Authorization: Bearer <token>（登录响应中的 token）。",
      "- 响应 JSON 为 camelCase，业务数据包在语义键里（{ foods }、{ entry } 等）。",
      "- /api/v1 业务错误为 { error: 说明 }，配合 400/401/404/409（照片另有 413/502/503）；404 表示不存在或不属于当前用户，不泄露其存在。",
      "- /api/auth 错误为 { code, message }。",
      "- 业务日期为 YYYY-MM-DD，按 APP_TIMEZONE（默认 Asia/Shanghai）计算今天；记录类接口拒绝未来日期。",
      "- 营养单位：热量 kcal，蛋白质/碳水/脂肪 g；食物库按每 100g 保存，饮食记录按实际克数折算为快照。",
      "",
      "## 在线调试（Try it out）",
      "",
      "1. 先调 POST /api/auth/sign-in/email（或手机号 verify）拿到 token；",
      "2. 点 Authorize 填入 Bearer token；",
      "3. 在顶部 Servers 选择你的应用地址。",
      "",
      "注意：应用当前未开启 CORS，浏览器会拦截跨域 Try it out；同源部署（把本文档放到应用同域静态目录）或用 curl 示例调试。",
    ].join("\n"),
  },
  servers: [
    { url: "http://localhost:3000", description: "本地开发" },
    { url: "https://your-deployment.example.com", description: "你的部署地址（可临时改成任意地址）" },
  ],
  tags: [
    { name: "认证", description: "better-auth 托管的注册 / 登录 / 会话接口，App 从这里获取 Bearer token" },
    { name: "食物库", description: "个人食物库按用户隔离；/reference 为共享只读官方参考库" },
    { name: "饮食记录", description: "保存写入时刻的食物名称与营养快照；改克数按快照等比缩放" },
    { name: "饮食照片", description: "照片独立归属 (userId, date, mealType)，每餐最多 6 张，文件存腾讯云 COS" },
    { name: "汇总与趋势", description: "首页 / 日记共用的当日汇总与最近 N 天趋势" },
    { name: "目标与计划", description: "每日目标与逐天手写的饮食计划；某天生效目标按日期从计划解析，否则回落每日目标" },
    { name: "身体指标", description: "体重 kg / 体脂率 % / 血压 mmHg；乐观并发（version）与 requestId 幂等" },
    { name: "训练记录", description: "一次训练含有序力量 / 有氧项目；requestId 幂等、version 乐观并发、服务端校时" },
    { name: "个人资料", description: "性别 / 身高 / 体重 / 目标体重，null 表示未填写" },
    { name: "数据管理", description: "一键清空本人全部业务记录" },
  ],
  security: [{ cookieAuth: [] }, { bearerAuth: [] }],
  externalDocs: {
    description: "完整 API 参考（Markdown）",
    url: "https://github.com/SNTopdsddsad/bodytrace/blob/master/docs/BodyTrace_API_Reference.md",
  },
});

const yaml = "# ⚠️ 本文件由 npm run docs:api 从真实校验 schema 生成，请勿手改。\n" + stringify(doc, { lineWidth: 0 });
const outPath = join(fileURLToPath(new URL("../docs/openapi.yaml", import.meta.url)));
writeFileSync(outPath, yaml, "utf8");
console.log(`已生成 ${outPath}：${Object.keys(doc.paths ?? {}).length} 个路径`);
// 服务层 schema 会连带引入数据库连接池，空闲句柄会挂住进程，生成完成后直接退出。
process.exit(0);
