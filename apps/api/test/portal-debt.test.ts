import { it, expect } from "vitest";
import Fastify from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseBudgetAccounting } from "../src/providers/rs-portal-debt-client.js";
import { RsRequestError } from "../src/providers/soap-transport.js";
import { LocalProfileStore } from "../src/modules/local-profiles.js";
import { registerLocalProfiles } from "../src/modules/local-profile-routes.js";
it("reads the amount to pay from the accounting budget info", () => {
  expect(
    parseBudgetAccounting(
      {
        d: {
          Balance: 1291.82,
          TotalDebt: 0.0,
          ToBePaid: 1291.82,
          ToBePaidList: [],
        },
      },
      "2026-10-21",
    ),
  ).toEqual({
    total: "1291.82",
    balance: "1291.82",
    upcoming: "0.00",
    asOf: "2026-10-21",
  });
  expect(
    parseBudgetAccounting(
      { d: { Balance: 100.1, TotalDebt: 25, ToBePaid: 125.1 } },
      "2026-10-21",
    ),
  ).toMatchObject({ total: "125.10", balance: "100.10", upcoming: "25.00" });
});
it("never shows a negative amount to pay as debt", () => {
  expect(
    parseBudgetAccounting(
      { d: { Balance: -20, TotalDebt: 0, ToBePaid: -20 } },
      "2026-10-21",
    ),
  ).toMatchObject({ total: "0.00", balance: "-20.00" });
});
it("rejects missing or malformed amounts", () => {
  for (const body of [
    null,
    {},
    { d: { Balance: 1, TotalDebt: 0 } },
    { d: { Balance: "1291.82", TotalDebt: 0, ToBePaid: 1291.82 } },
    { d: { Balance: 1.234, TotalDebt: 0, ToBePaid: 1.234 } },
    { d: { Balance: 1, TotalDebt: 0, ToBePaid: Number.NaN } },
  ])
    expect(() => parseBudgetAccounting(body, "2026-10-21")).toThrow(
      "RS_PORTAL_FORMAT_CHANGED",
    );
});
it("fetches a changed balance on every request and preserves the latest snapshot on failure", async () => {
  const dir = mkdtempSync(join(tmpdir(), "portal-debt-"));
  const store = new LocalProfileStore(dir);
  const app = Fastify();
  const p = store.save({
    name: "Fixture",
    username: "fixture",
    password: "private",
    taxpayerId: "60003008009",
  });
  let calls = 0;
  try {
    await registerLocalProfiles(
      app,
      store,
      "http://localhost:8081",
      undefined,
      {
        async getDebt(credentials, id) {
          expect(credentials).toEqual({
            username: "fixture",
            password: "private",
          });
          expect(id).toBe("60003008009");
          calls++;
          if (calls === 3) throw new RsRequestError("RS_PORTAL_UNAVAILABLE");
          return {
            total: calls === 1 ? "1290.56" : "0.00",
            balance: calls === 1 ? "-1290.56" : "0.00",
            asOf: "2026-10-20",
            checkedAt: new Date().toISOString(),
            source: "RS_PORTAL" as const,
            sourceUrl: "https://eservices.rs.ge/PayerInfo.aspx",
          };
        },
      },
    );
    const request = () =>
      app.inject({
        method: "POST",
        url: `/api/v1/local/profiles/${p.uid}/debt`,
        headers: { host: "localhost" },
        payload: {},
      });
    expect((await request()).json().data.portalDebt.total).toBe("1290.56");
    expect((await request()).json().data.portalDebt.total).toBe("0.00");
    const failed = (await request()).json().data;
    expect(failed.portalDebt.total).toBe("0.00");
    expect(failed.debtError).toBe("RS_PORTAL_UNAVAILABLE");
    expect(calls).toBe(3);
    expect(JSON.stringify(failed)).not.toContain("private");
  } finally {
    await app.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
