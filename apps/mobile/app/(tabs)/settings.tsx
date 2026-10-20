import React from "react";
import { router } from "expo-router";
import { Screen, Card, LinkRow, Button } from "../../components/ui";
import { useT } from "../../localization";
import { post } from "../../services/api";
import { tokenStore, useSession, securityStore } from "../../services/session";
import { queryClient } from "../_layout";
import { protectedCache } from "../../services/cache";
export async function clearSession() {
  await tokenStore.write(null);
  await securityStore.write(false);
  queryClient.clear();
  await protectedCache.clear().catch(() => {});
  useSession
    .getState()
    .set({ authenticated: false, locked: false, biometric: false });
  router.replace("/login");
}
export default function Settings() {
  const t = useT();
  return (
    <Screen title={t("settings")}>
      <Card>
        <LinkRow title="პროფილი / Business profile" path="/detail/business" />
        <LinkRow title={t("integrations")} path="/detail/integrations" />
        <LinkRow title={t("registers")} path="/detail/registers" />
        <LinkRow title={t("notifications")} path="/detail/notifications" />
        <LinkRow
          title="Language, theme & reminders"
          path="/detail/preferences"
        />
        <LinkRow title={t("security")} path="/detail/security" />
        <LinkRow title={t("diagnostics")} path="/detail/diagnostics" />
        <LinkRow title="CSV import" path="/detail/imports" />
      </Card>
      <Button
        quiet
        title={t("logout")}
        onPress={() => {
          void post("/auth/logout").then(clearSession).catch(clearSession);
        }}
      />
      <Button
        quiet
        title="Delete local session data"
        onPress={() => void clearSession()}
      />
    </Screen>
  );
}
