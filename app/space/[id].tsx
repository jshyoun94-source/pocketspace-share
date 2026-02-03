// app/space/[id].tsx
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { router, Stack, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { auth, db } from '@/firebase';
import { deleteDoc, doc, onSnapshot, collection, addDoc, query, where, getDocs, deleteDoc as deleteFirestoreDoc, getDoc, updateDoc, increment } from 'firebase/firestore';
import MindSpaceBadge from '@/components/MindSpaceBadge';
import { onAuthStateChanged } from 'firebase/auth';

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const MAP_EMBED_HEIGHT = 160;

// 거리 계산 (미터)
function calcDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

type NearbySpace = {
  id: string;
  title: string;
  address: string;
  pricePerHour?: number;
  priceNegotiable?: boolean;
  images?: string[];
  coords: { lat: number; lng: number };
};

export default function SpaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);
  const [ownerMindSpace, setOwnerMindSpace] = useState<number | null>(null);
  const [ownerProfile, setOwnerProfile] = useState<{
    photoURL: string | null;
    nickname: string | null;
  } | null>(null);
  const [storingCount, setStoringCount] = useState<number>(0);
  const [favoriteCount, setFavoriteCount] = useState<number>(0);
  const [nearbySpaces, setNearbySpaces] = useState<NearbySpace[]>([]);
  const [ownerSpaces, setOwnerSpaces] = useState<NearbySpace[]>([]);
  const [myLocation, setMyLocation] = useState<{ lat: number; lng: number } | null>(null);

  // 사용자 현재 위치 로드
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy.Balanced,
          });
          setMyLocation({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
          });
        }
      } catch {
        setMyLocation(null);
      }
    })();
  }, []);

  // Auth 상태 감지
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (!id) return;
    const ref = doc(db, 'spaces', String(id));
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          setData({ id: snap.id, ...snap.data() });
        } else {
          setData(null);
        }
        setLoading(false);
      },
      (error) => {
        console.error("공간 데이터 불러오기 실패:", error);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [id]);

  // 즐겨찾기 상태 확인
  useEffect(() => {
    if (!id || !currentUser) {
      setIsFavorite(false);
      setFavoriteId(null);
      return;
    }

    const checkFavorite = async () => {
      try {
        const q = query(
          collection(db, 'users', currentUser.uid, 'favorites'),
          where('spaceId', '==', id)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          setIsFavorite(true);
          setFavoriteId(snapshot.docs[0].id);
        } else {
          setIsFavorite(false);
          setFavoriteId(null);
        }
      } catch (error) {
        console.error('즐겨찾기 확인 실패:', error);
      }
    };

    checkFavorite();
  }, [id, currentUser]);

  // 공간등록자(대여자) 프로필 로드
  useEffect(() => {
    if (!data?.ownerId) {
      setOwnerMindSpace(null);
      setOwnerProfile(null);
      return;
    }
    getDoc(doc(db, 'users', data.ownerId)).then((snap) => {
      const d = snap.data();
      setOwnerMindSpace(d?.mindSpace ?? null);
      setOwnerProfile({
        photoURL: d?.profileImage ?? d?.photoURL ?? null,
        nickname: d?.nickname ?? d?.name ?? d?.displayName ?? null,
      });
    }).catch(() => {
      setOwnerMindSpace(null);
      setOwnerProfile(null);
    });
  }, [data?.ownerId]);

  // 즐겨찾기 로컬 변경 후 스냅샷이 이전 값으로 덮어쓰는 것 방지
  const pendingFavoriteDelta = React.useRef<number | null>(null);

  // favoriteCount 동기화 (data에서) — 서버가 반영된 후에만 덮어씀
  useEffect(() => {
    const serverCount = data?.favoriteCount ?? 0;
    const pending = pendingFavoriteDelta.current;
    if (pending === null) {
      setFavoriteCount(serverCount);
      return;
    }
    if (pending === 1 && serverCount >= 1) {
      setFavoriteCount(serverCount);
      pendingFavoriteDelta.current = null;
    } else if (pending === -1 && serverCount >= 0) {
      setFavoriteCount(serverCount);
      pendingFavoriteDelta.current = null;
    }
  }, [data?.favoriteCount]);

  // 조회수 증가 (최초 1회)
  const viewCountIncremented = React.useRef(false);
  useEffect(() => {
    if (!id || !data?.id || viewCountIncremented.current) return;
    viewCountIncremented.current = true;
    try {
      updateDoc(doc(db, "spaces", String(id)), {
        viewCount: increment(1),
        updatedAt: new Date(),
      }).catch(() => {});
    } catch {}
  }, [id, data?.id]);

  // 보관중 갯수 (소유자만 - transactions)
  useEffect(() => {
    if (!id || !data?.ownerId || !currentUser || data.ownerId !== currentUser.uid) {
      setStoringCount(0);
      return;
    }
    const q = query(
      collection(db, "transactions"),
      where("spaceId", "==", String(id)),
      where("ownerId", "==", currentUser.uid),
      where("status", "==", "보관중")
    );
    const unsub = onSnapshot(
      q,
      (snap) => setStoringCount(snap.size),
      () => setStoringCount(0)
    );
    return () => unsub();
  }, [id, data?.ownerId, currentUser?.uid]);

  // 가까운 보관 장소
  const loadNearbySpaces = useCallback(async () => {
    if (!data?.coords?.lat || !data?.coords?.lng || !id) return;
    try {
      const snap = await getDocs(collection(db, "spaces"));
      const list: NearbySpace[] = [];
      snap.forEach((d) => {
        if (d.id === String(id)) return;
        const x: any = d.data();
        if (!x?.coords?.lat || !x?.coords?.lng) return;
        list.push({
          id: d.id,
          title: x.title ?? "공간",
          address: x.address ?? "",
          pricePerHour: x.pricePerHour,
          priceNegotiable: x.priceNegotiable,
          images: x.images,
          coords: { lat: x.coords.lat, lng: x.coords.lng },
        });
      });
      const base = data.coords;
      list.sort((a, b) => calcDistance(base.lat, base.lng, a.coords.lat, a.coords.lng) - calcDistance(base.lat, base.lng, b.coords.lat, b.coords.lng));
      setNearbySpaces(list.slice(0, 10));
    } catch {
      setNearbySpaces([]);
    }
  }, [data?.coords, id]);

  useEffect(() => {
    loadNearbySpaces();
  }, [loadNearbySpaces]);

  // 공간대여자가 등록한 다른 보관 장소
  const loadOwnerSpaces = useCallback(async () => {
    if (!data?.ownerId || !id) return;
    try {
      const q = query(
        collection(db, "spaces"),
        where("ownerId", "==", data.ownerId)
      );
      const snap = await getDocs(q);
      const list: NearbySpace[] = [];
      snap.forEach((d) => {
        if (d.id === String(id)) return;
        const x: any = d.data();
        if (!x?.coords?.lat || !x?.coords?.lng) return;
        list.push({
          id: d.id,
          title: x.title ?? "공간",
          address: x.address ?? "",
          pricePerHour: x.pricePerHour,
          priceNegotiable: x.priceNegotiable,
          images: x.images,
          coords: { lat: x.coords.lat, lng: x.coords.lng },
        });
      });
      setOwnerSpaces(list);
    } catch {
      setOwnerSpaces([]);
    }
  }, [data?.ownerId, id]);

  useEffect(() => {
    loadOwnerSpaces();
  }, [loadOwnerSpaces]);

  const handleDelete = async () => {
    if (!id) return;
    try {
      await deleteDoc(doc(db, 'spaces', String(id)));
      Alert.alert('삭제 완료', '공간이 삭제되었습니다.');
      router.back();
    } catch (e: any) {
      Alert.alert('오류', e?.message ?? '삭제 중 문제가 발생했습니다.');
    }
  };

  const goEdit = () => {
    if (!data?.id) return;
    router.push(`/space/${data.id}/edit`);
  };

  const toggleFavorite = async () => {
    if (!currentUser) {
      Alert.alert("로그인 필요", "즐겨찾기를 사용하려면 로그인이 필요합니다.", [
        { text: "취소", style: "cancel" },
        { text: "로그인", onPress: () => router.push("/(auth)/login") },
      ]);
      return;
    }

    if (!id) return;

    try {
      if (isFavorite && favoriteId) {
        await deleteFirestoreDoc(doc(db, 'users', currentUser.uid, 'favorites', favoriteId));
        setIsFavorite(false);
        setFavoriteId(null);
        pendingFavoriteDelta.current = -1;
        setFavoriteCount((c) => Math.max(0, c - 1));
        // favoriteCount 갱신은 Cloud Function(onFavoriteDeleted)에서 처리
        Alert.alert('완료', '즐겨찾기에서 제거되었습니다.');
      } else {
        const docRef = await addDoc(collection(db, 'users', currentUser.uid, 'favorites'), {
          spaceId: id,
          createdAt: new Date(),
        });
        setIsFavorite(true);
        setFavoriteId(docRef.id);
        pendingFavoriteDelta.current = 1;
        setFavoriteCount((c) => c + 1);
        // favoriteCount 갱신은 Cloud Function(onFavoriteCreated)에서 처리
        Alert.alert('완료', '즐겨찾기에 추가되었습니다.');
      }
    } catch (error: any) {
      console.error('즐겨찾기 오류:', error);
      Alert.alert('오류', error?.message ?? '즐겨찾기 처리 중 문제가 발생했습니다.');
    }
  };

  const showBottomBar = data && (!data.ownerId || data.ownerId !== currentUser?.uid);

  return (
    <View style={styles.screenRoot}>
      <Stack.Screen
        options={{
          title: "",
          headerTransparent: true,
          headerBackTitle: "",
          headerTintColor: "#111827",
          headerStyle: { backgroundColor: "transparent" },
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={{ marginLeft: 0, padding: 4 }}
            >
              <Ionicons name="close" size={24} color="#111827" />
            </Pressable>
          ),
          headerRight: () => null,
        }}
      />

      <View style={styles.wrapper}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={[styles.contentContainer, showBottomBar && { paddingBottom: 24 + 80 + (insets.bottom || 0) }]}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}
      >
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
          </View>
        ) : !data ? (
          <Text style={styles.empty}>존재하지 않는 공간입니다.</Text>
        ) : (
          <View style={[
            styles.content,
            !(data.images?.length) && { paddingTop: insets.top + 56 }
          ]}>
            {/* 사진: 가로 여백 없이 전체 채움 */}
            {data.images && data.images.length > 0 ? (
              <View style={styles.imageWrapper}>
                <ScrollView
                  horizontal
                  pagingEnabled
                  showsHorizontalScrollIndicator={false}
                  style={styles.imageScroll}
                >
                  {data.images.map((uri: string, index: number) => (
                    <Image
                      key={index}
                      source={{ uri }}
                      style={styles.image}
                      resizeMode="cover"
                    />
                  ))}
                </ScrollView>
              </View>
            ) : null}

            <View style={[styles.mainContent, (data.images?.length ?? 0) > 0 && { marginTop: 0 }]}>
              {/* 공간등록자 프로필 */}
              <View style={styles.ownerRow}>
                <View style={styles.ownerLeft}>
                  {ownerProfile?.photoURL ? (
                    <Image source={{ uri: ownerProfile.photoURL }} style={styles.ownerAvatar} />
                  ) : (
                    <View style={styles.ownerAvatarPlaceholder}>
                      <Ionicons name="person" size={20} color="#9CA3AF" />
                    </View>
                  )}
                  <Text style={styles.ownerNickname}>
                    {ownerProfile?.nickname || "공간등록자"}
                  </Text>
                </View>
                {ownerMindSpace != null && (
                  <View style={styles.mindSpaceBlock}>
                    <MindSpaceBadge mindSpace={ownerMindSpace} size="small" />
                    <Text style={styles.mindSpaceLabel}>마음공간</Text>
                  </View>
                )}
              </View>

              {/* 가격 */}
              <View style={styles.priceRow}>
                {data.priceNegotiable ? (
                  <Text style={styles.priceNegotiable}>기타협의</Text>
                ) : data.pricePerHour ? (
                  <Text style={styles.price}>
                    {Number(data.pricePerHour).toLocaleString()}원/시간
                  </Text>
                ) : null}
              </View>

              {/* 보관중 (소유자만) */}
              {data.ownerId === currentUser?.uid && storingCount > 0 && (
                <View style={styles.statusRow}>
                  <Text style={styles.storingCount}>보관중 {storingCount}건</Text>
                </View>
              )}

              {/* 상호명/보관장소 (도로명주소 위) + 도로명주소 + 보관가능시간 */}
              <View style={styles.locationSection}>
                <View style={styles.infoRow}>
                  <Ionicons name="location-outline" size={16} color="#6B7280" />
                  <Text style={styles.infoText}>
                    {[data.title, data.placeType ?? data.tags?.[0]].filter(Boolean).join(" / ") || "위치 정보"}
                  </Text>
                </View>
                {data.address && (
                  <View style={styles.infoRow}>
                    <Ionicons name="navigate-outline" size={16} color="#6B7280" />
                    <Text style={styles.infoText}>{data.address}</Text>
                  </View>
                )}
                {/* 보관가능시간 (도로명주소 아래) */}
                {data.schedules && data.schedules.length > 0 && (
                  <>
                    {data.schedules.map((schedule: any, index: number) => {
                      const dayLabels: { [key: string]: string } = {
                        mon: "월", tue: "화", wed: "수", thu: "목",
                        fri: "금", sat: "토", sun: "일",
                      };
                      const koreanDays = schedule.days
                        ? schedule.days.map((d: string) => dayLabels[d.toLowerCase()] || d).join(", ")
                        : "요일 미설정";
                      const timeStr = `${schedule.time?.start || "09"}~${schedule.time?.end || "18"}시`;
                      return (
                        <View key={index} style={styles.scheduleRow}>
                          <Ionicons name="time-outline" size={16} color="#6B7280" />
                          <Text style={styles.scheduleText}>
                            {koreanDays} {timeStr}
                          </Text>
                        </View>
                      );
                    })}
                  </>
                )}
              </View>

              {/* 설명 (보관가능시간과 지도 사이) */}
              {data.description ? (
                <View style={styles.section}>
                  <Text style={styles.descText}>{data.description}</Text>
                </View>
              ) : null}

              {/* 조회수 · 즐겨찾기 수 (지도 없을 때) */}
              {(!data.coords?.lat || !data.coords?.lng) && (
                <View style={styles.statsRow}>
                  <Text style={styles.statsText}>조회수 {(data.viewCount ?? 0)}</Text>
                  <Text style={styles.statsDot}>·</Text>
                  <Text style={styles.statsText}>즐겨찾기 수 {Math.max(0, favoriteCount)}</Text>
                </View>
              )}

              {/* 지도 (마커) + 지도보기 버튼 (지도 안에) */}
              {data.coords?.lat && data.coords?.lng && (
                <View style={styles.mapSection}>
                  <View style={styles.mapEmbed}>
                    <MapView
                      style={styles.mapEmbedView}
                      provider={Platform.OS === "android" ? PROVIDER_GOOGLE : undefined}
                      initialRegion={{
                        latitude: data.coords.lat,
                        longitude: data.coords.lng,
                        latitudeDelta: 0.006,
                        longitudeDelta: 0.006,
                      }}
                      scrollEnabled={false}
                      zoomEnabled={false}
                      mapType="standard"
                    >
                      <Marker
                        coordinate={{ latitude: data.coords.lat, longitude: data.coords.lng }}
                        title={data.title}
                      />
                    </MapView>
                    <Pressable
                      style={styles.mapViewBtnInMap}
                      onPress={() =>
                        router.push({
                          pathname: `/space/${id}/map`,
                          params: {
                            lat: String(data.coords.lat),
                            lng: String(data.coords.lng),
                            address: data.address ?? "",
                            title: data.title ?? "",
                          },
                        } as any)
                      }
                    >
                      <Text style={styles.mapViewBtnTextInMap}>지도 보기</Text>
                      <Ionicons name="expand-outline" size={16} color="#111827" />
                    </Pressable>
                  </View>
                  {/* 조회수 · 즐겨찾기 수 (지도 아래) */}
                  <View style={styles.statsRow}>
                    <Text style={styles.statsText}>조회수 {(data.viewCount ?? 0)}</Text>
                    <Text style={styles.statsDot}>·</Text>
                    <Text style={styles.statsText}>즐겨찾기 수 {Math.max(0, favoriteCount)}</Text>
                  </View>
                </View>
              )}

              {/* 가까운 보관 장소 */}
              {nearbySpaces.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.nearbyTitle}>보고 있는 장소와 가까운 보관 장소</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.nearbyScroll}
                  >
                    {nearbySpaces.map((s) => {
                      const base = myLocation || data?.coords;
                      const distM = base ? Math.round(calcDistance(base.lat, base.lng, s.coords.lat, s.coords.lng)) : 0;
                      const priceStr = s.priceNegotiable ? "기타협의" : s.pricePerHour ? `${s.pricePerHour.toLocaleString()}원/시간` : "";
                      return (
                        <Pressable
                          key={s.id}
                          style={styles.nearbyCard}
                          onPress={() => router.push(`/space/${s.id}`)}
                        >
                          {s.images?.[0] ? (
                            <Image source={{ uri: s.images[0] }} style={styles.nearbyImage} />
                          ) : (
                            <View style={[styles.nearbyImage, styles.nearbyImagePlaceholder]}>
                              <Ionicons name="location" size={28} color="#9CA3AF" />
                            </View>
                          )}
                          <Text style={styles.nearbyCardTitle} numberOfLines={1}>{s.title}</Text>
                          <Text style={styles.nearbyCardPrice}>
                            {[priceStr, distM > 0 ? `${distM}m` : ""].filter(Boolean).join(" ")}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* 공간대여자의 닉네임님의 보관 장소 */}
              {ownerSpaces.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.nearbyTitle}>
                    {ownerProfile?.nickname || "공간대여자"}님의 보관 장소
                  </Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.nearbyScroll}
                  >
                    {ownerSpaces.map((s) => {
                      const base = myLocation || data?.coords;
                      const distM = base ? Math.round(calcDistance(base.lat, base.lng, s.coords.lat, s.coords.lng)) : 0;
                      const priceStr = s.priceNegotiable ? "기타협의" : s.pricePerHour ? `${s.pricePerHour.toLocaleString()}원/시간` : "";
                      return (
                        <Pressable
                          key={s.id}
                          style={styles.nearbyCard}
                          onPress={() => router.push(`/space/${s.id}`)}
                        >
                          {s.images?.[0] ? (
                            <Image source={{ uri: s.images[0] }} style={styles.nearbyImage} />
                          ) : (
                            <View style={[styles.nearbyImage, styles.nearbyImagePlaceholder]}>
                              <Ionicons name="location" size={28} color="#9CA3AF" />
                            </View>
                          )}
                          <Text style={styles.nearbyCardTitle} numberOfLines={1}>{s.title}</Text>
                          <Text style={styles.nearbyCardPrice}>
                            {[priceStr, distM > 0 ? `${distM}m` : ""].filter(Boolean).join(" ")}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </ScrollView>
                </View>
              )}
            </View>
          </View>
        )}
      </ScrollView>

      {/* 고정 하단 바 (별 + 내 물건 맡기기) - 소유자가 아닐 때만 */}
      {showBottomBar && (
        <SafeAreaView style={styles.fixedBottomBarSafe} edges={['bottom']}>
          <View style={styles.fixedBottomBar}>
            <Pressable style={styles.fixedStarBtn} onPress={toggleFavorite}>
              <Ionicons
                name={isFavorite ? "star" : "star-outline"}
                size={26}
                color={isFavorite ? "#FFD700" : "#374151"}
              />
            </Pressable>
            <Pressable
              style={styles.fixedActionBtn}
              onPress={() => {
                if (!currentUser) {
                  Alert.alert("로그인 필요", "물건을 맡기려면 로그인이 필요합니다.", [
                    { text: "취소", style: "cancel" },
                    { text: "로그인", onPress: () => router.push("/(auth)/login") },
                  ]);
                  return;
                }
                router.push(`/space/${id}/chat`);
              }}
            >
              <Text style={styles.fixedActionBtnText}>내 물건 맡기기</Text>
            </Pressable>
          </View>
        </SafeAreaView>
      )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screenRoot: { flex: 1, backgroundColor: '#fff' },
  wrapper: { flex: 1 },
  scrollView: { flex: 1 },
  contentContainer: { paddingBottom: 24 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  content: {
    flex: 1,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
  },
  imageWrapper: {
    width: SCREEN_WIDTH,
    marginHorizontal: -16,
    alignSelf: 'stretch',
  },
  imageScroll: { height: 240 },
  image: {
    width: SCREEN_WIDTH,
    height: 240,
    backgroundColor: '#E5E7EB',
  },
  mainContent: {
    marginTop: 0,
    paddingTop: 20,
    paddingBottom: 16,
  },
  empty: { textAlign: 'center', marginTop: 40, color: '#999' },
  ownerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  ownerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  ownerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5E7EB',
  },
  ownerAvatarPlaceholder: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ownerNickname: { fontSize: 15, fontWeight: '600', color: '#111827' },
  mindSpaceBlock: {
    alignItems: 'center',
    alignSelf: 'center',
  },
  mindSpaceLabel: {
    fontSize: 10,
    color: '#6B7280',
    marginTop: 2,
  },
  locationSection: { marginBottom: 4 },
  priceRow: { marginBottom: 16 },
  price: { fontSize: 18, fontWeight: '700', color: '#2477ff' },
  priceNegotiable: { fontSize: 16, fontWeight: '600', color: '#6B7280' },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  availabilityBadge: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  availabilityActive: { backgroundColor: '#DCFCE7', borderWidth: 1, borderColor: '#22C55E' },
  availabilityInactive: { backgroundColor: '#FEE2E2', borderWidth: 1, borderColor: '#EF4444' },
  availabilityText: { fontSize: 13, fontWeight: '600' },
  availabilityTextActive: { color: '#166534' },
  availabilityTextInactive: { color: '#B91C1C' },
  storingCount: { fontSize: 13, color: '#6B7280' },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    marginBottom: 16,
  },
  statsText: { fontSize: 13, color: '#6B7280' },
  statsDot: { fontSize: 13, color: '#9CA3AF' },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  infoText: { fontSize: 14, color: '#374151', flex: 1 },
  mapSection: { marginTop: 16 },
  mapEmbed: {
    height: MAP_EMBED_HEIGHT,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#E5E7EB',
    position: 'relative',
  },
  mapEmbedView: { flex: 1, width: '100%', height: '100%' },
  mapViewBtnInMap: {
    position: 'absolute',
    right: 10,
    bottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#fff',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  mapViewBtnTextInMap: { fontSize: 14, fontWeight: '600', color: '#111827' },
  section: { marginTop: 20 },
  nearbyTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#111827',
    marginBottom: 12,
  },
  nearbyScroll: { gap: 12, paddingRight: 20 },
  nearbyCard: {
    width: 120,
  },
  nearbyImage: {
    width: 120,
    height: 90,
    borderRadius: 10,
    backgroundColor: '#F3F4F6',
  },
  nearbyImagePlaceholder: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  nearbyCardTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#111827',
    marginTop: 6,
  },
  nearbyCardPrice: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },
  descText: { fontSize: 15, color: '#1f2937', lineHeight: 22 },
  scheduleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  scheduleText: { fontSize: 14, color: '#374151', flex: 1 },
  fixedBottomBarSafe: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E5E7EB',
    zIndex: 999,
    elevation: 999,
  },
  fixedBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  fixedStarBtn: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
  },
  fixedActionBtn: {
    flex: 1,
    backgroundColor: '#2477ff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fixedActionBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
