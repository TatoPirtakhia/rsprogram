import React, { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { BackLink, Button, Card, Txt } from "../../components/ui";
import { Sheet } from "../../components/settings-drawer";
import { useTheme } from "../../theme";
import { useResource } from "../../hooks/useResource";
import { post } from "../../services/api";
import { rsErrors, type RsInbox, type RsInboxMessage } from "./types";
export function sentAt(iso: string, withTime = false) {
  return new Intl.DateTimeFormat("ka-GE", {
    timeZone: "Asia/Tbilisi",
    day: "numeric",
    month: "short",
    year: "numeric",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
  }).format(new Date(iso));
}
// Stored inbox from the server (updated by its 10-minute check), a manual
// refresh that signs into RS right away, and app-side read marking.
export function useInbox(uid: string) {
  const path = `/local/profiles/${uid}/inbox`;
  const q = useResource<RsInbox>(path);
  const client = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const save = (value: RsInbox) =>
    client.setQueryData(["resource", path], value);
  const refresh = async () => {
    setRefreshing(true);
    try {
      save(await post<RsInbox>(path, {}));
    } finally {
      setRefreshing(false);
    }
  };
  // Omitting ids marks every message read.
  const markRead = async (ids?: string[]) => {
    const current = client.getQueryData<RsInbox>(["resource", path]);
    if (current)
      save({
        ...current,
        messages: current.messages.map((m) =>
          !ids || ids.includes(m.id) ? { ...m, read: true } : m,
        ),
      });
    save(await post<RsInbox>(path + "/read", ids ? { ids } : {}));
  };
  const unread = q.data?.messages.filter((m) => !m.read).length ?? 0;
  return { q, refreshing, refresh, markRead, unread };
}
export function MessageRow({
  message,
  onPress,
  last = false,
}: {
  message: RsInboxMessage;
  onPress: () => void;
  last?: boolean;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={message.subject}
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
    >
      <View
        style={{
          flexDirection: "row",
          gap: 10,
          paddingVertical: 11,
          borderBottomWidth: last ? 0 : StyleSheet.hairlineWidth,
          borderColor: c.line,
        }}
      >
        <View
          style={{
            width: 9,
            height: 9,
            borderRadius: 5,
            marginTop: 7,
            backgroundColor: message.read ? "transparent" : c.accent,
          }}
        />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <View style={{ flex: 1 }}>
              <Txt bold={!message.read} size={16}>
                {message.subject}
              </Txt>
            </View>
            <Txt muted size={13}>
              {sentAt(message.sentAt)}
            </Txt>
          </View>
          {!!message.preview && (
            <Txt muted size={14}>
              {message.preview.length > 110
                ? message.preview.slice(0, 110) + "…"
                : message.preview}
            </Txt>
          )}
        </View>
        <Txt size={22} color={c.muted}>
          ›
        </Txt>
      </View>
    </Pressable>
  );
}
// Sheet with the profile's RS messages; opening one shows its full text
// with a back link to the list and marks it read.
export function InboxDrawer({
  uid,
  open,
  onClose,
}: {
  uid: string;
  open: boolean;
  onClose: () => void;
}) {
  const c = useTheme();
  const { q, refreshing, refresh, markRead, unread } = useInbox(uid);
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState("");
  const inbox = q.data;
  const message = inbox?.messages.find((m) => m.id === selected);
  useEffect(() => {
    if (!open) setSelected(null);
  }, [open]);
  const run = (task: Promise<unknown>) => {
    setError("");
    task.catch(() => setError("მოქმედება ვერ შესრულდა. სცადეთ თავიდან."));
  };
  const show = (m: RsInboxMessage) => {
    setSelected(m.id);
    if (!m.read) run(markRead([m.id]));
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      plain
      title={message ? "შეტყობინება" : "შეტყობინებები"}
      leading={
        message ? (
          <BackLink title="უკან" onPress={() => setSelected(null)} />
        ) : undefined
      }
    >
      {!!error && <Txt color={c.danger}>{error}</Txt>}
      {message ? (
        <>
          <View style={{ gap: 4 }}>
            <Txt bold size={22}>
              {message.subject}
            </Txt>
            <Txt muted size={13}>
              {sentAt(message.sentAt, true)} · №{message.id}
            </Txt>
          </View>
          <Card>
            <Text
              selectable
              style={{ color: c.text, fontSize: 17, lineHeight: 24 }}
            >
              {message.text || message.preview || "ტექსტი არ არის."}
            </Text>
          </Card>
          <Txt muted size={13}>
            თანდართული ფაილები მხოლოდ RS კაბინეტშია ხელმისაწვდომი.
          </Txt>
          <Button
            quiet
            title="RS კაბინეტში გახსნა ↗"
            onPress={() =>
              void Linking.openURL("https://eservices.rs.ge/app/Notifications")
            }
          />
        </>
      ) : (
        <>
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              gap: 12,
            }}
          >
            <View style={{ flex: 1 }}>
              <Txt muted size={13}>
                {refreshing
                  ? "RS კაბინეტიდან ახლდება…"
                  : inbox?.checkedAt
                    ? `განახლდა ${sentAt(inbox.checkedAt, true)}`
                    : "ჯერ არ შემოწმებულა"}
              </Txt>
            </View>
            <Pressable
              accessibilityRole="button"
              disabled={refreshing}
              onPress={() => run(refresh())}
              hitSlop={8}
              style={({ pressed }) => ({
                opacity: refreshing ? 0.35 : pressed ? 0.5 : 1,
              })}
            >
              <Txt size={15} color={c.accent}>
                განახლება
              </Txt>
            </Pressable>
          </View>
          {!!inbox?.error && (
            <Card>
              <Txt>
                {rsErrors[inbox.error] ??
                  "RS კაბინეტიდან განახლება ვერ მოხერხდა."}
              </Txt>
            </Card>
          )}
          {q.isPending && <Txt muted>იტვირთება…</Txt>}
          {q.isError && <Txt color={c.danger}>სია ვერ ჩაიტვირთა.</Txt>}
          {!!inbox?.messages.length && (
            <>
              <Card>
                {inbox.messages.map((m, i) => (
                  <MessageRow
                    key={m.id}
                    message={m}
                    last={i === inbox.messages.length - 1}
                    onPress={() => show(m)}
                  />
                ))}
              </Card>
              <Button
                quiet
                title="ყველას წაკითხულად მონიშვნა"
                disabled={!unread}
                onPress={() => run(markRead())}
              />
            </>
          )}
          {inbox?.checkedAt && !inbox.messages.length && (
            <Card>
              <Txt muted>შეტყობინებები არ არის.</Txt>
            </Card>
          )}
        </>
      )}
    </Sheet>
  );
}
