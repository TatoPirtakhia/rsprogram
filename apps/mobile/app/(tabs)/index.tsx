import React from "react";
import { View, Linking } from "react-native";
import { router } from "expo-router";
import { gel, type Dashboard } from "@biz/shared";
import { useResource } from "../../hooks/useResource";
import { useT, useLocale } from "../../localization";
import { Screen, Card, Txt, Button, LinkRow, State } from "../../components/ui";
import { SalesChart } from "../../components/chart";
import { post } from "../../services/api";
import { useTheme } from "../../theme";
export default function Overview() {
  const t = useT();
  const locale = useLocale((s) => s.language);
  const c = useTheme();
  const q = useResource<Dashboard>("/dashboard/summary");
  const d = q.data;
  return (
    <Screen
      title={t("dashboard")}
      refreshing={q.isFetching && !q.isPending}
      onRefresh={() => void q.refetch()}
    >
      <State
        loading={q.isPending}
        error={q.isError && !d}
        retry={() => void q.refetch()}
      />
      {d && (
        <>
          {q.isError && <Txt color={c.warning}>{t("offline")}</Txt>}
          <View>
            <Txt size={22} bold>
              {d.business.name}
            </Txt>
            <Txt muted>
              {d.business.taxId} ·{" "}
              {new Intl.DateTimeFormat(locale === "ka" ? "ka-GE" : "en-GB", {
                timeZone: "Asia/Tbilisi",
                dateStyle: "long",
              }).format(new Date())}
            </Txt>
            <Txt muted size={11}>
              Demo RS ·{" "}
              {d.updatedAt
                ? new Date(d.updatedAt).toLocaleString()
                : t("unavailable")}
            </Txt>
          </View>
          <Card>
            <Txt muted>{t("today")} · Fiscal sales</Txt>
            <Txt size={38} bold>
              {gel(d.sales, locale)}
            </Txt>
            <Txt muted>
              {d.receiptCount} {t("receipts")} · Avg {gel(d.average, locale)}
            </Txt>
            <SalesChart data={d.chart} />
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                gap: 8,
              }}
            >
              <View>
                <Txt muted size={11}>
                  Yesterday
                </Txt>
                <Txt bold>{gel(d.comparisons.yesterday, locale)}</Txt>
              </View>
              <View>
                <Txt muted size={11}>
                  Previous 7 days
                </Txt>
                <Txt bold>{gel(d.comparisons.previous7Days, locale)}</Txt>
              </View>
            </View>
            <Txt muted size={12}>
              Previous month: {gel(d.comparisons.previousMonth, locale)}
            </Txt>
            <Txt muted size={11}>
              Demo fiscal provider · {d.updatedAt}
            </Txt>
          </Card>
          <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
            <View style={{ flex: 1, minWidth: 145 }}>
              <Card>
                <Txt muted>{t("incoming")}</Txt>
                <Txt bold size={22}>
                  {gel(d.bankIncoming, locale)}
                </Txt>
                <Txt size={11} muted>
                  Demo bank · {d.updatedAt}
                </Txt>
              </Card>
            </View>
            <View style={{ flex: 1, minWidth: 145 }}>
              <Card>
                <Txt muted>{t("debt")}</Txt>
                <Txt bold size={22} color={c.warning}>
                  {gel(d.taxDebt, locale)}
                </Txt>
                <Txt size={11} muted>
                  Simulated · {d.updatedAt}
                </Txt>
              </Card>
            </View>
          </View>
          <Card>
            <Txt bold>{t("obligations")}</Txt>
            {d.nextObligation && (
              <Txt>
                {d.nextObligation.dueDate} ·{" "}
                {d.nextObligation.estimated
                  ? t("estimated")
                  : d.nextObligation.kind}{" "}
                · {gel(d.nextObligation.amount, locale)}
              </Txt>
            )}
            {d.alerts.map((a) => (
              <Txt key={a} color={c.warning}>
                {a}
              </Txt>
            ))}
            <LinkRow title={t("calendar")} path="/detail/calendar" />
          </Card>
          <Card>
            <Txt bold>Quick actions</Txt>
            <Button
              title={t("refresh")}
              disabled={q.isFetching}
              onPress={() => {
                void Promise.all([
                  post("/integrations/rs-demo/sync"),
                  post("/integrations/bank-demo/sync"),
                ])
                  .then(() => q.refetch())
                  .catch(() => q.refetch());
              }}
            />
            <Button
              quiet
              title={t("receipts")}
              onPress={() => router.push("/(tabs)/sales")}
            />
            <Button
              quiet
              title="RS.ge ↗"
              onPress={() => void Linking.openURL("https://www.rs.ge")}
            />
            <LinkRow title={t("notifications")} path="/detail/notifications" />
          </Card>
        </>
      )}
    </Screen>
  );
}
