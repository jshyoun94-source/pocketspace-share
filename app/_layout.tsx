import FontAwesome from '@expo/vector-icons/FontAwesome';
import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { useFonts } from 'expo-font';
import { Stack, useRouter } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { onAuthStateChanged } from "firebase/auth";
import { useEffect, useRef } from 'react';
import 'react-native-reanimated';

import { useColorScheme } from '@/components/useColorScheme';
import { UnreadChatCountProvider } from '@/contexts/UnreadChatCountContext';
import { auth } from "../firebase";
import { registerPushTokenForUser } from "../utils/pushNotifications";

type NotificationsModule = typeof import("expo-notifications");
let notificationsModule: NotificationsModule | null = null;

function getNotificationsModule(): NotificationsModule | null {
  if (notificationsModule) return notificationsModule;
  try {
    notificationsModule = require("expo-notifications") as NotificationsModule;
    return notificationsModule;
  } catch (e) {
    console.warn("expo-notifications 모듈을 찾지 못했습니다.", e);
    return null;
  }
}

export {
  // Catch any errors thrown by the Layout component.
  ErrorBoundary,
} from 'expo-router';

export const unstable_settings = {
  // Ensure that reloading on `/modal` keeps a back button present.
  initialRouteName: '(tabs)',
};

// Prevent the splash screen from auto-hiding before asset loading is complete.
SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const [loaded, error] = useFonts({
    SpaceMono: require('../assets/fonts/SpaceMono-Regular.ttf'),
    ...FontAwesome.font,
  });

  // Expo Router uses Error Boundaries to catch errors in the navigation tree.
  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const colorScheme = useColorScheme();
  const router = useRouter();
  const handledNotificationIdsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      if (!user?.uid) return;
      registerPushTokenForUser(user.uid).catch((e) => {
        console.warn("푸시 토큰 등록 실패:", e?.message ?? e);
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    const Notifications = getNotificationsModule();
    if (!Notifications) return;

    const handleNotificationResponse = async (
      response: any
    ) => {
      if (!response) return;

      const requestIdentifier = response.notification.request.identifier;
      if (handledNotificationIdsRef.current.has(requestIdentifier)) return;
      handledNotificationIdsRef.current.add(requestIdentifier);

      const data = response.notification.request.content.data as
        | Record<string, unknown>
        | undefined;
      const type = typeof data?.type === "string" ? data.type : "";
      const chatId = typeof data?.chatId === "string" ? data.chatId : "";
      const spaceId = typeof data?.spaceId === "string" ? data.spaceId : "";

      if ((type === "chat_created" || type === "chat_message") && chatId) {
        router.push(`/chat/${chatId}` as any);
        return;
      }
      if (type === "request_status_changed") {
        router.push((chatId ? `/chat/${chatId}` : "/request/chats") as any);
        return;
      }
      if (type === "transaction_status_changed") {
        router.push((spaceId ? `/space/${spaceId}/chat` : "/(tabs)/chats") as any);
      }
    };

    const sub = Notifications.addNotificationResponseReceivedListener((res) => {
      handleNotificationResponse(res).catch((e) => {
        console.warn("알림 탭 라우팅 실패:", e?.message ?? e);
      });
    });

    Notifications.getLastNotificationResponseAsync()
      .then((res) => handleNotificationResponse(res))
      .catch((e) => {
        console.warn("초기 알림 응답 처리 실패:", e?.message ?? e);
      });

    return () => sub.remove();
  }, [router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <UnreadChatCountProvider>
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen
            name="notification-settings"
            options={{
              title: "알림 설정",
              headerTintColor: "#111827",
              headerTitleStyle: { color: "#111827", fontWeight: "700" },
              headerBackTitleVisible: false,
              headerBackButtonDisplayMode: "minimal",
              headerTitleAlign: "center",
              headerLeftContainerStyle: { paddingLeft: 12 },
              headerStyle: { backgroundColor: "#fff" },
            }}
          />
          <Stack.Screen name="modal" options={{ presentation: 'modal' }} />
        </Stack>
      </UnreadChatCountProvider>
    </ThemeProvider>
  );
}
