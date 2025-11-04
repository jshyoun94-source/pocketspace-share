import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity } from "react-native";
import Toast from "react-native-toast-message";

WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID!;

export default function GoogleLoginButton() {
  const [loading, setLoading] = useState(false);
  const redirectUri = useMemo(
    () => AuthSession.makeRedirectUri({ scheme: "com.jshyoun94.pocketspace" }),
    []
  );
  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID,
      redirectUri,
      responseType: AuthSession.ResponseType.Token,
      scopes: ["profile", "email"],
    },
    discovery
  );

  useEffect(() => {
    const fetchProfile = async (accessToken: string) => {
      try {
        const res = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
          headers: { Authorization: `Bearer ${accessToken}` },
        });
        const data = await res.json();
        const name = data?.name ?? "Google 사용자";
        await AsyncStorage.setItem("loggedInUser", name);
        Toast.show({ type: "success", text1: `${name}님 환영합니다!` });
      } catch (e) {
        Toast.show({ type: "error", text1: "프로필 가져오기 실패" });
      }
    };

    if (response?.type === "success") {
      const token = (response as any)?.authentication?.accessToken;
      if (token) fetchProfile(token);
    }
  }, [response]);

  return (
    <TouchableOpacity
      onPress={() => promptAsync()}
      disabled={loading}
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
