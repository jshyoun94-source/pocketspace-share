import { login } from "@react-native-seoul/kakao-login";
import { signInWithCustomToken } from "firebase/auth";
import React from "react";
import { ActivityIndicator, Alert, Text, TouchableOpacity } from "react-native";
import { auth } from "../firebase";

const FUNCTIONS_ENDPOINT = process.env.EXPO_PUBLIC_FUNCTIONS_ENDPOINT;

export default function KakaoLoginButton() {
  const [loading, setLoading] = React.useState(false);

  const handleKakao = async () => {
    try {
      setLoading(true);

      // 1) 카카오 SDK 로그인
      const kakao = await login(); // { accessToken, idToken?, ... }
      if (!kakao?.accessToken) {
        console.error("❌ Kakao: accessToken 없음", kakao);
        Alert.alert("카카오 로그인 실패", "accessToken을 받지 못했습니다.");
        setLoading(false);
        return;
      }

      // 2) 서버(Function)에서 custom token 발급
      if (!FUNCTIONS_ENDPOINT) {
        console.error("❌ FUNCTIONS_ENDPOINT 미설정");
        Alert.alert("설정 오류", "EXPO_PUBLIC_FUNCTIONS_ENDPOINT가 필요합니다.");
        setLoading(false);
        return;
      }

      const res = await fetch(`${FUNCTIONS_ENDPOINT}/auth/kakao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken: kakao.accessToken }),
      });

      const data = await res.json();
      if (!res.ok || !data?.customToken) {
        console.error("❌ customToken 수신 실패:", data);
        Alert.alert("서버 오류", "카카오 토큰 검증/발급에 실패했습니다.");
        setLoading(false);
        return;
      }

      // 3) Firebase 커스텀 토큰으로 로그인
      const cred = await signInWithCustomToken(auth, data.customToken);
      console.log("✅ Kakao -> Firebase 성공:", cred.user.uid);
    } catch (e) {
      console.error("❌ Kakao 로그인 전체 실패:", e);
      Alert.alert("로그인 실패", "카카오 로그인 중 오류가 발생했습니다.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <TouchableOpacity
      onPress={handleKakao}
      disabled={loading}
      style={{
        backgroundColor: "#FEE500",
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        alignItems: "center",
        justifyContent: "center",
        minWidth: 260,
      }}
    >
      {loading ? (
        <ActivityIndicator />
      ) : (
        <Text style={{ fontWeight: "bold" }}>카카오로 계속</Text>
      )}
    </TouchableOpacity>
  );
}
