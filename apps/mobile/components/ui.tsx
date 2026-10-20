import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { Host, Button as ExpoButton } from "@expo/ui";
import { useTheme } from "../theme";
import { useT } from "../localization";
import { useQueryClient } from "@tanstack/react-query";
export function Txt({
  children,
  muted = false,
  size = 15,
  bold = false,
  color,
}: {
  children: React.ReactNode;
  muted?: boolean;
  size?: number;
  bold?: boolean;
  color?: string;
}) {
  const c = useTheme();
  return (
    <Text
      style={{
        color: color ?? (muted ? c.muted : c.text),
        fontSize: size,
        fontWeight: bold ? "700" : "400",
        lineHeight: size * 1.5,
      }}
    >
      {children}
    </Text>
  );
}
export function Card({ children }: { children: React.ReactNode }) {
  const c = useTheme();
  return (
    <View
      style={{
        backgroundColor: c.card,
        borderRadius: Platform.OS === "ios" ? 18 : 22,
        padding: 20,
        gap: 10,
        borderWidth: 1,
        borderColor: c.line,
      }}
    >
      {children}
    </View>
  );
}
export function Button({
  title,
  onPress,
  quiet = false,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  quiet?: boolean;
  disabled?: boolean;
}) {
  const c = useTheme();
  if (Platform.OS !== "web")
    return (
      <Host matchContents colorScheme={c.dark ? "dark" : "light"}>
        <ExpoButton
          label={title}
          disabled={disabled}
          variant={quiet ? "outlined" : "filled"}
          onPress={() => {
            void Haptics.selectionAsync();
            onPress();
          }}
        />
      </Host>
    );
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={title}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        backgroundColor: quiet ? c.soft : c.accent,
        paddingHorizontal: 16,
        paddingVertical: 13,
        borderRadius: Platform.OS === "ios" ? 12 : 28,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        alignItems: "center",
        minHeight: 48,
      })}
    >
      <Txt bold color={quiet ? c.accent : c.dark ? "#102A24" : "white"}>
        {title}
      </Txt>
    </Pressable>
  );
}
export function Input(props: TextInputProps) {
  const c = useTheme();
  return (
    <TextInput
      placeholderTextColor={c.muted}
      {...props}
      style={[
        {
          backgroundColor: c.card,
          color: c.text,
          borderWidth: 1,
          borderColor: c.line,
          borderRadius: 12,
          padding: 14,
          fontSize: 16,
          minHeight: 48,
        },
        props.style,
      ]}
    />
  );
}
export function Row({
  title,
  subtitle,
  value,
  onPress,
}: {
  title: string;
  subtitle?: string;
  value?: string;
  onPress?: () => void;
}) {
  const c = useTheme();
  const content = (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: c.line,
      }}
    >
      <View style={{ flex: 1 }}>
        <Txt bold>{title}</Txt>
        {subtitle && (
          <Txt muted size={12}>
            {subtitle}
          </Txt>
        )}
      </View>
      {value && (
        <Txt bold color={c.accent}>
          {value}
        </Txt>
      )}
      {onPress && <Txt muted>›</Txt>}
    </View>
  );
  return onPress ? (
    <Pressable accessibilityRole="button" onPress={onPress}>
      {content}
    </Pressable>
  ) : (
    content
  );
}
export function LinkRow({
  title,
  path,
  subtitle,
}: {
  title: string;
  path: string;
  subtitle?: string;
}) {
  return (
    <Row
      title={title}
      subtitle={subtitle}
      onPress={() => router.push(path as never)}
    />
  );
}
export function Screen({
  title,
  children,
  refreshing = false,
  onRefresh,
  demo = true,
  showContext = true,
}: {
  title: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  demo?: boolean;
  showContext?: boolean;
}) {
  const c = useTheme();
  const t = useT();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const [offline, setOffline] = useState(false);
  useEffect(
    () =>
      client.getQueryCache().subscribe((event) => {
        if (event.type !== "updated") return;
        if (
          event.query.state.status === "error" &&
          /network|fetch|timeout|abort/i.test(String(event.query.state.error))
        )
          setOffline(true);
        else if (
          event.query.state.status === "success" &&
          event.query.state.fetchStatus === "idle"
        )
          setOffline(false);
      }),
    [client],
  );
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: c.bg }}
      contentContainerStyle={{
        padding: 20,
        paddingTop: Math.max(20, insets.top),
        paddingBottom: Math.max(45, insets.bottom),
        gap: 18,
        maxWidth: 900,
        width: "100%",
        alignSelf: "center",
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.accent}
          />
        ) : undefined
      }
    >
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <View style={{ flex: 1 }}>
          <Txt bold size={28}>
            {title}
          </Txt>
        </View>
        <Txt size={11} bold color={c.accent}>
          BIZ / GE
        </Txt>
      </View>
    
      {offline && (
        <Card>
          <Txt color={c.warning}>{t("offline")}</Txt>
        </Card>
      )}
      {children}
    </ScrollView>
  );
}
export function State({
  loading,
  error,
  empty,
  retry,
}: {
  loading?: boolean;
  error?: boolean;
  empty?: boolean;
  retry?: () => void;
}) {
  const t = useT();
  const c = useTheme();
  if (loading)
    return (
      <Card>
        <ActivityIndicator color={c.accent} />
        {[85, 65, 95].map((n) => (
          <View
            key={n}
            style={{
              height: 16,
              width: `${n}%`,
              backgroundColor: c.line,
              borderRadius: 4,
            }}
          />
        ))}
      </Card>
    );
  if (error || empty)
    return (
      <Card>
        <Txt>{t(error ? "error" : "empty")}</Txt>
        {retry && <Button title={t("retry")} onPress={retry} />}
      </Card>
    );
  return null;
}
