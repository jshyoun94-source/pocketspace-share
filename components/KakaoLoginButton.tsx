import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity } from "react-native";
import Toast from "react-native-toast-message";

WebBrowser.maybeCompleteAuthSession();

const KAKAO_REST_API_KEY = process.env.EXPO_PUBLIC_KAKAO_REST_API_KEY!;
const discovery = {
  authorizationEndpoint: "https://kauth.kakao.com/oauth/authorize",
  tokenEndpoint: "https://kauth.kakao.com/oauth/token",
};

export default function KakaoLoginButton() {
  const [loading, setLoading] = useState(false);
  const redirectUri = useMemo(
    () => AuthSession.makeRedirectUri({ scheme: "com.jshyoun94.pocketspace" }),
    []
  );
  const state = useMemo(() => Math.random().toString(36).slice(2), []);
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: KAKAO_REST_API_KEY,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes: ["profile_nickname"],
      state,
    },
    discovery
  );

  useEffect(() => {
    const fetchProfile = async (code: string) => {
      try {
        setLoading(true);
        const res = await fetch(discovery.tokenEndpoint, {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: `grant_type=authorization_code&client_id=${KAKAO_REST_API_KEY}&redirect_uri=${redirectUri}&code=${code}`,
        });
        const token = await res.json();

        if (!token.access_token) throw new Error("토큰 발급 실패");

        const profRes = await fetch("https://kapi.kakao.com/v2/user/me", {
          headers: { Authorization: `Bearer ${token.access_token}` },
        });
        const prof = await profRes.json();
        const name = prof?.kakao_account?.profile?.nickname ?? "카카오 사용자";

        await AsyncStorage.setItem("loggedInUser", name);
        Toast.show({ type: "success", text1: `${name}님 환영합니다!` });
      } catch (e: any) {
        Toast.show({ type: "error", text1: "카카오 로그인 실패", text2: String(e?.message ?? e) });
      } finally {
        setLoading(false);
      }
    };

    if (response?.type === "success") {
      const code = (response as any)?.params?.code;
      if (code) fetchProfile(code);
    }
  }, [response]);

  return (
    <TouchableOpacity
      onPress={() => promptAsync()}
      disabled={loading}
      style={{
        backgroundColor: "#FEE500",
        borderRadius: 8,
        padding: 12,
        alignItems: "center",
        justifyContent: "center",
        width: 220,
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color="#000" />
      ) : (
        <Text style={{ color: "#000", fontWeight: "bold" }}>카카오로 로그인</Text>
      )}
    </TouchableOpacity>
  );
}
