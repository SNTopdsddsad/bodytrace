import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";

/** 仅由隔离集成测试传入测试连接，在随机命名的合成表上演练真实迁移。 */
export async function checkMealPhotoMigration(pool) {
  const prefix = `bt${randomBytes(3).toString("hex")}_`;
  const photo = `${prefix}meal_photo`, entry = `${prefix}meal_entry`, user = `${prefix}user`;
  const runMigration = async name => {
    const source = (await readFile(new URL(`../../drizzle/mysql/${name}`, import.meta.url), "utf8"))
      .replaceAll("bodytrace_", prefix);
    for (const statement of source.split("--> statement-breakpoint")) {
      if (statement.trim()) await pool.query(statement);
    }
  };
  try {
    await pool.query(`CREATE TABLE \`${user}\` (id varchar(255) PRIMARY KEY) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
    await pool.query(`CREATE TABLE \`${entry}\` (id varchar(36) PRIMARY KEY, date date NOT NULL, meal_type enum('breakfast','lunch','dinner','snack') NOT NULL) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`);
    await runMigration("0006_chilly_expediter.sql");
    await runMigration("0007_flippant_green_goblin.sql");
    await pool.query(`INSERT INTO \`${user}\` VALUES ('a'), ('b')`);
    await pool.query(`INSERT INTO \`${entry}\` VALUES ('e1','2026-01-01','lunch'), ('e2','2026-01-01','lunch'), ('e3','2026-01-02','dinner')`);
    const seed = [];
    for (let i = 0; i < 9; i++) {
      seed.push([`p${i}`, i === 8 ? "b" : "a", i < 4 ? "e1" : i < 8 ? "e2" : "e3", `main-${i}`, `thumb-${i}`, i % 4, `r${i}`, `hash${i}`, i === 0 ? "2026-01-01 01:00:00" : null]);
    }
    for (const row of seed) await pool.execute(`INSERT INTO \`${photo}\` (id,user_id,entry_id,object_key,thumb_key,position,request_id,content_hash,deleted_at,mime_type,byte_size,width,height,created_at) VALUES (?,?,?,?,?,?,?,?,?,'image/webp',100,80,60,'2026-01-01 00:00:00')`, row);
    await runMigration("0008_calm_xorn.sql");
    const [rows] = await pool.query(`SELECT *, DATE_FORMAT(date,'%Y-%m-%d') AS date_string FROM \`${photo}\` ORDER BY user_id, position`);
    assert.equal(rows.length, 9);
    assert.deepEqual(rows.filter(r => r.user_id === "a").map(r => r.position), [0,1,2,3,4,5,6,7]);
    for (const row of rows) {
      const i = Number(row.id.slice(1));
      assert.equal(row.date_string, i === 8 ? "2026-01-02" : "2026-01-01");
      assert.equal(row.meal_type, i === 8 ? "dinner" : "lunch");
      assert.equal(row.object_key, `main-${i}`);
      assert.equal(row.thumb_key, `thumb-${i}`);
      assert.equal(row.request_id, `r${i}`);
      assert.equal(row.content_hash, `hash${i}`);
      assert.equal(Boolean(row.deleted_at), i === 0);
      assert.ok(!("entry_id" in row));
    }
    assert.equal(rows.filter(r => r.user_id === "a" && !r.deleted_at).length, 7, "迁移保留超过六张的历史餐次");
    await assert.rejects(pool.query(`UPDATE \`${photo}\` SET position=0 WHERE id='p1'`), { code: "ER_DUP_ENTRY" });
    await pool.query(`DELETE FROM \`${entry}\``);
    const [[count]] = await pool.query(`SELECT COUNT(*) AS n FROM \`${photo}\``);
    assert.equal(count.n, 9, "删除食物不再级联照片");
    await pool.query(`DELETE FROM \`${user}\` WHERE id='a'`);
    const [[afterUser]] = await pool.query(`SELECT COUNT(*) AS n FROM \`${photo}\``);
    assert.equal(afterUser.n, 1, "用户外键仍级联清理照片");
    await pool.query(`DROP TABLE \`${photo}\``);
    await runMigration("0006_chilly_expediter.sql");
    await runMigration("0007_flippant_green_goblin.sql");
    await runMigration("0008_calm_xorn.sql");
    const [[empty]] = await pool.query(`SELECT COUNT(*) AS n FROM \`${photo}\``);
    assert.equal(empty.n, 0, "空表可连续升级");
  } finally {
    await pool.query(`DROP TABLE IF EXISTS \`${photo}\``);
    await pool.query(`DROP TABLE IF EXISTS \`${entry}\``);
    await pool.query(`DROP TABLE IF EXISTS \`${user}\``);
  }
}
