// app/request/chats.tsx - 동네부탁 채팅 목록
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
import React, { useEffect, useRef, useState } from "react";
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

type RequestChatRoom = {
  id: string;
  spaceTitle: string;
  spaceImages: string[];
  ownerId: string;
  customerId: string;
  lastMessage?: string;
  lastMessageTime?: Timestamp;
  unreadCount: number;
  requestId: string;
};

export default function RequestChatsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [chats, setChats] = useState<RequestChatRoom[]>([]);
  const [loading, setLoading] = useState(true);
  const unsubRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubAuth = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (!user) {
        setChats([]);
        setLoading(false);
      }
    });
    return unsubAuth;
  }, []);

  useEffect(() => {
    if (!currentUser) return;

    const load = async () => {
      try {
        setLoading(true);
        const chatsRef = collection(db, "chats");
        const [ownerSnap, customerSnap] = await Promise.all([
          getDocs(query(chatsRef, where("ownerId", "==", currentUser.uid))),
          getDocs(query(chatsRef, where("customerId", "==", currentUser.uid))),
        ]);
        const list: RequestChatRoom[] = [];
        const seen = new Set<string>();

        const pushIfRequest = (d: { id: string; data: () => Record<string, unknown> }) => {
          const data = d.data();
          if (!data.requestId) return;
          const isOwner = data.ownerId === currentUser.uid;
          if (isOwner && data.leftByOwner === true) return;
          if (!isOwner && data.leftByCustomer === true) return;
          if (seen.has(d.id)) return;
          seen.add(d.id);
          list.push({
            id: d.id,
            spaceTitle: (data.spaceTitle as string) || "동네부탁",
            spaceImages: (data.spaceImages as string[]) || [],
            ownerId: data.ownerId as string,
            customerId: data.customerId as string,
            lastMessage: data.lastMessage as string,
            lastMessageTime: data.lastMessageTime as Timestamp,
            unreadCount: isOwner ? ((data.unreadByOwner as number) ?? 0) : ((data.unreadByCustomer as number) ?? 0),
            requestId: data.requestId as string,
          });
        };

        ownerSnap.docs.forEach((d) => pushIfRequest(d));
        customerSnap.docs.forEach((d) => pushIfRequest(d));
        list.sort((a, b) => {
          const ta = a.lastMessageTime?.toMillis?.() ?? 0;
          const tb = b.lastMessageTime?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setChats(list);
      } catch (e) {
        console.error("동네부탁 채팅 목록 로드 실패:", e);
      } finally {
        setLoading(false);
      }
    };

    load();

    const timer = setTimeout(() => {
      const chatsRef = collection(db, "chats");
      let ownerList: RequestChatRoom[] = [];
      let customerList: RequestChatRoom[] = [];

      const updateList = () => {
        const seen = new Set<string>();
        const merged: RequestChatRoom[] = [];
        [...ownerList, ...customerList].forEach((c) => {
          if (!c.requestId || seen.has(c.id)) return;
          seen.add(c.id);
          merged.push(c);
        });
        merged.sort((a, b) => {
          const ta = a.lastMessageTime?.toMillis?.() ?? 0;
          const tb = b.lastMessageTime?.toMillis?.() ?? 0;
          return tb - ta;
        });
        setChats(merged);
      };

      const unsubOwner = onSnapshot(
        query(chatsRef, where("ownerId", "==", currentUser.uid)),
        (snap) => {
          ownerList = [];
          snap.forEach((d) => {
            const data = d.data();
            if (!data.requestId) return;
            if (data.leftByOwner === true) return;
            ownerList.push({
              id: d.id,
              spaceTitle: data.spaceTitle || "동네부탁",
              spaceImages: data.spaceImages || [],
              ownerId: data.ownerId,
              customerId: data.customerId,
              lastMessage: data.lastMessage,
              lastMessageTime: data.lastMessageTime,
              unreadCount: data.unreadByOwner ?? 0,
              requestId: data.requestId,
            });
          });
          updateList();
        }
      );
      const unsubCustomer = onSnapshot(
        query(chatsRef, where("customerId", "==", currentUser.uid)),
        (snap) => {
          customerList = [];
          snap.forEach((d) => {
            const data = d.data();
            if (!data.requestId) return;
            if (data.leftByCustomer === true) return;
            customerList.push({
              id: d.id,
              spaceTitle: data.spaceTitle || "동네부탁",
              spaceImages: data.spaceImages || [],
              ownerId: data.ownerId,
              customerId: data.customerId,
              lastMessage: data.lastMessage,
              lastMessageTime: data.lastMessageTime,
              unreadCount: data.unreadByCustomer ?? 0,
              requestId: data.requestId,
            });
          });
          updateList();
        }
      );
      unsubRef.current = () => {
        unsubOwner();
        unsubCustomer();
      };
    }, 300);

    return () => {
      clearTimeout(timer);
      unsubRef.current?.();
    };
  }, [currentUser]);

  const formatTime = (ts?: Timestamp) => {
    if (!ts?.toDate) return "";
    const d = ts.toDate();
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    if (diff < 86400000) return d.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" });
    if (diff < 604800000) return d.toLocaleDateString("ko-KR", { weekday: "short" });
    return d.toLocaleDateString("ko-KR", { month: "short", day: "numeric" });
  };

  if (!currentUser) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "동네부탁",
            headerBackVisible: false,
            headerLeft: () => (
              <Pressable onPress={() => router.back()} style={{ marginLeft: 0, padding: 4 }}>
                <Ionicons name="chevron-back" size={28} color="#000" />
              </Pressable>
            ),
          }}
        />
        <View style={styles.container}>
          <Text style={styles.emptyText}>로그인이 필요합니다</Text>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "동네부탁",
          headerStyle: { backgroundColor: "#fff" },
          headerTitleStyle: { fontWeight: "700", fontSize: 18 },
          headerBackVisible: false,
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ marginLeft: 0, padding: 4 }}>
              <Ionicons name="chevron-back" size={28} color="#000" />
            </Pressable>
          ),
        }}
      />
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={chats}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 24 }]}
            renderItem={({ item }) => (
              <Pressable
                style={styles.chatItem}
                onPress={() => router.push(`/chat/${item.id}` as any)}
              >
                <View style={[styles.chatImage, styles.placeholderImage]}>
                  <Ionicons name="chatbubble-outline" size={28} color="#9CA3AF" />
                </View>
                <View style={styles.chatContent}>
                  <View style={styles.chatHeader}>
                    <Text style={styles.chatTitle} numberOfLines={1}>
                      {item.spaceTitle}
                    </Text>
                    <Text style={styles.chatTime}>{formatTime(item.lastMessageTime)}</Text>
                  </View>
                  <Text style={styles.chatMessage} numberOfLines={1}>
                    {item.lastMessage || "메시지가 없습니다"}
                  </Text>
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
                <Text style={styles.emptyText}>동네부탁이 없습니다</Text>
                <Text style={styles.emptySubtext}>
                  부탁을 수락하면 채팅이 시작됩니다
                </Text>
              </View>
            }
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  loadingContainer: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { padding: 16 },
  chatItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    padding: 14,
    borderRadius: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  chatImage: { width: 52, height: 52, borderRadius: 26, marginRight: 12 },
  placeholderImage: { backgroundColor: "#F3F4F6", justifyContent: "center", alignItems: "center" },
  chatContent: { flex: 1, minWidth: 0 },
  chatHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  chatTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  chatTime: { fontSize: 12, color: "#9CA3AF" },
  chatMessage: { fontSize: 14, color: "#6B7280" },
  unreadBadge: {
    backgroundColor: "#2477ff",
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    marginLeft: 8,
  },
  unreadBadgeText: { fontSize: 12, fontWeight: "700", color: "#fff" },
  emptyContainer: { flex: 1, justifyContent: "center", alignItems: "center", paddingTop: 24 },
  emptyText: { fontSize: 16, color: "#6B7280", marginTop: 12 },
  emptySubtext: { fontSize: 14, color: "#9CA3AF", marginTop: 4 },
});
