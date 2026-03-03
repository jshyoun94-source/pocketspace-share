import { Ionicons } from "@expo/vector-icons";
import { Stack, router, useLocalSearchParams } from "expo-router";
import {
  collection,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import MindSpaceBadge from "../../components/MindSpaceBadge";
import { db } from "../../firebase";

type UserReview = {
  id: string;
  targetRole?: "owner" | "customer";
  reviewerNickname?: string;
  ratingAvg?: number;
  reviewText?: string;
  createdAt?: Timestamp;
};

export default function PublicUserProfileScreen() {
  const { uid } = useLocalSearchParams<{ uid: string }>();
  const [loading, setLoading] = useState(true);
  const [nickname, setNickname] = useState("사용자");
  const [photoURL, setPhotoURL] = useState<string | null>(null);
  const [mindSpace, setMindSpace] = useState<number | null>(null);
  const [ownerReviews, setOwnerReviews] = useState<UserReview[]>([]);
  const [customerReviews, setCustomerReviews] = useState<UserReview[]>([]);

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    getDoc(doc(db, "users", uid))
      .then((snap) => {
        if (!snap.exists() || cancelled) return;
        const d = snap.data();
        setNickname(d.nickname ?? d.name ?? d.displayName ?? "사용자");
        setPhotoURL(d.profileImage ?? d.photoURL ?? null);
        setMindSpace(d.mindSpace ?? null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [uid]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      collection(db, "userReviews"),
      where("targetUserId", "==", uid),
      orderBy("createdAt", "desc")
    );
    const unsub = onSnapshot(q, (snap) => {
      const list: UserReview[] = [];
      snap.forEach((d) => list.push({ id: d.id, ...(d.data() as any) }));
      setOwnerReviews(list.filter((x) => x.targetRole === "owner").slice(0, 5));
      setCustomerReviews(list.filter((x) => x.targetRole === "customer").slice(0, 5));
    });
    return () => unsub();
  }, [uid]);

  if (loading) {
    return (
      <>
        <Stack.Screen options={{ title: "프로필", headerTintColor: "#111827" }} />
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" />
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: `${nickname}님의 프로필`,
          headerStyle: { backgroundColor: "#fff" },
          headerTintColor: "#111827",
          headerTitleStyle: { color: "#111827", fontWeight: "700" },
        }}
      />
      <ScrollView style={styles.container} contentContainerStyle={styles.content}>
        <View style={styles.headerCard}>
          {photoURL ? (
            <Image source={{ uri: photoURL }} style={styles.avatar} />
          ) : (
            <View style={styles.avatarPlaceholder}>
              <Ionicons name="person" size={24} color="#9CA3AF" />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.nickname}>{nickname}</Text>
          </View>
          {mindSpace != null && <MindSpaceBadge mindSpace={mindSpace} size="small" />}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{nickname}님의 공간 이용 후기</Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: `/user/${uid}/reviews`,
                  params: { role: "owner" },
                } as any)
              }
            >
              <Text style={styles.moreText}>더보기</Text>
            </Pressable>
          </View>
          {ownerReviews.length === 0 ? (
            <Text style={styles.emptyText}>등록된 후기가 없습니다.</Text>
          ) : (
            ownerReviews.map((rv) => (
              <ReviewCard key={rv.id} review={rv} />
            ))
          )}
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>{nickname}님의 이용 후기</Text>
            <Pressable
              onPress={() =>
                router.push({
                  pathname: `/user/${uid}/reviews`,
                  params: { role: "customer" },
                } as any)
              }
            >
              <Text style={styles.moreText}>더보기</Text>
            </Pressable>
          </View>
          {customerReviews.length === 0 ? (
            <Text style={styles.emptyText}>등록된 후기가 없습니다.</Text>
          ) : (
            customerReviews.map((rv) => (
              <ReviewCard key={rv.id} review={rv} />
            ))
          )}
        </View>
      </ScrollView>
    </>
  );
}

function ReviewCard({ review }: { review: UserReview }) {
  return (
    <View style={styles.reviewCard}>
      <View style={styles.reviewMetaRow}>
        <View style={styles.starRow}>
          <Ionicons name="star" size={12} color="#FBBF24" />
          <Text style={styles.ratingText}>{(review.ratingAvg ?? 0).toFixed(1)}</Text>
        </View>
        <Text style={styles.metaText}>
          {review.reviewerNickname || "사용자"} ·{" "}
          {review.createdAt?.toDate?.().toLocaleDateString("ko-KR") ?? "-"}
        </Text>
      </View>
      <Text style={styles.reviewBodyText}>
        {review.reviewText || "리뷰 내용이 없습니다."}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#F9FAFB" },
  content: { padding: 16, paddingBottom: 40 },
  loadingWrap: { flex: 1, justifyContent: "center", alignItems: "center" },
  headerCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: "#E5E7EB" },
  avatarPlaceholder: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#E5E7EB",
    alignItems: "center",
    justifyContent: "center",
  },
  nickname: { fontSize: 16, fontWeight: "700", color: "#111827" },
  section: { marginTop: 20 },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 16, fontWeight: "700", color: "#111827" },
  moreText: { fontSize: 13, fontWeight: "600", color: "#2477ff" },
  emptyText: { fontSize: 13, color: "#9CA3AF" },
  reviewCard: {
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 10,
    padding: 10,
    backgroundColor: "#fff",
    marginBottom: 8,
  },
  reviewMetaRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  starRow: { flexDirection: "row", alignItems: "center", gap: 4 },
  ratingText: { fontSize: 12, fontWeight: "700", color: "#111827" },
  metaText: { fontSize: 12, color: "#6B7280" },
  reviewBodyText: { fontSize: 14, color: "#374151", lineHeight: 20 },
});

