import { useRouter } from "expo-router";
import React from "react";
import { SafeAreaView, Text, TouchableOpacity, View } from "react-native";
import GoogleLoginButton from "../../components/GoogleLoginButton";
import KakaoLoginButton from "../../components/KakaoLoginButton";
import NaverLoginButton from "../../components/NaverLoginButton";

export default function LoginScreen() {
  const router = useRouter();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: "#fff" }}>
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
        <Text style={{ fontSize: 24, fontWeight: "700", marginBottom: 40 }}>
          로그인
        </Text>

        <NaverLoginButton />
        <View style={{ height: 16 }} />
        <KakaoLoginButton />
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
