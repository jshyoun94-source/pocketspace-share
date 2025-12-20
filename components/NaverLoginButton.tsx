import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import Toast from "react-native-toast-message";
import { signInWithNaverAccessToken } from "../utils/authNaver";

WebBrowser.maybeCompleteAuthSession();

const NAVER_CLIENT_ID = process.env.EXPO_PUBLIC_NAVER_CLIENT_ID!;
const NAVER_CLIENT_SECRET = process.env.EXPO_PUBLIC_NAVER_CLIENT_SECRET!;
const NAVER_REDIRECT_URI = process.env.EXPO_PUBLIC_NAVER_REDIRECT_URI!;

const discovery = {
  authorizationEndpoint: "https://nid.naver.com/oauth2.0/authorize",
  tokenEndpoint: "https://nid.naver.com/oauth2.0/token",
};

export default function NaverLoginButton() {
  const [loading, setLoading] = useState(false);
  const redirectUri = useMemo(() => NAVER_REDIRECT_URI, []);
  const state = useMemo(() => Math.random().toString(36).slice(2), []);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: NAVER_CLIENT_ID,
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes: [],
      state,
    },
    discovery
  );

  useEffect(() => {
    const fetchTokenAndProfile = async (code: string) => {
      try {
        setLoading(true);

        // 네이버 토큰 요청
        const tokenRes = await fetch(
          `${discovery.tokenEndpoint}?grant_type=authorization_code&client_id=${NAVER_CLIENT_ID}&client_secret=${NAVER_CLIENT_SECRET}&code=${encodeURIComponent(
            code
          )}&state=${state}`,
          { method: "GET" }
        );
        const tokenData = await tokenRes.json();
        if (!tokenData.access_token) throw new Error("토큰 발급 실패");

        // 커스텀 토큰 로그인 + Firestore 저장
        await signInWithNaverAccessToken(tokenData.access_token);

        // 프로필 표시용(선택)
        const profileRes = await fetch("https://openapi.naver.com/v1/nid/me", {
          headers: { Authorization: `Bearer ${tokenData.access_token}` },
        });
        const profileData = await profileRes.json();
        const name =
          profileData?.response?.name ??
          profileData?.response?.nickname ??
          "사용자";

        await AsyncStorage.setItem("loggedInUser", name);
        Toast.show({ type: "success", text1: `${name}님 환영합니다!` });
      } catch (e: any) {
        Toast.show({
          type: "error",
          text1: "네이버 로그인 실패",
          text2: String(e?.message ?? e),
        });
      } finally {
        setLoading(false);
      }
    };

    if (response?.type === "success") {
      const code = (response as any)?.params?.code;
      if (code) fetchTokenAndProfile(code);
    } else if (response?.type === "cancel") {
      Toast.show({ type: "info", text1: "로그인 취소" });
    } else if (response?.type === "dismiss") {
      Toast.show({ type: "info", text1: "창 닫힘" });
    }
  }, [response]);

  return (
    <TouchableOpacity
      onPress={() => promptAsync()}
      disabled={loading}
      style={{
        backgroundColor: "#1EC800",
        borderRadius: 8,
        padding: 12,
        alignItems: "center",
        justifyContent: "center",
        width: 220,
        opacity: loading ? 0.7 : 1,
      }}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <View
            style={{
              width: 20,
              height: 20,
              borderRadius: 3,
              backgroundColor: "#fff",
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Text style={{ color: "#1EC800", fontWeight: "bold", fontSize: 14 }}>
              N
            </Text>
          </View>
          <Text style={{ color: "#fff", fontWeight: "bold" }}>네이버 로그인</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
