import { readdir, readFile } from "node:fs/promises";
import { configuration } from "../config/index.js";
import { createPool } from "./pool.js";
const pool = createPool(configuration().DATABASE_URL);
const c = await pool.getConnection();
try {
  await c.query(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(191) PRIMARY KEY, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)",
  );
  await c.query("SELECT GET_LOCK('bizmonitor_migrations',30)");
  const dir = new URL("../../migrations/", import.meta.url);
  for (const name of (await readdir(dir))
    .filter((n) => n.endsWith(".sql"))
    .sort()) {
    const [rows] = await c.execute<import("mysql2").RowDataPacket[]>(
      "SELECT name FROM schema_migrations WHERE name=?",
      [name],
    );
    if (rows.length) continue;
    for (const sql of (await readFile(new URL(name, dir), "utf8"))
      .split(";")
      .filter((s) => s.trim()))
      await c.query(sql);
    await c.execute("INSERT INTO schema_migrations(name) VALUES (?)", [name]);
    console.log(`Applied ${name}`);
  }
} finally {
  await c.query("SELECT RELEASE_LOCK('bizmonitor_migrations')");
  c.release();
  await pool.end();
}
