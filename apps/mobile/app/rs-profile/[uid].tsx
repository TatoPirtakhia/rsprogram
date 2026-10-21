import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  Alert,
  Platform,
  Linking,
  View,
  Pressable,
  ActivityIndicator,
  AppState,
} from "react-native";
import { router, useLocalSearchParams, useFocusEffect } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { localDate, gel, cents, decimal } from "@biz/shared";
import {
  Screen,
  Card,
  Txt,
  Button,
  Row,
  State,
  IconButton,
  BackLink,
} from "../../components/ui";
import { PeriodFilter } from "../../features/rs-profiles/period-filter";
import { shortPeriod, validPeriod } from "../../features/rs-profiles/periods";
import { SelectField } from "../../components/select-field";
import { useTheme } from "../../theme";
import { SalesChart } from "../../components/chart";
import { useResource } from "../../hooks/useResource";
import { api, post } from "../../services/api";
import {
  rsErrors,
  type RsProfile,
  type RsZReportResponse,
} from "../../features/rs-profiles/types";
import { SettingsDrawer } from "../../components/settings-drawer";
import { InboxDrawer, useInbox } from "../../features/rs-profiles/inbox";
import { PortalBrowser } from "../../features/rs-profiles/portal-browser";
import { RsProfileForm } from "../../features/rs-profiles/form";
function range() {
  const to = localDate();
  return { from: to, to };
}
export default function Profile() {
  const { uid, inbox: inboxParam } = useLocalSearchParams<{
    uid: string;
    inbox?: string;
  }>();
  const path = `/local/profiles/${uid}`;
  const c = useTheme();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const q = useResource<RsProfile>(path);
  const client = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [debtBusy, setDebtBusy] = useState(false);
  const debtInFlight = useRef<string | null>(null);
  const [debtProfile, setDebtProfile] = useState<RsProfile | null>(null);
  const [debtRequestError, setDebtRequestError] = useState("");
  const [error, setError] = useState("");
  const [dates, setDates] = useState(range);
  const [device, setDevice] = useState("");
  const p = q.data;
  const { unread } = useInbox(uid);
  const [payOpen, setPayOpen] = useState(false);
  const [inboxOpen, setInboxOpen] = useState(inboxParam === "1");
  useEffect(() => {
    if (inboxParam === "1") setInboxOpen(true);
  }, [inboxParam]);
  const syncDebt = useCallback(async () => {
    if (debtInFlight.current === path) return;
    debtInFlight.current = path;
    setDebtBusy(true);
    setDebtRequestError("");
    try {
      setDebtProfile(await post<RsProfile>(path + "/debt", {}));
    } catch {
      setDebtRequestError(
        "დავალიანების შემოწმება ვერ მოხერხდა. სცადეთ განახლება.",
      );
    } finally {
      if (debtInFlight.current === path) debtInFlight.current = null;
      setDebtBusy(false);
    }
  }, [path]);
  useFocusEffect(
    useCallback(() => {
      setDebtProfile(null);
      if (p?.uid === uid) void syncDebt();
      const subscription = AppState.addEventListener("change", (state) => {
        if (state === "active" && p?.uid === uid) void syncDebt();
      });
      return () => subscription.remove();
    }, [p?.uid, uid, syncDebt]),
  );
  const debtState = debtProfile?.uid === uid ? debtProfile : p;
  const sync = useCallback(
    async (value: { from: string; to: string }) => {
      setBusy(true);
      setError("");
      try {
        const updated = await post<RsProfile>(path + "/sync", value);
        client.setQueryData(["resource", path], updated);
        setDevice((current) =>
          updated.response &&
          "reports" in updated.response &&
          updated.response.reports.some((r) => r.deviceNumber === current)
            ? current
            : "",
        );
        await client.invalidateQueries({
          queryKey: ["resource", "/local/profiles"],
        });
      } catch (e) {
        setError(
          (e as Error).message === "VALIDATION_ERROR"
            ? "შეამოწმეთ თარიღები: პერიოდი მაქსიმუმ 366 დღეა."
            : (e as Error).message,
        );
      } finally {
        setBusy(false);
      }
    },
    [path, client],
  );
  useFocusEffect(
    useCallback(() => {
      if (p?.uid === uid) {
        const initial = range();
        setDates(initial);
        void sync(initial);
      }
    }, [p?.uid, uid, sync]),
  );
  const reportData: RsZReportResponse | null =
    p?.response && "reports" in p.response ? p.response : null;
  const reports =
    reportData?.reports.filter((r) => !device || r.deviceNumber === device) ??
    [];
  const devices = [
    ...new Set(reportData?.reports.map((r) => r.deviceNumber) ?? []),
  ];
  const total = (key: "paidAmount" | "paidCash" | "paidOther") =>
    decimal(reports.reduce((sum, r) => sum + cents(r[key]), 0n));
  const daily = new Map<string, bigint>();
  for (const r of reports) {
    const date = localDate(new Date(r.reportDate));
    daily.set(date, (daily.get(date) ?? 0n) + cents(r.paidAmount));
  }
  const chart = [...daily]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, amount]) => ({ date, amount: decimal(amount) }));
  const remove = () => {
    void api(path, { method: "DELETE" })
      .then(async () => {
        client.removeQueries({ queryKey: ["resource", path] });
        await client.invalidateQueries({
          queryKey: ["resource", "/local/profiles"],
        });
        router.replace("/profiles");
      })
      .catch((e) => setError(e.message));
  };

  const applyPeriod = (value: { from: string; to: string }) => {
    setDates(value);
    void sync(value);
  };
  const stale =
    !!reportData &&
    (reportData.from !== dates.from ||
      reportData.to !== dates.to ||
      !!p?.errorCode);
  const time = reportData
    ? new Intl.DateTimeFormat("ka-GE", {
        timeZone: "Asia/Tbilisi",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(reportData.fetchedAt))
    : null;
  return (
    <Screen
      title={p?.name ?? "RS პროფილი"}
      demo={false}
      showContext={false}
      refreshing={busy}
      onRefresh={() => {
        void syncDebt();
        if (validPeriod(dates)) void sync(dates);
      }}
      header={
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <BackLink
            title="RS მომხმარებლები"
            label="‹ RS მომხმარებლების სია"
            onPress={() => router.replace("/profiles")}
          />
          <View style={{ flexDirection: "row" }}>
            <IconButton
              label="RS-დან ინფორმაციის მიღება"
              symbol="arrow.clockwise"
              glyph="↻"
              disabled={busy || !validPeriod(dates)}
              onPress={() => {
                void sync(dates);
                void syncDebt();
              }}
            />
            <IconButton
              label="RS შეტყობინებები"
              symbol={unread ? "bell.badge" : "bell"}
              glyph="🔔"
              badge={unread}
              onPress={() => setInboxOpen(true)}
            />
            <IconButton
              label="პროფილის პარამეტრები"
              symbol="gearshape"
              glyph="⚙"
              onPress={() => setSettingsOpen(!settingsOpen)}
            />
          </View>
        </View>
      }
    >
      <State
        loading={q.isPending}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {p && (
        <>
          <Button
            title="დაქირავებული პირები"
            quiet
            onPress={() => router.push(`/employees/${uid}`)}
          />
          <Card>
            <Txt bold size={13} muted>
              ბიუჯეტში გადასახდელი თანხა
            </Txt>
            {debtBusy && <Txt muted>RS კაბინეტიდან ახლდება…</Txt>}
            {debtState?.portalDebt ? (
              <>
                <Txt bold size={34}>
                  {gel(debtState.portalDebt.total)}
                </Txt>
                {debtState.portalDebt.upcoming !== undefined ? (
                  <>
                    <Row
                      title="მიმდინარე დავალიანება"
                      value={gel(debtState.portalDebt.balance)}
                    />
                    <Row
                      title="მომდევნო 30 დღის გადასახადი"
                      value={gel(debtState.portalDebt.upcoming)}
                    />
                  </>
                ) : (
                  <Txt muted>{debtState.portalDebt.asOf} მდგომარეობით</Txt>
                )}
                <Txt muted>
                  შემოწმებულია:{" "}
                  {new Date(debtState.portalDebt.checkedAt).toLocaleString(
                    "ka-GE",
                    { timeZone: "Asia/Tbilisi" },
                  )}
                  {debtBusy || debtState.debtError || debtRequestError
                    ? " · წინა მონაცემები"
                    : ""}
                </Txt>
              </>
            ) : (
              !debtBusy && <Txt muted>დავალიანება ჯერ ვერ ჩაიტვირთა</Txt>
            )}
            {!!debtState?.debtError && (
              <Txt>
                {rsErrors[debtState.debtError] ??
                  "RS კაბინეტიდან განახლება ვერ მოხერხდა."}
              </Txt>
            )}
            {!!debtRequestError && <Txt>{debtRequestError}</Txt>}
            <Button title="გადახდა" onPress={() => setPayOpen(true)} />
          </Card>
          <Card>
            <PeriodFilter value={dates} busy={busy} onApply={applyPeriod} />
            <View style={{ opacity: busy ? 0.55 : 1, paddingTop: 4, gap: 3 }}>
              <Txt bold size={36}>
                {reportData?.outcome === "ok" ? gel(total("paidAmount")) : "—"}
              </Txt>
              {reportData?.outcome === "ok" ? (
                <Txt muted size={12}>
                  {reports.reduce((sum, r) => sum + r.quantity, 0)} ჩეკი ·{" "}
                  {device ? "1" : devices.length} სალარო · {reports.length}{" "}
                  Z-რეპორტი
                </Txt>
              ) : (
                <Txt muted size={13}>
                  {busy
                    ? "მონაცემები იტვირთება…"
                    : reportData?.outcome === "no_records"
                      ? "ამ პერიოდში ჩანაწერები არ არის"
                      : "ინფორმაცია ჯერ არ მიღებულა"}
                </Txt>
              )}
            </View>
            {reportData?.outcome === "ok" && (
              <>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
                  {(["paidCash", "paidOther"] as const).map((key, i) => (
                    <View
                      key={key}
                      style={{
                        flex: 1,
                        backgroundColor: c.bg,
                        borderRadius: 12,
                        padding: 13,
                        gap: 4,
                      }}
                    >
                      <Txt muted size={12}>
                        {i === 0 ? "ნაღდი" : "უნაღდო / სხვა"}
                      </Txt>
                      <Txt bold size={19}>
                        {gel(total(key))}
                      </Txt>
                    </View>
                  ))}
                </View>
                {chart.length > 1 && (
                  <View style={{ marginTop: 10 }}>
                    <SalesChart data={chart} />
                  </View>
                )}
              </>
            )}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 8,
              }}
            >
              {busy ? (
                <ActivityIndicator size="small" color={c.accent} />
              ) : (
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: p.errorCode ? c.warning : c.accent,
                  }}
                />
              )}
              <Txt size={11} muted>
                {busy
                  ? "იტვირთება RS-დან"
                  : time
                    ? "RS · განახლდა " + time
                    : "RS · " + p.username}
              </Txt>
            </View>
            {stale && (
              <Txt size={11} color={c.warning}>
                ბოლო შენახული პერიოდი: {shortPeriod(reportData!)}
              </Txt>
            )}
            {!!(p.errorCode || error) && (
              <View
                style={{ padding: 12, backgroundColor: c.bg, borderRadius: 10 }}
              >
                <Txt size={12} color={c.danger}>
                  {error ||
                    (p.errorCode
                      ? (rsErrors[p.errorCode] ?? "მოთხოვნა ვერ შესრულდა.")
                      : "")}
                </Txt>
              </View>
            )}
          </Card>
          {reportData?.outcome === "no_records" && (
            <Card>
              <Txt bold>ჩანაწერები ვერ მოიძებნა</Txt>
              <Txt muted size={13}>
                სცადეთ სხვა პერიოდი. ჩანაწერების არქონა საგადასახადო
                დავალიანებაზე ინფორმაციას არ იძლევა.
              </Txt>
            </Card>
          )}
          {reportData?.outcome === "ok" && (
            <Card>
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <View>
                  <Txt bold size={16}>
                    Z-რეპორტები
                  </Txt>
                  <Txt muted size={11}>
                    {reports.length} ჩანაწერი
                  </Txt>
                </View>
                <View style={{ maxWidth: 190, flex: 1 }}>
                  <SelectField
                    label="სალაროს არჩევა"
                    value={device}
                    options={[
                      { value: "", label: "ყველა სალარო" },
                      ...devices.map((value) => ({ value, label: value })),
                    ]}
                    onChange={setDevice}
                  />
                </View>
              </View>
              {reports.slice(0, 100).map((r) => (
                <Row
                  key={r.deviceNumber + ":" + r.zNumber + ":" + r.reportDate}
                  title={
                    "Z №" +
                    r.zNumber +
                    " · " +
                    localDate(new Date(r.reportDate))
                      .split("-")
                      .reverse()
                      .join(".")
                  }
                  subtitle={r.deviceNumber + " · " + r.quantity + " ჩეკი"}
                  value={gel(r.paidAmount)}
                />
              ))}
              {reports.length > 100 && (
                <Txt muted size={12}>
                  ნაჩვენებია პირველი 100 ჩანაწერი. შეარჩიეთ უფრო მოკლე პერიოდი.
                </Txt>
              )}
            </Card>
          )}
          <InboxDrawer
            uid={uid}
            open={inboxOpen}
            onClose={() => setInboxOpen(false)}
          />
          <PortalBrowser
            uid={uid}
            username={p.username}
            open={payOpen}
            onClose={() => {
              setPayOpen(false);
              void syncDebt();
            }}
          />
          <SettingsDrawer
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          >
            <Row title="RS მომხმარებელი" value={p.username} />
            {settingsOpen && (
              <RsProfileForm
                initial={p}
                button="ცვლილებების შენახვა"
                onSave={async (value) => {
                  const updated = await api<RsProfile>(path, {
                    method: "PATCH",
                    body: JSON.stringify(value),
                  });
                  client.setQueryData(["resource", path], updated);
                  await client.invalidateQueries({
                    queryKey: ["resource", "/local/profiles"],
                  });
                  setSettingsOpen(false);
                  setDebtProfile(null);
                  await syncDebt();
                  await sync(dates);
                }}
              />
            )}
            <Button
              quiet
              title="RS პორტალის გახსნა ↗"
              onPress={() =>
                void Linking.openURL("https://eservices.rs.ge/Login.aspx")
              }
            />
            <Txt muted size={12}>
              ფისკალური მონაცემები და დავალიანება RS-ის ცალკე სერვისებიდან
              ახლდება.
            </Txt>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="პროფილის წაშლა"
              disabled={busy}
              onPress={() => {
                if (Platform.OS === "web") {
                  if (
                    globalThis.confirm(
                      "წაიშალოს RS პროფილი და მისი შენახული მონაცემები?",
                    )
                  )
                    remove();
                } else
                  Alert.alert(
                    "პროფილის წაშლა",
                    "წაიშლება შენახული პაროლი და მიღებული ინფორმაცია.",
                    [
                      { text: "გაუქმება", style: "cancel" },
                      {
                        text: "წაშლა",
                        style: "destructive",
                        onPress: remove,
                      },
                    ],
                  );
              }}
              style={{ paddingVertical: 12 }}
            >
              <Txt size={13} color={c.danger}>
                პროფილის წაშლა
              </Txt>
            </Pressable>
          </SettingsDrawer>
        </>
      )}
    </Screen>
  );
}
