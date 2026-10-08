/**
 * 导入《中国食物成分表》参考数据到 food_reference 表。
 *
 * 数据来源：github.com/Sanotsu/china-food-composition-data
 * 默认使用「增强矫正版」（*fixed_en*.json，已修正原书能量列互换问题、含英文名）。
 *
 * 用法：
 *   npm run db:push                            # 先确保 food_reference 表存在
 *   node scripts/import-food-reference.mjs     # 导入（可重复执行，每次全量重建）
 */
import "dotenv/config";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import postgres from "postgres";

const DATA_DIR = "data/china-food-composition-data";
const BATCH_SIZE = 100;

/** 递归找出目录下所有匹配的 JSON 文件 */
function findJsonFiles(dir, filter) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...findJsonFiles(full, filter));
    else if (entry.name.endsWith(".json") && entry.name.includes(filter)) out.push(full);
  }
  return out;
}

/**
 * 原书数值是字符串保真的，这里统一清洗：
 * "544" → 544；"Tr"（微量）→ 0；"—"/""/null → null；"<5" 之类按 5 处理
 */
function toNumber(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (s === "") return null;
  if (s === "Tr" || s === "TR") return 0;
  const cleaned = s.replace(/[^0-9.>-]/g, "");
  if (cleaned === "" || cleaned === "-" || cleaned === ".") return null;
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : null;
}

function toStringOrNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" || s === "—" ? null : s;
}

const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.DATABASE_SSL === "require" ? { rejectUnauthorized: false } : undefined,
  max: 5,
});

// 文件名过滤词（默认空 = 目录下全部 JSON；该目录只放 fixed_en 增强矫正版数据）
const files = findJsonFiles(DATA_DIR, process.argv[2] ?? "");
if (files.length === 0) {
  console.error(`在 ${DATA_DIR} 下没找到匹配的 JSON 文件`);
  process.exit(1);
}

const rows = [];
let skipped = 0;

for (const file of files) {
  // 分类名从文件名提取：去掉前缀 merged_ 和版本后缀
  const base = file.split(/[\\/]/).pop().replace(/\.json$/, "");
  const category = base
    .replace(/^merged_?/, "")
    .replace(/[-_?]?(fixed_en|fixed|en)$/i, "")
    .trim() || null;

  const data = JSON.parse(readFileSync(file, "utf8"));
  const list = Array.isArray(data) ? data : Object.values(data); // 兼容数组或按 foodCode 键的对象

  for (const item of list) {
    const code = toStringOrNull(item.foodCode);
    const name = toStringOrNull(item.foodName ?? item.name);
    if (!code || !name) {
      skipped++;
      continue;
    }
    rows.push({
      foodCode: code,
      name,
      englishName: toStringOrNull(item.englishName),
      category,
      calories: toNumber(item.energyKCal ?? item.energy),
      protein: toNumber(item.protein),
      carbs: toNumber(item.CHO ?? item.carbs),
      fat: toNumber(item.fat),
      dietaryFiber: toNumber(item.dietaryFiber),
      edible: toNumber(item.edible),
    });
  }
}

console.log(`文件 ${files.length} 个，解析出 ${rows.length} 条（跳过 ${skipped} 条无效）`);
if (rows.length === 0) process.exit(1);

// 打一条样例让用户确认字段映射对了
console.log("样例:", JSON.stringify(rows[0]));

const t0 = Date.now();
await sql`TRUNCATE food_reference`;
for (let i = 0; i < rows.length; i += BATCH_SIZE) {
  // postgres.js 拿对象键名当列名，所以要转成数据库的 snake_case
  const batch = rows.slice(i, i + BATCH_SIZE).map((r) => ({
    food_code: r.foodCode,
    name: r.name,
    english_name: r.englishName,
    category: r.category,
    calories: r.calories,
    protein: r.protein,
    carbs: r.carbs,
    fat: r.fat,
    dietary_fiber: r.dietaryFiber,
    edible: r.edible,
  }));
  await sql`INSERT INTO food_reference ${sql(batch)}`;
}
const [{ count }] = await sql`SELECT count(*)::int AS count FROM food_reference`;
console.log(`✓ 导入完成：${count} 条，耗时 ${((Date.now() - t0) / 1000).toFixed(1)}s`);
await sql.end();
