/**
 * 从 GitHub 下载《中国食物成分表》的 fixed_en JSON 文件（只下数据，不下截图）。
 * 优先走 raw.githubusercontent.com，失败自动改走 api.github.com（国内更稳）。
 * 已存在的文件会跳过，可重复执行。
 */
import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const OUT_DIR = "data/china-food-composition-data";
const tree = JSON.parse(readFileSync(join(process.env.TEMP, "tree.json"), "utf8"));

const files = tree.tree.filter(
  (f) => f.type === "blob" && f.path.endsWith(".json") && f.path.includes("fixed_en"),
);

mkdirSync(OUT_DIR, { recursive: true });

// 跳过已经下载好的
const todo = files.filter((f) => !existsSync(join(OUT_DIR, f.path.split("/").pop())));
console.log(`${files.length} 个文件，已存在 ${files.length - todo.length}，待下载 ${todo.length}`);

let done = 0;
let failed = 0;
const CONCURRENCY = 4;
const queue = [...todo];

/** 兜底通道：contents API 返回 base64 内容（单文件限 1MB，我们最大 74KB） */
async function fetchViaApi(path) {
  const url = `https://api.github.com/repos/Sanotsu/china-food-composition-data/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, { headers: { Accept: "application/vnd.github+json" } });
  if (!res.ok) throw new Error(`API HTTP ${res.status}`);
  const data = await res.json();
  return Buffer.from(data.content, "base64");
}

async function worker() {
  while (queue.length > 0) {
    const f = queue.shift();
    const rawUrl = `https://raw.githubusercontent.com/Sanotsu/china-food-composition-data/main/${f.path}`;
    try {
      let buf;
      try {
        const res = await fetch(rawUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        buf = Buffer.from(await res.arrayBuffer());
      } catch {
        buf = await fetchViaApi(f.path); // raw 失败 → API 兜底
      }
      writeFileSync(join(OUT_DIR, f.path.split("/").pop()), buf);
      done++;
      if (done % 10 === 0) console.log(`  已下载 ${done}/${todo.length}`);
    } catch (e) {
      failed++;
      console.error(`  ✗ ${f.path}: ${e.message}`);
    }
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`完成：成功 ${done}，失败 ${failed}`);
process.exit(failed > 0 ? 1 : 0);
