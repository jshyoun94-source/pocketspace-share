// app/favorites.tsx
import { Ionicons } from "@expo/vector-icons";
import { router, Stack } from "expo-router";
import { collection, getDocs, query, where } from "firebase/firestore";
import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type FavoriteSpace = {
  id: string;
  favoriteId: string;
  title: string;
  pricePerHour: number;
  address: string;
  images?: string[];
  tags?: string[];
};

export default function FavoritesScreen() {
  const [favorites, setFavorites] = useState<FavoriteSpace[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFavorites();
  }, []);

  const loadFavorites = async () => {
    if (!auth.currentUser) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // 사용자의 즐겨찾기 목록 가져오기
      const favoritesRef = collection(db, "users", auth.currentUser.uid, "favorites");
      const favoritesSnapshot = await getDocs(favoritesRef);
      
      const favoriteSpaces: FavoriteSpace[] = [];
      
      for (const favoriteDoc of favoritesSnapshot.docs) {
        const favoriteData = favoriteDoc.data();
        const spaceId = favoriteData.spaceId;
        
        if (!spaceId) continue;
        
        // 공간 정보 가져오기
        const spaceDoc = await getDoc(doc(db, "spaces", spaceId));
        if (spaceDoc.exists()) {
          const spaceData = spaceDoc.data();
          favoriteSpaces.push({
            id: spaceId,
            favoriteId: favoriteDoc.id,
            title: spaceData.title || "제목 없음",
            pricePerHour: spaceData.pricePerHour || 0,
            priceNegotiable: spaceData.priceNegotiable === true,
            placeType: spaceData.placeType ?? spaceData.tags?.[0] ?? null,
            address: spaceData.address || "",
            images: spaceData.images || [],
            tags: spaceData.tags || [],
          });
        }
      }
      
      setFavorites(favoriteSpaces);
    } catch (error: any) {
      console.error("즐겨찾기 불러오기 실패:", error);
      Alert.alert("오류", "즐겨찾기를 불러오는 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const goToSpaceDetail = (spaceId: string) => {
    router.push(`/space/${spaceId}`);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "즐겨찾기",
          headerBackTitle: "",
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={{ marginLeft: 0, padding: 4 }}
            >
              <Ionicons name="chevron-back" size={24} color="#111827" />
            </Pressable>
          ),
        }}
      />

      <View style={styles.container}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
          </View>
        ) : favorites.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="star-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>즐겨찾기한 공간이 없습니다</Text>
            <Text style={styles.emptySubtext}>공간 상세 화면에서 별표를 눌러 즐겨찾기에 추가하세요</Text>
          </View>
        ) : (
          <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
            {favorites.map((space) => (
              <Pressable
                key={space.id}
                style={styles.spaceCard}
                onPress={() => goToSpaceDetail(space.id)}
              >
                {space.images && space.images.length > 0 ? (
                  <Image
                    source={{ uri: space.images[0] }}
                    style={styles.spaceImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={[styles.spaceImage, styles.placeholderImage]}>
                    <Ionicons name="image-outline" size={32} color="#D1D5DB" />
                  </View>
                )}
                
                <View style={styles.spaceInfo}>
                  <Text style={styles.spaceTitle} numberOfLines={1}>
                    {space.title}
                  </Text>
                  <Text style={styles.spaceAddress} numberOfLines={1}>
                    {space.address}
                  </Text>
                  {(space.pricePerHour > 0 || space.priceNegotiable) && (
                    <Text style={styles.spacePrice}>
                      {space.priceNegotiable ? "기타협의" : `${Number(space.pricePerHour).toLocaleString()}원/시간`}
                    </Text>
                  )}
                  {(space.placeType || (space.tags && space.tags.length > 0)) && (
                    <View style={styles.tagsContainer}>
                      <View style={styles.tag}>
                        <Text style={styles.tagText}>{space.placeType ?? space.tags?.[0] ?? "기타"}</Text>
                      </View>
                    </View>
                  )}
                </View>
              </Pressable>
            ))}
          </ScrollView>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
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
    textAlign: "center",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
  },
  spaceCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    marginBottom: 16,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "#E5E7EB",
    flexDirection: "row",
  },
  spaceImage: {
    width: 120,
    height: 120,
    backgroundColor: "#F3F4F6",
  },
  placeholderImage: {
    justifyContent: "center",
    alignItems: "center",
  },
  spaceInfo: {
    flex: 1,
    padding: 16,
    justifyContent: "space-between",
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
    marginBottom: 8,
  },
  spacePrice: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2563EB",
    marginBottom: 8,
  },
  tagsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
  },
  tag: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  tagText: {
    fontSize: 12,
    color: "#374151",
  },
});
