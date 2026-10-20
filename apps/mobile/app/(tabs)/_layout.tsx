import React from "react";
import { Tabs, Redirect } from "expo-router";
import { Text } from "react-native";
import { useSession } from "../../services/session";
import { useT } from "../../localization";
import { useTheme } from "../../theme";
import { usePreferences } from "../../hooks/usePreferences";
export default function TabLayout() {
  usePreferences();
  const t = useT();
  const c = useTheme();
  const s = useSession();
  if (!s.authenticated) return <Redirect href="/login" />;
  if (s.locked) return <Redirect href="/unlock" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.accent,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.line },
        sceneStyle: { backgroundColor: c.bg },
      }}
    >
      {(["index", "sales", "banking", "taxes", "settings"] as const).map(
        (name, i) => (
          <Tabs.Screen
            key={name}
            name={name}
            options={{
              title: t(
                (
                  [
                    "dashboard",
                    "sales",
                    "banking",
                    "taxes",
                    "settings",
                  ] as const
                )[i],
              ),
              tabBarIcon: ({ color }) => (
                <Text style={{ fontSize: 23, color }}>
                  {["◫", "↗", "▤", "▦", "⚙"][i]}
                </Text>
              ),
            }}
          />
        ),
      )}
    </Tabs>
  );
}
