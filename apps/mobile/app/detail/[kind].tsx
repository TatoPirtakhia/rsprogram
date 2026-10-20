import React, { useEffect, useState } from "react";
import { Alert, Platform, Share, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import * as LocalAuthentication from "expo-local-authentication";
import {
  gel,
  type Business,
  type CashRegister,
  type Receipt,
  type Page,
  type BankTransaction,
  type Reconciliation,
  type IntegrationStatus,
  type Notice,
  type TaxObligation,
  type Preferences,
  type MerchantSettlement,
} from "@biz/shared";
import {
  Screen,
  Card,
  Txt,
  Row,
  Input,
  Button,
  State,
} from "../../components/ui";
import { useResource } from "../../hooks/useResource";
import { api, post } from "../../services/api";
import { useT, useLocale } from "../../localization";
import { useSession, securityStore } from "../../services/session";
import { clearSession } from "../(tabs)/settings";
import { NativeSwitch } from "../../components/native-switch";
import { registerPush } from "../../services/push";
export default function Detail() {
  const { kind, uid } = useLocalSearchParams<{ kind: string; uid?: string }>();
  const t = useT();
  const s = useSession();
  if (!s.authenticated) return <Redirect href="/login" />;
  if (s.locked) return <Redirect href="/unlock" />;
  const titles: Record<string, string> = {
    registers: t("registers"),
    receipt: t("receipts"),
    calendar: t("calendar"),
    notifications: t("notifications"),
    integrations: t("integrations"),
    diagnostics: t("diagnostics"),
    reconciliation: t("reconcile"),
    security: t("security"),
    business: "Business profile",
    preferences: "Preferences",
    imports: "CSV import",
    settlements: "Merchant settlements",
  };
  return (
    <Screen title={titles[kind] ?? kind}>
      {kind === "receipt" ? (
        <ReceiptView uid={uid ?? ""} />
      ) : kind === "registers" ? (
        <Registers />
      ) : kind === "calendar" ? (
        <Calendar />
      ) : kind === "notifications" ? (
        <Notices />
      ) : kind === "integrations" ? (
        <Integrations />
      ) : kind === "diagnostics" ? (
        <Diagnostics />
      ) : kind === "reconciliation" ? (
        <Reconcile />
      ) : kind === "security" ? (
        <Security />
      ) : kind === "business" ? (
        <BusinessView />
      ) : kind === "preferences" ? (
        <PreferencesView />
      ) : kind === "imports" ? (
        <Imports />
      ) : kind === "settlements" ? (
        <Settlements />
      ) : (
        <Txt>Unavailable</Txt>
      )}
    </Screen>
  );
}
function ReceiptView({ uid }: { uid: string }) {
  const q = useResource<Receipt>(`/fiscal/receipts/${uid}`);
  return (
    <>
      <State
        loading={q.isPending}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <Card>
          <Txt bold size={30}>
            {gel(q.data.amount)}
          </Txt>
          {Object.entries(q.data).map(([key, value]) => (
            <Row
              key={key}
              title={key}
              subtitle={String(value ?? "Unavailable")}
            />
          ))}
        </Card>
      )}
    </>
  );
}
function Registers() {
  const q = useResource<CashRegister[]>("/fiscal/registers");
  return (
    <>
      <State
        loading={q.isPending}
        error={q.isError}
        empty={q.data?.length === 0}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <Card>
          {q.data.map((r) => (
            <Row
              key={r.uid}
              title={r.name}
              subtitle={`${r.externalId} · ${r.status} · ${r.source}\n${r.syncedAt}`}
            />
          ))}
        </Card>
      )}
    </>
  );
}
function Calendar() {
  const q = useResource<TaxObligation[]>("/taxes/calendar");
  return (
    <>
      <Txt muted>
        Simulated dates for the demo profile. Not a verified legal tax calendar.
      </Txt>
      <State
        loading={q.isPending}
        error={q.isError}
        empty={q.data?.length === 0}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <Card>
          {[...q.data]
            .sort((a, b) => a.dueDate.localeCompare(b.dueDate))
            .map((o) => (
              <Row
                key={o.uid}
                title={o.dueDate}
                subtitle={`${o.taxType} · ${o.kind} · ${o.status}`}
                value={o.estimated ? `~ ${gel(o.amount)}` : o.kind}
              />
            ))}
        </Card>
      )}
    </>
  );
}
function Notices() {
  const q = useResource<Notice[]>("/notifications");
  return (
    <>
      <State
        loading={q.isPending}
        error={q.isError}
        empty={q.data?.length === 0}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <Card>
          {q.data.map((n) => (
            <Row
              key={n.uid}
              title={`${n.read ? "" : "● "}${n.title}`}
              subtitle={`${n.body}\n${n.createdAt}`}
              onPress={() => {
                void api(`/notifications/${n.uid}/read`, {
                  method: "PATCH",
                }).then(() => q.refetch());
              }}
            />
          ))}
        </Card>
      )}
    </>
  );
}
function Integrations() {
  const q = useResource<IntegrationStatus[]>("/integrations");
  const [message, setMessage] = useState("");
  return (
    <>
      <State
        loading={q.isPending}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {q.data?.map((i) => (
        <Card key={i.uid}>
          <Txt bold>{i.name}</Txt>
          <Txt>
            {i.capability} · {i.state}
          </Txt>
          <Txt muted>{i.message}</Txt>
          <Txt muted size={12}>
            {i.lastSuccessAt ?? "Never synchronized"}
          </Txt>
          <Button
            title="Synchronize"
            disabled={i.source !== "demo"}
            onPress={() => {
              void post(`/integrations/${i.uid}/sync`)
                .then(() => {
                  setMessage("Demo refreshed");
                  return q.refetch();
                })
                .catch((e) => setMessage(e.message));
            }}
          />
        </Card>
      ))}
      {!!message && <Txt>{message}</Txt>}
    </>
  );
}
function Diagnostics() {
  const q =
    useResource<{ uid: string; at: string; message: string; state: string }[]>(
      "/diagnostics",
    );
  return (
    <>
      <State
        loading={q.isPending}
        error={q.isError}
        empty={q.data?.length === 0}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <Card>
          {q.data.map((l) => (
            <Row
              key={l.uid}
              title={l.state}
              subtitle={`${l.at}\n${l.message}`}
            />
          ))}
        </Card>
      )}
    </>
  );
}
function Reconcile() {
  const [source, setSource] = useState<"demo" | "import">("demo");
  const receipts = useResource<Page<Receipt>>(
    `/fiscal/receipts?limit=100&source=${source}`,
  );
  const transactions = useResource<Page<BankTransaction>>(
    `/banking/transactions?limit=100&source=${source}`,
  );
  const links = useResource<Reconciliation[]>("/reconciliations");
  const [receiptUid, setReceipt] = useState("");
  const [transactionUid, setTransaction] = useState("");
  const [note, setNote] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const availableReceipts =
    receipts.data?.items.filter(
      (r) =>
        r.status === "sale" && !links.data?.some((l) => l.receiptUid === r.uid),
    ) ?? [];
  const availableTransactions =
    transactions.data?.items.filter(
      (t) =>
        t.direction === "incoming" &&
        !links.data?.some((l) => l.transactionUid === t.uid),
    ) ?? [];
  return (
    <>
      <State
        loading={
          receipts.isPending || transactions.isPending || links.isPending
        }
        error={receipts.isError || transactions.isError || links.isError}
        retry={() => {
          void receipts.refetch();
          void transactions.refetch();
          void links.refetch();
        }}
      />
      <Txt muted>
        Choose records to associate. Amount matches are suggestions only;
        settlement delays and deposits need manual review.
      </Txt>
      <Button
        quiet
        title={`Source: ${source}`}
        onPress={() => {
          setSource(source === "demo" ? "import" : "demo");
          setReceipt("");
          setTransaction("");
        }}
      />
      <Card>
        <Txt bold>1 · Fiscal receipt</Txt>
        {availableReceipts.slice(0, 12).map((r) => (
          <Row
            key={r.uid}
            title={`${r.uid === receiptUid ? "✓ " : ""}${r.externalId}`}
            value={gel(r.amount)}
            subtitle={r.occurredAt.slice(0, 10)}
            onPress={() => setReceipt(r.uid)}
          />
        ))}
      </Card>
      <Card>
        <Txt bold>2 · Bank transaction</Txt>
        {availableTransactions.map((tx) => (
          <Row
            key={tx.uid}
            title={`${tx.uid === transactionUid ? "✓ " : ""}${tx.description}`}
            value={gel(tx.amount)}
            subtitle={`${tx.occurredAt.slice(0, 10)} · ${tx.category}`}
            onPress={() => setTransaction(tx.uid)}
          />
        ))}
      </Card>
      <Input
        value={note}
        onChangeText={setNote}
        placeholder="Manual reconciliation note"
      />
      <Button
        title="Link selected records"
        disabled={!receiptUid || !transactionUid || !note || busy}
        onPress={() => {
          setBusy(true);
          void post("/reconciliations", { receiptUid, transactionUid, note })
            .then(() => {
              setMessage("Linked successfully");
              setReceipt("");
              setTransaction("");
              setNote("");
              return links.refetch();
            })
            .catch((e) => setMessage(e.message))
            .finally(() => setBusy(false));
        }}
      />
      {!!message && <Txt>{message}</Txt>}
      <Card>
        <Txt bold>Linked records</Txt>
        {links.data?.map((l) => (
          <Row
            key={l.uid}
            title={l.note}
            subtitle={`${l.receiptUid}\n${l.transactionUid}`}
          />
        ))}
      </Card>
    </>
  );
}
function BusinessView() {
  const q = useResource<Business[]>("/businesses");
  const [name, setName] = useState("");
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (q.data?.[0]) setName(q.data[0].name);
  }, [q.data]);
  return (
    <>
      <State
        loading={q.isPending}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {q.data?.[0] && (
        <Card>
          <Txt>
            {q.data[0].owner} · {q.data[0].taxId}
          </Txt>
          <Txt muted>
            Verified profile editing requires an authorized provider. Demo
            category: {q.data[0].taxProfile.join(", ")}
          </Txt>
          <Input value={name} onChangeText={setName} />
          <Button
            title="Save business name"
            onPress={() => {
              void api("/business", {
                method: "PATCH",
                body: JSON.stringify({ name }),
              })
                .then(() => {
                  setMessage("Saved");
                  return q.refetch();
                })
                .catch((e) => setMessage(e.message));
            }}
          />
          {!!message && <Txt>{message}</Txt>}
        </Card>
      )}
    </>
  );
}
function PreferencesView() {
  const q = useResource<Preferences>("/settings");
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [message, setMessage] = useState("");
  const locale = useLocale();
  const client = useQueryClient();
  useEffect(() => {
    if (q.data) setPrefs(q.data);
  }, [q.data]);
  return (
    <>
      <State
        loading={q.isPending}
        error={q.isError}
        retry={() => void q.refetch()}
      />
      {prefs && (
        <Card>
          <Row
            title="Language"
            value={prefs.language.toUpperCase()}
            onPress={() => {
              const language = prefs.language === "ka" ? "en" : "ka";
              setPrefs({ ...prefs, language });
              locale.setLanguage(language);
            }}
          />
          <Row
            title="Theme"
            value={prefs.theme}
            onPress={() => {
              const theme =
                prefs.theme === "system"
                  ? "light"
                  : prefs.theme === "light"
                    ? "dark"
                    : "system";
              setPrefs({ ...prefs, theme });
              locale.setTheme(theme);
            }}
          />
          <Txt bold>Deadline reminders</Txt>
          {[7, 3, 1, 0].map((n) => (
            <View
              key={n}
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
              }}
            >
              <Txt>{n === 0 ? "On due date" : `${n} days before`}</Txt>
              <NativeSwitch
                label={`${n} day reminder`}
                value={prefs.reminders.includes(n)}
                onValueChange={(v) =>
                  setPrefs({
                    ...prefs,
                    reminders: v
                      ? [...prefs.reminders, n]
                      : prefs.reminders.filter((d) => d !== n),
                  })
                }
              />
            </View>
          ))}
          <Row title="Detailed lock-screen notifications" />
          <NativeSwitch
            label="Detailed notifications"
            value={prefs.detailedNotifications}
            onValueChange={(v) =>
              setPrefs({ ...prefs, detailedNotifications: v })
            }
          />
          <Txt muted>
            Details are hidden by default. Push delivery setup is available
            after an EAS project is configured.
          </Txt>
          <Button
            title="Save preferences"
            onPress={() => {
              void api("/settings", {
                method: "PATCH",
                body: JSON.stringify(prefs),
              })
                .then(() => {
                  setMessage("Saved");
                  return client.invalidateQueries();
                })
                .catch((e) => setMessage(e.message));
            }}
          />
          <NativeSwitch
            label="Push alerts"
            value={prefs.pushEnabled}
            onValueChange={(value) => {
              if (!value) {
                setPrefs({ ...prefs, pushEnabled: false });
                return;
              }
              void registerPush()
                .then(() => setPrefs({ ...prefs, pushEnabled: true }))
                .catch((e) => setMessage(e.message));
            }}
          />
          <Txt muted>Significant sales change threshold (%)</Txt>
          <Input
            accessibilityLabel="Sales change percentage"
            keyboardType="numeric"
            value={String(prefs.salesChangePercent)}
            onChangeText={(text) =>
              setPrefs({ ...prefs, salesChangePercent: Number(text) })
            }
          />
          {!!message && <Txt>{message}</Txt>}
        </Card>
      )}
    </>
  );
}
function Security() {
  const biometric = useSession((s) => s.biometric);
  const [message, setMessage] = useState("");
  const [confirm, setConfirm] = useState("");
  return (
    <>
      <Card>
        <Txt bold>Biometric application lock</Txt>
        <NativeSwitch
          label="Biometric lock"
          value={biometric}
          disabled={Platform.OS === "web"}
          onValueChange={(v) => {
            void (async () => {
              if (!v) {
                await securityStore.write(false);
                useSession.getState().set({ biometric: false });
                return;
              }
              if (
                !(await LocalAuthentication.hasHardwareAsync()) ||
                !(await LocalAuthentication.isEnrolledAsync())
              ) {
                setMessage("No enrolled biometric available");
                return;
              }
              const result = await LocalAuthentication.authenticateAsync({
                promptMessage: "Enable BizMonitor lock",
              });
              if (result.success) {
                await securityStore.write(true);
                useSession.getState().set({ biometric: true });
              }
            })();
          }}
        />
        <Txt muted>
          Native session credentials use the OS keychain. Native offline cache
          uses SQLCipher with an OS keychain key and clears on logout.
        </Txt>
        <Button
          quiet
          title="Notification permission"
          onPress={() => {
            if (Platform.OS === "web") {
              setMessage("Use a native development build");
              return;
            }
            void registerPush()
              .then(() => setMessage("Push notifications enabled"))
              .catch((e) => setMessage(e.message));
          }}
        />
        <Button
          quiet
          title="Export business data"
          onPress={() => {
            void api("/account/export")
              .then((data) =>
                Share.share({
                  message: JSON.stringify(data, null, 2),
                  title: "BizMonitor export",
                }),
              )
              .catch((e) => setMessage(e.message));
          }}
        />
        {!!message && <Txt>{message}</Txt>}
      </Card>
      <Card>
        <Txt bold>Delete account and business data</Txt>
        <Txt muted>
          This permanently deletes the account and its business. Type DELETE to
          enable.
        </Txt>
        <Input
          value={confirm}
          onChangeText={setConfirm}
          autoCapitalize="characters"
          placeholder="DELETE"
        />
        <Button
          title="Delete account"
          disabled={confirm !== "DELETE"}
          onPress={() => {
            const remove = () => {
              void api("/account", {
                method: "DELETE",
                body: JSON.stringify({ confirmation: "DELETE" }),
              })
                .then(clearSession)
                .catch((e) => setMessage(e.message));
            };
            if (Platform.OS === "web") {
              if (globalThis.confirm("Permanently delete this demo account?"))
                remove();
            } else
              Alert.alert("Delete account?", "This cannot be undone.", [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: remove },
              ]);
          }}
        />
      </Card>
    </>
  );
}
function Imports() {
  const [kind, setKind] = useState<"receipts" | "transactions">("transactions");
  const [name, setName] = useState("Imported account");
  const [container, setContainer] = useState("");
  const [csv, setCsv] = useState("");
  const [preview, setPreview] = useState<{
    uid: string;
    rows: unknown[];
    duplicates: number;
  } | null>(null);
  const [message, setMessage] = useState("");
  return (
    <>
      <Txt muted>
        Imported records remain visibly separate from demo data. CSV uses
        positive decimal amounts, ISO timestamps, explicit status/direction, and
        existing imported container IDs. Maximum 1,000 rows.
      </Txt>
      <Card>
        <Button
          quiet
          title={`Kind: ${kind}`}
          onPress={() => {
            setKind(kind === "receipts" ? "transactions" : "receipts");
            setPreview(null);
            setContainer("");
            setCsv("");
          }}
        />
        <Input
          value={name}
          onChangeText={setName}
          placeholder="Import account/register name"
        />
        <Button
          title="Create import account/register"
          onPress={() => {
            void post<{ uid: string }>("/imports/container", {
              kind: kind === "receipts" ? "register" : "account",
              name,
            })
              .then((r) => {
                setContainer(r.uid);
                const time = new Date().toISOString();
                setCsv(
                  kind === "receipts"
                    ? `externalId,occurredAt,amount,registerUid,status\nIMPORT-001,${time},125.00,${r.uid},sale`
                    : `externalId,occurredAt,amount,accountUid,direction,description,category\nIMPORT-001,${time},125.00,${r.uid},incoming,Imported customer payment,customer_payment`,
                );
              })
              .catch((e) => setMessage(e.message));
          }}
        />
        {!!container && (
          <Txt muted size={11}>
            {container}
          </Txt>
        )}
        <Input
          multiline
          style={{ minHeight: 180, fontSize: 12 }}
          value={csv}
          onChangeText={(v) => {
            setCsv(v);
            setPreview(null);
          }}
          placeholder="Paste CSV including header"
        />
        <Button
          title="Validate & preview"
          disabled={!csv}
          onPress={() => {
            setPreview(null);
            void post<{ uid: string; rows: unknown[]; duplicates: number }>(
              "/imports/preview",
              { csv, kind },
            )
              .then(setPreview)
              .catch((e) => setMessage(e.message));
          }}
        />
        {preview && (
          <>
            <Txt>
              {preview.rows.length} valid records · {preview.duplicates}{" "}
              duplicates skipped
            </Txt>
            <Txt size={11}>
              {JSON.stringify(preview.rows.slice(0, 3), null, 2)}
            </Txt>
            <Button
              title="Confirm import"
              onPress={() => {
                void post<{ inserted: number }>(
                  `/imports/${preview.uid}/confirm`,
                )
                  .then((r) => {
                    setMessage(`Imported ${r.inserted} records`);
                    setPreview(null);
                  })
                  .catch((e) => setMessage(e.message));
              }}
            />
          </>
        )}
        {!!message && <Txt>{message}</Txt>}
      </Card>
    </>
  );
}
function Settlements() {
  const q = useResource<MerchantSettlement[]>("/banking/settlements");
  return (
    <>
      <State
        loading={q.isPending}
        error={q.isError}
        empty={q.data?.length === 0}
        retry={() => void q.refetch()}
      />
      {q.data && (
        <Card>
          {q.data.map((s) => (
            <Row
              key={s.uid}
              title={gel(s.amount)}
              subtitle={`${s.settledAt}\n${s.transactionUid} · ${s.source}`}
            />
          ))}
        </Card>
      )}
    </>
  );
}
