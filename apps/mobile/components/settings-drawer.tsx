import React, { useEffect, useRef } from "react";
import {
  Animated,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTheme } from "../theme";
import { Txt } from "./ui";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  // Optional left bar item, e.g. a back link inside the sheet.
  leading?: React.ReactNode;
  // Content rendered without the grouped card wrapper.
  plain?: boolean;
  // Full-height content without scrolling, e.g. a web view.
  fill?: boolean;
  children: React.ReactNode;
}

export function SettingsDrawer({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Sheet open={open} onClose={onClose} title="პროფილის პარამეტრები">
      {children}
    </Sheet>
  );
}

// iOS page sheet; a full-width slide-in drawer elsewhere.
export function Sheet(props: SheetProps) {
  return Platform.OS === "ios" ? (
    <PageSheet {...props} />
  ) : (
    <SideDrawer {...props} />
  );
}

// iOS: native page sheet with a centered title and a "Done" bar button,
// dismissible by swiping down.
function PageSheet({
  open,
  onClose,
  title,
  leading,
  plain,
  fill,
  children,
}: SheetProps) {
  const c = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal
      visible={open}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={{ flex: 1, backgroundColor: c.bg }}>
        <View
          style={{
            height: 56,
            justifyContent: "center",
            alignItems: "center",
            borderBottomWidth: StyleSheet.hairlineWidth,
            borderColor: c.line,
            backgroundColor: c.bg,
          }}
        >
          <Text
            accessibilityRole="header"
            numberOfLines={1}
            style={{
              color: c.text,
              fontSize: 17,
              fontWeight: "600",
              maxWidth: "50%",
            }}
          >
            {title}
          </Text>
          {leading && (
            <View style={{ position: "absolute", left: 16, maxWidth: "30%" }}>
              {leading}
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="პარამეტრების დახურვა"
            onPress={onClose}
            hitSlop={8}
            style={({ pressed }) => ({
              position: "absolute",
              right: 16,
              minHeight: 44,
              justifyContent: "center",
              opacity: pressed ? 0.5 : 1,
            })}
          >
            <Text style={{ color: c.accent, fontSize: 17, fontWeight: "600" }}>
              მზადაა
            </Text>
          </Pressable>
        </View>
        {fill ? (
          <View style={{ flex: 1 }}>{children}</View>
        ) : (
          <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <ScrollView
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              contentContainerStyle={{
                padding: 16,
                paddingBottom: Math.max(insets.bottom, 24) + 16,
              }}
            >
              {plain ? (
                <View style={{ gap: 16 }}>{children}</View>
              ) : (
                <View
                  style={{
                    backgroundColor: c.card,
                    borderRadius: 12,
                    borderCurve: "continuous",
                    padding: 16,
                    gap: 12,
                  }}
                >
                  {children}
                </View>
              )}
            </ScrollView>
          </KeyboardAvoidingView>
        )}
      </View>
    </Modal>
  );
}

function SideDrawer({
  open,
  onClose,
  title,
  leading,
  fill,
  children,
}: SheetProps) {
  const c = useTheme();
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(1)).current;
  const drawerWidth = width;
  useEffect(() => {
    if (!open) {
      slide.setValue(1);
      return;
    }
    const animation = Animated.timing(slide, {
      toValue: 0,
      duration: 220,
      useNativeDriver: Platform.OS !== "web",
    });
    animation.start();
    return () => animation.stop();
  }, [open, slide]);
  return (
    <Modal
      visible={open}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={{ flex: 1, flexDirection: "row", justifyContent: "flex-end" }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="პარამეტრების დახურვა"
          onPress={onClose}
          style={{
            position: "absolute",
            inset: 0,
            backgroundColor: "rgba(0,0,0,0.45)",
          }}
        />
        <Animated.View
          accessibilityViewIsModal
          style={{
            width: drawerWidth,
            height: "100%",
            backgroundColor: c.card,
            borderLeftWidth: 1,
            borderColor: c.line,
            transform: [
              {
                translateX: slide.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, drawerWidth],
                }),
              },
            ],
          }}
        >
          <KeyboardAvoidingView style={{ flex: 1 }}>
            <View
              style={{
                paddingTop: Math.max(insets.top, 20),
                paddingHorizontal: 24,
                paddingBottom: 18,
                borderBottomWidth: 1,
                borderColor: c.line,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 10,
              }}
            >
              {leading}
              <View style={{ flex: 1 }}>
                <Txt bold size={19}>
                  {title}
                </Txt>
              </View>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="დრავერის დახურვა"
                onPress={onClose}
                style={{
                  minWidth: 44,
                  minHeight: 44,
                  alignItems: "center",
                  justifyContent: "center",
                  borderRadius: 12,
                  backgroundColor: c.bg,
                }}
              >
                <Txt size={24}>×</Txt>
              </Pressable>
            </View>
            {fill ? (
              <View style={{ flex: 1 }}>{children}</View>
            ) : (
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{
                  padding: 24,
                  paddingBottom: Math.max(insets.bottom, 24),
                  gap: 14,
                }}
              >
                {children}
              </ScrollView>
            )}
          </KeyboardAvoidingView>
        </Animated.View>
      </View>
    </Modal>
  );
}
