// app/(auth)/login.tsx
import { Stack, useRouter } from "expo-router";
import { onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import AppleLoginButton from "../../components/AppleLoginButton";
import GoogleLoginButton from "../../components/GoogleLoginButton";
import KakaoLoginButton from "../../components/KakaoLoginButton";
import NaverLoginButton from "../../components/NaverLoginButton";
import useKakaoLogin from "../../hooks/useKakaoLogin";
import { auth, db } from "../../firebase";
import { TERMS_CONTENT, PRIVACY_CONTENT } from "../../utils/termsContent";

export default function LoginScreen() {
  const router = useRouter();
  const { signInWithKakao } = useKakaoLogin();
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [nicknameModalVisible, setNicknameModalVisible] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nicknameLoading, setNicknameLoading] = useState(false);
  
  // 이용약관 동의 관련 상태
  const [termsModalVisible, setTermsModalVisible] = useState(false);
  const [termsAgreed, setTermsAgreed] = useState(false);
  const [privacyAgreed, setPrivacyAgreed] = useState(false);
  const [termsContentVisible, setTermsContentVisible] = useState(false);
  const [privacyContentVisible, setPrivacyContentVisible] = useState(false);
  const [pendingLoginType, setPendingLoginType] = useState<"naver" | "kakao" | "google" | "apple" | null>(null);
  const prevAuthUid = useRef<string | null>(auth.currentUser?.uid ?? null);
  const checkTermsRef = useRef<(type: "naver" | "kakao" | "google" | "apple") => Promise<void>>(() => Promise.resolve());
  const appleHandledRef = useRef(false);

  // Auth가 null → user로 바뀔 때 (Apple은 버튼에서 처리하므로 보조용으로만 사용)
  useEffect(() => {
    let delayTimer: ReturnType<typeof setTimeout> | null = null;
    const unsub = onAuthStateChanged(auth, (user) => {
      const uid = user?.uid ?? null;
      if (prevAuthUid.current === null && uid !== null && !appleHandledRef.current) {
        delayTimer = setTimeout(() => {
          checkTermsAgreement("apple");
        }, 800);
      }
      prevAuthUid.current = uid;
    });
    return () => {
      if (delayTimer) clearTimeout(delayTimer);
      unsub();
    };
  }, []);

  // 닉네임 저장 및 홈으로 이동
  const handleNicknameSubmit = async () => {
    if (!nickname.trim()) {
      return;
    }
    try {
      setNicknameLoading(true);
      if (auth.currentUser) {
        await setDoc(
          doc(db, "users", auth.currentUser.uid),
          {
            nickname: nickname.trim(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        setNicknameModalVisible(false);
        router.replace("/(tabs)");
      }
    } catch (e: any) {
      console.error("닉네임 저장 실패:", e);
    } finally {
      setNicknameLoading(false);
    }
  };

  // 이용약관 동의 확인 (Apple 로그인 시 Firestore 쓰기 지연 대비 재시도)
  const checkTermsAgreement = async (loginType: "naver" | "kakao" | "google" | "apple", retry = 0) => {
    if (!auth.currentUser) return;
    
    try {
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      const userData = userDoc.data();
      
      if (!userDoc.exists() && retry < 2) {
        await new Promise((r) => setTimeout(r, 400 + retry * 300));
        return checkTermsAgreement(loginType, retry + 1);
      }
      
      // 이미 약관에 동의한 경우 바로 닉네임 확인
      if (userData?.termsAgreed && userData?.privacyAgreed) {
        await checkAndSetNickname();
        return;
      }
      
      // 약관 동의가 필요한 경우 모달 표시
      setPendingLoginType(loginType);
      setTermsModalVisible(true);
    } catch (e) {
      console.error("약관 동의 확인 실패:", e);
      if (retry < 2) {
        await new Promise((r) => setTimeout(r, 400 + retry * 300));
        return checkTermsAgreement(loginType, retry + 1);
      }
      setPendingLoginType(loginType);
      setTermsModalVisible(true);
    }
  };

  // 이용약관 동의 처리
  const handleTermsAgreement = async () => {
    if (!termsAgreed || !privacyAgreed) {
      return;
    }
    
    try {
      if (auth.currentUser) {
        await setDoc(
          doc(db, "users", auth.currentUser.uid),
          {
            termsAgreed: true,
            privacyAgreed: true,
            termsAgreedAt: serverTimestamp(),
            privacyAgreedAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
      }
      
      setTermsModalVisible(false);
      setTermsAgreed(false);
      setPrivacyAgreed(false);
      
      // 약관 동의 후 닉네임 확인
      await checkAndSetNickname();
    } catch (e) {
      console.error("약관 동의 저장 실패:", e);
    }
  };

  // 로그인 성공 후 닉네임 확인
  const checkAndSetNickname = async () => {
    if (!auth.currentUser) return;
    
    try {
      const userDoc = await getDoc(doc(db, "users", auth.currentUser.uid));
      const userData = userDoc.data();
      
      // 닉네임이 없으면 모달 표시
      if (!userData?.nickname) {
        setNicknameModalVisible(true);
      } else {
        // 닉네임이 있으면 바로 홈으로 (iOS에서 한 번만 반영되지 않을 수 있어 짧은 지연 후 한 번 더 시도)
        router.replace("/(tabs)");
        setTimeout(() => router.replace("/(tabs)"), 300);
      }
    } catch (e) {
      console.error("닉네임 확인 실패:", e);
      router.replace("/(tabs)");
      setTimeout(() => router.replace("/(tabs)"), 300);
    }
  };

  useEffect(() => {
    checkTermsRef.current = checkTermsAgreement;
  });

  const handleKakaoPress = async () => {
    try {
      setKakaoLoading(true);
      await signInWithKakao();
      // ✅ 카카오 로그인 성공 후 약관 동의 확인
      await checkTermsAgreement("kakao");
    } finally {
      setKakaoLoading(false);
    }
  };

  const handleNaverSuccess = async () => {
    await checkTermsAgreement("naver");
  };

  const handleGoogleSuccess = async () => {
    await checkTermsAgreement("google");
  };

  const handleAppleSuccess = async () => {
    try {
      await checkTermsRef.current("apple");
    } catch (e) {
      console.error("Apple 로그인 후 약관/닉네임 확인 실패:", e);
      router.replace("/(tabs)");
    }
  };

  const allAgreed = termsAgreed && privacyAgreed;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 40 }}>
          로그인
        </Text>

        {/* Apple 로그인: 항상 렌더 (iOS에서만 동작, Android는 탭 시 토스트). 조건 제거해 예전 번들/캐시 시에도 노출 보장 */}
        <AppleLoginButton
          onAppleStart={() => { appleHandledRef.current = true; }}
          onSuccess={handleAppleSuccess}
        />
        <View style={{ height: 16 }} />

        <NaverLoginButton onSuccess={handleNaverSuccess} />
        <View style={{ height: 16 }} />

        {/* ✅ onPress를 KakaoLoginButton에 전달 */}
        <KakaoLoginButton onPress={handleKakaoPress} loading={kakaoLoading} />

        <View style={{ height: 16 }} />
        <GoogleLoginButton onSuccess={handleGoogleSuccess} />

        <TouchableOpacity
          onPress={() => {
            if (typeof (router as any).canGoBack === "function" && (router as any).canGoBack()) {
              router.back();
            } else {
              router.replace("/(tabs)");
            }
          }}
          style={{ marginTop: 40 }}
        >
          <Text style={{ color: "#6B7280" }}>뒤로가기</Text>
        </TouchableOpacity>
      </View>

      {/* 이용약관 동의 모달 */}
      <Modal
        visible={termsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setTermsModalVisible(false);
          setTermsAgreed(false);
          setPrivacyAgreed(false);
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              padding: 24,
              width: "100%",
              maxWidth: 400,
              maxHeight: "80%",
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "700",
                color: "#111827",
                marginBottom: 20,
              }}
            >
              {termsContentVisible
                ? "이용약관"
                : privacyContentVisible
                ? "개인정보처리방침"
                : "이용약관 동의"}
            </Text>

            {/* 약관 내용 보기 */}
            {termsContentVisible ? (
              <ScrollView 
                style={{ maxHeight: 400, marginBottom: 16 }}
                showsVerticalScrollIndicator={true}
              >
                <Text 
                  style={{ 
                    fontSize: 13, 
                    color: "#374151", 
                    lineHeight: 20,
                    padding: 8,
                  }}
                >
                  {TERMS_CONTENT}
                </Text>
              </ScrollView>
            ) : privacyContentVisible ? (
              <ScrollView 
                style={{ maxHeight: 400, marginBottom: 16 }}
                showsVerticalScrollIndicator={true}
              >
                <Text 
                  style={{ 
                    fontSize: 13, 
                    color: "#374151", 
                    lineHeight: 20,
                    padding: 8,
                  }}
                >
                  {PRIVACY_CONTENT}
                </Text>
              </ScrollView>
            ) : (
              <>
                {/* 전체 동의 */}
                <Pressable
                  onPress={() => {
                    const allAgree = !allAgreed;
                    setTermsAgreed(allAgree);
                    setPrivacyAgreed(allAgree);
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 12,
                    borderBottomWidth: 1,
                    borderBottomColor: "#E5E7EB",
                    marginBottom: 12,
                  }}
                >
                  <View
                    style={{
                      width: 24,
                      height: 24,
                      borderRadius: 4,
                      borderWidth: 2,
                      borderColor: allAgreed ? "#2477ff" : "#D1D5DB",
                      backgroundColor: allAgreed ? "#2477ff" : "#fff",
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 12,
                    }}
                  >
                    {allAgreed && (
                      <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>✓</Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>
                    전체 동의
                  </Text>
                </Pressable>

                {/* 이용약관 동의 */}
                <Pressable
                  onPress={() => setTermsAgreed(!termsAgreed)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 8,
                    marginBottom: 8,
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      borderWidth: 2,
                      borderColor: termsAgreed ? "#2477ff" : "#D1D5DB",
                      backgroundColor: termsAgreed ? "#2477ff" : "#fff",
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 12,
                    }}
                  >
                    {termsAgreed && (
                      <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>✓</Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 14, color: "#374151", flex: 1 }}>
                    이용약관 동의 (필수)
                  </Text>
                  <Pressable
                    onPress={() => setTermsContentVisible(true)}
                    style={{ padding: 4 }}
                  >
                    <Text style={{ fontSize: 12, color: "#6B7280" }}>보기</Text>
                  </Pressable>
                </Pressable>

                {/* 개인정보처리방침 동의 */}
                <Pressable
                  onPress={() => setPrivacyAgreed(!privacyAgreed)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    paddingVertical: 8,
                    marginBottom: 16,
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 4,
                      borderWidth: 2,
                      borderColor: privacyAgreed ? "#2477ff" : "#D1D5DB",
                      backgroundColor: privacyAgreed ? "#2477ff" : "#fff",
                      justifyContent: "center",
                      alignItems: "center",
                      marginRight: 12,
                    }}
                  >
                    {privacyAgreed && (
                      <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>✓</Text>
                    )}
                  </View>
                  <Text style={{ fontSize: 14, color: "#374151", flex: 1 }}>
                    개인정보처리방침 동의 (필수)
                  </Text>
                  <Pressable
                    onPress={() => setPrivacyContentVisible(true)}
                    style={{ padding: 4 }}
                  >
                    <Text style={{ fontSize: 12, color: "#6B7280" }}>보기</Text>
                  </Pressable>
                </Pressable>
              </>
            )}

            {/* 버튼 영역 */}
            <View style={{ flexDirection: "row", gap: 12 }}>
              {termsContentVisible || privacyContentVisible ? (
                <Pressable
                  onPress={() => {
                    setTermsContentVisible(false);
                    setPrivacyContentVisible(false);
                  }}
                  style={{
                    flex: 1,
                    backgroundColor: "#F3F4F6",
                    borderRadius: 12,
                    paddingVertical: 14,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: "#6B7280", fontSize: 16, fontWeight: "700" }}>
                    돌아가기
                  </Text>
                </Pressable>
              ) : (
                <>
                  <Pressable
                    onPress={() => {
                      setTermsModalVisible(false);
                      setTermsAgreed(false);
                      setPrivacyAgreed(false);
                    }}
                    style={{
                      flex: 1,
                      backgroundColor: "#F3F4F6",
                      borderRadius: 12,
                      paddingVertical: 14,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: "#6B7280", fontSize: 16, fontWeight: "700" }}>
                      취소
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={handleTermsAgreement}
                    disabled={!allAgreed}
                    style={{
                      flex: 1,
                      backgroundColor: allAgreed ? "#2477ff" : "#D1D5DB",
                      borderRadius: 12,
                      paddingVertical: 14,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }}>
                      동의하기
                    </Text>
                  </Pressable>
                </>
              )}
            </View>
          </View>
        </View>
      </Modal>

      {/* 닉네임 설정 모달 */}
      <Modal
        visible={nicknameModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setNicknameModalVisible(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            justifyContent: "center",
            alignItems: "center",
            padding: 20,
          }}
        >
          <View
            style={{
              backgroundColor: "#fff",
              borderRadius: 16,
              padding: 24,
              width: "100%",
              maxWidth: 320,
            }}
          >
            <Text
              style={{
                fontSize: 20,
                fontWeight: "700",
                color: "#111827",
                marginBottom: 8,
              }}
            >
              닉네임 설정
            </Text>
            <Text
              style={{
                fontSize: 14,
                color: "#6B7280",
                marginBottom: 20,
              }}
            >
              사용할 닉네임을 입력해주세요.
            </Text>
            <TextInput
              value={nickname}
              onChangeText={setNickname}
              placeholder="닉네임을 입력하세요"
              style={{
                borderWidth: 1,
                borderColor: "#E5E7EB",
                borderRadius: 8,
                padding: 12,
                fontSize: 16,
                marginBottom: 16,
              }}
              autoFocus
              maxLength={20}
            />
            <Pressable
              onPress={handleNicknameSubmit}
              disabled={!nickname.trim() || nicknameLoading}
              style={{
                backgroundColor: nickname.trim() ? "#2477ff" : "#D1D5DB",
                borderRadius: 12,
                paddingVertical: 14,
                alignItems: "center",
                justifyContent: "center",
                width: "100%",
              }}
            >
              <Text
                style={{
                  color: "#fff",
                  fontSize: 16,
                  fontWeight: "700",
                }}
              >
                {nicknameLoading ? "저장 중..." : "확인"}
              </Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}
