import { hash, argon2id } from "argon2";
import { randomUUID } from "node:crypto";
import { configuration } from "../config/index.js";
import { createPool } from "./pool.js";
import { MysqlRepository } from "./repository.js";
import { createDemo } from "../providers/demo.js";
const env = configuration();
if (env.NODE_ENV === "production")
  throw new Error("Demo seed disabled in production");
const pool = createPool(env.DATABASE_URL);
const c = await pool.getConnection();
try {
  const data = createDemo();
  const userUid = randomUUID();
  await c.beginTransaction();
  await c.execute(
    "INSERT INTO businesses (uid,name,tax_id,tax_profile) VALUES (?,?,?,?)",
    [
      data.business.uid,
      data.business.name,
      data.business.taxId,
      JSON.stringify(data.business.taxProfile),
    ],
  );
  await c.execute(
    "INSERT INTO users (uid,email,username,password_hash) VALUES (?,?,?,?)",
    [
      userUid,
      process.env.DEMO_EMAIL ?? "demo@bizmonitor.ge",
      (process.env.DEMO_USERNAME ?? "demo").trim().toLowerCase(),
      await hash(process.env.DEMO_PASSWORD ?? "DemoPass!2026", {
        type: argon2id,
      }),
    ],
  );
  await c.execute(
    "INSERT INTO business_users (uid,business_uid,user_uid) VALUES (?,?,?)",
    [randomUUID(), data.business.uid, userUid],
  );
  await new MysqlRepository(pool).persist(c, data.business.uid, data);
  await c.commit();
  console.log(
    "Demo business seeded. Seed runs once; duplicate business is rejected.",
  );
} catch (e) {
  await c.rollback();
  throw e;
} finally {
  c.release();
  await pool.end();
}
