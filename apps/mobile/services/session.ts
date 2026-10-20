import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import { create } from "zustand";
type Tokens = { accessToken: string; refreshToken: string };
// Web sessions intentionally stay in memory. Native credentials are encrypted by the OS.
let webTokens: Tokens | null = null;
export const securityStore = {
  async read() {
    return (
      Platform.OS !== "web" &&
      (await SecureStore.getItemAsync("biz.biometric")) === "true"
    );
  },
  async write(value: boolean) {
    if (Platform.OS !== "web")
      await SecureStore.setItemAsync("biz.biometric", String(value));
  },
};
export const tokenStore = {
  async read(): Promise<Tokens | null> {
    if (Platform.OS === "web") return webTokens;
    const text = await SecureStore.getItemAsync("biz.session");
    return text ? JSON.parse(text) : null;
  },
  async write(value: Tokens | null) {
    if (Platform.OS === "web") {
      webTokens = value;
      return;
    }
    if (value)
      await SecureStore.setItemAsync("biz.session", JSON.stringify(value), {
        keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
      });
    else await SecureStore.deleteItemAsync("biz.session");
  },
};
export const useSession = create<{
  ready: boolean;
  authenticated: boolean;
  locked: boolean;
  biometric: boolean;
  set: (
    value: Partial<{
      ready: boolean;
      authenticated: boolean;
      locked: boolean;
      biometric: boolean;
    }>,
  ) => void;
}>((set) => ({
  ready: false,
  authenticated: false,
  locked: false,
  biometric: false,
  set,
}));
