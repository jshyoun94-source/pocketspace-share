import React from "react";
import { SafeAreaView, StatusBar } from "react-native";
import { Slot } from "expo-router";
import Toast from "react-native-toast-message";

export default function App() {
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
