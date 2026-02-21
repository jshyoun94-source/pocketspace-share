// ✅ 최상단에 이 한 줄 추가 (crypto 폴리필)
import "react-native-get-random-values";

import { useUnreadChatCount } from "@/contexts/UnreadChatCountContext";
import { Ionicons } from "@expo/vector-icons";
import { Tabs } from "expo-router";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { Platform, Text, View } from "react-native";
import { Toast } from "react-native-toast-message/lib/src/Toast";

export default function TabsLayout() {
  const unreadCount = useUnreadChatCount();
  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: "#2477ff",
          tabBarInactiveTintColor: "#6B7280",
          tabBarStyle: {
            backgroundColor: "#FFFFFF", // 배경을 투명하게
            borderTopWidth: 0, // 상단 테두리 제거
            height: Platform.OS === "ios" ? 140 : 54,
            paddingBottom: Platform.OS === "ios" ? 28 : 8,
            paddingTop: 8,
            position: "absolute",
            bottom: Platform.OS === "ios" ? 0 : 28, // 광고배너와의 간격 더 줄임
            left: 0,
            right: 0,
            borderTopLeftRadius: 0,
            borderTopRightRadius: 0,
            zIndex: 0,
            elevation: 0,
          },
          tabBarItemStyle: {
            paddingBottom: Platform.OS === "ios" ? 2 : 0,
          },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: "600",
            marginBottom: 0,
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
      {/* 전역 광고배너 (탭바 위 레이어) */}
      <View
        pointerEvents="box-none"
        style={{
          position: "absolute",
          left: 12,
          right: 12,
          bottom: Platform.OS === "ios" ? 22 : 18,
          zIndex: 1000,
          elevation: 1000,
        }}
      >
        <View
          style={{
            backgroundColor: "#1E3A8A",
            borderRadius: 12,
            paddingVertical: 8,
            paddingHorizontal: 11,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            shadowColor: "#000",
            shadowOpacity: 0.1,
            shadowRadius: 8,
            elevation: 20,
          }}
        >
          <View style={{ flex: 1, marginRight: 12 }}>
            <Text
              style={{
                color: "#fff",
                fontSize: 13,
                fontWeight: "700",
                marginBottom: 1,
              }}
            >
              포켓스페이스로 편한 보관
            </Text>
            <Text style={{ color: "#E0E7FF", fontSize: 10 }}>
              언제 어디서나 안전한 보관 공간
            </Text>
          </View>
          <View
            style={{
              width: 38,
              height: 38,
              backgroundColor: "#3B82F6",
              borderRadius: 19,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Ionicons name="cube" size={20} color="#fff" />
          </View>
        </View>
      </View>

      {/* 전역 Toast */}
      <Toast />
      <StatusBar style="auto" />
    </>
  );
}

