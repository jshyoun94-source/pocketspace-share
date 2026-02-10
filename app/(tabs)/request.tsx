// app/(tabs)/request.tsx
import { Ionicons } from "@expo/vector-icons";
import * as Location from "expo-location";
import { Stack, useRouter } from "expo-router";
import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  orderBy,
  limit,
  Timestamp,
  onSnapshot,
  deleteDoc,
  doc,
  updateDoc,
  getDoc,
  setDoc,
  serverTimestamp,
  deleteField,
} from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { auth, db } from "../../firebase";
import { canPostToday } from "../../utils/checkDailyPostLimit";
import * as FileSystem from "expo-file-system/legacy";
import { uploadBase64ToStorage } from "../../utils/uploadImageToStorage";
import * as ImagePicker from "expo-image-picker";
import { onAuthStateChanged } from "firebase/auth";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Request = {
  id: string;
  authorId: string;
  authorName: string;
  title: string;
  content: string;
  price: number;
  images?: string[];
  location: { lat: number; lng: number };
  createdAt: Timestamp;
  status: "open" | "in_progress" | "completed" | "cancelled";
  acceptedBy?: string;
};

export default function RequestScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [requests, setRequests] = useState<Request[]>([]);
  const [loading, setLoading] = useState(true);
  const [writeModalVisible, setWriteModalVisible] = useState(false);
  const [requestTitle, setRequestTitle] = useState("");
  const [requestContent, setRequestContent] = useState("");
  const [requestPrice, setRequestPrice] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [requestUnreadCount, setRequestUnreadCount] = useState(0);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return unsubscribe;
  }, []);

  // 현재 위치 가져오기 (타임아웃·폴백으로 iPad 등에서 무한 로딩 방지)
  const DEFAULT_LOCATION = { lat: 37.5665, lng: 126.978 }; // 서울 시청
  useEffect(() => {
    let cancelled = false;
    const timeout = setTimeout(() => {
      if (!cancelled) {
        setCurrentLocation((prev) => prev ?? DEFAULT_LOCATION);
      }
    }, 6000); // 6초 후에도 위치 못 받으면 기본값 사용

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (cancelled) return;
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({});
          if (!cancelled) {
            setCurrentLocation({
              lat: loc.coords.latitude,
              lng: loc.coords.longitude,
            });
          }
        } else {
          setCurrentLocation(DEFAULT_LOCATION);
        }
      } catch (e) {
        console.warn("위치 가져오기 실패:", e);
        if (!cancelled) setCurrentLocation(DEFAULT_LOCATION);
      } finally {
        clearTimeout(timeout);
      }
    })();

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, []);

  // 동네부탁 채팅 안 읽은 개수 구독 (data는 스냅 시점의 객체로 저장해야 나중에 안전히 참조 가능)
  const ownerChatsRef = useRef<{ id: string; data: Record<string, unknown> | undefined }[]>([]);
  const customerChatsRef = useRef<{ id: string; data: Record<string, unknown> | undefined }[]>([]);
  useEffect(() => {
    if (!currentUser) {
      setRequestUnreadCount(0);
      return;
    }
    const uid = currentUser.uid;
    const chatsRef = collection(db, "chats");
    const ownerQ = query(chatsRef, where("ownerId", "==", uid));
    const customerQ = query(chatsRef, where("customerId", "==", uid));

    const computeAndSet = () => {
      const ownerDocs = ownerChatsRef.current;
      const customerDocs = customerChatsRef.current;
      let total = 0;
      const seen = new Set<string>();
      ownerDocs.forEach((d) => {
        const data = d.data;
        if (!data || !data.requestId || seen.has(d.id)) return;
        seen.add(d.id);
        total += (data.unreadByOwner as number) ?? 0;
      });
      customerDocs.forEach((d) => {
        const data = d.data;
        if (!data || !data.requestId || seen.has(d.id)) return;
        seen.add(d.id);
        total += (data.unreadByCustomer as number) ?? 0;
      });
      setRequestUnreadCount(total);
    };

    const unsubOwner = onSnapshot(
      ownerQ,
      (snap) => {
        ownerChatsRef.current = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
        computeAndSet();
      },
      () => setRequestUnreadCount(0)
    );
    const unsubCustomer = onSnapshot(
      customerQ,
      (snap) => {
        customerChatsRef.current = snap.docs.map((d) => ({ id: d.id, data: d.data() }));
        computeAndSet();
      },
      () => setRequestUnreadCount(0)
    );
    return () => {
      unsubOwner();
      unsubCustomer();
    };
  }, [currentUser?.uid]);

  // 거리 계산
  const calculateDistance = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number => {
    const R = 6371000;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  };

  // 부탁 목록 로드
  useEffect(() => {
    if (!currentLocation) return;

    const loadRequests = async () => {
      try {
        setLoading(true);
        const requestsRef = collection(db, "neighborhoodRequests");
        let q = query(requestsRef, orderBy("createdAt", "desc"), limit(100));

        const snapshot = await getDocs(q);
        const requestsList: Request[] = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const requestLocation = data.location;
          if (!requestLocation) return;

          const distance = calculateDistance(
            currentLocation.lat,
            currentLocation.lng,
            requestLocation.lat,
            requestLocation.lng
          );

          // 5km 이내만 포함
          if (distance <= 5000) {
            requestsList.push({
              id: docSnap.id,
              authorId: data.authorId,
              authorName: data.authorName || "익명",
              title: data.title,
              content: data.content,
              price: data.price || 0,
              images: data.images || [],
              location: requestLocation,
              createdAt: data.createdAt,
              status: data.status || "open",
              acceptedBy: data.acceptedBy,
            });
          }
        });

        setRequests(requestsList);
      } catch (e) {
        console.error("부탁 목록 로드 실패:", e);
      } finally {
        setLoading(false);
      }
    };

    loadRequests();

    // 실시간 업데이트
    const requestsRef = collection(db, "neighborhoodRequests");
    const q = query(requestsRef, orderBy("createdAt", "desc"), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const requestsList: Request[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const requestLocation = data.location;
        if (!requestLocation || !currentLocation) return;

        const distance = calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          requestLocation.lat,
          requestLocation.lng
        );

        if (distance <= 5000) {
          requestsList.push({
            id: docSnap.id,
            authorId: data.authorId,
            authorName: data.authorName || "익명",
            title: data.title,
            content: data.content,
            price: data.price || 0,
            images: data.images || [],
            location: requestLocation,
            createdAt: data.createdAt,
            status: data.status || "open",
            acceptedBy: data.acceptedBy,
          });
        }
      });

      setRequests(requestsList);
    });

    return () => unsubscribe();
  }, [currentLocation, currentUser]);

  // 이미지 선택
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const uris = result.assets.map((asset) => asset.uri);
        setSelectedImages((prev) => [...prev, ...uris].slice(0, 5));
      }
    } catch (e) {
      console.error("이미지 선택 실패:", e);
    }
  };

  // 부탁 등록
  const handlePost = async () => {
    if (!requestTitle.trim() || !requestContent.trim()) {
      Alert.alert("알림", "제목과 내용을 입력해주세요.");
      return;
    }

    const price = parseInt(requestPrice.replace(/[^0-9]/g, ""), 10);
    if (isNaN(price) || price < 0) {
      Alert.alert("알림", "올바른 금액을 입력해주세요.");
      return;
    }

    if (!currentUser || !currentLocation) {
      Alert.alert("알림", "로그인 및 위치 정보가 필요합니다.");
      return;
    }

    try {
      setPosting(true);

      // 이미지 업로드
      const uploadedImageUrls: string[] = [];
      for (const localUri of selectedImages) {
        try {
          const base64 = await FileSystem.readAsStringAsync(localUri, {
            encoding: "base64",
          });
          if (!base64) continue;
          const fileName = `requests/${currentUser.uid}/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
          const downloadURL = await uploadBase64ToStorage(
            base64,
            fileName,
            "image/jpeg"
          );
          uploadedImageUrls.push(downloadURL);
        } catch (e) {
          console.error("이미지 업로드 실패:", e);
        }
      }

      // 사용자 정보 가져오기
      const userDoc = await getDocs(
        query(collection(db, "users"), where("__name__", "==", currentUser.uid))
      );
      let authorName = "익명";
      if (!userDoc.empty) {
        const userData = userDoc.docs[0].data();
        authorName = userData.nickname || userData.name || "익명";
      }

      const canPost = await canPostToday(db, "neighborhoodRequests", "authorId", currentUser.uid);
      if (!canPost) {
        Alert.alert("안내", "하루에 5건까지 등록이 가능합니다.");
        setPosting(false);
        return;
      }

      await addDoc(collection(db, "neighborhoodRequests"), {
        authorId: currentUser.uid,
        authorName,
        title: requestTitle.trim(),
        content: requestContent.trim(),
        price,
        images: uploadedImageUrls,
        location: currentLocation,
        createdAt: Timestamp.now(),
        status: "open",
      });

      setRequestTitle("");
      setRequestContent("");
      setRequestPrice("");
      setSelectedImages([]);
      setWriteModalVisible(false);
      Alert.alert("완료", "부탁이 등록되었습니다.");
    } catch (e: any) {
      console.error("부탁 등록 실패:", e);
      Alert.alert("오류", "부탁 등록에 실패했습니다.");
    } finally {
      setPosting(false);
    }
  };

  // 부탁 수락 → 채팅 생성 후 채팅 목록/채팅방으로 이동 가능
  const handleAccept = async (request: Request) => {
    if (!currentUser) {
      Alert.alert("로그인 필요", "부탁을 수락하려면 로그인이 필요합니다.", [
        { text: "취소", style: "cancel" },
        { text: "로그인", onPress: () => router.push("/(auth)/login") },
      ]);
      return;
    }

    Alert.alert("부탁 수락", "이 부탁을 수락하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "수락",
        onPress: async () => {
          try {
            await updateDoc(doc(db, "neighborhoodRequests", request.id), {
              status: "in_progress",
              acceptedBy: currentUser.uid,
            });

            // 동네부탁 채팅 생성 (이미 있으면 스킵)
            const chatsRef = collection(db, "chats");
            const existing = await getDocs(
              query(chatsRef, where("requestId", "==", request.id))
            );
            let chatId: string | null = null;
            if (!existing.empty) {
              chatId = existing.docs[0].id;
            } else {
              const userSnap = await getDoc(doc(db, "users", currentUser.uid));
              const accepterName =
                userSnap.data()?.nickname ||
                userSnap.data()?.name ||
                "사용자";
              const chatRef = await addDoc(chatsRef, {
                requestId: request.id,
                spaceId: request.id,
                spaceTitle: "동네부탁",
                spaceAddress: "",
                spaceImages: [],
                ownerId: request.authorId,
                ownerName: request.authorName,
                customerId: currentUser.uid,
                customerName: accepterName,
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
              chatId = chatRef.id;
              await addDoc(
                collection(db, "chats", chatRef.id, "messages"),
                {
                  text: "부탁이 수락되어 채팅이 시작되었습니다.",
                  senderId: "system",
                  type: "system",
                  createdAt: serverTimestamp(),
                }
              );
              await updateDoc(doc(db, "chats", chatRef.id), {
                lastMessage: "부탁이 수락되어 채팅이 시작되었습니다.",
                lastMessageTime: serverTimestamp(),
                updatedAt: serverTimestamp(),
              });
            }

            Alert.alert("완료", "부탁을 수락했습니다. 채팅을 통해 연락하세요.", [
              { text: "채팅하기", onPress: () => chatId && router.push(`/chat/${chatId}` as any) },
              { text: "확인" },
            ]);
          } catch (e) {
            console.error("부탁 수락 실패:", e);
            Alert.alert("오류", "부탁 수락에 실패했습니다.");
          }
        },
      },
    ]);
  };

  // 게시자: 부탁 글 삭제
  const handleDelete = (request: Request) => {
    if (request.authorId !== currentUser?.uid) return;
    Alert.alert("부탁 삭제", "이 부탁 글을 삭제하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "삭제",
        style: "destructive",
        onPress: async () => {
          try {
            await deleteDoc(doc(db, "neighborhoodRequests", request.id));
            Alert.alert("완료", "삭제되었습니다.");
          } catch (e) {
            console.error("부탁 삭제 실패:", e);
            Alert.alert("오류", "삭제에 실패했습니다.");
          }
        },
      },
    ]);
  };

  // 게시자: 진행중 → 다시 받기 (상태 되돌리기)
  const handleResetStatus = (request: Request) => {
    if (request.authorId !== currentUser?.uid || request.status !== "in_progress") return;
    Alert.alert(
      "다시 받기",
      "진행을 취소하고 새로운 분의 수락을 다시 받으시겠습니까? (기존에 수락한 분과의 채팅은 그대로 유지됩니다.)",
      [
        { text: "취소", style: "cancel" },
        {
          text: "다시 받기",
          onPress: async () => {
            try {
              await updateDoc(doc(db, "neighborhoodRequests", request.id), {
                status: "open",
                acceptedBy: deleteField(),
              });
              Alert.alert("완료", "다시 수락을 받을 수 있습니다.");
            } catch (e) {
              console.error("상태 되돌리기 실패:", e);
              Alert.alert("오류", "처리에 실패했습니다.");
            }
          },
        },
      ]
    );
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "open":
        return "#10B981";
      case "in_progress":
        return "#F59E0B";
      case "completed":
        return "#6B7280";
      case "cancelled":
        return "#EF4444";
      default:
        return "#6B7280";
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case "open":
        return "모집중";
      case "in_progress":
        return "진행중";
      case "completed":
        return "완료";
      case "cancelled":
        return "취소됨";
      default:
        return status;
    }
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "동네부탁",
          headerStyle: { backgroundColor: "#fff" },
          headerTitleStyle: { fontWeight: "700", fontSize: 18 },
        }}
      />

      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        {loading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
          </View>
        ) : (
          <FlatList
            data={requests}
            keyExtractor={(item) => item.id}
            contentContainerStyle={[
              styles.listContent,
              {
                paddingBottom:
                  insets.bottom +
                  (Platform.OS === "ios" ? 200 : 140),
              },
            ]}
            renderItem={({ item }) => (
              <View style={styles.requestCard}>
                <View style={styles.requestHeader}>
                  <View style={styles.requestHeaderLeft}>
                    <Text style={styles.authorName}>{item.authorName}</Text>
                    <View
                      style={[
                        styles.statusBadge,
                        { backgroundColor: getStatusColor(item.status) },
                      ]}
                    >
                      <Text style={styles.statusText}>
                        {getStatusText(item.status)}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.requestTime}>
                    {item.createdAt?.toDate().toLocaleString("ko-KR", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>

                <Text style={styles.requestTitle}>{item.title}</Text>
                <Text style={styles.requestContent}>{item.content}</Text>

                {item.images && item.images.length > 0 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    style={styles.imageScroll}
                  >
                    {item.images.map((imageUri, index) => (
                      <Image
                        key={index}
                        source={{ uri: imageUri }}
                        style={styles.requestImage}
                      />
                    ))}
                  </ScrollView>
                )}

                <View style={styles.requestFooter}>
                  <Text style={styles.priceText}>
                    {item.price.toLocaleString()}원
                  </Text>
                  <View style={styles.footerActions}>
                    {item.status === "open" &&
                      item.authorId !== currentUser?.uid && (
                        <Pressable
                          style={styles.acceptButton}
                          onPress={() => handleAccept(item)}
                        >
                          <Text style={styles.acceptButtonText}>수락하기</Text>
                        </Pressable>
                      )}
                    {item.authorId === currentUser?.uid && (
                      <>
                        {item.status === "in_progress" && (
                          <Pressable
                            style={styles.resetButton}
                            onPress={() => handleResetStatus(item)}
                          >
                            <Text style={styles.resetButtonText}>다시 받기</Text>
                          </Pressable>
                        )}
                        <Pressable
                          style={styles.deleteButton}
                          onPress={() => handleDelete(item)}
                        >
                          <Text style={styles.deleteButtonText}>삭제</Text>
                        </Pressable>
                      </>
                    )}
                  </View>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="hand-left-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyText}>아직 부탁이 없습니다</Text>
                <Text style={styles.emptySubtext}>
                  첫 부탁을 등록해보세요!
                </Text>
              </View>
            }
          />
        )}

        {/* 부탁 등록(가운데) + 채팅 버튼(오른쪽 옆) */}
        <View
          style={{
            position: "absolute",
            bottom: Platform.OS === "ios" ? 152 : 128,
            left: 0,
            right: 0,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10,
          }}
        >
          {/* 부탁 등록이 화면 정중앙에 오도록 왼쪽에 채팅 버튼 너비+간격만큼 spacer */}
          <View style={{ width: 52 + 14, height: 52 }} />
          <Pressable
            onPress={() => {
              if (!currentUser) {
                Alert.alert("로그인 필요", "부탁을 등록하려면 로그인이 필요합니다.", [
                  { text: "취소", style: "cancel" },
                  { text: "로그인", onPress: () => router.push("/(auth)/login") },
                ]);
                return;
              }
              setWriteModalVisible(true);
            }}
            style={{
              backgroundColor: "#2477ff",
              borderRadius: 26,
              paddingHorizontal: 22,
              paddingVertical: 12,
              shadowColor: "#000",
              shadowOpacity: 0.1,
              shadowRadius: 5,
              elevation: 4,
            }}
          >
            <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
              + 부탁 등록
            </Text>
          </Pressable>
          <View style={{ width: 14, height: 52 }} />
          <Pressable
            onPress={() => {
              if (!currentUser) {
                Alert.alert("로그인 필요", "채팅 목록을 보려면 로그인이 필요합니다.", [
                  { text: "취소", style: "cancel" },
                  { text: "로그인", onPress: () => router.push("/(auth)/login") },
                ]);
                return;
              }
              router.push("/request/chats" as any);
            }}
            style={{
              backgroundColor: "#fff",
              width: 52,
              height: 52,
              borderRadius: 26,
              justifyContent: "center",
              alignItems: "center",
              shadowColor: "#000",
              shadowOpacity: 0.1,
              shadowRadius: 5,
              elevation: 4,
              borderWidth: 1,
              borderColor: "#E5E7EB",
            }}
          >
            <Ionicons name="chatbubbles-outline" size={26} color="#2477ff" />
            {requestUnreadCount > 0 && (
              <View
                style={{
                  position: "absolute",
                  top: 4,
                  right: 4,
                  minWidth: 18,
                  height: 18,
                  borderRadius: 9,
                  backgroundColor: "#EF4444",
                  justifyContent: "center",
                  alignItems: "center",
                  paddingHorizontal: 4,
                }}
              >
                <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>
                  {requestUnreadCount > 99 ? "99+" : requestUnreadCount}
                </Text>
              </View>
            )}
          </Pressable>
        </View>

        {/* 글쓰기 모달 */}
        <Modal
          visible={writeModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setWriteModalVisible(false)}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalContainer}
          >
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setWriteModalVisible(false)}>
                <Text style={styles.cancelText}>취소</Text>
              </Pressable>
              <Text style={styles.modalTitle}>부탁 등록</Text>
              <Pressable onPress={handlePost} disabled={posting}>
                <Text
                  style={[styles.postText, posting && { opacity: 0.5 }]}
                >
                  등록
                </Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalContent}>
              <Text style={styles.label}>제목</Text>
              <TextInput
                style={styles.titleInput}
                placeholder="예: 벌레 잡아주실분~"
                value={requestTitle}
                onChangeText={setRequestTitle}
              />

              <Text style={styles.label}>내용</Text>
              <TextInput
                style={styles.contentInput}
                placeholder="부탁 내용을 자세히 적어주세요"
                multiline
                value={requestContent}
                onChangeText={setRequestContent}
                textAlignVertical="top"
              />

              <Text style={styles.label}>금액 (원)</Text>
              <TextInput
                style={styles.priceInput}
                placeholder="0"
                value={requestPrice}
                onChangeText={setRequestPrice}
                keyboardType="number-pad"
              />

              {selectedImages.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {selectedImages.map((uri, index) => (
                    <View key={index} style={styles.imagePreviewContainer}>
                      <Image source={{ uri }} style={styles.imagePreview} />
                      <Pressable
                        style={styles.removeImageButton}
                        onPress={() =>
                          setSelectedImages(
                            selectedImages.filter((_, i) => i !== index)
                          )
                        }
                      >
                        <Ionicons name="close-circle" size={24} color="#fff" />
                      </Pressable>
                    </View>
                  ))}
                </ScrollView>
              )}

              <Pressable style={styles.addImageButton} onPress={pickImage}>
                <Ionicons name="image-outline" size={24} color="#6B7280" />
                <Text style={styles.addImageText}>사진 추가</Text>
              </Pressable>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>

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
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  listContent: {
    padding: 16,
  },
  requestCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  requestHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  requestHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  authorName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusText: {
    fontSize: 12,
    fontWeight: "600",
    color: "#fff",
  },
  requestTime: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  requestTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 8,
  },
  requestContent: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
    marginBottom: 12,
  },
  imageScroll: {
    marginBottom: 12,
  },
  requestImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginRight: 8,
  },
  requestFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  priceText: {
    fontSize: 20,
    fontWeight: "700",
    color: "#2477ff",
  },
  acceptButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: "#2477ff",
    borderRadius: 8,
  },
  acceptButtonText: {
    fontSize: 14,
    fontWeight: "700",
    color: "#fff",
  },
  footerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  resetButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#F59E0B",
    borderRadius: 8,
  },
  resetButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  deleteButton: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: "#EF4444",
    borderRadius: 8,
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#fff",
  },
  modalContainer: {
    flex: 1,
    backgroundColor: "#fff",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  cancelText: {
    fontSize: 16,
    color: "#6B7280",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: "#111827",
  },
  postText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#2477ff",
  },
  modalContent: {
    flex: 1,
    padding: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    color: "#374151",
    marginBottom: 8,
    marginTop: 16,
  },
  titleInput: {
    fontSize: 16,
    color: "#111827",
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    marginBottom: 16,
  },
  contentInput: {
    fontSize: 16,
    color: "#111827",
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    minHeight: 150,
    marginBottom: 16,
  },
  priceInput: {
    fontSize: 18,
    fontWeight: "700",
    color: "#2477ff",
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    marginBottom: 16,
  },
  imagePreviewContainer: {
    position: "relative",
    marginRight: 8,
    marginBottom: 8,
  },
  imagePreview: {
    width: 100,
    height: 100,
    borderRadius: 8,
  },
  removeImageButton: {
    position: "absolute",
    top: -8,
    right: -8,
  },
  addImageButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    marginBottom: 16,
  },
  addImageText: {
    fontSize: 14,
    color: "#6B7280",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
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
});
