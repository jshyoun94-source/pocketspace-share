// ✅ 최상단에 이 한 줄 추가 (crypto 폴리필)
import "react-native-get-random-values";

import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Platform, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Toast } from "react-native-toast-message/lib/src/Toast";
import { useUnreadChatCount } from "@/contexts/UnreadChatCountContext";

export default function TabsLayout() {
  const unreadCount = useUnreadChatCount();
  return (
    <>
      {/* 1번+2번 통합: 탭바~화면 하단까지 단일 흰색. 모든 탭에 공통, 탭바/광고배너는 그 위에 올라감 */}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          height: Platform.OS === "ios" ? 140 : 92,
          backgroundColor: "#FFFFFF",
          borderTopWidth: 1,
          borderTopColor: "#E5E7EB",
          zIndex: 0,
        }}
      />
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#2477ff",
          tabBarInactiveTintColor: "#6B7280",
          tabBarStyle: {
            backgroundColor: "transparent",
            borderTopWidth: 0,
            height: Platform.OS === "ios" ? 88 : 64,
            paddingBottom: Platform.OS === "ios" ? 28 : 8,
            paddingTop: 8,
            position: "absolute",
            bottom: Platform.OS === "ios" ? 52 : 28,
            left: 0,
            right: 0,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            zIndex: 1,
            elevation: 1,
          },
          tabBarBackground: () => null,
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: "600",
          },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: "홈",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="home" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="community"
          options={{
            title: "동네생활",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="people" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="request"
          options={{
            title: "동네부탁",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="hand-left" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="chats"
          options={{
            title: "채팅",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="chatbubbles" size={size} color={color} />
            ),
            tabBarBadge: unreadCount > 0 ? (unreadCount > 99 ? "99+" : unreadCount) : undefined,
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: "나의 포스",
            tabBarIcon: ({ color, size }) => (
              <Ionicons name="person" size={size} color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="two"
          options={{
            href: null, // 탭바에서 숨기기
          }}
        />
      </Tabs>
      {/* 전역 Toast */}
      <Toast />
      <StatusBar style="auto" />
    </>
  );
}

