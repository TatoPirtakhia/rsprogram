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
import { SymbolView, type SFSymbol } from "expo-symbols";
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
        fontWeight: bold ? "600" : "400",
        lineHeight: Math.round(size * 1.35),
        letterSpacing: size >= 28 ? 0.35 : size <= 13 ? 0 : -0.2,
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
        borderRadius: Platform.OS === "ios" ? 12 : 22,
        borderCurve: "continuous",
        padding: 16,
        gap: 10,
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
        backgroundColor: quiet ? c.fill : c.accent,
        paddingHorizontal: 16,
        paddingVertical: 13,
        borderRadius: 12,
        opacity: disabled ? 0.4 : pressed ? 0.7 : 1,
        alignItems: "center",
        minHeight: 48,
      })}
    >
      <Txt
        bold
        size={17}
        color={quiet ? c.accent : c.dark ? "#000000" : "white"}
      >
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
      selectionColor={c.accent}
      {...props}
      style={[
        {
          backgroundColor: c.fill,
          color: c.text,
          borderRadius: 10,
          paddingHorizontal: 12,
          paddingVertical: 11,
          fontSize: 17,
          minHeight: 44,
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
        paddingVertical: 11,
        minHeight: 44,
        borderBottomWidth: StyleSheet.hairlineWidth,
        borderColor: c.line,
      }}
    >
      <View style={{ flex: 1 }}>
        <Txt size={17}>{title}</Txt>
        {subtitle && (
          <Txt muted size={13}>
            {subtitle}
          </Txt>
        )}
      </View>
      {value && (
        <Txt size={17} color={c.muted}>
          {value}
        </Txt>
      )}
      {onPress && (
        <Txt size={22} color={c.muted}>
          ›
        </Txt>
      )}
    </View>
  );
  return onPress ? (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => ({ opacity: pressed ? 0.55 : 1 })}
    >
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
  header,
}: {
  title: string;
  children: React.ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  demo?: boolean;
  showContext?: boolean;
  header?: React.ReactNode;
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
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="interactive"
      contentContainerStyle={{
        paddingHorizontal: 16,
        paddingTop: Math.max(20, insets.top + 4),
        paddingBottom: Math.max(45, insets.bottom + 24),
        gap: 20,
        maxWidth: 900,
        width: "100%",
        alignSelf: "center",
      }}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={c.muted}
          />
        ) : undefined
      }
    >
      <View style={{ gap: 2 }}>
        {header}
        <Text
          accessibilityRole="header"
          style={{
            color: c.text,
            fontSize: 34,
            fontWeight: "700",
            lineHeight: 41,
            letterSpacing: 0.37,
          }}
        >
          {title}
        </Text>
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
        <ActivityIndicator color={c.muted} />
        {[85, 65, 95].map((n) => (
          <View
            key={n}
            style={{
              height: 16,
              width: `${n}%`,
              backgroundColor: c.fill,
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
// Borderless navigation-bar button: SF Symbol on iOS, text glyph elsewhere.
export function IconButton({
  label,
  symbol,
  glyph,
  onPress,
  disabled = false,
  badge = 0,
}: {
  label: string;
  symbol: SFSymbol;
  glyph: string;
  onPress: () => void;
  disabled?: boolean;
  badge?: number;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={badge ? `${label}, ${badge}` : label}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        if (Platform.OS !== "web") void Haptics.selectionAsync();
        onPress();
      }}
      style={({ pressed }) => ({
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.35 : pressed ? 0.5 : 1,
      })}
    >
      <SymbolView
        name={symbol}
        size={22}
        tintColor={c.accent}
        fallback={
          <Txt size={21} color={c.accent}>
            {glyph}
          </Txt>
        }
      />
      {badge > 0 && (
        <View
          style={{
            position: "absolute",
            top: 4,
            right: 2,
            minWidth: 18,
            height: 18,
            paddingHorizontal: 5,
            borderRadius: 9,
            backgroundColor: c.danger,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text style={{ color: "white", fontSize: 11, fontWeight: "700" }}>
            {badge > 99 ? "99+" : badge}
          </Text>
        </View>
      )}
    </Pressable>
  );
}
// iOS navigation-bar back link: "‹ Title" in the tint color.
export function BackLink({
  title,
  label = title,
  onPress,
}: {
  title: string;
  label?: string;
  onPress: () => void;
}) {
  const c = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 44,
        flexDirection: "row",
        alignItems: "center",
        gap: 4,
        flexShrink: 1,
        marginLeft: -6,
        opacity: pressed ? 0.5 : 1,
      })}
    >
      <SymbolView
        name="chevron.left"
        size={20}
        weight="semibold"
        tintColor={c.accent}
        fallback={
          <Text style={{ color: c.accent, fontSize: 28, lineHeight: 30 }}>
            ‹
          </Text>
        }
      />
      <Text numberOfLines={1} style={{ color: c.accent, fontSize: 17 }}>
        {title}
      </Text>
    </Pressable>
  );
}
