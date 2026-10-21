import { beforeEach, it, expect, vi } from "vitest";
import { DatabaseSync } from "node:sqlite";
const f = vi.hoisted(() => ({
  db: null as unknown as DatabaseSync,
  key: null as string | null,
  cipher: true,
  connections: 0,
  network: vi.fn(),
  portal: vi.fn(),
  exec: vi.fn(),
}));
vi.mock("expo-crypto", () => ({
  randomUUID: () => crypto.randomUUID(),
  getRandomBytesAsync: async () => new Uint8Array(32).fill(19),
}));
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: async () => f.key,
  setItemAsync: async (_k: string, v: string) => {
    f.key = v;
  },
}));
vi.mock("expo/fetch", () => ({
  fetch: (...args: unknown[]) => f.network(...args),
}));
vi.mock("../services/device/portal-session", () => ({
  readPortal: (...args: unknown[]) => f.portal(...args),
}));
vi.mock("expo-sqlite", () => ({
  openDatabaseAsync: async (
    _name: string,
    options?: { useNewConnection?: boolean },
  ) => {
    let keyed = false;
    let closed = false;
    const check = () => {
      if (closed) throw new Error("CONNECTION_CLOSED");
      if (!keyed)
        throw new Error(
          "SQLiteErrorException: Error code 26: file is not a database",
        );
    };
    const adapter = {
      execAsync: async (sql: string) => {
        f.exec(sql);
        if (sql.startsWith("PRAGMA key")) {
          keyed = true;
          return;
        }
        check();
        f.db.exec(sql);
      },
      getFirstAsync: async (sql: string, ...args: (string | number)[]) => {
        check();
        return sql === "PRAGMA cipher_version"
          ? f.cipher
            ? { cipher_version: "test" }
            : null
          : f.db.prepare(sql).get(...args);
      },
      getAllAsync: async (sql: string, ...args: (string | number)[]) => {
        check();
        return f.db.prepare(sql).all(...args);
      },
      runAsync: async (sql: string, ...args: (string | number)[]) => {
        check();
        return f.db.prepare(sql).run(...args);
      },
      closeAsync: async () => {
        closed = true;
      },
      withExclusiveTransactionAsync: async () => {
        throw new Error(
          "Unkeyed exclusive transaction connection: error code 26",
        );
      },
    };
    // Each call, including useNewConnection, starts without a cipher key.
    if (options?.useNewConnection) f.connections++;
    return adapter;
  },
}));
import { deviceApi as api } from "../services/device/local-api";
const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
import { deviceStore } from "../services/device/store";
const input = {
  name: "Company",
  username: "selected-user",
  password: "secret<&",
  taxpayerId: "123456789",
};
beforeEach(async () => {
  if (!f.db) f.db = new DatabaseSync(":memory:");
  f.network.mockReset();
  f.portal.mockReset();
  await api("/local/profiles");
  f.db.exec("DELETE FROM profiles");
});
it("creates, reads and deletes profiles offline, keeping passwords out of returned data", async () => {
  const p = await post<{ uid: string }>("/local/profiles", input);
  expect(JSON.stringify(await api("/local/profiles"))).not.toContain(
    input.password,
  );
  expect(await post(`/local/profiles/${p.uid}/password`)).toEqual({
    password: input.password,
  });
  expect(f.exec).toHaveBeenCalledWith(
    expect.stringMatching(/^PRAGMA key = '[a-f0-9]{64}';$/),
  );
  expect(f.key).toHaveLength(64);
  expect(f.network).not.toHaveBeenCalled();
  await api(`/local/profiles/${p.uid}`, { method: "DELETE" });
  expect(await api("/local/profiles")).toEqual([]);
});
it("persists profiles across store reopen and rejects duplicate usernames", async () => {
  const p = await post<{ uid: string }>("/local/profiles", input);
  await expect(post("/local/profiles", input)).rejects.toThrow(
    "PROFILE_EXISTS",
  );
  vi.resetModules();
  const reopened = await import("../services/device/store");
  expect((await reopened.deviceStore.read(p.uid)).username).toBe(
    input.username,
  );
});
it("reads RS on-device, preserves successful debt on failure, and isolates profiles", async () => {
  const a = await post<{ uid: string }>("/local/profiles", input);
  const b = await post<{ uid: string }>("/local/profiles", {
    ...input,
    username: "second",
    password: "other",
  });
  f.portal.mockResolvedValueOnce({
    d: { ToBePaid: 101.25, Balance: 100, TotalDebt: 1.25 },
  });
  const debt = await post<{ portalDebt: { total: string } }>(
    `/local/profiles/${a.uid}/debt`,
  );
  expect(debt.portalDebt.total).toBe("101.25");
  expect(f.portal).toHaveBeenCalledWith(
    expect.objectContaining({
      username: input.username,
      password: input.password,
    }),
    input.taxpayerId,
    "debt",
  );
  f.portal.mockRejectedValueOnce(new Error("RS_PORTAL_UNAVAILABLE"));
  expect(await post(`/local/profiles/${a.uid}/debt`)).toMatchObject({
    debtError: "RS_PORTAL_UNAVAILABLE",
    portalDebt: { total: "101.25" },
  });
  expect(await api(`/local/profiles/${b.uid}`)).toHaveProperty(
    "portalDebt",
    undefined,
  );
  await api(`/local/profiles/${a.uid}`, {
    method: "PATCH",
    body: JSON.stringify({ ...input, password: "replacement" }),
  });
  expect(await api(`/local/profiles/${a.uid}`)).toHaveProperty(
    "portalDebt",
    undefined,
  );
});
it("does not apply an old response after credentials change", async () => {
  const p = await post<{ uid: string }>("/local/profiles", input);
  const old = await deviceStore.read(p.uid);
  await api(`/local/profiles/${p.uid}`, {
    method: "PATCH",
    body: JSON.stringify({ ...input, password: "new" }),
  });
  await expect(
    deviceStore.update(
      p.uid,
      (v) => {
        v.errorCode = "OLD";
      },
      old.revision,
    ),
  ).rejects.toThrow("PROFILE_CHANGED");
});
it("stores inbox read state and retains messages if RS later fails", async () => {
  const p = await post<{ uid: string }>("/local/profiles", input);
  const payload = {
    STATUS: { ID: 0 },
    DATA: {
      data: {
        Rows: [
          {
            NOTIF_ID: 1,
            NOTIF_SUBJ: "Notice",
            NOTIF_DATE: "15-ოქტ-2026 10:05:45",
            NOTIF_TEXT: "<p>hello</p>",
          },
        ],
      },
    },
  };
  f.portal.mockResolvedValue(payload);
  await post(`/local/profiles/${p.uid}/inbox`);
  await post(`/local/profiles/${p.uid}/inbox/read`, { ids: ["1"] });
  expect(await post(`/local/profiles/${p.uid}/inbox`)).toMatchObject({
    messages: [{ id: "1", read: true, text: "hello" }],
  });
  f.portal.mockRejectedValue(new Error("RS_PORTAL_UNAVAILABLE"));
  expect(await post(`/local/profiles/${p.uid}/inbox`)).toMatchObject({
    error: "RS_PORTAL_UNAVAILABLE",
    messages: [{ id: "1", read: true }],
  });
});
it("rejects routes that would require the old server", async () => {
  await expect(api("/notifications/device")).rejects.toThrow(
    "DEVICE_ROUTE_UNAVAILABLE",
  );
  expect(f.network).not.toHaveBeenCalled();
});
it("fails closed if the native database lacks SQLCipher", async () => {
  vi.resetModules();
  f.cipher = false;
  try {
    const fresh = await import("../services/device/store");
    await expect(fresh.deviceStore.list()).rejects.toThrow(
      "ENCRYPTED_STORAGE_REQUIRED",
    );
  } finally {
    f.cipher = true;
  }
});

it("keys every new transaction connection before BEGIN and serializes concurrent writes", async () => {
  const before = f.connections;
  const profiles = await Promise.all(
    Array.from({ length: 4 }, (_, i) =>
      post<{ uid: string }>("/local/profiles", {
        ...input,
        username: `parallel-${i}`,
      }),
    ),
  );
  expect(new Set(profiles.map((p) => p.uid)).size).toBe(4);
  expect(f.connections - before).toBe(4);
  expect(await api<unknown[]>("/local/profiles")).toHaveLength(4);
});
