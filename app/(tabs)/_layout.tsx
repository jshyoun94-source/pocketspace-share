// ✅ 최상단에 이 한 줄 추가 (crypto 폴리필)
import "react-native-get-random-values";

import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Toast } from "react-native-toast-message/lib/src/Toast";

export default function RootLayout() {
  return (
    <>
      {/* 앱 전체 공통 네비게이션 스택 */}
      <Stack
        screenOptions={{
          headerStyle: { backgroundColor: "#fff" },
          headerTintColor: "#333",
          headerTitleStyle: { fontWeight: "600" },
        }}
      />
      {/* 전역 Toast */}
      <Toast />
      <StatusBar style="auto" />
    </>
  );
}
