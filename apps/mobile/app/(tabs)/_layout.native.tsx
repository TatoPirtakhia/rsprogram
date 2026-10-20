import React from "react";
import { Redirect } from "expo-router";
import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useSession } from "../../services/session";
import { useTheme } from "../../theme";
import { useT } from "../../localization";
import { usePreferences } from "../../hooks/usePreferences";
export default function NativeTabLayout() {
  usePreferences();
  const s = useSession();
  const c = useTheme();
  const t = useT();
  if (!s.authenticated) return <Redirect href="/login" />;
  if (s.locked) return <Redirect href="/unlock" />;
  return (
    <NativeTabs tintColor={c.accent} backgroundColor={c.card}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>{t("dashboard")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="square.grid.2x2" md="dashboard" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="sales">
        <NativeTabs.Trigger.Label>{t("sales")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="chart.xyaxis.line" md="trending_up" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="banking">
        <NativeTabs.Trigger.Label>{t("banking")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="building.columns" md="account_balance" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="taxes">
        <NativeTabs.Trigger.Label>{t("taxes")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="calendar" md="calendar_month" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Label>{t("settings")}</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="gearshape" md="settings" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
