// components/SideMenu.tsx
import { FontAwesome5, Ionicons, MaterialCommunityIcons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useRouter } from "expo-router";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import React, { useEffect, useState } from "react";
import {
    Image,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import { auth, db } from "../firebase";
import useKakaoLogin from "../hooks/useKakaoLogin";

type Props = {
  visible: boolean;
  onClose: () => void;
  bannerUri: string; // 기존 배너 이미지를 그대로 사용
};

export default function SideMenu({ visible, onClose, bannerUri }: Props) {
  const router = useRouter();
  const [userName, setUserName] = useState<string | null>(null);
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const { signOutKakao } = useKakaoLogin();

  // ✅ 로그인 상태 및 닉네임 불러오기
  const loadUserNickname = async () => {
    if (auth.currentUser) {
      // Firestore에서 닉네임 가져오기
      try {
        const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
        const userData = userDoc.data();
        // 닉네임이 있으면 닉네임, 없으면 기존 name 사용
        const nickname = userData?.nickname || userData?.name || null;
        setUserName(nickname);
      } catch (e) {
        console.warn("닉네임 불러오기 실패:", e);
        // 폴백: AsyncStorage에서 가져오기
        const name = await AsyncStorage.getItem("loggedInUser");
        setUserName(name);
      }
    } else {
      setUserName(null);
    }
  };

  useEffect(() => {
    if (visible) {
      loadUserNickname();
    }
  }, [visible]);

  // ✅ auth 상태 변경 감지
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, () => {
      if (visible) {
        loadUserNickname();
      }
    });
    return unsubscribe;
  }, [visible]);

  // ✅ 로그아웃
  const handleLogout = async () => {
    try {
      // 현재 사용자의 provider 확인
      let isKakaoUser = false;
      if (auth.currentUser) {
        try {
          const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
          const userData = userDoc.data();
          isKakaoUser = userData?.providers?.includes("kakao") || false;
        } catch (e) {
          console.warn("provider 확인 실패:", e);
        }
      }
      
      // 카카오 로그인인 경우 카카오 로그아웃 (이미 auth.signOut() 포함)
      if (isKakaoUser) {
        try {
          await signOutKakao();
        } catch (e) {
          console.warn("카카오 로그아웃 실패, Firebase 로그아웃만 진행:", e);
          await signOut(auth);
        }
      } else {
        // 그 외 provider는 Firebase Auth 로그아웃만
        await signOut(auth);
      }
      
      // AsyncStorage 정리
      await AsyncStorage.removeItem("loggedInUser");
      
      // 상태 초기화
      setUserName(null);
      setShowSettingsModal(false);
      onClose();
    } catch (e: any) {
      console.error("로그아웃 실패:", e);
      // 에러가 발생해도 상태는 초기화
      await AsyncStorage.removeItem("loggedInUser");
      setUserName(null);
      setShowSettingsModal(false);
      onClose();
    }
  };

  // ✅ 로그인 클릭
  const handleLoginPress = () => {
    onClose();
    router.push("/login");
  };

  return (
    <Modal transparent visible={visible} animationType="fade" onRequestClose={onClose}>
      {/* 어두운 배경 */}
      <Pressable style={s.dim} onPress={onClose} />

      {/* 왼쪽 슬라이드 패널 */}
      <View style={s.panelWrap} pointerEvents="box-none">
        <View style={s.panel}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            {/* 상단 프로필 영역 */}
            <View style={s.profileRow}>
              <View style={s.avatarDot} />

              {/* ✅ 로그인 여부에 따라 표시 다르게 */}
              {userName ? (
                <Text style={s.userName}>{userName}</Text>
              ) : (
                <Pressable onPress={handleLoginPress}>
                  <Text style={[s.userName, { color: "#2563EB" }]}>로그인하기</Text>
                </Pressable>
              )}

              <View style={{ flex: 1 }} />
              <Ionicons name="notifications-outline" size={22} color="#6B7280" />
            </View>

            {/* (요청) 내 공유주차장 → 내 공간 */}
            <Pressable
              style={s.primaryBtn}
              onPress={() => {
                onClose();
                router.push("/my-spaces");
              }}
            >
              <Text style={s.primaryBtnText}>내 공간</Text>
            </Pressable>

            {/* 배너 */}
            <Image source={{ uri: bannerUri }} style={s.banner} />

            {/* 리스트 카드 */}
            <View style={s.card}>
              <Row
                left={
                  <>
                    <FontAwesome5 name="suitcase" size={16} color="#374151" />
                    <Text style={s.rowText}>예약내역</Text>
                  </>
                }
                right={<Count text="0건" />}
              />

              <Divider />

              <Row
                left={
                  <>
                    <MaterialCommunityIcons
                      name="ticket-percent-outline"
                      size={18}
                      color="#374151"
                    />
                    <Text style={s.rowText}>쿠폰함</Text>
                  </>
                }
                right={<Count text="0매" />}
              />

              <Divider />

              <Row
                left={
                  <>
                    <MaterialCommunityIcons
                      name="currency-krw"
                      size={18}
                      color="#374151"
                    />
                    <Text style={s.rowText}>충전금</Text>
                  </>
                }
                right={<Count text="0 P" />}
              />

              <Divider />

              <Row
                left={
                  <>
                    <Ionicons name="ellipse-outline" size={16} color="#374151" />
                    <Text style={s.rowText}>적립금</Text>
                  </>
                }
                right={<Count text="0 P" />}
              />

              <Divider />

              <Row
                left={
                  <>
                    <Ionicons name="star-outline" size={16} color="#374151" />
                    <Text style={s.rowText}>즐겨찾기</Text>
                  </>
                }
                right={<Ionicons name="chevron-forward" size={16} color="#9CA3AF" />}
                onPress={() => {
                  onClose();
                  router.push("/favorites");
                }}
              />
            </View>

            {/* 하단 메뉴들 */}
            <View style={{ marginTop: 18, gap: 16 }}>
              <SectionTitle>공지사항</SectionTitle>
              <SectionTitle>결제, 충전, 적립</SectionTitle>
              <SectionTitle>
                마이 제보내역
                <View style={s.badge}>
                  <Text style={s.badgeText}>이벤트 진행 중</Text>
                </View>
              </SectionTitle>
              <SectionTitle>제휴 문의</SectionTitle>
              <Pressable onPress={() => setShowSettingsModal(true)}>
                <SectionTitle>환경설정</SectionTitle>
              </Pressable>
            </View>

            <Pressable style={s.footerHelp}>
              <Ionicons name="help-circle-outline" size={18} color="#94A3B8" />
              <Text style={s.footerHelpText}>이용안내 및 문의하기</Text>
            </Pressable>
          </ScrollView>
        </View>
      </View>

      {/* 환경설정 메뉴 패널 */}
      {showSettingsModal && (
        <View style={s.panelWrap} pointerEvents="box-none">
          <Pressable style={s.dim} onPress={() => setShowSettingsModal(false)} />
          <View style={s.panel}>
            <ScrollView
              contentContainerStyle={{ paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            >
              {/* 상단 헤더 */}
              <View style={s.profileRow}>
                <Pressable
                  onPress={() => setShowSettingsModal(false)}
                  style={{ padding: 4 }}
                >
                  <Ionicons name="chevron-back" size={24} color="#111827" />
                </Pressable>
                <Text style={[s.userName, { marginLeft: 8 }]}>환경설정</Text>
                <View style={{ flex: 1 }} />
              </View>

              {/* 환경설정 메뉴 리스트 */}
              <View style={{ marginTop: 20 }}>
                {userName ? (
                  <>
                    {/* 알림 설정 (추후 추가 예정) */}
                    <Pressable style={s.settingsRow}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <Ionicons name="notifications-outline" size={20} color="#374151" />
                        <Text style={s.settingsRowText}>알림 설정</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                    </Pressable>

                    <View style={s.divider} />

                    {/* 로그아웃 */}
                    <Pressable
                      onPress={handleLogout}
                      style={s.settingsRow}
                    >
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                        <Ionicons name="log-out-outline" size={20} color="#EF4444" />
                        <Text style={[s.settingsRowText, { color: "#EF4444" }]}>
                          로그아웃하기
                        </Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />
                    </Pressable>
                  </>
                ) : (
                  <View style={{ padding: 20, alignItems: "center" }}>
                    <Text
                      style={{
                        fontSize: 14,
                        color: "#6B7280",
                        marginBottom: 20,
                        textAlign: "center",
                      }}
                    >
                      로그인 후 이용 가능합니다.
                    </Text>
                    <Pressable
                      onPress={() => {
                        setShowSettingsModal(false);
                        onClose();
                        router.push("/(auth)/login");
                      }}
                      style={{
                        backgroundColor: "#2477ff",
                        borderRadius: 12,
                        paddingVertical: 14,
                        paddingHorizontal: 24,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: "#fff",
                          fontSize: 16,
                          fontWeight: "700",
                        }}
                      >
                        로그인하러 가기
                      </Text>
                    </Pressable>
                  </View>
                )}
              </View>
            </ScrollView>
          </View>
        </View>
      )}
    </Modal>
  );
}

/* 작은 프리미티브들 */
function Row({ left, right, onPress }: { left: React.ReactNode; right?: React.ReactNode; onPress?: () => void }) {
  return (
    <Pressable style={s.row} onPress={onPress}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
        {left}
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        {right}
        {!right && <Ionicons name="chevron-forward" size={16} color="#9CA3AF" />}
      </View>
    </Pressable>
  );
}
function Divider() {
  return <View style={s.divider} />;
}
function Count({ text }: { text: string }) {
  return <Text style={s.count}>{text}</Text>;
}
function SectionTitle({ children }: { children: React.ReactNode }) {
  return <Text style={s.section}>{children}</Text>;
}

/* styles */
const s = StyleSheet.create({
  dim: {
    position: "absolute",
    inset: 0 as any,
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  panelWrap: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
  },
  panel: {
    width: "82%",
    height: "100%",
    backgroundColor: "#fff",
    paddingTop: 52,
    paddingHorizontal: 18,
    borderTopRightRadius: 16,
    borderBottomRightRadius: 16,
  },
  profileRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 14,
  },
  avatarDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: "#FFD600",
  },
  userName: { fontSize: 20, fontWeight: "700", color: "#111827" },

  primaryBtn: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: "#60A5FA",
    borderRadius: 10,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  primaryBtnText: { color: "#2563EB", fontWeight: "700", fontSize: 16 },

  banner: {
    width: "100%",
    height: 92,
    borderRadius: 10,
    marginTop: 16,
  },

  card: {
    marginTop: 16,
    borderRadius: 12,
    backgroundColor: "#F9FAFB",
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  row: {
    paddingHorizontal: 14,
    paddingVertical: 14,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  rowText: { fontSize: 16, color: "#111827" },
  count: { color: "#2563EB", fontWeight: "700" },
  divider: { height: 1, backgroundColor: "#E5E7EB" },

  section: { fontSize: 16, color: "#111827", paddingVertical: 2 },
  badge: {
    marginLeft: 8,
    backgroundColor: "#F97316",
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  badgeText: { color: "#fff", fontSize: 12 },

  footerHelp: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  footerHelpText: { color: "#94A3B8", fontSize: 15 },

  settingsRow: {
    paddingHorizontal: 14,
    paddingVertical: 16,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  settingsRowText: {
    fontSize: 16,
    color: "#111827",
  },
});

