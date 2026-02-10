import * as AuthSession from "expo-auth-session";
import { Slot } from "expo-router";
import React, { useEffect } from "react";
import { StatusBar } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import Toast from "react-native-toast-message";

export default function App() {
  // ✅ Redirect URI 확인용 로그 (임시)
  useEffect(() => {
    const uri = AuthSession.makeRedirectUri({
      scheme: "com.jshyoun94.pocketspace", // app.config.ts의 scheme과 동일해야 함
    });
    console.log("🔁 Redirect URI =", uri);
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
