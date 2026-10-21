import * as SecureStore from "expo-secure-store";
import { validateServerConfig, type ServerConfig } from "./server-config";
const key = "biz.server.connection.v1";
let cached: Promise<ServerConfig> | undefined;
let generation = 0;
export function connectionGeneration() {
  return generation;
}
export function getServerConfig(): Promise<ServerConfig> {
  if (!cached)
    cached = (async () => {
      const stored = await SecureStore.getItemAsync(key);
      return validateServerConfig(
        stored
          ? JSON.parse(stored)
          : {
              url: process.env.EXPO_PUBLIC_API_URL ?? "http://localhost:3001",
              token: process.env.EXPO_PUBLIC_PREVIEW_TOKEN ?? "",
            },
      );
    })().catch((e) => {
      cached = undefined;
      throw e;
    });
  return cached;
}
export async function saveServerConfig(value: ServerConfig) {
  const valid = validateServerConfig(value);
  await SecureStore.setItemAsync(key, JSON.stringify(valid), {
    keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
  cached = Promise.resolve(valid);
  generation++;
}
