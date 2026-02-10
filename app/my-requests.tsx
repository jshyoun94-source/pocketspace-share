// app/my-requests.tsx - 내 부탁 관리 (동네부탁 버전, 내공간관리와 동일 개념)
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  deleteField,
  Timestamp,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { auth, db } from "../firebase";

type MyRequest = {
  id: string;
  title: string;
  content: string;
  price: number;
  images?: string[];
  status: "open" | "in_progress" | "completed" | "cancelled";
  acceptedBy?: string;
  createdAt?: Timestamp;
};

const STATUS_LABEL: Record<string, string> = {
  open: "모집중",
  in_progress: "진행중",
  completed: "완료",
  cancelled: "취소됨",
};

const STATUS_COLOR: Record<string, string> = {
  open: "#10B981",
  in_progress: "#F59E0B",
  completed: "#6B7280",
  cancelled: "#EF4444",
};

export default function MyRequestsScreen() {
  const router = useRouter();
  const [requests, setRequests] = useState<MyRequest[]>([]);
  const [loading, setLoading] = useState(true);

  const loadMyRequests = async () => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const q = query(
        collection(db, "neighborhoodRequests"),
        where("authorId", "==", auth.currentUser.uid)
      );
      const snap = await getDocs(q);
      const list: MyRequest[] = [];
      snap.forEach((d) => {
        const data = d.data();
        list.push({
          id: d.id,
          title: data.title ?? "",
          content: data.content ?? "",
          price: Number(data.price ?? 0),
          images: data.images ?? [],
          status: data.status ?? "open",
          acceptedBy: data.acceptedBy,
          createdAt: data.createdAt,
        });
      });
      list.sort((a, b) => {
        const at = a.createdAt?.toMillis?.() ?? 0;
        const bt = b.createdAt?.toMillis?.() ?? 0;
        return bt - at;
      });
      setRequests(list);
    } catch (e: any) {
      console.error("내 부탁 불러오기 실패:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMyRequests();
  }, []);

  const handleDelete = (item: MyRequest) => {
    Alert.alert("부탁 삭제", `"${item.title}"을(를) 삭제하시겠습니까?`, [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "neighborhoodRequests", item.id));
            setRequests((prev) => prev.filter((r) => r.id !== item.id));
            Alert.alert("완료", "삭제되었습니다.");
          } catch (e: any) {
            console.error("삭제 실패:", e);
            Alert.alert("오류", "삭제에 실패했습니다.");
          }
        },
      },
    ]);
  };

  const handleResetStatus = (item: MyRequest) => {
    if (item.status !== "in_progress") return;
    Alert.alert(
      "다시 받기",
      "진행을 취소하고 새로운 분의 수락을 다시 받으시겠습니까? (기존에 수락한 분과의 채팅은 그대로 유지됩니다.)",
      [
        { text: "취소", style: "cancel" },
        {
          text: "다시 받기",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "neighborhoodRequests", item.id), {
                status: "open",
                acceptedBy: deleteField(),
              });
              setRequests((prev) =>
                prev.map((r) =>
                  r.id === item.id ? { ...r, status: "open" as const, acceptedBy: undefined } : r
                )
              );
              Alert.alert("완료", "다시 수락을 받을 수 있습니다.");
            } catch (e: any) {
              console.error("상태 되돌리기 실패:", e);
              Alert.alert("오류", "처리에 실패했습니다.");
            }
          },
        },
      ]
    );
  };

  if (!auth.currentUser) {
    return (
      <>
        <Stack.Screen options={{ title: "내 부탁 관리" }} />
        <View style={styles.container}>
          <Text style={styles.emptyText}>로그인이 필요합니다.</Text>
          <Pressable
            style={styles.loginButton}
            onPress={() => router.push("/(auth)/login")}
          >
            <Text style={styles.loginButtonText}>로그인하러 가기</Text>
          </Pressable>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "내 부탁 관리",
          headerBackTitle: "",
          headerLeft: () => (
            <Pressable onPress={() => router.back()} style={{ marginLeft: 0, padding: 4 }}>
              <Ionicons name="chevron-back" size={28} color="#000" />
            </Pressable>
          ),
        }}
      />
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      ) : requests.length === 0 ? (
        <View style={styles.container}>
          <Text style={styles.emptyText}>등록한 부탁이 없습니다.</Text>
          <Pressable
            style={styles.addButton}
            onPress={() => router.replace("/(tabs)/request")}
          >
            <Text style={styles.addButtonText}>+ 부탁 등록하기</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={requests}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <View style={styles.requestCard}>
              {item.images && item.images.length > 0 ? (
                <Image
                  source={{ uri: item.images[0] }}
                  style={styles.requestImage}
                  resizeMode="cover"
                />
              ) : (
                <View style={[styles.requestImage, styles.requestImagePlaceholder]}>
                  <Ionicons name="hand-left-outline" size={40} color="#9CA3AF" />
                </View>
              )}
              <View style={styles.requestContent}>
                <View style={styles.requestHeader}>
                  <Text style={styles.requestTitle} numberOfLines={1}>
                    {item.title}
                  </Text>
                  <View
                    style={[
                      styles.statusBadge,
                      { backgroundColor: STATUS_COLOR[item.status] ?? "#6B7280" },
                    ]}
                  >
                    <Text style={styles.statusText}>
                      {STATUS_LABEL[item.status] ?? item.status}
                    </Text>
                  </View>
                </View>
                <Text style={styles.requestBody} numberOfLines={2}>
                  {item.content || "내용 없음"}
                </Text>
                <View style={styles.requestFooter}>
                  <Text style={styles.priceText}>
                    {item.price.toLocaleString()}원
                  </Text>
                  <View style={styles.actionButtons}>
                    {item.status === "in_progress" && (
                      <Pressable
                        style={styles.resetButton}
                        onPress={() => handleResetStatus(item)}
                      >
                        <Ionicons name="refresh-outline" size={18} color="#F59E0B" />
                        <Text style={styles.resetButtonText}>다시 받기</Text>
                      </Pressable>
                    )}
                    <Pressable
                      style={styles.deleteButton}
                      onPress={() => handleDelete(item)}
                    >
                      <Ionicons name="trash-outline" size={18} color="#DC2626" />
                      <Text style={styles.deleteButtonText}>삭제</Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            </View>
          )}
        />
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#fff",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
  },
  listContainer: {
    padding: 16,
    backgroundColor: "#F9FAFB",
  },
  requestCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 12,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  requestImage: {
    width: "100%",
    height: 160,
    backgroundColor: "#E5E7EB",
  },
  requestImagePlaceholder: {
    justifyContent: "center",
    alignItems: "center",
  },
  requestContent: {
    padding: 16,
  },
  requestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  requestTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  requestBody: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 12,
  },
  requestFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  priceText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2477ff",
  },
  actionButtons: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resetButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#FFFBEB",
  },
  resetButtonText: {
    fontSize: 14,
    color: "#F59E0B",
    fontWeight: "600",
  },
  deleteButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#FEF2F2",
  },
  deleteButtonText: {
    fontSize: 14,
    color: "#DC2626",
    fontWeight: "600",
  },
  emptyText: {
    fontSize: 16,
    color: "#6B7280",
    marginBottom: 20,
    textAlign: "center",
  },
  loginButton: {
    backgroundColor: "#2477ff",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  loginButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  addButton: {
    backgroundColor: "#2477ff",
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 24,
  },
  addButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
