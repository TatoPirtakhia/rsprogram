import type { ApiResult } from "@biz/shared";
import { getServerConfig, connectionGeneration } from "./server-connection";
import {
  isLocalServer,
  validateServerConfig,
  type ServerConfig,
} from "./server-config";
export async function requestServer<T>(
  config: ServerConfig,
  path: string,
  init: RequestInit = {},
): Promise<T> {
  config = validateServerConfig(config);
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  if (config.token) {
    headers.set("Authorization", `Bearer ${config.token}`);
    if (isLocalServer(new URL(config.url).hostname))
      headers.set("X-Preview-Token", config.token);
  }
  let response: Response;
  try {
    response = await fetch(`${config.url}/api/v1${path}`, {
      ...init,
      headers,
      redirect: "error",
      signal:
        init.signal ??
        AbortSignal.timeout(
          path.endsWith("/debt") || path.endsWith("/inbox") ? 120000 : 30000,
        ),
    });
  } catch {
    throw new Error("SERVER_CONNECTION_FAILED");
  }
  let result: ApiResult<T>;
  try {
    result = await response.json();
  } catch {
    throw new Error("SERVER_INVALID_RESPONSE");
  }
  if (!response.ok || result.error)
    throw new Error(result.error?.code ?? `HTTP_${response.status}`);
  return result.data;
}
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const generation = connectionGeneration(),
    config = await getServerConfig();
  if (generation !== connectionGeneration()) return api<T>(path, init);
  const result = await requestServer<T>(config, path, init);
  if (generation !== connectionGeneration())
    throw new Error("SERVER_CONNECTION_CHANGED");
  return result;
}
export const post = <T>(path: string, body?: unknown): Promise<T> =>
  api<T>(path, { method: "POST", body: JSON.stringify(body ?? {}) });
