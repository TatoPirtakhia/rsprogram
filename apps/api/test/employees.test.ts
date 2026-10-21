import { expect, it, vi } from "vitest";
import Fastify from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  RsEmployeesClient,
  parseEmployees,
} from "../src/providers/rs-employees-client.js";
import { registerLocalProfiles } from "../src/modules/local-profile-routes.js";
import { LocalProfileStore } from "../src/modules/local-profiles.js";

const credentials = { username: "user", password: "secret" };
const taxpayerId = "206322102";
const fields = [
  "ID",
  "TIN",
  "ORG_TIN",
  "FULLNAME",
  "STATUS",
  "WORK_TYPE_TXT",
  "ACTIVATE_DATE",
];
const row = [
  2100,
  "01234567890",
  taxpayerId,
  "სატესტო პირი",
  1,
  "სრული",
  "01-10-2026",
];
const grid = (rows: unknown[][] = [row], count = rows.length) => ({
  Data: { Fields: fields, Rows: rows },
  Summary: { _Count: count },
});
const ok = (data: unknown) =>
  new Response(JSON.stringify({ DATA: data, STATUS: { ID: 0 } }));

it("maps documented Fields/Rows, preserves identity and never invents a salary", () => {
  const result = parseEmployees(grid([row], 12), taxpayerId);
  expect(result.total).toBe(12);
  expect(result.truncated).toBe(true);
  expect(result.employees[0]).toMatchObject({
    tin: "01234567890",
    name: "სატესტო პირი",
    status: 1,
    salary: null,
  });
  expect(parseEmployees(grid([]), taxpayerId)).toEqual({
    total: 0,
    truncated: false,
    employees: [],
  });
});
it("rejects another employer, unknown columns, missing identity and duplicate records", () => {
  expect(() => parseEmployees(grid(), "999999999")).toThrow(
    "RS_PORTAL_ID_MISMATCH",
  );
  expect(() => parseEmployees(grid([[2100]]), taxpayerId)).toThrow(
    "RS_INVALID_RESPONSE",
  );
  expect(() => parseEmployees(grid([row, row]), taxpayerId)).toThrow(
    "RS_INVALID_RESPONSE",
  );
  expect(() =>
    parseEmployees(
      { ...grid(), Data: { Fields: ["ID", "ID"], Rows: [] } },
      taxpayerId,
    ),
  ).toThrow("RS_INVALID_RESPONSE");
});
it("authenticates, requests the explicit row limit and signs out on employer mismatch", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(ok({ ACCESS_TOKEN: "private-token" }))
    .mockResolvedValueOnce(ok(grid()))
    .mockResolvedValueOnce(ok({}));
  const client = new RsEmployeesClient(transport);
  await expect(
    client.getEmployees("profile", credentials, "wrong"),
  ).rejects.toThrow("RS_PORTAL_ID_MISMATCH");
  expect(transport.mock.calls[1][1]?.body).toBe(
    JSON.stringify({ MAXIMUM_ROWS: 10000 }),
  );
  expect(transport.mock.calls[2][0]).toBe("https://eapi.rs.ge/Users/SignOut");
});
it("keeps SMS tokens server-side and binds single-use challenges to the profile", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      ok({ PIN_TOKEN: "private-pin-token", MASKED_MOBILE: "***16" }),
    )
    .mockResolvedValueOnce(ok({ ACCESS_TOKEN: "private-access-token" }))
    .mockResolvedValueOnce(ok(grid()))
    .mockResolvedValueOnce(ok({}));
  const client = new RsEmployeesClient(transport);
  const challenge = await client.getEmployees("a", credentials, taxpayerId);
  expect(challenge.state).toBe("pin_required");
  expect(JSON.stringify(challenge)).not.toContain("private");
  if (challenge.state !== "pin_required") throw new Error("missing challenge");
  const verification = { challengeId: challenge.challengeId, pin: "1234" };
  await expect(
    client.getEmployees("b", credentials, taxpayerId, verification),
  ).rejects.toThrow("RS_EMPLOYEES_PIN_EXPIRED");
  const result = await client.getEmployees(
    "a",
    credentials,
    taxpayerId,
    verification,
  );
  expect(result.state).toBe("ready");
  expect(JSON.stringify(result)).not.toContain("private");
  await expect(
    client.getEmployees("a", credentials, taxpayerId, verification),
  ).rejects.toThrow("RS_EMPLOYEES_PIN_EXPIRED");
});
it("enforces expiry and rejects invalid/denied responses", async () => {
  const transport = vi
    .fn<typeof fetch>()
    .mockResolvedValue(ok({ PIN_TOKEN: "private" }));
  const client = new RsEmployeesClient(transport);
  const challenge = await client.getEmployees("a", credentials, taxpayerId);
  if (challenge.state !== "pin_required") throw new Error("missing challenge");
  const clock = vi.spyOn(Date, "now").mockReturnValue(Date.now() + 6 * 60000);
  try {
    await expect(
      client.getEmployees("a", credentials, taxpayerId, {
        challengeId: challenge.challengeId,
        pin: "1234",
      }),
    ).rejects.toThrow("RS_EMPLOYEES_PIN_EXPIRED");
  } finally {
    clock.mockRestore();
  }
  transport.mockResolvedValueOnce(new Response("not JSON"));
  await expect(
    client.getEmployees("a", credentials, taxpayerId),
  ).rejects.toThrow("RS_INVALID_RESPONSE");
  transport.mockResolvedValueOnce(new Response("", { status: 403 }));
  await expect(
    client.getEmployees("a", credentials, taxpayerId),
  ).rejects.toThrow("RS_ACCESS_DENIED");
});
it("protects the employees route with the existing server connection key", async () => {
  const directory = mkdtempSync(join(tmpdir(), "biz-employees-"));
  const store = new LocalProfileStore(directory);
  const app = Fastify();
  const transport = vi
    .fn<typeof fetch>()
    .mockImplementation(async (url) =>
      String(url).endsWith("Authenticate")
        ? ok({ ACCESS_TOKEN: "private" })
        : String(url).endsWith("ListEmployees")
          ? ok(grid())
          : ok({}),
    );
  const key = "a".repeat(64);
  try {
    const profile = store.save({ name: "Company", ...credentials, taxpayerId });
    await registerLocalProfiles(
      app,
      store,
      "https://rs.example",
      undefined,
      undefined,
      undefined,
      { connectionKey: key, publicOrigin: "https://rs.example" },
      new RsEmployeesClient(transport),
    );
    const url = `/api/v1/local/profiles/${profile.uid}/employees`;
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: { host: "rs.example" },
          payload: {},
        })
      ).statusCode,
    ).toBe(401);
    expect(transport).not.toHaveBeenCalled();
    const response = await app.inject({
      method: "POST",
      url,
      headers: { host: "rs.example", authorization: `Bearer ${key}` },
      payload: {},
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().data.employees[0].tin).toBe("01234567890");
    expect(response.body).not.toContain("private");
  } finally {
    await app.close();
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
