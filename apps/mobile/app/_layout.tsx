import React, { useEffect } from "react";
import { AppState, Platform } from "react-native";
import { Stack, router } from "expo-router";
import {
  QueryClient,
  QueryClientProvider,
  dehydrate,
  hydrate,
} from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { tokenStore, useSession, securityStore } from "../services/session";
import { useTheme } from "../theme";
import { protectedCache } from "../services/cache";
import { validCache, type CacheSnapshot } from "../services/cache-policy";
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 60000,
      gcTime: 30 * 60 * 1000,
      networkMode: "always",
    },
  },
});
export default function Layout() {
  const c = useTheme();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    void (async () => {
      const tokens = await tokenStore.read();
      if (tokens) {
        try {
          const raw = await protectedCache.read();
          if (raw) {
            const snapshot = JSON.parse(raw) as CacheSnapshot;
            if (validCache(snapshot, tokens.refreshToken.split(".")[0]))
              hydrate(queryClient, snapshot.queries);
            else await protectedCache.clear();
          }
        } catch {
          /* Cache failures never block login. */
        }
      }
      const biometric = await securityStore.read();
      useSession.getState().set({
        ready: true,
        authenticated: !!tokens,
        biometric,
        locked: !!tokens && biometric,
      });
    })();
    const unsubscribe = queryClient.getQueryCache().subscribe((event) => {
      if (event.type !== "updated" || event.query.state.status !== "success")
        return;
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void (async () => {
          const tokens = await tokenStore.read();
          if (tokens)
            await protectedCache.write(
              JSON.stringify({
                owner: tokens.refreshToken.split(".")[0],
                savedAt: Date.now(),
                queries: dehydrate(queryClient),
              }),
            );
        })().catch(() => {});
      }, 500);
    });
    const subscription = AppState.addEventListener("change", (state) => {
      if (
        state !== "active" &&
        Platform.OS !== "web" &&
        useSession.getState().biometric
      ) {
        useSession.getState().set({ locked: true });
        router.replace("/unlock");
      }
    });
    return () => {
      subscription.remove();
      unsubscribe();
      if (timer) clearTimeout(timer);
    };
  }, []);
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <StatusBar style={c.dark ? "light" : "dark"} />
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: c.bg },
            headerTintColor: c.text,
            contentStyle: { backgroundColor: c.bg },
            headerBackTitle: "Back",
          }}
        >
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="profiles" options={{ headerShown: false }} />
          <Stack.Screen
            name="rs-profile/[uid]"
            options={{ headerShown: false }}
          />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="detail/[kind]"
            options={{ title: "BizMonitor GE", presentation: "card" }}
          />
          <Stack.Screen
            name="unlock"
            options={{ headerShown: false, gestureEnabled: false }}
          />
        </Stack>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
