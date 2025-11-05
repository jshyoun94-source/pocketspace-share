import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import { GoogleAuthProvider, signInWithCredential } from "firebase/auth";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity } from "react-native";
import Toast from "react-native-toast-message";
import { auth } from "../firebase"; // initializeAuth + AsyncStorage persistence 적용된 공용 auth

WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

// .env 값 사용
const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID!;
const REDIRECT_URI = process.env.EXPO_PUBLIC_GOOGLE_REDIRECT_URI!; // 예: https://auth.expo.io/@jshyoun94-source/pocketspace

export default function GoogleLoginButton() {
  const [loading, setLoading] = useState(false);

  // useAuthRequest로 id_token 받기 (Firebase 연동용)
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      redirectUri: REDIRECT_URI,
      responseType: AuthSession.ResponseType.IdToken, // ✅ Firebase엔 id_token 필요
      scopes: ["openid", "email", "profile"],
    },
    discovery
  );

  useEffect(() => {
    (async () => {
      if (response?.type !== "success") return;

      // 환경/버전에 따라 위치가 다를 수 있어 안전하게 체크
      const idToken =
        (response as any)?.authentication?.idToken ??
        (response as any)?.params?.id_token;

      if (!idToken) {
        Toast.show({ type: "error", text1: "Google 로그인 실패", text2: "id_token이 비었습니다." });
        console.error("❌ Google: id_token 없음", response);
        setLoading(false);
        return;
      }

      try {
        const credential = GoogleAuthProvider.credential(idToken);
        const userCred = await signInWithCredential(auth, credential);

        const name = userCred.user.displayName ?? "Google 사용자";
        await AsyncStorage.setItem("loggedInUser", name);

        Toast.show({ type: "success", text1: `${name}님 환영합니다!` });
        console.log("✅ Google -> Firebase 성공:", userCred.user.uid);
      } catch (e) {
        console.error("❌ Firebase signIn 실패:", e);
        Toast.show({ type: "error", text1: "로그인 실패", text2: "Firebase 인증에 실패했습니다." });
      } finally {
        setLoading(false);
      }
    })();
  }, [response]);

  return (
    <TouchableOpacity
      onPress={async () => {
        try {
          setLoading(true);
          // ❌ { useProxy: true } 제거 (버전 미지원)
          await promptAsync();
        } catch (e) {
          console.error("❌ Google prompt 실패:", e);
          Toast.show({ type: "error", text1: "로그인 시작 실패" });
          setLoading(false);
        }
      }}
      disabled={!request || loading}
      style={{
        backgroundColor: "#fff",
        borderWidth: 1,
        borderColor: "#ccc",
        borderRadius: 8,
        padding: 12,
        alignItems: "center",
        justifyContent: "center",
        width: 220,
        flexDirection: "row",
        gap: 8,
      }}
    >
      {loading ? (
        <ActivityIndicator color="#000" />
      ) : (
        <Text style={{ color: "#111", fontWeight: "bold" }}>Google로 로그인</Text>
      )}
    </TouchableOpacity>
  );
}
