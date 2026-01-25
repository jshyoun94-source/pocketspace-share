// app/(auth)/login.tsx
import { Stack, useRouter } from "expo-router";
import { doc, getDoc, setDoc, serverTimestamp } from "firebase/firestore";
import React, { useState } from "react";
import {
  Modal,
  Pressable,
  SafeAreaView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import GoogleLoginButton from "../../components/GoogleLoginButton";
import KakaoLoginButton from "../../components/KakaoLoginButton";
import NaverLoginButton from "../../components/NaverLoginButton";
import useKakaoLogin from "../../hooks/useKakaoLogin";
import { auth, db } from "../../firebase";

export default function LoginScreen() {
  const router = useRouter();
  const { signInWithKakao } = useKakaoLogin();
  const [kakaoLoading, setKakaoLoading] = useState(false);
  const [nicknameModalVisible, setNicknameModalVisible] = useState(false);
  const [nickname, setNickname] = useState("");
  const [nicknameLoading, setNicknameLoading] = useState(false);

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
        // 닉네임이 있으면 바로 홈으로
        router.replace("/(tabs)");
      }
    } catch (e) {
      console.error("닉네임 확인 실패:", e);
      // 에러 발생 시에도 홈으로 이동
      router.replace("/(tabs)");
    }
  };

  const handleKakaoPress = async () => {
    try {
      setKakaoLoading(true);
      await signInWithKakao();
      // ✅ 카카오 로그인 성공 후 닉네임 확인
      await checkAndSetNickname();
    } finally {
      setKakaoLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <Stack.Screen options={{ headerShown: false }} />
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 40 }}>
          로그인
        </Text>

        <NaverLoginButton onSuccess={checkAndSetNickname} />
        <View style={{ height: 16 }} />

        {/* ✅ onPress를 KakaoLoginButton에 전달 */}
        <KakaoLoginButton onPress={handleKakaoPress} loading={kakaoLoading} />

        <View style={{ height: 16 }} />
        <GoogleLoginButton onSuccess={checkAndSetNickname} />

        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 40 }}
        >
          <Text style={{ color: "#6B7280" }}>뒤로가기</Text>
        </TouchableOpacity>
      </View>

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
