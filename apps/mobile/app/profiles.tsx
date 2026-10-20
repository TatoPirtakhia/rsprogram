import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { SymbolView } from "expo-symbols";
import { useQueryClient } from "@tanstack/react-query";
import { Screen, Card, Txt, Row, State } from "../components/ui";
import { RsProfileForm } from "../features/rs-profiles/form";
import type { RsProfile } from "../features/rs-profiles/types";
import { useResource } from "../hooks/useResource";
import { post } from "../services/api";
import { Sheet } from "../components/settings-drawer";
import { useTheme } from "../theme";
export default function Profiles() {
  const q = useResource<RsProfile[]>("/local/profiles");
  const client = useQueryClient();
  const [adding, setAdding] = useState(false);
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <View style={{ flex: 1 }}>
      <Screen
        title="RS მომხმარებლები"
        demo={false}
        refreshing={q.isRefetching}
        onRefresh={() => void q.refetch()}
      >
        <State
          loading={q.isPending}
          error={q.isError}
          retry={() => void q.refetch()}
        />
        {q.data?.length === 0 && (
          <Card>
            <Txt>RS მომხმარებელი ჯერ არ არის დამატებული.</Txt>
            <Txt muted>
              შეინახეთ მომხმარებლის სახელი და პაროლი ლოკალურ ბაზაში. მონაცემების
              მისაღებად შემდეგ აირჩიეთ პროფილი.
            </Txt>
          </Card>
        )}
        {!!q.data?.length && (
          <Card>
            {q.data.map((p) => (
              <Row
                key={p.uid}
                title={p.name}
                subtitle={`${p.username} · ${p.connectionState === "received" ? "პასუხი მიღებულია" : p.connectionState === "error" ? "კავშირი შესამოწმებელია" : "ჯერ არ შემოწმებულა"}`}
                onPress={() =>
                  router.push({
                    pathname: "/rs-profile/[uid]",
                    params: { uid: p.uid },
                  })
                }
              />
            ))}
          </Card>
        )}
        {/* Keeps the last row clear of the floating add button. */}
        <View style={{ height: 64 }} />
      </Screen>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="+ RS მომხმარებლის დამატება"
        onPress={() => {
          void Haptics.selectionAsync().catch(() => {});
          setAdding(true);
        }}
        style={({ pressed }) => ({
          position: "absolute",
          right: 20,
          bottom: Math.max(insets.bottom, 16) + 8,
          width: 58,
          height: 58,
          borderRadius: 29,
          backgroundColor: c.accent,
          alignItems: "center",
          justifyContent: "center",
          shadowColor: "#000",
          shadowOpacity: 0.22,
          shadowRadius: 10,
          shadowOffset: { width: 0, height: 4 },
          elevation: 6,
          transform: [{ scale: pressed ? 0.94 : 1 }],
        })}
      >
        <SymbolView
          name="plus"
          size={26}
          weight="semibold"
          tintColor={c.dark ? "#000000" : "#FFFFFF"}
          fallback={
            <Text
              style={{
                color: c.dark ? "#000000" : "#FFFFFF",
                fontSize: 32,
                lineHeight: 34,
                fontWeight: "300",
              }}
            >
              +
            </Text>
          }
        />
      </Pressable>
      <Sheet
        open={adding}
        onClose={() => setAdding(false)}
        title="ახალი RS პროფილი"
      >
        <RsProfileForm
          onSave={async (value) => {
            const profile = await post<RsProfile>("/local/profiles", value);
            client.removeQueries({
              queryKey: ["resource", `/local/profiles/${profile.uid}`],
            });
            await q.refetch();
            setAdding(false);
            router.push({
              pathname: "/rs-profile/[uid]",
              params: { uid: profile.uid },
            });
          }}
        />
        <Txt muted size={12}>
          პაროლი დაშიფრულად ინახება ამ კომპიუტერზე. მისი მიღება მხოლოდ სერვერს
          შეუძლია.
        </Txt>
      </Sheet>
    </View>
  );
}
