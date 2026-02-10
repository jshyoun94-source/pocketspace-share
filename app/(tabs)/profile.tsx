// app/(tabs)/profile.tsx
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { Stack, useRouter } from "expo-router";
import {
  collection,
  query,
  where,
  getDocs,
  doc,
  getDoc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
  Timestamp,
} from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  Linking,
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
import { deleteUser, onAuthStateChanged, signOut } from "firebase/auth";
import useKakaoLogin from "../../hooks/useKakaoLogin";
import MindSpaceBadge from "../../components/MindSpaceBadge";
import { uploadBase64ToStorage } from "../../utils/uploadImageToStorage";
import { TERMS_URL, PRIVACY_URL } from "../../utils/termsContent";

type UserProfile = {
  nickname?: string;
  name?: string;
  email?: string;
  profileImage?: string;
  mindSpace?: number;
};

type Transaction = {
  id: string;
  type: "sell" | "buy";
  spaceTitle: string;
  spaceId: string;
  chatId: string;
  amount: number;
  date: Timestamp | null;
  status: "보관종료";
};

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { signOutKakao } = useKakaoLogin();
  const [currentUser, setCurrentUser] = useState(auth.currentUser);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [nicknameModalVisible, setNicknameModalVisible] = useState(false);
  const [newNickname, setNewNickname] = useState("");
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [activeTab, setActiveTab] = useState<"profile" | "transactions" | "settings">("profile");
  const [uploadingPhoto, setUploadingPhoto] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setCurrentUser(user);
      if (user) {
        loadProfile();
        loadTransactions();
      } else {
        setProfile(null);
        setTransactions([]);
        setLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  const loadProfile = async () => {
    if (!currentUser) return;

    try {
      setLoading(true);
      const userDoc = await getDoc(doc(db, "users", currentUser.uid));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const mindSpace = userData.mindSpace ?? 50;
        if (userData.mindSpace == null) {
          updateDoc(doc(db, "users", currentUser.uid), {
            mindSpace: 50,
            updatedAt: serverTimestamp(),
          }).catch(() => {});
        }
        setProfile({
          nickname: userData.nickname,
          name: userData.name,
          email: userData.email,
          profileImage: userData.profileImage ?? userData.photoURL,
          mindSpace,
        });
        setNewNickname(userData.nickname || "");
      }
    } catch (e) {
      console.error("프로필 로드 실패:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadTransactions = async () => {
    if (!currentUser) return;

    try {
      const transactionsRef = collection(db, "transactions");
      const uid = currentUser.uid;
      const [ownerSnap, customerSnap] = await Promise.all([
        getDocs(query(transactionsRef, where("ownerId", "==", uid))),
        getDocs(query(transactionsRef, where("customerId", "==", uid))),
      ]);
      const transactionsList: Transaction[] = [];
      const seen = new Set<string>();

      const pushIfCompleted = (
        docSnap: { id: string; data: () => Record<string, unknown> }
      ) => {
        const data = docSnap.data();
        if (data.status !== "보관종료") return;
        if (seen.has(docSnap.id)) return;
        seen.add(docSnap.id);
        const ownerId = data.ownerId as string;
        transactionsList.push({
          id: docSnap.id,
          type: ownerId === uid ? "sell" : "buy",
          spaceTitle: (data.spaceTitle as string) || "공간",
          spaceId: (data.spaceId as string) || "",
          chatId: (data.chatId as string) || "",
          amount: 0,
          date: (data.completedAt as Timestamp) ?? null,
          status: "보관종료",
        });
      };

      ownerSnap.docs.forEach((d) => pushIfCompleted(d));
      customerSnap.docs.forEach((d) => pushIfCompleted(d));

      transactionsList.sort((a, b) => {
        const ta = a.date?.toMillis?.() ?? 0;
        const tb = b.date?.toMillis?.() ?? 0;
        return tb - ta;
      });

      setTransactions(transactionsList);
    } catch (e) {
      console.error("거래 내역 로드 실패:", e);
    }
  };

  const handleUpdateNickname = async () => {
    if (!currentUser || !newNickname.trim()) return;

    try {
      await updateDoc(doc(db, "users", currentUser.uid), {
        nickname: newNickname.trim(),
        updatedAt: serverTimestamp(),
      });
      setProfile((prev) => ({ ...prev!, nickname: newNickname.trim() }));
      setNicknameModalVisible(false);
      Alert.alert("완료", "닉네임이 변경되었습니다.");
    } catch (e) {
      console.error("닉네임 변경 실패:", e);
      Alert.alert("오류", "닉네임 변경에 실패했습니다.");
    }
  };

  const pickProfileImage = async () => {
    if (!currentUser) return;
    try {
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== "granted") {
        Alert.alert("권한 필요", "사진을 선택하려면 사진 라이브러리 권한이 필요합니다.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ["images"],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });
      if (result.canceled || !result.assets?.[0]) return;

      setUploadingPhoto(true);
      const asset = result.assets[0];
      let base64: string | null = asset.base64 ?? null;
      if (!base64) {
        base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: "base64" });
      }
      if (!base64) throw new Error("이미지 데이터를 읽을 수 없습니다.");

      const path = `users/${currentUser.uid}/profile.jpg`;
      const url = await uploadBase64ToStorage(base64, path, "image/jpeg");
      await updateDoc(doc(db, "users", currentUser.uid), {
        profileImage: url,
        updatedAt: serverTimestamp(),
      });
      setProfile((p) => (p ? { ...p, profileImage: url } : null));
      Alert.alert("완료", "프로필 사진이 변경되었습니다.");
    } catch (e: any) {
      console.error("프로필 사진 업로드 실패:", e);
      Alert.alert("오류", e?.message ?? "프로필 사진 변경에 실패했습니다.");
    } finally {
      setUploadingPhoto(false);
    }
  };

  const handleLogout = async () => {
    Alert.alert("로그아웃", "정말 로그아웃하시겠습니까?", [
      { text: "취소", style: "cancel" },
      {
        text: "로그아웃",
        style: "destructive",
        onPress: async () => {
          try {
            // 카카오 로그인인 경우
            const userDoc = await getDoc(doc(db, "users", currentUser?.uid || ""));
            if (userDoc.exists()) {
              const userData = userDoc.data();
              if (userData?.providers?.includes("kakao")) {
                await signOutKakao();
              } else {
                await signOut(auth);
              }
            } else {
              await signOut(auth);
            }
            router.replace("/(auth)/login");
          } catch (e) {
            console.error("로그아웃 실패:", e);
            await signOut(auth);
            router.replace("/(auth)/login");
          }
        },
      },
    ]);
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "회원 탈퇴",
      "탈퇴 시 계정 및 보관된 데이터가 삭제되며 복구할 수 없습니다. 정말 탈퇴하시겠습니까?",
      [
        { text: "취소", style: "cancel" },
        {
          text: "탈퇴하기",
          style: "destructive",
          onPress: async () => {
            const uid = auth.currentUser?.uid;
            if (!uid) {
              router.replace("/(auth)/login");
              return;
            }
            try {
              const userRef = doc(db, "users", uid);
              await deleteDoc(userRef);
              const user = auth.currentUser;
              if (user) await deleteUser(user);
              router.replace("/(auth)/login");
            } catch (e: any) {
              console.error("회원 탈퇴 실패:", e);
              const msg =
                e?.code === "auth/requires-recent-login"
                  ? "보안을 위해 다시 로그인한 뒤 탈퇴를 시도해 주세요."
                  : e?.message || "탈퇴 처리에 실패했습니다.";
              Alert.alert("탈퇴 실패", msg);
            }
          },
        },
      ]
    );
  };

  if (!currentUser) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "나의 포스",
            headerStyle: { backgroundColor: "#fff" },
            headerTitleStyle: { fontWeight: "700", fontSize: 18 },
          }}
        />
        <View style={styles.container}>
          <View style={styles.loginPromptContainer}>
            <Ionicons name="person-outline" size={64} color="#D1D5DB" />
            <Text style={styles.emptyText}>로그인이 필요합니다</Text>
            <Pressable
              style={styles.loginButton}
              onPress={() => router.push("/(auth)/login")}
            >
              <Text style={styles.loginButtonText}>로그인하기</Text>
            </Pressable>
          </View>

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

  if (loading) {
    return (
      <>
        <Stack.Screen
          options={{
            title: "나의 포스",
            headerStyle: { backgroundColor: "#fff" },
            headerTitleStyle: { fontWeight: "700", fontSize: 18 },
          }}
        />
        <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
          </View>
        </View>
      </>
    );
  }

  return (
    <>
      <Stack.Screen
        options={{
          title: "나의 포스",
          headerStyle: { backgroundColor: "#fff" },
          headerTitleStyle: { fontWeight: "700", fontSize: 18 },
        }}
      />

      <View style={[styles.container, { paddingTop: insets.top + 8 }]}>
        {/* 탭 메뉴 */}
        <View style={styles.tabContainer}>
          <Pressable
            style={[
              styles.tab,
              activeTab === "profile" && styles.tabActive,
            ]}
            onPress={() => setActiveTab("profile")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "profile" && styles.tabTextActive,
              ]}
            >
              프로필
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.tab,
              activeTab === "transactions" && styles.tabActive,
            ]}
            onPress={() => setActiveTab("transactions")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "transactions" && styles.tabTextActive,
              ]}
            >
              거래내역
            </Text>
          </Pressable>
          <Pressable
            style={[
              styles.tab,
              activeTab === "settings" && styles.tabActive,
            ]}
            onPress={() => setActiveTab("settings")}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === "settings" && styles.tabTextActive,
              ]}
            >
              설정
            </Text>
          </Pressable>
        </View>

        <ScrollView style={styles.content}>
          {activeTab === "profile" && (
            <View style={styles.profileSection}>
              <View style={styles.profileHeader}>
                <View style={styles.profileHeaderLeft}>
                  <Pressable
                    onPress={pickProfileImage}
                    disabled={uploadingPhoto}
                    style={styles.profileImageWrap}
                  >
                    {profile?.profileImage ? (
                      <Image
                        source={{ uri: profile.profileImage }}
                        style={styles.profileImage}
                      />
                    ) : (
                      <View style={[styles.profileImage, styles.profileImagePlaceholder]}>
                        <Ionicons name="person" size={40} color="#D1D5DB" />
                        <View style={styles.profileImageAddWrap}>
                          <Text style={styles.profileImageAddText}>+</Text>
                        </View>
                      </View>
                    )}
                    {uploadingPhoto && (
                      <View style={styles.profileImageOverlay}>
                        <ActivityIndicator size="small" color="#fff" />
                      </View>
                    )}
                  </Pressable>
                  <View style={styles.profileInfo}>
                    <Text style={styles.profileName}>
                      {profile?.nickname || profile?.name || "사용자"}
                    </Text>
                    {profile?.email && (
                      <Text style={styles.profileEmail}>{profile.email}</Text>
                    )}
                  </View>
                </View>
                {profile?.mindSpace != null && (
                  <View style={styles.mindSpaceBlock}>
                    <MindSpaceBadge mindSpace={profile.mindSpace} size="small" />
                    <Text style={styles.mindSpaceLabel}>마음공간</Text>
                  </View>
                )}
              </View>

              <Pressable
                style={styles.menuItem}
                onPress={() => router.push("/my-spaces")}
              >
                <Text style={styles.menuItemText}>내 공간 관리</Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </Pressable>
              <Pressable
                style={styles.menuItem}
                onPress={() => router.push("/my-requests")}
              >
                <Text style={styles.menuItemText}>내 부탁 관리</Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </Pressable>
              <Pressable
                style={styles.menuItem}
                onPress={() => setNicknameModalVisible(true)}
              >
                <Text style={styles.menuItemText}>닉네임 변경</Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </Pressable>
              <Pressable
                style={styles.menuItem}
                onPress={() => router.push("/favorites")}
              >
                <Text style={styles.menuItemText}>즐겨찾는 장소</Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </Pressable>
            </View>
          )}

          {activeTab === "transactions" && (
            <View style={styles.transactionsSection}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>판매 완료</Text>
              </View>
              {transactions
                .filter((t) => t.type === "sell")
                .map((transaction) => (
                  <Pressable
                    key={transaction.id}
                    style={styles.transactionItem}
                    onPress={() =>
                      transaction.spaceId &&
                      router.push(`/space/${transaction.spaceId}/chat`)
                    }
                  >
                    <View style={styles.transactionInfo}>
                      <Text style={styles.transactionTitle}>
                        {transaction.spaceTitle}
                      </Text>
                      <Text style={styles.transactionDate}>
                        {transaction.date?.toDate?.().toLocaleDateString("ko-KR") ??
                          "날짜 없음"}
                      </Text>
                    </View>
                    <Text style={styles.transactionAmount}>보관종료</Text>
                  </Pressable>
                ))}

              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>구매 완료</Text>
              </View>
              {transactions
                .filter((t) => t.type === "buy")
                .map((transaction) => (
                  <Pressable
                    key={transaction.id}
                    style={styles.transactionItem}
                    onPress={() =>
                      transaction.spaceId &&
                      router.push(`/space/${transaction.spaceId}/chat`)
                    }
                  >
                    <View style={styles.transactionInfo}>
                      <Text style={styles.transactionTitle}>
                        {transaction.spaceTitle}
                      </Text>
                      <Text style={styles.transactionDate}>
                        {transaction.date?.toDate?.().toLocaleDateString("ko-KR") ??
                          "날짜 없음"}
                      </Text>
                    </View>
                    <Text
                      style={[
                        styles.transactionAmount,
                        { color: "#059669" },
                      ]}
                    >
                      보관종료
                    </Text>
                  </Pressable>
                ))}

              {transactions.length === 0 && (
                <View style={styles.emptyTransactions}>
                  <Ionicons name="receipt-outline" size={48} color="#D1D5DB" />
                  <Text style={styles.emptyTransactionsText}>
                    거래 내역이 없습니다
                  </Text>
                </View>
              )}
            </View>
          )}

          {activeTab === "settings" && (
            <View style={styles.settingsSection}>
              <Pressable
                style={styles.menuItem}
                onPress={() => {
                  Alert.alert("준비중", "알림 설정 기능은 준비중입니다.");
                }}
              >
                <Text style={styles.menuItemText}>알림 설정</Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </Pressable>

              <Pressable
                style={styles.menuItem}
                onPress={() => Linking.openURL(TERMS_URL)}
              >
                <Text style={styles.menuItemText}>이용약관</Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </Pressable>

              <Pressable
                style={styles.menuItem}
                onPress={() => Linking.openURL(PRIVACY_URL)}
              >
                <Text style={styles.menuItemText}>개인정보처리방침</Text>
                <Ionicons name="chevron-forward" size={20} color="#9CA3AF" />
              </Pressable>

              <Pressable
                style={[styles.menuItem, { marginTop: 16 }]}
                onPress={handleDeleteAccount}
              >
                <Text style={[styles.menuItemText, { color: "#DC2626" }]}>
                  회원 탈퇴
                </Text>
                <Ionicons name="chevron-forward" size={20} color="#DC2626" />
              </Pressable>

              <Pressable style={styles.logoutButton} onPress={handleLogout}>
                <Text style={styles.logoutButtonText}>로그아웃</Text>
              </Pressable>

              {__DEV__ && (
                <Text
                  style={{
                    marginTop: 24,
                    fontSize: 11,
                    color: "#9CA3AF",
                    textAlign: "center",
                  }}
                >
                  개발 빌드 · Apple 로그인 · 회원탈퇴 · 삭제된 공간 채팅 포함
                </Text>
              )}
            </View>
          )}
        </ScrollView>

        {/* 닉네임 변경 모달 */}
        <Modal
          visible={nicknameModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setNicknameModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>닉네임 변경</Text>
              <TextInput
                style={styles.nicknameInput}
                placeholder="닉네임을 입력하세요"
                value={newNickname}
                onChangeText={setNewNickname}
                maxLength={20}
              />
              <View style={styles.modalButtons}>
                <Pressable
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={() => setNicknameModalVisible(false)}
                >
                  <Text style={styles.modalButtonTextCancel}>취소</Text>
                </Pressable>
                <Pressable
                  style={[styles.modalButton, styles.modalButtonConfirm]}
                  onPress={handleUpdateNickname}
                >
                  <Text style={styles.modalButtonTextConfirm}>확인</Text>
                </Pressable>
              </View>
            </View>
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
  tabContainer: {
    flexDirection: "row",
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  tab: {
    flex: 1,
    paddingVertical: 16,
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: {
    borderBottomColor: "#2477ff",
  },
  tabText: {
    fontSize: 14,
    fontWeight: "600",
    color: "#6B7280",
  },
  tabTextActive: {
    color: "#2477ff",
  },
  content: {
    flex: 1,
  },
  profileSection: {
    backgroundColor: "#fff",
    marginTop: 12,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  profileHeaderLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  mindSpaceBlock: {
    alignItems: "center",
  },
  mindSpaceLabel: {
    fontSize: 12,
    color: "#6B7280",
    marginTop: 4,
  },
  profileImageWrap: {
    marginRight: 16,
    position: "relative",
  },
  profileImage: {
    width: 80,
    height: 80,
    borderRadius: 40,
  },
  profileImagePlaceholder: {
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    position: "relative",
  },
  profileImageAddWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: "center",
    alignItems: "center",
  },
  profileImageAddText: {
    fontSize: 36,
    color: "rgba(0,0,0,0.2)",
    fontWeight: "300",
  },
  profileImageOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 40,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "center",
    alignItems: "center",
  },
  profileInfo: {
    flex: 1,
  },
  profileName: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 4,
  },
  profileEmail: {
    fontSize: 14,
    color: "#6B7280",
  },
  menuItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  menuItemText: {
    fontSize: 16,
    color: "#111827",
  },
  transactionsSection: {
    backgroundColor: "#fff",
    marginTop: 12,
  },
  sectionHeader: {
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "400",
    color: "#111827",
  },
  transactionItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
  },
  transactionInfo: {
    flex: 1,
  },
  transactionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  transactionDate: {
    fontSize: 14,
    color: "#6B7280",
  },
  transactionAmount: {
    fontSize: 18,
    fontWeight: "700",
    color: "#10B981",
  },
  emptyTransactions: {
    padding: 40,
    alignItems: "center",
  },
  emptyTransactionsText: {
    fontSize: 14,
    color: "#9CA3AF",
    marginTop: 12,
  },
  settingsSection: {
    backgroundColor: "#fff",
    marginTop: 12,
  },
  logoutButton: {
    margin: 16,
    padding: 16,
    backgroundColor: "#EF4444",
    borderRadius: 8,
    alignItems: "center",
  },
  logoutButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingTop: 100,
  },
  loginPromptContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  emptyText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#6B7280",
    marginTop: 16,
  },
  loginButton: {
    marginTop: 24,
    paddingHorizontal: 24,
    paddingVertical: 12,
    backgroundColor: "#2477ff",
    borderRadius: 8,
  },
  loginButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: "#fff",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "100%",
    maxWidth: 400,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: "#111827",
    marginBottom: 16,
  },
  nicknameInput: {
    fontSize: 16,
    color: "#111827",
    padding: 12,
    borderWidth: 1,
    borderColor: "#E5E7EB",
    borderRadius: 8,
    marginBottom: 24,
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
  },
  modalButton: {
    flex: 1,
    padding: 14,
    borderRadius: 8,
    alignItems: "center",
  },
  modalButtonCancel: {
    backgroundColor: "#F3F4F6",
  },
  modalButtonConfirm: {
    backgroundColor: "#2477ff",
  },
  modalButtonTextCancel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B7280",
  },
  modalButtonTextConfirm: {
    fontSize: 16,
    fontWeight: "600",
    color: "#fff",
  },
});
