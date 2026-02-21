import { arrayUnion, doc, serverTimestamp, setDoc } from "firebase/firestore";
import * as Device from "expo-device";
import * as Notifications from "expo-notifications";
import Constants from "expo-constants";
import { Platform } from "react-native";
import { db } from "../firebase";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

function getExpoProjectId(): string | undefined {
  const fromExpoConfig = (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId;
  const fromEasConfig = (Constants.easConfig as { projectId?: string } | undefined)?.projectId;
  return fromExpoConfig ?? fromEasConfig;
}

export async function registerPushTokenForUser(userId: string): Promise<void> {
  if (!Device.isDevice) {
    return;
  }

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync("default", {
      name: "기본 알림",
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: "#2477ff",
      sound: "default",
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let finalStatus = existing.status;
  if (finalStatus !== "granted") {
    const asked = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    finalStatus = asked.status;
  }
  if (finalStatus !== "granted") {
    return;
  }

  const projectId = getExpoProjectId();
  const tokenResponse = await Notifications.getExpoPushTokenAsync(
    projectId ? { projectId } : undefined
  );
  const expoPushToken = tokenResponse.data;
  if (!expoPushToken) return;

  await setDoc(
    doc(db, "users", userId),
    {
      expoPushTokens: arrayUnion(expoPushToken),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
