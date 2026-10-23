/**
 * 腾讯云 COS 适配层：只由服务端引用，浏览器永远拿不到密钥。
 *
 * 饮食照片默认走“公有读、私有写”的桶：数据库存对象 key，展示时拼公开地址；
 * 若以后把桶改成私有读，设置 COS_PHOTO_ACCESS=signed 即可返回短时签名地址。
 */
import { randomUUID } from "node:crypto";
import COS from "cos-nodejs-sdk-v5";

export type MealPhotoKeys = { objectKey: string; thumbKey: string };

export class PhotoStorageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PhotoStorageError";
  }
}

type CosBaseOptions = {
  bucket: string;
  region: string;
  prefix: string;
};

type CosOptions = CosBaseOptions & {
  secretId: string;
  secretKey: string;
};

let client: InstanceType<typeof COS> | null = null;

function env(name: string): string {
  return process.env[name]?.trim() ?? "";
}

/** 上传需要完整凭证；只展示公开 URL 时至少需要 bucket 和 region。 */
export function isPhotoStorageConfigured(): boolean {
  return Boolean(
    env("COS_SECRET_ID") && env("COS_SECRET_KEY") && env("COS_BUCKET") && env("COS_REGION"),
  );
}

function getBaseOptions(): CosBaseOptions {
  const bucket = env("COS_BUCKET");
  const region = env("COS_REGION");
  if (!bucket || !region) {
    throw new PhotoStorageError("照片存储尚未配置");
  }
  return {
    bucket,
    region,
    prefix: normalizePrefix(env("COS_UPLOAD_PATH_PREFIX") || "bodytrace"),
  };
}

function getOptions(): CosOptions {
  const base = getBaseOptions();
  const secretId = env("COS_SECRET_ID");
  const secretKey = env("COS_SECRET_KEY");
  if (!secretId || !secretKey) {
    throw new PhotoStorageError("照片存储尚未配置");
  }
  return { ...base, secretId, secretKey };
}

function getClient(): InstanceType<typeof COS> {
  if (client) return client;
  const { secretId, secretKey } = getOptions();
  client = new COS({ SecretId: secretId, SecretKey: secretKey });
  return client;
}

/** 配置里的前缀统一去掉首尾斜杠，避免拼出 `//` 或绝对路径。 */
export function normalizePrefix(prefix: string): string {
  return prefix.trim().replace(/^\/+|\/+$/g, "");
}

/**
 * 生成一次上传的主图/缩略图 key。key 只含随机 UUID，不含用户 ID 或原始文件名，
 * 既避免路径注入，也让公开 URL 无法从命名推断出其他对象。
 */
export function buildMealPhotoKeys(now = new Date()): MealPhotoKeys {
  const { prefix } = getBaseOptions();
  const month = now.toISOString().slice(0, 7);
  const id = randomUUID();
  const base = [prefix, "meal-photos", month, id].filter(Boolean).join("/");
  return {
    objectKey: `${base}.webp`,
    thumbKey: `${base}_thumb.webp`,
  };
}

function encodeKey(key: string): string {
  return key.split("/").map(encodeURIComponent).join("/");
}

function publicUrl(key: string): string {
  const { bucket, region } = getBaseOptions();
  const base = env("COS_PUBLIC_BASE_URL").replace(/\/+$/, "");
  if (base) return `${base}/${encodeKey(key)}`;
  return `https://${bucket}.cos.${region}.myqcloud.com/${encodeKey(key)}`;
}

function signedUrl(key: string): Promise<string> {
  const { bucket, region } = getOptions();
  const ttlRaw = Number(env("COS_PHOTO_URL_TTL") || 3600);
  const expires = Number.isInteger(ttlRaw) && ttlRaw > 0 ? ttlRaw : 3600;
  return new Promise((resolve, reject) => {
    getClient().getObjectUrl(
      { Bucket: bucket, Region: region, Key: key, Sign: true, Expires: expires },
      (error, data) => (error ? reject(new PhotoStorageError("生成照片地址失败")) : resolve(data.Url)),
    );
  });
}

export async function getMealPhotoUrl(key: string): Promise<string> {
  return env("COS_PHOTO_ACCESS") === "signed" ? signedUrl(key) : publicUrl(key);
}

export type StoredMealPhotoObject = {
  key: string;
  lastModified: Date;
  size: number;
};

/** 列出当前前缀下的饮食照片对象，供孤儿清理脚本对比数据库。需要桶的 List 权限。 */
export async function listMealPhotoObjects(): Promise<StoredMealPhotoObject[]> {
  const { bucket, region, prefix } = getOptions();
  const cos = getClient();
  const objectPrefix = [prefix, "meal-photos"].filter(Boolean).join("/") + "/";
  const result: StoredMealPhotoObject[] = [];
  let marker: string | undefined;

  for (;;) {
    const page = await new Promise<COS.GetBucketResult>((resolve, reject) => {
      cos.getBucket(
        {
          Bucket: bucket,
          Region: region,
          Prefix: objectPrefix,
          Marker: marker,
          MaxKeys: 1000,
        },
        (error, data) => (error ? reject(new PhotoStorageError("读取照片对象列表失败")) : resolve(data)),
      );
    });
    for (const item of page.Contents ?? []) {
      result.push({
        key: item.Key,
        lastModified: new Date(item.LastModified),
        size: Number(item.Size),
      });
    }
    if (page.IsTruncated !== "true" || !page.NextMarker) break;
    marker = page.NextMarker;
  }
  return result;
}

export async function putMealPhotoObjects(
  keys: MealPhotoKeys,
  main: Buffer,
  thumb: Buffer,
): Promise<void> {
  const { bucket, region } = getOptions();
  const cos = getClient();
  const common = {
    Bucket: bucket,
    Region: region,
    ContentType: "image/webp",
    CacheControl: "public, max-age=31536000, immutable",
  };
  const results = await Promise.allSettled([
    cos.putObject({ ...common, Key: keys.objectKey, Body: main }),
    cos.putObject({ ...common, Key: keys.thumbKey, Body: thumb }),
  ]);
  if (results.some((result) => result.status === "rejected")) {
    // 主图成功、缩略图失败时也尽量回滚，避免留下半套对象。
    await deleteMealPhotoObjects([keys.objectKey, keys.thumbKey]).catch(() => undefined);
    throw new PhotoStorageError("照片上传失败，请稍后重试");
  }
}

/** 删除是尽力而为：调用方在数据库事务提交后调用，失败只记录日志由清理脚本兜底。 */
export async function deleteMealPhotoObjects(keys: string[]): Promise<void> {
  const unique = [...new Set(keys.filter(Boolean))];
  if (unique.length === 0) return;
  if (!isPhotoStorageConfigured()) return;

  const { bucket, region } = getOptions();
  const cos = getClient();
  for (let i = 0; i < unique.length; i += 1000) {
    const chunk = unique.slice(i, i + 1000);
    const result = await cos.deleteMultipleObject({
      Bucket: bucket,
      Region: region,
      Objects: chunk.map((Key) => ({ Key })),
    });
    if (result.Error?.length) {
      throw new PhotoStorageError(`有 ${result.Error.length} 个照片对象删除失败`);
    }
  }
}
