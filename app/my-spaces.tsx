// app/my-spaces.tsx
import { Ionicons } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { collection, query, where, getDocs } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { auth, db } from "../firebase";

type MySpace = {
  id: string;
  title: string;
  address: string;
  pricePerHour: number;
  description?: string;
  images?: string[];
  tags?: string[];
  schedules?: Array<{
    days: string[];
    time: { start: string; end: string };
  }>;
  coords?: { lat: number; lng: number };
  createdAt?: any;
};

export default function MySpacesScreen() {
  const router = useRouter();
  const [spaces, setSpaces] = useState<MySpace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMySpaces();
  }, []);

  const loadMySpaces = async () => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const q = query(
        collection(db, "spaces"),
        where("ownerId", "==", auth.currentUser.uid)
      );
      const snap = await getDocs(q);
      const mySpaces: MySpace[] = [];
      snap.forEach((doc) => {
        const data = doc.data();
        mySpaces.push({
          id: doc.id,
          title: data.title ?? "공간",
          address: data.address ?? "",
          pricePerHour: Number(data.pricePerHour ?? 0),
          description: data.description ?? "",
          images: data.images ?? [],
          tags: data.tags ?? [],
          schedules: data.schedules ?? [],
          coords: data.coords,
          createdAt: data.createdAt,
        });
      });
      // 최신순 정렬
      mySpaces.sort((a, b) => {
        const aTime = a.createdAt?.toMillis?.() ?? 0;
        const bTime = b.createdAt?.toMillis?.() ?? 0;
        return bTime - aTime;
      });
      setSpaces(mySpaces);
    } catch (e: any) {
      console.error("내 공간 불러오기 실패:", e);
    } finally {
      setLoading(false);
    }
  };

  const goToDetail = (id: string) => {
    router.push(`/space/${id}`);
  };

  const goToEdit = (id: string) => {
    router.push(`/space/${id}/edit`);
  };

  if (!auth.currentUser) {
    return (
      <>
        <Stack.Screen options={{ title: "내 공간" }} />
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
          title: "내 공간",
          headerBackTitle: "",
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={{ marginLeft: 0, padding: 4 }}
            >
              <Ionicons name="close" size={24} color="#111827" />
            </Pressable>
          ),
        }}
      />
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
        </View>
      ) : spaces.length === 0 ? (
        <View style={styles.container}>
          <Text style={styles.emptyText}>등록된 공간이 없습니다.</Text>
          <Pressable
            style={styles.addButton}
            onPress={() => router.push("/space/new")}
          >
            <Text style={styles.addButtonText}>+ 공간 등록하기</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={spaces}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContainer}
          renderItem={({ item }) => (
            <Pressable
              style={styles.spaceCard}
              onPress={() => goToDetail(item.id)}
            >
              {item.images && item.images.length > 0 && (
                <Image
                  source={{ uri: item.images[0] }}
                  style={styles.spaceImage}
                  resizeMode="cover"
                />
              )}
              <View style={styles.spaceContent}>
                <Text style={styles.spaceTitle}>{item.title}</Text>
                <Text style={styles.spaceAddress} numberOfLines={1}>
                  {item.address}
                </Text>
                <View style={styles.spaceFooter}>
                  <Text style={styles.spacePrice}>
                    {item.pricePerHour.toLocaleString()}원/시간
                  </Text>
                  <Pressable
                    style={styles.editButton}
                    onPress={(e) => {
                      e.stopPropagation();
                      goToEdit(item.id);
                    }}
                  >
                    <Ionicons name="create-outline" size={18} color="#2563EB" />
                    <Text style={styles.editButtonText}>수정</Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
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
  spaceCard: {
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
  spaceImage: {
    width: "100%",
    height: 200,
    backgroundColor: "#E5E7EB",
  },
  spaceContent: {
    padding: 16,
  },
  spaceTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  spaceAddress: {
    fontSize: 14,
    color: "#6B7280",
    marginBottom: 12,
  },
  spaceFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  spacePrice: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2563EB",
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: "#EFF6FF",
  },
  editButtonText: {
    fontSize: 14,
    color: "#2563EB",
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


