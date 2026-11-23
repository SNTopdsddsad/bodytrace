import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { parse } from "yaml";

const document = parse(readFileSync(new URL("../docs/openapi.yaml", import.meta.url), "utf8"));
const requiredBodies = [
  ["post", "/api/auth/sign-up/email"],
  ["post", "/api/auth/sign-in/email"],
  ["post", "/api/auth/phone-number/send-otp"],
  ["post", "/api/auth/phone-number/verify"],
  ["post", "/api/auth/request-password-reset"],
  ["post", "/api/auth/reset-password"],
  ["post", "/api/v1/foods"],
  ["patch", "/api/v1/foods/{id}"],
  ["post", "/api/v1/meals"],
  ["patch", "/api/v1/meals/{id}"],
  ["post", "/api/v1/meal-photos"],
  ["put", "/api/v1/goals"],
  ["post", "/api/v1/measurements"],
  ["patch", "/api/v1/measurements/{id}"],
  ["delete", "/api/v1/measurements/{id}"],
  ["put", "/api/v1/profile"],
];

test("OpenAPI 必需请求体在 HTTP 层声明必填，包含版本删除和图片上传", () => {
  for (const [method, path] of requiredBodies) {
    const body = document.paths[path]?.[method]?.requestBody;
    assert.equal(body?.required, true, method.toUpperCase() + " " + path + " 必须提供请求体");
    assert.ok(body.content, "必填请求体须保留内容 schema");
  }
});

test("OpenAPI 保留字段必填与可选语义，无请求体的操作仍无需请求体", () => {
  const food = document.paths["/api/v1/foods"].post.requestBody.content["application/json"].schema;
  assert.deepEqual(food.required, ["name", "calories"]);
  const photo = document.paths["/api/v1/meal-photos"].post.requestBody.content["multipart/form-data"].schema;
  assert.deepEqual(new Set(photo.required), new Set(["date", "mealType", "file"]));
  assert.deepEqual(photo.not, { required: ["type"] });
  for (const operations of Object.values(document.paths)) {
    if (operations.get) assert.equal(operations.get.requestBody, undefined);
  }
  assert.equal(document.paths["/api/v1/records"].delete.requestBody, undefined);
});

test("移动客户端契约保留号码约束、密码重置响应和可空字段", () => {
  for (const operation of ["send-otp", "verify"]) {
    const schema = document.paths[`/api/auth/phone-number/${operation}`].post.requestBody.content["application/json"].schema;
    assert.equal(schema.additionalProperties, false);
    assert.equal(schema.properties.phoneNumber.maxLength, 32);
  }
  const responseSchema = (path, method) => document.paths[path][method].responses["200"].content["application/json"].schema;
  assert.deepEqual(responseSchema("/api/auth/request-password-reset", "post").required, ["status", "message"]);
  assert.deepEqual(responseSchema("/api/auth/reset-password", "post").required, ["status"]);
  assert.ok(document.components.schemas.ReferenceFood.properties.category.type.includes("null"));
  assert.ok(responseSchema("/api/v1/meal-photos", "get").properties.photo.anyOf.some(schema => schema.type === "null"));
});
