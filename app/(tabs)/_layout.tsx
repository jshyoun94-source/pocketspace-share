// ✅ 최상단에 이 한 줄 추가 (crypto 폴리필)
import "react-native-get-random-values";

import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { Toast } from "react-native-toast-message/lib/src/Toast";

export default function TabsLayout() {
  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#2477ff",
          tabBarInactiveTintColor: "#6B7280",
          tabBarStyle: {
            backgroundColor: "transparent", // 배경을 투명하게
            borderTopWidth: 0, // 상단 테두리 제거
            height: Platform.OS === "ios" ? 88 : 64,
            paddingBottom: Platform.OS === "ios" ? 28 : 8,
            paddingTop: 8,
            position: "absolute",
            bottom: Platform.OS === "ios" ? 52 : 28, // 광고배너와의 간격 더 줄임
            left: 0,
            right: 0,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            zIndex: 1, // 광고배너보다 아래
            elevation: 1, // Android에서 zIndex 대신 사용
          },
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
            tabBarBadge: undefined, // 나중에 안읽은 메시지 수로 업데이트 가능
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
