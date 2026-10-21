import { beforeEach, afterAll, it, expect, vi } from "vitest";
const memory = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("expo-secure-store", () => ({
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 6,
  getItemAsync: async () => memory.value,
  setItemAsync: async (_key: string, value: string) => {
    memory.value = value;
  },
}));
import {
  saveServerConfig,
  getServerConfig,
} from "../services/server-connection";
import { validateServerConfig } from "../services/server-config";
import { api, post } from "../services/api.native";
const local = { url: "http://192.168.0.138:3001", token: "a".repeat(64) };
const cloud = { url: "https://api.example.ge", token: "b".repeat(64) };
const ok = (data: unknown) =>
  new Response(JSON.stringify({ data, error: null }), { status: 200 });
beforeEach(async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ok([])),
  );
  await saveServerConfig(local);
});
afterAll(() => vi.unstubAllGlobals());
it("sends phone requests to the Mac server with the pairing key", async () => {
  expect(await api("/local/profiles")).toEqual([]);
  const [url, init] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe(local.url + "/api/v1/local/profiles");
  expect(new Headers(init?.headers).get("X-Preview-Token")).toBe(local.token);
  expect(new Headers(init?.headers).get("Authorization")).toBe(
    "Bearer " + local.token,
  );
});
it("posts profile credentials to the server rather than phone SQLite", async () => {
  await post("/local/profiles", {
    name: "Test",
    username: "user",
    password: "saved-on-server",
  });
  const [, init] = vi.mocked(fetch).mock.calls[0];
  expect(init?.method).toBe("POST");
  expect(JSON.parse(init?.body as string)).toMatchObject({
    password: "saved-on-server",
  });
});
it("uses a saved HTTPS server without rebuilding and keeps preview headers local", async () => {
  await saveServerConfig(cloud);
  await api("/local/profiles");
  expect(await getServerConfig()).toEqual(cloud);
  expect(JSON.parse(memory.value!)).toEqual(cloud);
  const [url, init] = vi.mocked(fetch).mock.calls[0];
  expect(url).toBe(cloud.url + "/api/v1/local/profiles");
  expect(new Headers(init?.headers).get("Authorization")).toBe(
    "Bearer " + cloud.token,
  );
  expect(new Headers(init?.headers).has("X-Preview-Token")).toBe(false);
});
it("rejects public HTTP, embedded passwords and malformed pairing keys", async () => {
  for (const url of [
    "http://example.ge",
    "https://user:pass@example.ge",
    "https://example.ge?token=x",
  ])
    expect(() => validateServerConfig({ ...local, url })).toThrow();
  expect(() => validateServerConfig({ ...local, token: "short" })).toThrow(
    "SERVER_TOKEN_INVALID",
  );
  expect(fetch).not.toHaveBeenCalled();
});
it("rejects responses from an old server after switching connections", async () => {
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise<Response>((r) => {
        resolve = r;
      }),
  );
  const pending = api("/local/profiles");
  await vi.waitFor(() => expect(fetch).toHaveBeenCalledTimes(1));
  await saveServerConfig(cloud);
  resolve(ok([{ uid: "old-server-profile" }]));
  await expect(pending).rejects.toThrow("SERVER_CONNECTION_CHANGED");
});
it("returns server errors and connection failures without inventing empty profile lists", async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ error: { code: "LOCAL_ACCESS_ONLY" } }), {
      status: 403,
    }),
  );
  await expect(api("/local/profiles")).rejects.toThrow("LOCAL_ACCESS_ONLY");
  vi.mocked(fetch).mockRejectedValueOnce(new Error("network"));
  await expect(api("/local/profiles")).rejects.toThrow(
    "SERVER_CONNECTION_FAILED",
  );
});
