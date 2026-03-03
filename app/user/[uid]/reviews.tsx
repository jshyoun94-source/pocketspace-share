import { Ionicons } from "@expo/vector-icons";
import { Stack, useLocalSearchParams } from "expo-router";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, StyleSheet, Text, View } from "react-native";
import { db } from "../../../firebase";

type RoleType = "owner" | "customer";
type UserReview = {
  id: string;
  targetRole?: RoleType;
  reviewerNickname?: string;
  ratingAvg?: number;
  reviewText?: string;
  createdAt?: Timestamp;
};

export default function UserReviewsScreen() {
  const { uid, role } = useLocalSearchParams<{ uid: string; role?: string }>();
  const viewRole: RoleType = role === "customer" ? "customer" : "owner";
  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<UserReview[]>([]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "userReviews"),
      where("targetUserId", "==", uid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: UserReview[] = [];
        snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
        setReviews(list.filter((x) => x.targetRole === viewRole));
        setLoading(false);
      },
      () => {
        setReviews([]);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [uid, viewRole]);

  const title = useMemo(
    () => (viewRole === "owner" ? "공간 이용 후기 전체" : "이용자 후기 전체"),
    [viewRole]
  );

  return (
    <>
      <Stack.Screen
        options={{
          title,
          headerStyle: { backgroundColor: "#fff" },
          headerTintColor: "#111827",
          headerTitleStyle: { color: "#111827", fontWeight: "700" },
          headerBackTitleVisible: false,
          headerBackButtonDisplayMode: "minimal",
        }}
      />
      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={reviews}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>등록된 리뷰가 없습니다.</Text>
              </View>
            }
            renderItem={({ item }) => (
              <View style={styles.card}>
                <View style={styles.metaRow}>
                  <View style={styles.starRow}>
                    <Ionicons name="star" size={12} color="#FBBF24" />
                    <Text style={styles.ratingText}>
                      {(item.ratingAvg ?? 0).toFixed(1)}
                    </Text>
                  </View>
                  <Text style={styles.metaText}>
                    {item.reviewerNickname || "사용자"} ·{" "}
                    {item.createdAt?.toDate?.().toLocaleDateString("ko-KR") ?? "-"}
                  </Text>
                </View>
                <Text style={styles.bodyText}>
                  {item.reviewText || "리뷰 내용이 없습니다."}
                </Text>
              </View>
            )}
          />
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  listContent: { padding: 16, paddingBottom: 40 },
  emptyWrap: { paddingTop: 120, alignItems: "center" },
  emptyText: { color: "#9CA3AF", fontSize: 14 },
  card: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 12,
    backgroundColor: "#fff",
    padding: 12,
    marginBottom: 10,
  },
  metaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  starRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontSize: 12, fontWeight: "700", color: "#111827" },
  metaText: { fontSize: 12, color: "#6B7280" },
  bodyText: { fontSize: 14, color: "#374151", lineHeight: 20 },
});

