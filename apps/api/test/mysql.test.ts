import { beforeAll, afterAll, describe, it, expect } from "vitest";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { createPool } from "../src/database/pool.js";
import { MysqlRepository } from "../src/database/repository.js";
import { createDemo } from "../src/providers/demo.js";
describe.skipIf(!process.env.TEST_DATABASE_URL)(
  "MySQL repositories (disposable DB only)",
  () => {
    const pool = createPool(
      process.env.TEST_DATABASE_URL ?? "mysql://unused:unused@localhost/unused",
    );
    const repo = new MysqlRepository(pool);
    const d = createDemo();
    beforeAll(async () => {
      const directory = new URL("../migrations/", import.meta.url);
      for (const file of (await readdir(directory))
        .filter((f) => f.endsWith(".sql"))
        .sort())
        for (const sql of (await readFile(new URL(file, directory), "utf8"))
          .split(";")
          .filter((s) => s.trim()))
          await pool.query(sql);
      await pool.execute(
        "INSERT INTO businesses(uid,name,tax_id,tax_profile) VALUES (?,?,?,?)",
        [
          d.business.uid,
          d.business.name,
          d.business.taxId,
          JSON.stringify(d.business.taxProfile),
        ],
      );
      const c = await pool.getConnection();
      try {
        await c.beginTransaction();
        await repo.persist(c, d.business.uid, d);
        await c.commit();
      } finally {
        c.release();
      }
    }, 60000);
    afterAll(async () => {
      await pool.execute("DELETE FROM businesses WHERE uid=?", [
        d.business.uid,
      ]);
      await pool.end();
    });
    it("round-trips exact decimal strings and all domains", async () => {
      const saved = await repo.load(d.business.uid);
      expect(saved?.receipts).toHaveLength(d.receipts.length);
      expect(saved?.accounts[0].balance).toMatch(/^\d+\.\d{2}$/);
      expect(saved?.obligations).toHaveLength(3);
    });
    it("isolates absent businesses and rejects cross-business parents", async () => {
      expect(await repo.load(randomUUID())).toBeNull();
      const c = await pool.getConnection();
      try {
        await c.beginTransaction();
        await expect(
          c.execute(
            "INSERT INTO fiscal_receipts(uid,business_uid,register_uid,external_id,amount,payload) VALUES (?,?,?,?,?,?)",
            [
              randomUUID(),
              d.business.uid,
              randomUUID(),
              "invalid-parent",
              "42.00",
              "{}",
            ],
          ),
        ).rejects.toThrow();
        await c.rollback();
      } finally {
        c.release();
      }
    });
    it("persists edits and preserves receipt idempotency", async () => {
      await repo.mutate(d.business.uid, (data) => {
        data.business.name = "Updated Demo";
        data.receipts.push({ ...data.receipts[0] });
      });
      const loaded = await repo.load(d.business.uid);
      expect(loaded?.business.name).toBe("Updated Demo");
      expect(loaded?.receipts).toHaveLength(d.receipts.length);
    });
  },
);
