import * as AuthSession from "expo-auth-session";
import * as Notifications from "expo-notifications";
import { Slot, useRouter } from "expo-router";
import React, { useEffect, useRef } from "react";
import { StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { registerPushTokenForUser } from "./utils/pushNotifications";

export default function App() {
  const router = useRouter();
  const handledNotificationIdsRef = useRef<Set<string>>(new Set());

  const resolveRouteFromNotificationData = async (
    data: Record<string, unknown> | null | undefined,
    _currentUid?: string
  ): Promise<string | null> => {
    const type = typeof data?.type === "string" ? data.type : "";
    const chatId = typeof data?.chatId === "string" ? data.chatId : "";
    const requestId = typeof data?.requestId === "string" ? data.requestId : "";
    const spaceId = typeof data?.spaceId === "string" ? data.spaceId : "";

    if ((type === "chat_created" || type === "chat_message") && chatId) {
      return `/chat/${chatId}`;
    }

    if (type === "transaction_status_changed") {
      if (spaceId) return `/space/${spaceId}/chat`;
      if (chatId) return `/chat/${chatId}`;
      return "/(tabs)/chats";
    }

    if (type === "request_status_changed") {
      if (chatId) return `/chat/${chatId}`;
      // 동네부탁 상태 알림은 동네부탁 채팅 목록으로 이동
      if (requestId) return "/request/chats";
      return "/request/chats";
    }

    return null;
  };

  // ✅ Redirect URI 확인용 로그 (임시)
  useEffect(() => {
    const uri = AuthSession.makeRedirectUri({
      scheme: "com.jshyoun94.pocketspace", // app.config.ts의 scheme과 동일해야 함
    });
    console.log("🔁 Redirect URI =", uri);
  }, []);

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
    const handleNotificationResponse = async (
      response: Notifications.NotificationResponse | null
    ) => {
      if (!response) return;

      const requestId = response.notification.request.identifier;
      if (handledNotificationIdsRef.current.has(requestId)) return;
      handledNotificationIdsRef.current.add(requestId);

      const data = response.notification.request.content
        .data as Record<string, unknown> | undefined;
      const route = await resolveRouteFromNotificationData(
        data,
        auth.currentUser?.uid
      );
      if (!route) return;

      router.push(route as any);
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
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      {/* 상태바 색상 설정 */}
      <StatusBar barStyle="dark-content" backgroundColor="#fff" />

      {/* Expo Router 페이지 렌더링 */}
      <Slot />

      {/* ✅ 전역 토스트 */}
      <Toast />
    </SafeAreaView>
  );
}
