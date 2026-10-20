import { beforeEach, afterEach, describe, it, expect } from "vitest";
import { hash } from "argon2";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { MemoryRepository } from "../src/database/repository.js";
import { createDemo } from "../src/providers/demo.js";
import { fiscalTotal, reconcile, dashboard } from "../src/modules/finance.js";
import {
  RsSoapProvider,
  AuthorizedBankPlaceholder,
} from "../src/providers/index.js";
import { retry, reminders, deadlineDays } from "../src/jobs/scheduler.js";
import {
  encryptCredential,
  decryptCredential,
} from "../src/modules/credentials.js";
import { previewCsv } from "../src/modules/imports.js";
describe("BizMonitor API", () => {
  let repo: MemoryRepository;
  let app: Awaited<ReturnType<typeof createApp>>["app"];
  let token: string;
  let refreshToken: string;
  beforeEach(async () => {
    repo = new MemoryRepository();
    const d = createDemo();
    repo.datasets.set(d.business.uid, d);
    repo.users.push({
      uid: randomUUID(),
      email: "demo@example.com",
      username: "owner",
      passwordHash: await hash("Password123!"),
      businessUid: d.business.uid,
    });
    ({ app } = await createApp(repo, {
      jwtSecret: "test-secret-with-at-least-thirty-two-characters",
    }));
    const login = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "owner", password: "Password123!" },
    });
    token = login.json().data.accessToken;
    refreshToken = login.json().data.refreshToken;
  });
  afterEach(async () => {
    await app.close();
  });
  const headers = () => ({});
  it("rejects unauthenticated access", async () => {
    const result = await app.inject({
      url: "/api/v1/dashboard/summary",
      headers: headers(),
    });
    expect(result.statusCode).toBe(401);
    expect(result.json().error.code).toBe("UNAUTHORIZED");
  });
  it("validates login and hides internal errors", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "", password: "x" },
    });
    expect(r.statusCode).toBe(400);
    expect(r.json().data).toBeNull();
  });
  it("accepts a short existing password but still verifies it", async () => {
    repo.users[0].passwordHash = await hash("123");
    const valid = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "owner", password: "123" },
    });
    expect(valid.statusCode).toBe(200);
    const invalid = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "owner", password: "124" },
    });
    expect(invalid.statusCode).toBe(401);
    const empty = await app.inject({
      method: "POST",
      url: "/api/v1/auth/login",
      payload: { username: "owner", password: "" },
    });
    expect(empty.statusCode).toBe(400);
  });
  it("rotates refresh tokens and revokes reused token families", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json().data.refreshToken).not.toBe(refreshToken);
    const reused = await app.inject({
      method: "POST",
      url: "/api/v1/auth/refresh",
      payload: { refreshToken },
    });
    expect(reused.statusCode).toBe(401);
    const revoked = await app.inject({
      url: "/api/v1/me",
      headers: { authorization: `Bearer ${first.json().data.accessToken}` },
    });
    expect(revoked.statusCode).toBe(401);
  });
  it("scopes business reads and denies cross-business IDs", async () => {
    const r = await app.inject({
      url: "/api/v1/businesses/" + randomUUID(),
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(404);
    const receipts = await app.inject({
      url: "/api/v1/fiscal/receipts?limit=3",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(receipts.json().data.items).toHaveLength(3);
    expect(
      new Set(
        receipts
          .json()
          .data.items.map((r: { businessUid: string }) => r.businessUid),
      ).size,
    ).toBe(1);
  });
  it("serves every core module and documented OpenAPI routes", async () => {
    for (const path of [
      "me",
      "dashboard/summary",
      "dashboard/sales-chart",
      "fiscal/registers",
      "fiscal/receipts",
      "fiscal/daily-summary",
      "fiscal/summary",
      "banking/accounts",
      "banking/transactions",
      "banking/settlements",
      "taxes/debts",
      "taxes/obligations",
      "taxes/calendar",
      "taxes/declarations",
      "integrations",
      "notifications",
      "diagnostics",
      "reconciliations/candidates",
    ]) {
      const r = await app.inject({
        url: "/api/v1/" + path,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(r.statusCode, path).toBe(200);
      expect(r.json().meta.source).toBe("demo");
    }
    const docs = await app.inject("/docs/json");
    expect(docs.statusCode).toBe(200);
    expect(docs.json().paths["/api/v1/dashboard/summary"]).toBeDefined();
  });
  it("returns unsupported for unverified live sync", async () => {
    const r = await app.inject({
      method: "POST",
      url: "/api/v1/integrations/rs-soap/sync",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(r.statusCode).toBe(422);
    expect(r.json().error.code).toBe("UNSUPPORTED");
  });
  it("rejects invalid pagination and date ranges", async () => {
    for (const query of [
      "limit=0",
      "from=2026-10-20&to=2026-10-01",
      "from=banana",
    ]) {
      const r = await app.inject({
        url: "/api/v1/fiscal/receipts?" + query,
        headers: { authorization: `Bearer ${token}` },
      });
      expect(r.statusCode).toBe(400);
    }
  });
  it("revokes sessions on logout", async () => {
    await app.inject({
      method: "POST",
      url: "/api/v1/auth/logout",
      headers: { authorization: `Bearer ${token}` },
    });
    expect(
      (
        await app.inject({
          url: "/api/v1/me",
          headers: { authorization: `Bearer ${token}` },
        })
      ).statusCode,
    ).toBe(401);
  });
  it("requires preview confirmation and keeps imported banking separate", async () => {
    const auth = { authorization: `Bearer ${token}` };
    const account = await app.inject({
      method: "POST",
      url: "/api/v1/imports/container",
      headers: auth,
      payload: { kind: "account", name: "Imported account" },
    });
    const csv = `externalId,occurredAt,amount,accountUid,direction,description,category\nTX-01,2026-10-20T10:00:00+04:00,42.50,${account.json().data.uid},incoming,Customer transfer,customer_payment`;
    const p = await app.inject({
      method: "POST",
      url: "/api/v1/imports/preview",
      headers: auth,
      payload: { kind: "transactions", csv },
    });
    expect(p.statusCode).toBe(200);
    expect(
      (
        await app.inject({
          url: "/api/v1/banking/transactions?source=import",
          headers: auth,
        })
      ).json().data.total,
    ).toBe(0);
    const url = `/api/v1/imports/${p.json().data.uid}/confirm`;
    expect(
      (await app.inject({ method: "POST", url, headers: auth })).json().data
        .inserted,
    ).toBe(1);
    expect(
      (await app.inject({ method: "POST", url, headers: auth })).statusCode,
    ).toBe(404);
    expect(
      (
        await app.inject({
          url: "/api/v1/banking/transactions?source=import",
          headers: auth,
        })
      ).json().data.total,
    ).toBe(1);
    const duplicate = await app.inject({
      method: "POST",
      url: "/api/v1/imports/preview",
      headers: auth,
      payload: { kind: "transactions", csv },
    });
    expect(duplicate.json().data.duplicates).toBe(1);
  });
});
describe("financial rules and integrations", () => {
  it("uses exact integer arithmetic, deduplicates, subtracts refunds and excludes voids", () => {
    const d = createDemo();
    const r = d.receipts[0];
    expect(
      fiscalTotal([
        { ...r, externalId: "s", amount: "90071992547409.91", status: "sale" },
        { ...r, externalId: "s", amount: "90071992547409.91", status: "sale" },
        { ...r, externalId: "r", amount: "0.02", status: "refund" },
        { ...r, externalId: "v", amount: "999.00", status: "void" },
      ]),
    ).toBe("90071992547409.89");
  });
  it("does not count owner deposits as fiscal revenue", () => {
    const d = createDemo();
    const before = dashboard(d).sales;
    d.transactions.push({
      ...d.transactions[0],
      uid: randomUUID(),
      externalId: "owner",
      category: "owner_deposit",
      amount: "999999.00",
    });
    expect(dashboard(d).sales).toBe(before);
  });
  it("keeps unknown tax debt unavailable and demo debt unconfirmed", () => {
    const d = createDemo();
    expect(d.debts[0].confirmed).toBe(false);
    d.debts[0].amount = null;
    expect(dashboard(d).taxDebt).toBeNull();
  });
  it("checks reconciliation existence, direction, source and duplicates", () => {
    const d = createDemo();
    expect(() =>
      reconcile(d, "unknown", d.transactions[0].uid, "note"),
    ).toThrow("RECORD_NOT_FOUND");
    const r = d.receipts.find((r) => r.status === "sale")!;
    const tx = d.transactions.find((t) => t.direction === "incoming")!;
    expect(reconcile(d, r.uid, tx.uid, "Settlement delay")).toEqual({
      receiptUid: r.uid,
      transactionUid: tx.uid,
      note: "Settlement delay",
    });
    d.reconciliations.push({
      uid: randomUUID(),
      receiptUid: r.uid,
      transactionUid: tx.uid,
      note: "linked",
      createdAt: new Date().toISOString(),
    });
    expect(() => reconcile(d, r.uid, tx.uid, "again")).toThrow(
      "ALREADY_LINKED",
    );
  });
  it("calculates Tbilisi reminder days and deduplicates unchanged reminders", () => {
    expect(deadlineDays("2026-10-21", "2026-10-20")).toBe(1);
    const d = createDemo(new Date("2026-10-20T12:00:00Z"));
    reminders(d, new Date("2026-10-20T12:00:00Z"));
    const count = d.notifications.length;
    reminders(d, new Date("2026-10-20T12:00:00Z"));
    expect(d.notifications.length).toBe(count);
  });
  it("retries transient failures with exponential delays", async () => {
    const delays: number[] = [];
    let attempts = 0;
    const result = await retry(
      async () => {
        if (++attempts < 3) throw new Error("timeout");
        return "ok";
      },
      3,
      async (ms) => {
        delays.push(ms);
      },
    );
    expect(result).toBe("ok");
    expect(delays).toEqual([250, 500]);
  });
  it("does not fabricate unsupported provider data", async () => {
    await expect(new RsSoapProvider().getTaxDebt()).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
    await expect(
      new AuthorizedBankPlaceholder("TBC Bank").getAccounts(),
    ).rejects.toMatchObject({ code: "UNSUPPORTED" });
  });
  it("authenticates encrypted secrets and tenant context", () => {
    const key = "ab".repeat(32);
    const encrypted = encryptCredential("private secret", key, "tenant-a");
    expect(encrypted).not.toContain("private secret");
    expect(decryptCredential(encrypted, key, "tenant-a")).toBe(
      "private secret",
    );
    expect(() => decryptCredential(encrypted, key, "tenant-b")).toThrow();
  });
  it("validates imported decimals", () => {
    const d = createDemo();
    expect(() =>
      previewCsv(
        "externalId,occurredAt,amount,accountUid,direction,description,category\nx,2026-10-20T12:00:00Z,3.14159,no,incoming,x,x",
        "transactions",
        d,
      ),
    ).toThrow();
  });
});
