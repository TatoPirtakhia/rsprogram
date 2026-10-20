import { Platform } from "react-native";
import type { ApiResult } from "@biz/shared";
import { tokenStore, useSession } from "./session";
const base =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === "android"
    ? "http://10.0.2.2:3001"
    : "http://localhost:3001");
if (!__DEV__ && !base.startsWith("https://"))
  throw new Error("Release builds require an HTTPS API");
let refreshPromise: Promise<boolean> | null = null;
async function refresh() {
  try {
    const tokens = await tokenStore.read();
    if (!tokens) return false;
    const response = await fetch(`${base}/api/v1/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) {
      await tokenStore.write(null);
      useSession.getState().set({ authenticated: false });
      return false;
    }
    const result = await response.json();
    await tokenStore.write(result.data);
    return true;
  } catch {
    return false;
  }
}
export async function api<T>(
  path: string,
  init: RequestInit = {},
  retry = true,
): Promise<T> {
  const tokens = await tokenStore.read();
  const response = await fetch(`${base}/api/v1${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(tokens ? { Authorization: `Bearer ${tokens.accessToken}` } : {}),
      ...init.headers,
    },
    signal: AbortSignal.timeout(path.startsWith("/local/") ? 30000 : 15000),
  });
  if (response.status === 401 && retry && !path.startsWith("/auth/")) {
    if (!refreshPromise)
      refreshPromise = refresh().finally(() => {
        refreshPromise = null;
      });
    if (await refreshPromise) return api<T>(path, init, false);
  }
  const result: ApiResult<T> = await response.json();
  if (!response.ok || result.error)
    throw new Error(result.error?.code ?? `HTTP_${response.status}`);
  return result.data;
}
export const post = <T>(path: string, body?: unknown) =>
  api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
