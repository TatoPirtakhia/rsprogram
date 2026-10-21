import { afterAll, beforeAll, expect, it } from "vitest";
import mysql, { type Pool, type RowDataPacket } from "mysql2/promise";
import Fastify, { type FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { MysqlProfileStore } from "../src/database/mysql-profile-store.js";
import { registerLocalProfiles } from "../src/modules/local-profile-routes.js";
import { hostingConfiguration } from "../src/cpanel-server.js";
const enabled = !!process.env.CPANEL_TEST_MYSQL_URL;
let pool: Pool, store: MysqlProfileStore, app: FastifyInstance, uid: string;
const key = randomBytes(32).toString("hex"),
  credentialKey = randomBytes(32).toString("hex");
const headers = { host: "api.test.ge", authorization: `Bearer ${key}` };
const message = (id: string) => ({
  id,
  subject: "Test",
  sentAt: "2026-10-21T10:00:00Z",
  read: false,
  preview: "Test",
  text: "Test",
});
beforeAll(async () => {
  if (!enabled) return;
  pool = mysql.createPool(process.env.CPANEL_TEST_MYSQL_URL!);
  store = new MysqlProfileStore(pool, credentialKey);
  await store.initialize();
  await pool.query("DELETE FROM rs_profiles");
  await pool.query("DELETE FROM rs_push_tokens");
  app = Fastify();
  await registerLocalProfiles(
    app,
    store,
    "https://api.test.ge",
    undefined,
    undefined,
    undefined,
    { connectionKey: key, publicOrigin: "https://api.test.ge" },
  );
});
afterAll(async () => {
  if (!enabled) return;
  await app.close();
  await store.close();
});
it("requires secure non-placeholder hosting configuration", () => {
  const base = {
    PUBLIC_ORIGIN: "https://api.test.ge",
    CONNECTION_KEY: key,
    CREDENTIAL_ENCRYPTION_KEY: credentialKey,
    MYSQL_HOST: "localhost",
    MYSQL_DATABASE: "test",
    MYSQL_USER: "test",
    MYSQL_PASSWORD: "secret",
  };
  expect(hostingConfiguration(base).RS_INBOX_POLL).toBe("0");
  expect(() =>
    hostingConfiguration({ ...base, PUBLIC_ORIGIN: "http://api.test.ge" }),
  ).toThrow();
  expect(() =>
    hostingConfiguration({
      ...base,
      CREDENTIAL_ENCRYPTION_KEY: "0".repeat(64),
    }),
  ).toThrow();
});
it.skipIf(!enabled)(
  "protects even loopback requests and rejects preview keys and other hosts",
  async () => {
    for (const h of [
      { host: "api.test.ge" },
      { host: "api.test.ge", "x-preview-token": key },
      { ...headers, authorization: "Bearer wrong" },
      { ...headers, host: "evil.test" },
      { ...headers, origin: "https://evil.test" },
    ]) {
      expect(
        (await app.inject({ url: "/api/v1/local/profiles", headers: h }))
          .statusCode,
      ).toBe(401);
    }
    expect(
      (await app.inject({ url: "/api/v1/local/profiles", headers })).statusCode,
    ).toBe(200);
  },
);
it.skipIf(!enabled)(
  "saves API profiles in MySQL with encrypted credentials and reloads them",
  async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/v1/local/profiles",
      headers,
      payload: {
        name: "Test",
        username: "cpanel-test",
        password: "private-fixture-password",
        taxpayerId: "60003008009",
      },
    });
    expect(response.statusCode).toBe(200);
    uid = response.json().data.uid;
    expect(response.body).not.toContain("private-fixture-password");
    const [rows] = await pool.query<RowDataPacket[]>(
      "SELECT payload FROM rs_profiles WHERE uid=?",
      [uid],
    );
    expect(rows[0].payload).not.toContain("private-fixture-password");
    const reloaded = new MysqlProfileStore(pool, credentialKey);
    expect(await reloaded.credentials(uid)).toEqual({
      username: "cpanel-test",
      password: "private-fixture-password",
    });
    expect(await reloaded.list()).toHaveLength(1);
    expect(
      (
        await app.inject({
          method: "POST",
          url: `/api/v1/local/profiles/${uid}/password`,
          headers,
        })
      ).json().data.password,
    ).toBe("private-fixture-password");
  },
);
it.skipIf(!enabled)(
  "preserves independent concurrent refresh results and old debt after an error",
  async () => {
    const debt = {
      total: "125.50",
      balance: "100.00",
      asOf: "2026-10-21",
      checkedAt: new Date().toISOString(),
      source: "RS_PORTAL" as const,
      sourceUrl: "https://eservices.rs.ge/Accounting.aspx",
    };
    await Promise.all([
      store.portalResult(uid, debt, null),
      store.result(uid, null, "RS_INVALID_CREDENTIALS"),
    ]);
    const p = await store.get(uid);
    expect(p.portalDebt?.total).toBe("125.50");
    expect(p.errorCode).toBe("RS_INVALID_CREDENTIALS");
    await store.portalResult(uid, null, "RS_PORTAL_UNAVAILABLE");
    expect((await store.get(uid)).portalDebt?.total).toBe("125.50");
  },
);
it.skipIf(!enabled)(
  "keeps inbox baseline, unread state and device tokens in MySQL",
  async () => {
    expect(await store.inboxResult(uid, [], null)).toEqual([]);
    expect(await store.inboxResult(uid, [message("1")], null)).toHaveLength(1);
    await store.markInboxRead(uid, ["1"]);
    expect((await store.inbox(uid)).messages[0].read).toBe(true);
    expect(await store.inboxResult(uid, [message("1")], null)).toEqual([]);
    await store.savePushToken("ExponentPushToken[fixture]");
    await store.savePushToken("ExponentPushToken[fixture]");
    expect(await store.pushTokens()).toHaveLength(1);
    await store.removePushToken("ExponentPushToken[fixture]");
    expect(await store.pushTokens()).toEqual([]);
  },
);
it.skipIf(!enabled)(
  "rejects duplicate usernames and persists edits/deletions through API",
  async () => {
    const payload = {
      name: "Updated",
      username: "cpanel-test",
      password: "new-password",
    };
    await expect(store.save(payload)).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(
      (
        await app.inject({
          method: "PATCH",
          url: `/api/v1/local/profiles/${uid}`,
          headers,
          payload,
        })
      ).json().data.name,
    ).toBe("Updated");
    expect((await store.credentials(uid)).password).toBe("new-password");
    expect(
      (
        await app.inject({
          method: "DELETE",
          url: `/api/v1/local/profiles/${uid}`,
          headers,
        })
      ).statusCode,
    ).toBe(200);
    await expect(store.get(uid)).rejects.toMatchObject({ statusCode: 404 });
  },
);
