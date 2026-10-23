import assert from "node:assert/strict";
import test, { after } from "node:test";
import sharp from "sharp";
import { processMealPhoto, MealPhotoImageError } from "../src/lib/meal-photo-image.ts";
import {
  buildMealPhotoKeys,
  getMealPhotoUrl,
  isPhotoStorageConfigured,
  normalizePrefix,
} from "../src/lib/cos.ts";

const savedEnv = { ...process.env };

after(() => {
  for (const key of Object.keys(process.env)) {
    if (!(key in savedEnv)) delete process.env[key];
  }
  Object.assign(process.env, savedEnv);
});

function configure() {
  process.env.COS_SECRET_ID = "test-secret-id";
  process.env.COS_SECRET_KEY = "test-secret-key";
  process.env.COS_BUCKET = "bodytrace-1250000000";
  process.env.COS_REGION = "ap-guangzhou";
  process.env.COS_UPLOAD_PATH_PREFIX = "bodytrace";
  delete process.env.COS_PUBLIC_BASE_URL;
  delete process.env.COS_PHOTO_ACCESS;
  delete process.env.COS_PHOTO_URL_TTL;
}

test("对象 key 使用前缀、月份和随机 UUID，不包含用户信息", () => {
  configure();
  const keys = buildMealPhotoKeys(new Date("2026-10-21T12:00:00Z"));
  assert.match(keys.objectKey, /^bodytrace\/meal-photos\/2026-10\/[0-9a-f-]{36}\.webp$/);
  assert.equal(keys.thumbKey, keys.objectKey.replace(/\.webp$/, "_thumb.webp"));
  assert.equal(normalizePrefix(" /bodytrace/// "), "bodytrace");
  assert.equal(normalizePrefix(""), "");
});

test("公有读模式返回对象地址，自定义域名优先", async () => {
  configure();
  assert.equal(isPhotoStorageConfigured(), true);
  const keys = buildMealPhotoKeys(new Date("2026-10-21T12:00:00Z"));
  assert.equal(
    await getMealPhotoUrl(keys.objectKey),
    `https://bodytrace-1250000000.cos.ap-guangzhou.myqcloud.com/${keys.objectKey}`,
  );

  process.env.COS_PUBLIC_BASE_URL = "https://cdn.example.com/photos/";
  assert.equal(
    await getMealPhotoUrl(keys.objectKey),
    `https://cdn.example.com/photos/${keys.objectKey}`,
  );
});

test("signed 模式生成带签名的短时地址", async () => {
  configure();
  process.env.COS_PHOTO_ACCESS = "signed";
  process.env.COS_PHOTO_URL_TTL = "60";
  const url = await getMealPhotoUrl("bodytrace/meal-photos/2026-10/abc.webp");
  assert.match(url, /^https:\/\/bodytrace-1250000000\.cos\.ap-guangzhou\.myqcloud\.com\//);
  assert.match(url, /q-signature|sign=/);
});

test("服务端统一转 WebP、限制长边并生成缩略图", async () => {
  const input = await sharp({
    create: { width: 2200, height: 1200, channels: 3, background: "#336699" },
  })
    .jpeg()
    .toBuffer();
  const result = await processMealPhoto(input);
  assert.equal(result.mimeType, "image/webp");
  assert.equal(result.width, 1600);
  assert.equal(result.height, 873);
  assert.ok(result.byteSize > 0);
  assert.equal(result.byteSize, result.main.length);

  const thumb = await sharp(result.thumb).metadata();
  assert.equal(thumb.format, "webp");
  assert.equal(thumb.width, 480);
  assert.equal(thumb.height, 262);
});

test("小图不放大，输出也不保留 EXIF", async () => {
  const input = await sharp({
    create: { width: 300, height: 200, channels: 3, background: "#ffffff" },
  })
    .jpeg()
    .withMetadata({ exif: { IFD0: { Copyright: "bodytrace-test" } } })
    .toBuffer();
  assert.ok((await sharp(input).metadata()).exif);

  const result = await processMealPhoto(input);
  assert.equal(result.width, 300);
  assert.equal(result.height, 200);
  assert.equal((await sharp(result.main).metadata()).exif, undefined);
  assert.equal((await sharp(result.thumb).metadata()).exif, undefined);
});

test("损坏或不支持的图片给出明确错误", async () => {
  await assert.rejects(
    () => processMealPhoto(Buffer.from("this is not an image")),
    (error) => error instanceof MealPhotoImageError && error.code === "invalid",
  );

  const svg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>',
  );
  await assert.rejects(
    () => processMealPhoto(svg),
    (error) => error instanceof MealPhotoImageError && error.code === "unsupported",
  );
});

test("真实 AVIF 按 HEIF/AV1 元数据识别并输出 WebP", async () => {
  const input = await sharp({ create: { width: 80, height: 60, channels: 3, background: "#336699" } }).avif().toBuffer();
  const metadata = await sharp(input).metadata();
  assert.equal(metadata.format, "heif");
  assert.equal(metadata.compression, "av1");
  const result = await processMealPhoto(input);
  assert.equal((await sharp(result.main).metadata()).format, "webp");
  assert.equal(result.width, 80);
  assert.equal(result.height, 60);
});
