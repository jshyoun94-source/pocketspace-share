// app/(auth)/login.tsx
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { SafeAreaView, Text, TouchableOpacity, View } from "react-native";
import GoogleLoginButton from "../../components/GoogleLoginButton";
import KakaoLoginButton from "../../components/KakaoLoginButton";
import NaverLoginButton from "../../components/NaverLoginButton";
import useKakaoLogin from "../../hooks/useKakaoLogin";

export default function LoginScreen() {
  const router = useRouter();
  const { signInWithKakao } = useKakaoLogin();
  const [kakaoLoading, setKakaoLoading] = useState(false);

  const handleKakaoPress = async () => {
    try {
      setKakaoLoading(true);
      await signInWithKakao();
      // TODO: 로그인 성공 시 라우팅 등 처리
      // router.replace("/(tabs)");
    } finally {
      setKakaoLoading(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 40 }}>
          로그인
        </Text>

        <NaverLoginButton />
        <View style={{ height: 16 }} />

        {/* ✅ onPress를 KakaoLoginButton에 전달 */}
        <KakaoLoginButton onPress={handleKakaoPress} loading={kakaoLoading} />

        <View style={{ height: 16 }} />
        <GoogleLoginButton />

        <TouchableOpacity
          onPress={() => router.back()}
          style={{ marginTop: 40 }}
        >
          <Text style={{ color: "#6B7280" }}>뒤로가기</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}
