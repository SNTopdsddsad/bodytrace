/** 仅复制进隔离测试应用的 COS 替身；对象随测试目录一起清理。 */
import { randomUUID } from "node:crypto";
import { mkdir, writeFile, rm } from "node:fs/promises";
import { join } from "node:path";

const directory = join(process.cwd(), ".photo-test");
export class PhotoStorageError extends Error {}
export function isPhotoStorageConfigured() { return true; }
export function buildMealPhotoKeys() {
  const id = randomUUID();
  return { objectKey: `${id}.webp`, thumbKey: `${id}_thumb.webp` };
}
export async function getMealPhotoUrl(key: string) { return `https://photos.invalid/${encodeURIComponent(key)}`; }
export async function putMealPhotoObjects(keys: { objectKey: string; thumbKey: string }, main: Buffer, thumb: Buffer) {
  await mkdir(directory, { recursive: true });
  await Promise.all([
    writeFile(join(directory, keys.objectKey), main),
    writeFile(join(directory, keys.thumbKey), thumb),
  ]);
}
export async function deleteMealPhotoObjects(keys: string[]) {
  await Promise.all(keys.map(key => rm(join(directory, key), { force: true })));
}
