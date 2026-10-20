import { afterEach, describe, it, expect, vi } from "vitest";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import Fastify from "fastify";
import { LocalProfileStore } from "../src/modules/local-profiles.js";
import { registerLocalProfiles } from "../src/modules/local-profile-routes.js";
import { RsSoapClient } from "../src/providers/rs-soap-client.js";
const stores: LocalProfileStore[] = [];
const directories: string[] = [];
function store() {
  const directory = mkdtempSync(join(tmpdir(), "biz-rs-"));
  directories.push(directory);
  const value = new LocalProfileStore(directory);
  stores.push(value);
  return { value, directory };
}
const soap = (code: string, amount: string) =>
  `<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetTPInfoDebt_RSResponse><GetTPInfoDebt_RSResult><TPInfoDebt_RS><Code>${code}</Code><DebtAmount>${amount}</DebtAmount></TPInfoDebt_RS></GetTPInfoDebt_RSResult></GetTPInfoDebt_RSResponse></soap:Body></soap:Envelope>`;
afterEach(() => {
  for (const value of stores.splice(0)) value.close();
  for (const path of directories.splice(0))
    rmSync(path, { recursive: true, force: true });
});
describe("local RS profile management", () => {
  it("requires a development pairing token for the configured LAN preview host", async () => {
    vi.stubEnv("RS_PREVIEW_HOST", "192.168.0.112");
    vi.stubEnv(
      "RS_PREVIEW_TOKEN",
      "fixture-preview-token-with-at-least-32-characters",
    );
    const { value } = store();
    const app = Fastify();
    try {
      await registerLocalProfiles(app, value, "http://localhost:8081");
      const request = (token?: string) =>
        app.inject({
          method: "GET",
          url: "/api/v1/local/profiles",
          remoteAddress: "192.168.0.50",
          headers: {
            host: "192.168.0.112",
            ...(token ? { "x-preview-token": token } : {}),
          },
        });
      expect((await request()).statusCode).toBe(403);
      expect((await request("incorrect")).statusCode).toBe(403);
      expect(
        (await request("fixture-preview-token-with-at-least-32-characters"))
          .statusCode,
      ).toBe(200);
      vi.stubEnv("NODE_ENV", "production");
      expect(
        (await request("fixture-preview-token-with-at-least-32-characters"))
          .statusCode,
      ).toBe(403);
    } finally {
      await app.close();
      vi.unstubAllEnvs();
    }
  });
  it("reveals the selected password only through the local non-cacheable edit endpoint", async () => {
    const { value } = store();
    const profile = value.save({
      name: "Edit",
      username: "edit-user",
      password: "fixture-secret",
    });
    const app = Fastify();
    try {
      await registerLocalProfiles(app, value, "http://localhost:8081");
      const url = `/api/v1/local/profiles/${profile.uid}/password`;
      const allowed = await app.inject({
        method: "POST",
        url,
        headers: { host: "localhost", origin: "http://localhost:8081" },
      });
      expect(allowed.json().data.password).toBe("fixture-secret");
      expect(allowed.headers["cache-control"]).toBe("no-store");
      const denied = await app.inject({
        method: "POST",
        url,
        headers: { host: "localhost", origin: "https://untrusted.example" },
      });
      expect(denied.statusCode).toBe(403);
      expect(denied.body).not.toContain("fixture-secret");
      expect(JSON.stringify(value.get(profile.uid))).not.toContain(
        "fixture-secret",
      );
    } finally {
      await app.close();
    }
  });
  it("distinguishes the observed empty XML operation response from malformed XML", async () => {
    const emptyResponse =
      '<?xml version="1.0" encoding="utf-8"?><soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"><soap:Body><GetTPInfoDebt_RSResponse xmlns="services.rs.ge" /></soap:Body></soap:Envelope>';
    const emptyClient = new RsSoapClient(
      vi.fn(
        async () =>
          new Response(emptyResponse, {
            status: 200,
            headers: { "Content-Type": "text/xml; charset=utf-8" },
          }),
      ) as typeof fetch,
    );
    await expect(
      emptyClient.getDebtResponse({ username: "fixture", password: "x" }),
    ).rejects.toMatchObject({ code: "RS_NO_DATA" });
    const brokenClient = new RsSoapClient(
      vi.fn(
        async () => new Response("<Envelope><Body>", { status: 200 }),
      ) as typeof fetch,
    );
    await expect(
      brokenClient.getDebtResponse({ username: "fixture", password: "x" }),
    ).rejects.toMatchObject({ code: "RS_INVALID_RESPONSE" });
  });
  it("keeps an explicit empty result distinct from a confirmed zero balance", async () => {
    const client = new RsSoapClient(
      vi.fn(
        async () =>
          new Response(
            "<Envelope><Body><GetTPInfoDebt_RSResponse><GetTPInfoDebt_RSResult /></GetTPInfoDebt_RSResponse></Body></Envelope>",
            { status: 200 },
          ),
      ) as typeof fetch,
    );
    const result = await client.getDebtResponse({
      username: "fixture",
      password: "x",
    });
    expect(result.rows).toEqual([]);
    expect(result.mappingStatus).toBe("NOT_VERIFIED");
    expect(result).not.toHaveProperty("taxDebt");
  });
  it("persists encrypted passwords and keeps profiles isolated", () => {
    const { value, directory } = store();
    const a = value.save({
      name: "A",
      username: "user-a",
      password: "a-private-password",
    });
    const b = value.save({ name: "B", username: "user-b", password: "123" });
    expect(value.credentials(a.uid)).toEqual({
      username: "user-a",
      password: "a-private-password",
    });
    expect(value.credentials(b.uid).password).toBe("123");
    expect(JSON.stringify(value.list())).not.toContain("a-private-password");
    expect(
      readFileSync(join(directory, "rs-profiles.sqlite")).includes(
        Buffer.from("a-private-password"),
      ),
    ).toBe(false);
    const reopened = new LocalProfileStore(directory);
    stores.push(reopened);
    expect(reopened.get(a.uid).username).toBe("user-a");
    expect(reopened.credentials(a.uid).password).toBe("a-private-password");
    value.delete(a.uid);
    expect(() => value.credentials(a.uid)).toThrow("PROFILE_NOT_FOUND");
    expect(value.list()).toHaveLength(1);
  });
  it("sends only selected credentials and escapes XML characters", async () => {
    const { value } = store();
    value.save({
      name: "Other",
      username: "not-selected",
      password: "other-secret",
    });
    const selected = value.save({
      name: "Selected",
      username: "a<&",
      password: "p<&",
    });
    const transport = vi.fn(
      async () => new Response(soap("raw-code", "12.3400"), { status: 200 }),
    );
    const client = new RsSoapClient(transport as typeof fetch);
    const response = await client.getDebtResponse(
      value.credentials(selected.uid),
    );
    const request = transport.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[0]).toBe(
      "https://services.rs.ge/taxservice/taxservice.asmx",
    );
    expect(request[1].body).toContain("<login>a&lt;&amp;</login>");
    expect(request[1].body).toContain("<password>p&lt;&amp;</password>");
    expect(request[1].body).not.toContain("other-secret");
    expect(response.rows).toEqual([
      { code: "raw-code", debtAmount: "12.3400" },
    ]);
    expect(response.mappingStatus).toBe("NOT_VERIFIED");
  });
  it("allows local CRUD with no application login, rejects remote and cross-origin access", async () => {
    const { value } = store();
    const app = Fastify();
    await registerLocalProfiles(app, value, "http://localhost:8081");
    const headers = { host: "localhost:3001", origin: "http://localhost:8081" };
    const profile = await app.inject({
      method: "POST",
      url: "/api/v1/local/profiles",
      headers,
      payload: {
        name: "Company",
        username: "ordinary_username",
        password: "1",
      },
    });
    expect(profile.statusCode).toBe(200);
    expect(profile.json().data.username).toBe("ordinary_username");
    expect(profile.json().data.password).toBeUndefined();
    expect(
      (await app.inject({ url: "/api/v1/local/profiles", headers })).json()
        .data,
    ).toHaveLength(1);
    expect(
      (
        await app.inject({
          url: "/api/v1/local/profiles",
          headers,
          remoteAddress: "192.168.10.2",
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await app.inject({
          url: "/api/v1/local/profiles",
          headers: { ...headers, origin: "https://untrusted.example" },
        })
      ).statusCode,
    ).toBe(403);
    await app.close();
  });
  it("preserves the last successful result when a later request fails", () => {
    const { value } = store();
    const p = value.save({ name: "Saved", username: "saved", password: "x" });
    value.result(
      p.uid,
      {
        fetchedAt: "2026-10-20T12:00:00Z",
        operation: "GetTPInfoDebt_RS",
        mappingStatus: "NOT_VERIFIED",
        rows: [],
      },
      null,
    );
    const updated = value.result(p.uid, null, "RS_ACCESS_DENIED");
    expect(updated.connectionState).toBe("error");
    expect(updated.lastSuccessAt).toBe("2026-10-20T12:00:00Z");
    expect(
      updated.response && "rows" in updated.response
        ? updated.response.rows
        : null,
    ).toEqual([]);
  });
  it("does not expose remote SOAP fault contents", async () => {
    const client = new RsSoapClient(
      vi.fn(
        async () =>
          new Response(
            "<Envelope><Body><Fault><faultstring>secret password echoed</faultstring></Fault></Body></Envelope>",
            { status: 500 },
          ),
      ) as typeof fetch,
    );
    await expect(
      client.getDebtResponse({ username: "u", password: "p" }),
    ).rejects.toMatchObject({ code: "RS_SOAP_FAULT" });
  });
});
