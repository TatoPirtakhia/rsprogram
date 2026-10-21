import { useEffect } from "react";
import { Platform } from "react-native";
import { router } from "expo-router";
import Constants, { ExecutionEnvironment } from "expo-constants";
import * as Notifications from "expo-notifications";
import { post } from "./api";
async function expoPushToken() {
  if (Platform.OS === "web")
    throw new Error("Push registration requires a native device");
  if (Constants.executionEnvironment === ExecutionEnvironment.StoreClient)
    throw new Error("Push notifications require a development build");
  if (Platform.OS === "android")
    await Notifications.setNotificationChannelAsync("default", {
      name: "Business alerts",
      importance: Notifications.AndroidImportance.DEFAULT,
    });
  const permissions = await Notifications.requestPermissionsAsync();
  if (!permissions.granted)
    throw new Error("Notification permission not granted");
  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId ??
    Constants.easConfig?.projectId;
  if (!projectId)
    throw new Error("Configure an EAS project ID before enabling push");
  return (await Notifications.getExpoPushTokenAsync({ projectId })).data;
}
export async function registerPush() {
  const token = await expoPushToken();
  await post("/notifications/device", { token });
  return token;
}
// Registers this device for new RS portal inbox messages.
export async function registerRsInboxPush() {
  const token = await expoPushToken();
  await post("/local/push-token", { token });
  return token;
}
// Shows RS inbox pushes while the app is open; a tapped notification opens
// its profile with the messages drawer.
export function useRsInboxNotifications() {
  useEffect(() => {
    if (
      Platform.OS === "web" ||
      Constants.executionEnvironment === ExecutionEnvironment.StoreClient
    )
      return;
    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    if (
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId
    ) {
      void registerRsInboxPush().catch(() => {
        /* Optional until EAS/APNs are configured. */
      });
    }
    const open = (response: Notifications.NotificationResponse | null) => {
      const uid = response?.notification.request.content.data?.profileUid;
      if (typeof uid === "string")
        router.push({
          pathname: "/rs-profile/[uid]",
          params: { uid, inbox: "1" },
        });
    };
    void Notifications.getLastNotificationResponseAsync().then(open);
    const subscription =
      Notifications.addNotificationResponseReceivedListener(open);
    return () => subscription.remove();
  }, []);
}
