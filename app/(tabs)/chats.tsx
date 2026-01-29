// app/(tabs)/chats.tsx
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import {
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  Timestamp,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../../firebase";
import { onAuthStateChanged } from "firebase/auth";

type ChatRoom = {
  id: string;
  spaceId: string;
  spaceTitle: string;
  spaceImages: string[];
  ownerId: string;
  customerId: string;
  lastMessage?: string;
  lastMessageTime?: Timestamp;
  unreadCount: number;
  role: "owner" | "customer"; // 현재 사용자의 역할
};

export default function ChatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [chats, setChats] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<
    "all" | "selling" | "buying" | "unread"
  >("all");

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return unsubscribe;
  }, []);

  // 채팅방 목록 로드
  useEffect(() => {
    if (!currentUser) {
      setChats([]);
      setLoading(false);
      return;
    }

    const loadChats = async () => {
      try {
        setLoading(true);
        const chatsRef = collection(db, "chats");
        
        // orderBy 없이 where만 사용 (인덱스 문제 방지)
        const ownerQ = query(
          chatsRef,
          where("ownerId", "==", currentUser.uid)
        );

        const ownerChats = await getDocs(ownerQ);
        const chatList: ChatRoom[] = [];

        ownerChats.forEach((docSnap) => {
          const data = docSnap.data();
          chatList.push({
            id: docSnap.id,
            spaceId: data.spaceId,
            spaceTitle: data.spaceTitle || "공간",
            spaceImages: data.spaceImages || [],
            ownerId: data.ownerId,
            customerId: data.customerId,
            lastMessage: data.lastMessage,
            lastMessageTime: data.lastMessageTime || data.updatedAt || data.createdAt,
            unreadCount: data.unreadCount || 0,
            role: "owner",
          });
        });

        // customerId로도 조회
        const customerQ = query(
          chatsRef,
          where("customerId", "==", currentUser.uid)
        );

        const customerChats = await getDocs(customerQ);
        customerChats.forEach((docSnap) => {
          const data = docSnap.data();
          chatList.push({
            id: docSnap.id,
            spaceId: data.spaceId,
            spaceTitle: data.spaceTitle || "공간",
            spaceImages: data.spaceImages || [],
            ownerId: data.ownerId,
            customerId: data.customerId,
            lastMessage: data.lastMessage,
            lastMessageTime: data.lastMessageTime || data.updatedAt || data.createdAt,
            unreadCount: data.unreadCount || 0,
            role: "customer",
          });
        });

        // 최신 메시지 순으로 정렬 (클라이언트에서)
        chatList.sort((a, b) => {
          const timeA = a.lastMessageTime?.toMillis() || a.lastMessageTime?.seconds || 0;
          const timeB = b.lastMessageTime?.toMillis() || b.lastMessageTime?.seconds || 0;
          return timeB - timeA;
        });

        setChats(chatList);
        console.log("✅ 채팅 목록 로드 완료:", chatList.length, "개");
      } catch (e: any) {
        console.error("❌ 채팅 목록 로드 실패:", e);
        console.error("오류 코드:", e?.code);
        console.error("오류 메시지:", e?.message);
        // 오류 메시지 표시
        if (e?.code === "failed-precondition" || e?.message?.includes("index")) {
          console.warn("Firestore 인덱스가 필요할 수 있습니다. 콘솔의 오류 메시지를 확인하세요.");
        }
        if (e?.code === "permission-denied") {
          console.error("⚠️ Firestore 권한 오류: 규칙을 확인하세요.");
        }
      } finally {
        setLoading(false);
      }
    };

    loadChats();

    // 실시간 업데이트 (별도로 관리)
    const chatsRef = collection(db, "chats");
    const ownerQ = query(
      chatsRef,
      where("ownerId", "==", currentUser.uid)
    );

    const customerQ = query(
      chatsRef,
      where("customerId", "==", currentUser.uid)
    );

    let ownerChats: ChatRoom[] = [];
    let customerChats: ChatRoom[] = [];

    const updateChatList = () => {
      const allChats = [...ownerChats, ...customerChats];
      // 중복 제거 (같은 채팅방이 owner와 customer 모두에 있을 수 있음)
      const uniqueChats = allChats.filter(
        (chat, index, self) => index === self.findIndex((c) => c.id === chat.id)
      );

      // 최신 메시지 순으로 정렬
      uniqueChats.sort((a, b) => {
        const timeA = a.lastMessageTime?.toMillis?.() || a.lastMessageTime?.seconds || 0;
        const timeB = b.lastMessageTime?.toMillis?.() || b.lastMessageTime?.seconds || 0;
        return timeB - timeA;
      });

      setChats(uniqueChats);
    };

    const unsubscribeOwner = onSnapshot(
      ownerQ,
      (snapshot) => {
        ownerChats = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          ownerChats.push({
            id: docSnap.id,
            spaceId: data.spaceId,
            spaceTitle: data.spaceTitle || "공간",
            spaceImages: data.spaceImages || [],
            ownerId: data.ownerId,
            customerId: data.customerId,
            lastMessage: data.lastMessage,
            lastMessageTime: data.lastMessageTime || data.updatedAt || data.createdAt,
            unreadCount: data.unreadCount || 0,
            role: "owner",
          });
        });
        updateChatList();
      },
      (error) => {
        console.error("❌ owner 채팅 실시간 업데이트 오류:", error);
        console.error("오류 코드:", error?.code);
        console.error("오류 메시지:", error?.message);
        // 오류가 발생해도 기존 데이터는 유지
      }
    );

    const unsubscribeCustomer = onSnapshot(
      customerQ,
      (snapshot) => {
        customerChats = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          customerChats.push({
            id: docSnap.id,
            spaceId: data.spaceId,
            spaceTitle: data.spaceTitle || "공간",
            spaceImages: data.spaceImages || [],
            ownerId: data.ownerId,
            customerId: data.customerId,
            lastMessage: data.lastMessage,
            lastMessageTime: data.lastMessageTime || data.updatedAt || data.createdAt,
            unreadCount: data.unreadCount || 0,
            role: "customer",
          });
        });
        updateChatList();
      },
      (error) => {
        console.error("❌ customer 채팅 실시간 업데이트 오류:", error);
        console.error("오류 코드:", error?.code);
        console.error("오류 메시지:", error?.message);
        // 오류가 발생해도 기존 데이터는 유지
      }
    );

    return () => {
      unsubscribeOwner();
      unsubscribeCustomer();
    };
  }, [currentUser]);

  // 필터링된 채팅 목록
  const filteredChats = chats.filter((chat) => {
    if (filter === "selling") {
      return chat.role === "owner";
    }
    if (filter === "buying") {
      return chat.role === "customer";
    }
    if (filter === "unread") {
      return chat.unreadCount > 0;
    }
    return true;
  });

  const formatTime = (timestamp?: Timestamp) => {
    if (!timestamp) return "";
    const date = timestamp.toDate();
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "방금 전";
    if (minutes < 60) return `${minutes}분 전`;
    if (hours < 24) return `${hours}시간 전`;
    if (days < 7) return `${days}일 전`;
    return date.toLocaleDateString("ko-KR", {
      month: "short",
      day: "numeric",
    });
  };

  if (!currentUser) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "채팅",
            headerStyle: { backgroundColor: "#fff" },
            headerTitleStyle: { fontWeight: "700", fontSize: 18 },
          }}
        />
        <View style={styles.container}>
          <View style={styles.loginPromptContainer}>
            <Ionicons name="chatbubbles-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>로그인이 필요합니다</Text>
            <Pressable
              style={styles.loginButton}
              onPress={() => router.push("/(auth)/login")}
            >
              <Text style={styles.loginButtonText}>로그인하기</Text>
            </Pressable>
          </View>

          {/* 광고배너 (탭바를 덮도록) */}
          <View
            style={{
              position: "absolute",
              left: 12,
              right: 12,
              bottom: Platform.OS === "ios" ? 22 : 18,
              zIndex: 1000,
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
                  borderRadius: 8,
                  justifyContent: "center",
                  alignItems: "center",
                }}
              >
                <Ionicons name="cube" size={22} color="#fff" />
              </View>
            </View>
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "채팅",
          headerStyle: { backgroundColor: "#fff" },
          headerTitleStyle: { fontWeight: "700", fontSize: 18 },
        }}
      />

      <View style={styles.container}>
        {/* 필터 버튼 (상태바 바로 아래) */}
        <View style={[styles.filterContainer, { paddingTop: insets.top + 8 }]}>
          <Pressable
            style={[
              styles.filterButton,
              filter === "all" && styles.filterButtonActive,
            ]}
            onPress={() => setFilter("all")}
          >
            <Text
              style={[
                styles.filterText,
                filter === "all" && styles.filterTextActive,
              ]}
            >
              전체
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.filterButton,
              filter === "selling" && styles.filterButtonActive,
            ]}
            onPress={() => setFilter("selling")}
          >
            <Text
              style={[
                styles.filterText,
                filter === "selling" && styles.filterTextActive,
              ]}
            >
              판매
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.filterButton,
              filter === "buying" && styles.filterButtonActive,
            ]}
            onPress={() => setFilter("buying")}
          >
            <Text
              style={[
                styles.filterText,
                filter === "buying" && styles.filterTextActive,
              ]}
            >
              구매
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.filterButton,
              filter === "unread" && styles.filterButtonActive,
            ]}
            onPress={() => setFilter("unread")}
          >
            <Text
              style={[
                styles.filterText,
                filter === "unread" && styles.filterTextActive,
              ]}
            >
              안읽은채팅방
            </Text>
            {chats.filter((c) => c.unreadCount > 0).length > 0 && (
              <View style={styles.badge}>
                <Text style={styles.badgeText}>
                  {chats.filter((c) => c.unreadCount > 0).length}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={filteredChats}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <Pressable
                style={styles.chatItem}
                onPress={() => router.push(`/space/${item.spaceId}/chat`)}
              >
                {item.spaceImages && item.spaceImages.length > 0 ? (
                  <Image
                    source={{ uri: item.spaceImages[0] }}
                    style={styles.chatImage}
                  />
                ) : (
                  <View style={[styles.chatImage, styles.placeholderImage]}>
                    <Ionicons name="image-outline" size={24} color="#D1D5DB" />
                  </View>
                )}

                <View style={styles.chatContent}>
                  <View style={styles.chatHeader}>
                    <Text style={styles.chatTitle} numberOfLines={1}>
                      {item.spaceTitle}
                    </Text>
                    <Text style={styles.chatTime}>
                      {formatTime(item.lastMessageTime)}
                    </Text>
                  </View>
                  <Text style={styles.chatMessage} numberOfLines={1}>
                    {item.lastMessage || "메시지가 없습니다"}
                  </Text>
                  {item.role === "owner" && (
                    <Text style={styles.chatRole}>판매중</Text>
                  )}
                  {item.role === "customer" && (
                    <Text style={styles.chatRole}>구매중</Text>
                  )}
                </View>

                {item.unreadCount > 0 && (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>
                      {item.unreadCount > 99 ? "99+" : item.unreadCount}
                    </Text>
                  </View>
                )}
              </Pressable>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="chatbubbles-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyText}>채팅이 없습니다</Text>
                <Text style={styles.emptySubtext}>
                  공간을 예약하면 채팅이 시작됩니다
                </Text>
              </View>
            }
          />
        )}

        {/* 광고배너 (탭바를 덮도록) */}
        <View
          style={{
            position: "absolute",
            left: 12,
            right: 12,
            bottom: Platform.OS === "ios" ? 22 : 18,
            zIndex: 1000,
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
                borderRadius: 8,
                justifyContent: "center",
                alignItems: "center",
              }}
            >
              <Ionicons name="cube" size={22} color="#fff" />
            </View>
          </View>
        </View>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  filterContainer: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingBottom: 12,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    gap: 8,
  },
  filterButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F3F4F6",
    position: "relative",
  },
  filterButtonActive: {
    backgroundColor: "#2477ff",
  },
  filterText: {
    fontSize: 13,
    fontWeight: "600",
    color: "#6B7280",
  },
  filterTextActive: {
    color: "#fff",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#EF4444",
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 6,
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
    color: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 16,
  },
  chatItem: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  chatImage: {
    width: 60,
    height: 60,
    borderRadius: 8,
    backgroundColor: "#F3F4F6",
    marginRight: 12,
  },
  placeholderImage: {
    justifyContent: "center",
    alignItems: "center",
  },
  chatContent: {
    flex: 1,
  },
  chatHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  chatTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
  },
  chatTime: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  chatMessage: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 4,
  },
  chatRole: {
    fontSize: 12,
    color: "#2477ff",
    fontWeight: "600",
  },
  unreadBadge: {
    backgroundColor: "#EF4444",
    borderRadius: 12,
    minWidth: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 8,
    marginLeft: 8,
  },
  unreadBadgeText: {
    fontSize: 12,
    fontWeight: "700",
    color: "#fff",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  loginPromptContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    color: "#9CA3AF",
    marginTop: 8,
  },
  loginButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#2477ff",
    borderRadius: 8,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
});
