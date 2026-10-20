import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import { post } from "./api";
export async function registerPush() {
  if (Platform.OS === "web")
    throw new Error("Push registration requires a native device");
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
  const token = await Notifications.getExpoPushTokenAsync({ projectId });
  await post("/notifications/device", { token: token.data });
  return token.data;
}
