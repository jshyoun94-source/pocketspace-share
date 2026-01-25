// app/space/[id].tsx
import { Ionicons } from "@expo/vector-icons";
import { Text } from '@/components/Themed';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Dimensions, Image, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { auth, db } from '@/firebase';
import { deleteDoc, doc, onSnapshot, collection, addDoc, query, where, getDocs, deleteDoc as deleteFirestoreDoc } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';

const { width: SCREEN_WIDTH } = Dimensions.get("window");

export default function SpaceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [isFavorite, setIsFavorite] = useState(false);
  const [favoriteId, setFavoriteId] = useState<string | null>(null);

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
        // 즐겨찾기 제거
        await deleteFirestoreDoc(doc(db, 'users', currentUser.uid, 'favorites', favoriteId));
        setIsFavorite(false);
        setFavoriteId(null);
        Alert.alert('완료', '즐겨찾기에서 제거되었습니다.');
      } else {
        // 즐겨찾기 추가
        const docRef = await addDoc(collection(db, 'users', currentUser.uid, 'favorites'), {
          spaceId: id,
          createdAt: new Date(),
        });
        setIsFavorite(true);
        setFavoriteId(docRef.id);
        Alert.alert('완료', '즐겨찾기에 추가되었습니다.');
      }
    } catch (error: any) {
      console.error('즐겨찾기 오류:', error);
      Alert.alert('오류', error?.message ?? '즐겨찾기 처리 중 문제가 발생했습니다.');
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: data?.title ? `${data.title}` : '상세 보기',
          headerBackTitle: "",
          headerLeft: () => (
            <Pressable
              onPress={() => router.back()}
              style={{ marginLeft: 0, padding: 4 }}
            >
              <Ionicons name="close" size={24} color="#111827" />
            </Pressable>
          ),
          headerRight: () => (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              {/* 즐겨찾기 버튼 (내가 등록한 공간이 아닐 때만 표시) */}
              {currentUser && data && data.ownerId !== currentUser.uid && (
                <Pressable onPress={toggleFavorite} style={{ padding: 4 }}>
                  <Ionicons 
                    name={isFavorite ? "star" : "star-outline"} 
                    size={24} 
                    color={isFavorite ? "#FFD700" : "#111827"} 
                  />
                </Pressable>
              )}
              {/* 수정/삭제 버튼 (소유자만) */}
              {data && auth.currentUser && data.ownerId === auth.currentUser.uid && (
                <>
                  <Text onPress={goEdit} style={styles.editBtn}>수정</Text>
                  <Text onPress={handleDelete} style={styles.deleteBtn}>삭제</Text>
                </>
              )}
            </View>
          ),
        }}
      />

      <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
          </View>
        ) : !data ? (
          <Text style={styles.empty}>존재하지 않는 공간입니다.</Text>
        ) : (
          <>
            {/* 사진 */}
            {data.images && data.images.length > 0 && (
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
            )}

            <View style={styles.content}>
              <Text style={styles.title}>{data.title}</Text>

              {/* 가격 */}
              {data.pricePerHour && (
                <View style={styles.priceContainer}>
                  <Text style={styles.price}>
                    {Number(data.pricePerHour).toLocaleString()}원/시간
                  </Text>
                </View>
              )}

              {/* 주소 */}
              <Text style={styles.label}>주소</Text>
              <Text style={styles.text}>{data.address}</Text>

              {/* 설명 */}
              {data.description && (
                <>
                  <Text style={[styles.label, { marginTop: 16 }]}>설명</Text>
                  <Text style={styles.text}>{data.description}</Text>
                </>
              )}

              {/* 카테고리/태그 */}
              {data.tags && data.tags.length > 0 && (
                <>
                  <Text style={[styles.label, { marginTop: 16 }]}>보관 가능한 물품</Text>
                  <View style={styles.tagsContainer}>
                    {data.tags.map((tag: string, index: number) => (
                      <View key={index} style={styles.tag}>
                        <Text style={styles.tagText}>{tag}</Text>
                      </View>
                    ))}
                  </View>
                </>
              )}

              {/* 보관 가능 시간 */}
              {data.schedules && data.schedules.length > 0 && (
                <>
                  <Text style={[styles.label, { marginTop: 16 }]}>보관 가능 시간</Text>
                  {data.schedules.map((schedule: any, index: number) => {
                    // 요일을 한국어로 변환
                    const dayLabels: { [key: string]: string } = {
                      mon: "월",
                      tue: "화",
                      wed: "수",
                      thu: "목",
                      fri: "금",
                      sat: "토",
                      sun: "일",
                    };
                    const koreanDays = schedule.days
                      ? schedule.days.map((day: string) => dayLabels[day.toLowerCase()] || day).join(", ")
                      : "요일 미설정";
                    
                    return (
                      <View key={index} style={styles.scheduleItem}>
                        <Text style={styles.scheduleText}>
                          {koreanDays} {schedule.time?.start || "09"}시 ~ {schedule.time?.end || "18"}시
                        </Text>
                      </View>
                    );
                  })}
                </>
              )}

              {/* 등록일 */}
              {data.createdAt?.toDate && (
                <>
                  <Text style={[styles.label, { marginTop: 16 }]}>등록일</Text>
                  <Text style={styles.muted}>
                    {data.createdAt.toDate().toLocaleString("ko-KR")}
                  </Text>
                </>
              )}

              {/* 내 물건 맡기기 버튼 */}
              {data.ownerId && data.ownerId !== currentUser?.uid && (
                <Pressable
                  style={styles.chatButton}
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
                  <Text style={styles.chatButtonText}>내 물건 맡기기</Text>
                </Pressable>
              )}
              
              {/* 로그인하지 않은 경우에도 버튼 표시 */}
              {!currentUser && (
                <Pressable
                  style={styles.chatButton}
                  onPress={() => {
                    Alert.alert("로그인 필요", "물건을 맡기려면 로그인이 필요합니다.", [
                      { text: "취소", style: "cancel" },
                      { text: "로그인", onPress: () => router.push("/(auth)/login") },
                    ]);
                  }}
                >
                  <Text style={styles.chatButtonText}>내 물건 맡기기</Text>
                </Pressable>
              )}
            </View>
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  contentContainer: { paddingBottom: 20 },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  imageScroll: {
    height: 300,
  },
  image: {
    width: SCREEN_WIDTH,
    height: 300,
    backgroundColor: '#E5E7EB',
  },
  content: {
    padding: 20,
    backgroundColor: '#fff',
  },
  empty: { textAlign: 'center', marginTop: 40, color: '#999' },
  title: { fontSize: 24, fontWeight: '700', marginBottom: 12, color: '#111' },
  priceContainer: {
    marginBottom: 16,
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#EFF6FF',
    borderRadius: 8,
  },
  price: {
    fontSize: 20,
    fontWeight: '700',
    color: '#2563EB',
  },
  label: { fontSize: 14, color: '#6b7280', marginBottom: 6, fontWeight: '600' },
  text: { fontSize: 16, color: '#1f2937', lineHeight: 24 },
  muted: { fontSize: 13, color: '#9ca3af' },
  tagsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 8,
  },
  tag: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: '#F3F4F6',
    borderWidth: 1,
    borderColor: '#E5E7EB',
  },
  tagText: {
    fontSize: 13,
    color: '#374151',
  },
  scheduleItem: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    marginTop: 4,
  },
  scheduleText: {
    fontSize: 14,
    color: '#1f2937',
  },
  editBtn: { color: '#2563eb', fontWeight: '700', paddingHorizontal: 10 },
  deleteBtn: { color: '#ef4444', fontWeight: '700', paddingHorizontal: 10 },
  chatButton: {
    marginTop: 24,
    backgroundColor: '#2477ff',
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  chatButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
});
