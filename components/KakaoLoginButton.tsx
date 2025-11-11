// components/KakaoLoginButton.tsx
import React, { useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity } from "react-native";
import Toast from "react-native-toast-message";
import { loginWithKakaoAuthCode } from "../utils/kakaoAuth";

export default function KakaoLoginButton() {
  const [loading, setLoading] = useState(false);

  const handleKakaoLogin = async () => {
    if (loading) return;
    setLoading(true);
    try {
      const code = await loginWithKakaoAuthCode();

      if (!code) {
        Toast.show({
          type: "error",
          text1: "카카오 로그인 취소 또는 실패",
        });
        return;
      }

      console.log("🔑 Kakao 인가 코드:", code);

      Toast.show({
        type: "success",
        text1: "카카오 로그인 연동 성공",
        text2: "콘솔에서 code를 확인하세요.",
      });

      // 👉 다음 단계에서: 여기서 code를 가지고 토큰 교환 + Firebase 연동 진행할 거야.

    } catch (error: any) {
      console.log("Kakao 로그인 에러:", error);
      Toast.show({
        type: "error",
        text1: "카카오 로그인 오류",
        text2: String(error?.message ?? error),
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handleKakaoLogin}
      disabled={loading}
      style={{
        backgroundColor: "#FEE500",
        borderRadius: 8,
        paddingVertical: 12,
        paddingHorizontal: 16,
        alignItems: "center",
        justifyContent: "center",
        width: 220,
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator />
      ) : (
        <Text style={{ fontWeight: "600" }}>카카오로 로그인</Text>
      )}
    </TouchableOpacity>
  );
}
