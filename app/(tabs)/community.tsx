// app/(tabs)/community.tsx
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
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
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
import { auth, db, storage } from "../../firebase";
import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import * as ImagePicker from "expo-image-picker";
import { onAuthStateChanged } from "firebase/auth";

const { width: SCREEN_WIDTH } = Dimensions.get("window");

type Post = {
  id: string;
  authorId: string;
  authorName: string;
  content: string;
  images?: string[];
  location: { lat: number; lng: number };
  createdAt: Timestamp;
  expiresAt: Timestamp;
  commentCount: number;
};

type Comment = {
  id: string;
  postId: string;
  authorId: string;
  authorName: string;
  content: string;
  parentCommentId?: string; // 답글인 경우 부모 댓글 ID
  createdAt: Timestamp;
};

export default function CommunityScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [currentLocation, setCurrentLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [writeModalVisible, setWriteModalVisible] = useState(false);
  const [postContent, setPostContent] = useState("");
  const [selectedImages, setSelectedImages] = useState<string[]>([]);
  const [posting, setPosting] = useState(false);
  const [selectedPost, setSelectedPost] = useState<Post | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentModalVisible, setCommentModalVisible] = useState(false);
  const [commentContent, setCommentContent] = useState("");
  const [replyingTo, setReplyingTo] = useState<Comment | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
    });
    return unsubscribe;
  }, []);

  // 현재 위치 가져오기
  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === "granted") {
          const loc = await Location.getCurrentPositionAsync({});
          setCurrentLocation({
            lat: loc.coords.latitude,
            lng: loc.coords.longitude,
          });
        }
      } catch (e) {
        console.warn("위치 가져오기 실패:", e);
      }
    })();
  }, []);

  // 거리 계산 (Haversine formula)
  const calculateDistance = (
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number
  ): number => {
    const R = 6371000; // 지구 반지름 (미터)
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c; // 미터 단위
  };

  // 게시글 로드 (반경 5km 이내)
  useEffect(() => {
    if (!currentLocation) return;

    const loadPosts = async () => {
      try {
        setLoading(true);
        const postsRef = collection(db, "communityPosts");
        const q = query(
          postsRef,
          orderBy("createdAt", "desc"),
          limit(100) // 최대 100개만 가져오기
        );

        const snapshot = await getDocs(q);
        const now = new Date();
        const postsList: Post[] = [];

        snapshot.forEach((docSnap) => {
          const data = docSnap.data();
          const postLocation = data.location;
          if (!postLocation) return;

          const distance = calculateDistance(
            currentLocation.lat,
            currentLocation.lng,
            postLocation.lat,
            postLocation.lng
          );

          // 5km 이내만 포함
          if (distance <= 5000) {
            const expiresAt = data.expiresAt?.toDate();
            // 만료되지 않은 게시글만 포함
            if (!expiresAt || expiresAt > now) {
              postsList.push({
                id: docSnap.id,
                authorId: data.authorId,
                authorName: data.authorName || "익명",
                content: data.content,
                images: data.images || [],
                location: postLocation,
                createdAt: data.createdAt,
                expiresAt: data.expiresAt,
                commentCount: data.commentCount || 0,
              });
            }
          }
        });

        setPosts(postsList);
      } catch (e) {
        console.error("게시글 로드 실패:", e);
      } finally {
        setLoading(false);
      }
    };

    loadPosts();

    // 실시간 업데이트
    const postsRef = collection(db, "communityPosts");
    const q = query(postsRef, orderBy("createdAt", "desc"), limit(100));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = new Date();
      const postsList: Post[] = [];

      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        const postLocation = data.location;
        if (!postLocation || !currentLocation) return;

        const distance = calculateDistance(
          currentLocation.lat,
          currentLocation.lng,
          postLocation.lat,
          postLocation.lng
        );

        if (distance <= 5000) {
          const expiresAt = data.expiresAt?.toDate();
          if (!expiresAt || expiresAt > now) {
            postsList.push({
              id: docSnap.id,
              authorId: data.authorId,
              authorName: data.authorName || "익명",
              content: data.content,
              images: data.images || [],
              location: postLocation,
              createdAt: data.createdAt,
              expiresAt: data.expiresAt,
              commentCount: data.commentCount || 0,
            });
          }
        }
      });

      setPosts(postsList);
    });

    return () => unsubscribe();
  }, [currentLocation]);

  // 만료된 게시글 자동 삭제 (24시간 후)
  useEffect(() => {
    const interval = setInterval(async () => {
      const now = new Date();
      const expiredPosts = posts.filter((post) => {
        const expiresAt = post.expiresAt?.toDate();
        return expiresAt && expiresAt <= now;
      });

      for (const post of expiredPosts) {
        try {
          await deleteDoc(doc(db, "communityPosts", post.id));
        } catch (e) {
          console.error("게시글 삭제 실패:", e);
        }
      }
    }, 60000); // 1분마다 체크

    return () => clearInterval(interval);
  }, [posts]);

  // 이미지 선택
  const pickImage = async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        quality: 0.8,
      });

      if (!result.canceled && result.assets) {
        const uris = result.assets.map((asset) => asset.uri);
        setSelectedImages((prev) => [...prev, ...uris].slice(0, 5)); // 최대 5개
      }
    } catch (e) {
      console.error("이미지 선택 실패:", e);
    }
  };

  // 게시글 작성
  const handlePost = async () => {
    if (!postContent.trim() && selectedImages.length === 0) {
      Alert.alert("알림", "내용 또는 사진을 입력해주세요.");
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
          const response = await fetch(localUri);
          const blob = await response.blob();
          const fileName = `community/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
          const imageRef = ref(storage, fileName);
          await uploadBytes(imageRef, blob);
          const downloadURL = await getDownloadURL(imageRef);
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

      // 24시간 후 만료
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      await addDoc(collection(db, "communityPosts"), {
        authorId: currentUser.uid,
        authorName,
        content: postContent.trim(),
        images: uploadedImageUrls,
        location: currentLocation,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(expiresAt),
        commentCount: 0,
      });

      setPostContent("");
      setSelectedImages([]);
      setWriteModalVisible(false);
      Alert.alert("완료", "게시글이 등록되었습니다. 24시간 후 자동으로 삭제됩니다.");
    } catch (e: any) {
      console.error("게시글 작성 실패:", e);
      Alert.alert("오류", "게시글 작성에 실패했습니다.");
    } finally {
      setPosting(false);
    }
  };

  // 댓글 로드
  const loadComments = async (postId: string) => {
    try {
      const commentsRef = collection(db, "communityPosts", postId, "comments");
      const q = query(commentsRef, orderBy("createdAt", "asc"));
      const snapshot = await getDocs(q);

      const commentsList: Comment[] = [];
      snapshot.forEach((docSnap) => {
        const data = docSnap.data();
        commentsList.push({
          id: docSnap.id,
          postId: data.postId,
          authorId: data.authorId,
          authorName: data.authorName || "익명",
          content: data.content,
          parentCommentId: data.parentCommentId,
          createdAt: data.createdAt,
        });
      });

      setComments(commentsList);
    } catch (e) {
      console.error("댓글 로드 실패:", e);
    }
  };

  // 댓글 작성
  const handleComment = async () => {
    if (!commentContent.trim()) return;
    if (!currentUser || !selectedPost) return;

    try {
      const userDoc = await getDocs(
        query(collection(db, "users"), where("__name__", "==", currentUser.uid))
      );
      let authorName = "익명";
      if (!userDoc.empty) {
        const userData = userDoc.docs[0].data();
        authorName = userData.nickname || userData.name || "익명";
      }

      await addDoc(
        collection(db, "communityPosts", selectedPost.id, "comments"),
        {
          postId: selectedPost.id,
          authorId: currentUser.uid,
          authorName,
          content: commentContent.trim(),
          parentCommentId: replyingTo?.id || null,
          createdAt: Timestamp.now(),
        }
      );

      // 댓글 수 업데이트
      const postRef = doc(db, "communityPosts", selectedPost.id);
      await updateDoc(postRef, {
        commentCount: (selectedPost.commentCount || 0) + 1,
      });

      setCommentContent("");
      setReplyingTo(null);
      loadComments(selectedPost.id);
    } catch (e) {
      console.error("댓글 작성 실패:", e);
      Alert.alert("오류", "댓글 작성에 실패했습니다.");
    }
  };

  const openCommentModal = (post: Post) => {
    setSelectedPost(post);
    setCommentModalVisible(true);
    loadComments(post.id);
  };

  return (
    <>
      <Stack.Screen
        options={{
          title: "동네생활",
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
            data={posts}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            renderItem={({ item }) => (
              <View style={styles.postCard}>
                <View style={styles.postHeader}>
                  <Text style={styles.authorName}>{item.authorName}</Text>
                  <Text style={styles.postTime}>
                    {item.createdAt?.toDate().toLocaleString("ko-KR", {
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </Text>
                </View>

                <Text style={styles.postContent}>{item.content}</Text>

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
                        style={styles.postImage}
                      />
                    ))}
                  </ScrollView>
                )}

                <View style={styles.postFooter}>
                  <Pressable
                    style={styles.commentButton}
                    onPress={() => openCommentModal(item)}
                  >
                    <Ionicons name="chatbubble-outline" size={18} color="#6B7280" />
                    <Text style={styles.commentCount}>
                      댓글 {item.commentCount || 0}
                    </Text>
                  </Pressable>
                  <Text style={styles.expiresText}>
                    24시간 후 자동 삭제
                  </Text>
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={styles.emptyContainer}>
                <Ionicons name="document-text-outline" size={64} color="#D1D5DB" />
                <Text style={styles.emptyText}>아직 게시글이 없습니다</Text>
                <Text style={styles.emptySubtext}>
                  첫 게시글을 작성해보세요!
                </Text>
              </View>
            }
          />
        )}

        {/* 글쓰기 버튼 */}
        <Pressable
          onPress={() => {
            if (!currentUser) {
              Alert.alert("로그인 필요", "게시글을 작성하려면 로그인이 필요합니다.", [
                { text: "취소", style: "cancel" },
                { text: "로그인", onPress: () => router.push("/(auth)/login") },
              ]);
              return;
            }
            setWriteModalVisible(true);
          }}
          style={{
            position: "absolute",
            bottom: Platform.OS === "ios" ? 152 : 128,
            alignSelf: "center",
            backgroundColor: "#2477ff",
            borderRadius: 26,
            paddingHorizontal: 22,
            paddingVertical: 12,
            shadowColor: "#000",
            shadowOpacity: 0.1,
            shadowRadius: 5,
            elevation: 4,
            zIndex: 10,
          }}
        >
          <Text style={{ color: "white", fontWeight: "700", fontSize: 16 }}>
            + 글쓰기
          </Text>
        </Pressable>

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
              <Text style={styles.modalTitle}>게시글 작성</Text>
              <Pressable onPress={handlePost} disabled={posting}>
                <Text
                  style={[
                    styles.postText,
                    posting && { opacity: 0.5 },
                  ]}
                >
                  등록
                </Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalContent}>
              <TextInput
                style={styles.contentInput}
                placeholder="무엇을 공유하고 싶나요?"
                multiline
                value={postContent}
                onChangeText={setPostContent}
                textAlignVertical="top"
              />

              {selectedImages.length > 0 && (
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {selectedImages.map((uri, index) => (
                    <View key={index} style={styles.imagePreviewContainer}>
                      <Image source={{ uri }} style={styles.imagePreview} />
                      <Pressable
                        style={styles.removeImageButton}
                        onPress={() =>
                          setSelectedImages(selectedImages.filter((_, i) => i !== index))
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

              <View style={styles.noticeBox}>
                <Ionicons name="information-circle-outline" size={20} color="#2477ff" />
                <Text style={styles.noticeText}>
                  게시글은 24시간 후 자동으로 삭제됩니다.
                </Text>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </Modal>

        {/* 댓글 모달 */}
        <Modal
          visible={commentModalVisible}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => setCommentModalVisible(false)}
        >
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <Pressable onPress={() => setCommentModalVisible(false)}>
                <Text style={styles.cancelText}>닫기</Text>
              </Pressable>
              <Text style={styles.modalTitle}>댓글</Text>
              <View style={{ width: 50 }} />
            </View>

            <FlatList
              data={comments}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.commentsList}
              renderItem={({ item }) => (
                <View
                  style={[
                    styles.commentItem,
                    item.parentCommentId && styles.replyItem,
                  ]}
                >
                  <Text style={styles.commentAuthor}>{item.authorName}</Text>
                  <Text style={styles.commentContent}>{item.content}</Text>
                  {!item.parentCommentId && (
                    <Pressable
                      onPress={() => setReplyingTo(item)}
                      style={styles.replyButton}
                    >
                      <Text style={styles.replyText}>답글</Text>
                    </Pressable>
                  )}
                </View>
              )}
            />

            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
            >
              {replyingTo && (
                <View style={styles.replyingToBox}>
                  <Text style={styles.replyingToText}>
                    {replyingTo.authorName}님에게 답글
                  </Text>
                  <Pressable onPress={() => setReplyingTo(null)}>
                    <Ionicons name="close" size={20} color="#6B7280" />
                  </Pressable>
                </View>
              )}
              <View style={styles.commentInputContainer}>
                <TextInput
                  style={styles.commentInput}
                  placeholder="댓글을 입력하세요..."
                  value={commentContent}
                  onChangeText={setCommentContent}
                  multiline
                />
                <Pressable
                  onPress={handleComment}
                  disabled={!commentContent.trim()}
                  style={[
                    styles.sendButton,
                    !commentContent.trim() && styles.sendButtonDisabled,
                  ]}
                >
                  <Ionicons
                    name="send"
                    size={20}
                    color={commentContent.trim() ? "#2477ff" : "#D1D5DB"}
                  />
                </Pressable>
              </View>
            </KeyboardAvoidingView>
          </View>
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
  postCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  postHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  authorName: {
    fontSize: 16,
    fontWeight: "700",
    color: "#111827",
  },
  postTime: {
    fontSize: 12,
    color: "#9CA3AF",
  },
  postContent: {
    fontSize: 15,
    color: "#374151",
    lineHeight: 22,
    marginBottom: 12,
  },
  imageScroll: {
    marginBottom: 12,
  },
  postImage: {
    width: 200,
    height: 200,
    borderRadius: 8,
    marginRight: 8,
  },
  postFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  commentButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  commentCount: {
    fontSize: 14,
    color: "#6B7280",
  },
  expiresText: {
    fontSize: 12,
    color: "#9CA3AF",
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
  contentInput: {
    fontSize: 16,
    color: "#111827",
    minHeight: 200,
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
  noticeBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    backgroundColor: "#EFF6FF",
    borderRadius: 8,
  },
  noticeText: {
    fontSize: 14,
    color: "#2477ff",
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
  commentsList: {
    padding: 16,
  },
  commentItem: {
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#F9FAFB",
    borderRadius: 8,
  },
  replyItem: {
    marginLeft: 24,
    backgroundColor: "#F3F4F6",
  },
  commentAuthor: {
    fontSize: 14,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  commentContent: {
    fontSize: 14,
    color: "#374151",
    marginBottom: 8,
  },
  replyButton: {
    alignSelf: "flex-start",
  },
  replyText: {
    fontSize: 12,
    color: "#6B7280",
  },
  replyingToBox: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#EFF6FF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
  },
  replyingToText: {
    fontSize: 14,
    color: "#2477ff",
  },
  commentInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    backgroundColor: "#fff",
  },
  commentInput: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    padding: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 20,
    marginRight: 8,
    maxHeight: 100,
  },
  sendButton: {
    padding: 8,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
});
