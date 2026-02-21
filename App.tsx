import * as AuthSession from "expo-auth-session";
import { Slot } from "expo-router";
import React, { useEffect } from "react";
import { StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "./firebase";
import { registerPushTokenForUser } from "./utils/pushNotifications";

export default function App() {
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
