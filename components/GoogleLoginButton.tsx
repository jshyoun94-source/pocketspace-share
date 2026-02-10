import AsyncStorage from "@react-native-async-storage/async-storage";
import * as AuthSession from "expo-auth-session";
import * as Linking from "expo-linking";
import * as WebBrowser from "expo-web-browser";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Image, Text, TouchableOpacity, View } from "react-native";
import Toast from "react-native-toast-message";
import { signInWithGoogleAccessToken } from "../utils/authGoogle";

WebBrowser.maybeCompleteAuthSession();

const discovery = {
  authorizationEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
};

const GOOGLE_CLIENT_ID = process.env.EXPO_PUBLIC_GOOGLE_CLIENT_ID ?? "";
const FUNCTIONS_ENDPOINT = process.env.EXPO_PUBLIC_FUNCTIONS_ENDPOINT
  ? (process.env.EXPO_PUBLIC_FUNCTIONS_ENDPOINT ?? "").replace(/\/+$/, "")
  : "https://api-iqsbggf5na-du.a.run.app";
const GOOGLE_REDIRECT_URI = `${FUNCTIONS_ENDPOINT}/auth/google/callback`;

type Props = {
  onSuccess?: () => void | Promise<void>;
};

export default function GoogleLoginButton({ onSuccess }: Props) {
  const [loading, setLoading] = useState(false);
  const [processingCode, setProcessingCode] = useState<string | null>(null); // 중복 요청 방지
  const redirectUri = useMemo(() => GOOGLE_REDIRECT_URI, []);
  const state = useMemo(() => Math.random().toString(36).slice(2), []);

  const [request, response, promptAsync] = AuthSession.useAuthRequest(
    {
      clientId: GOOGLE_CLIENT_ID || "placeholder",
      redirectUri,
      responseType: AuthSession.ResponseType.Code,
      scopes: ["profile", "email"],
      state,
      usePKCE: true,
      // 로그아웃 후 다른 구글 계정으로 로그인하려면 계정 선택 화면이 나와야 함
      extraParams: { prompt: "select_account" },
    },
    discovery
  );

  // 딥링크 리스너 설정
  useEffect(() => {
    const subscription = Linking.addEventListener("url", async (event) => {
      const { url } = event;
      console.log("🔍 딥링크 받음:", url);
      
      if (url.startsWith("com.jshyoun94.pocketspace://google-auth")) {
        try {
          const parsedUrl = new URL(url);
          const code = parsedUrl.searchParams.get("code");
          const error = parsedUrl.searchParams.get("error");
          
          if (error) {
            console.log("❌ 딥링크에서 에러:", error);
            Toast.show({
              type: "error",
              text1: "구글 로그인 오류",
              text2: error,
            });
            return;
          }
          
          if (code && request) {
            console.log("✅ 딥링크에서 code 받음:", code);
            await fetchTokenAndProfile(code);
          }
        } catch (e: any) {
          console.log("❌ 딥링크 처리 에러:", e);
          Toast.show({
            type: "error",
            text1: "로그인 처리 오류",
            text2: e?.message || "알 수 없는 오류",
          });
        }
      }
    });
    
    return () => {
      subscription.remove();
    };
  }, [request]);

  const fetchTokenAndProfile = async (code: string) => {
    try {
      setLoading(true);

      // Functions에서 code를 accessToken으로 교환
      const API_BASE = (process.env.EXPO_PUBLIC_FUNCTIONS_ENDPOINT ?? "").replace(/\/+$/, "");
      if (!API_BASE) throw new Error("FUNCTIONS endpoint가 설정되지 않았습니다.");

      // PKCE code_verifier 전달 (필수!)
      const codeVerifier = request?.codeVerifier;
      if (!codeVerifier) {
        throw new Error("code_verifier가 없습니다.");
      }

      console.log("🔍 code_verifier 전달:", codeVerifier ? "있음" : "없음");

      const tokenRes = await fetch(`${API_BASE}/auth/google/code`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, redirectUri, state, codeVerifier }),
      });

      const tokenData = await tokenRes.json();
      if (!tokenRes.ok || !tokenData.accessToken) {
        throw new Error(tokenData?.error || "토큰 교환 실패");
      }

      // 커스텀 토큰 로그인 + Firestore 저장
      const { profile } = await signInWithGoogleAccessToken(tokenData.accessToken);

      // 프로필 표시용
      const name = profile?.name ?? "Google 사용자";
      await AsyncStorage.setItem("loggedInUser", name);
      Toast.show({ type: "success", text1: `${name}님 환영합니다!` });
      
      // 로그인 성공 콜백 호출
      if (onSuccess) {
        await onSuccess();
      }
    } catch (e: any) {
      console.log("❌ 구글 로그인 에러:", e);
      Toast.show({
        type: "error",
        text1: "구글 로그인 실패",
        text2: String(e?.message ?? e),
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // response가 변경될 때마다 로그 출력
    if (response) {
      console.log("🔍 Google 로그인 응답 변경:", response);
      console.log("🔍 응답 타입:", response?.type);
      console.log("🔍 응답 전체:", JSON.stringify(response, null, 2));
    }

    if (response?.type === "success") {
      const code = (response as any)?.params?.code;
      console.log("✅ response에서 success 받음!");
      console.log("🔍 받은 code:", code ? "있음" : "없음");
      console.log("🔍 code 값:", code);
      console.log("🔍 request 존재:", request ? "있음" : "없음");
      
      // 중복 요청 방지: 이미 처리 중인 code는 무시
      if (code && request && code !== processingCode) {
        setProcessingCode(code);
        fetchTokenAndProfile(code).finally(() => {
          setProcessingCode(null);
        });
      } else if (code === processingCode) {
        console.log("⚠️ 이미 처리 중인 code입니다. 중복 요청 무시");
      } else {
        console.log("❌ code 또는 request가 없습니다.");
        console.log("❌ code:", code);
        console.log("❌ request:", request);
      }
    } else if (response?.type === "error") {
      const errorDetails = (response as any)?.error;
      console.log("❌ Google 로그인 에러 응답:", response);
      console.log("❌ 에러 상세:", errorDetails);
      console.log("❌ 에러 코드:", errorDetails?.code);
      console.log("❌ 에러 메시지:", errorDetails?.message);
      Toast.show({
        type: "error",
        text1: "구글 로그인 오류",
        text2: errorDetails?.message || errorDetails?.code || "알 수 없는 오류",
      });
    } else if (response?.type === "cancel") {
      console.log("ℹ️ 사용자가 취소함");
      Toast.show({ type: "info", text1: "로그인 취소" });
    } else if (response?.type === "dismiss") {
      console.log("ℹ️ 창이 닫힘");
      Toast.show({ type: "info", text1: "창 닫힘" });
    }
  }, [response, redirectUri, state, request]);

  const handlePress = async () => {
    Toast.show({ type: "info", text1: "구글 로그인 창을 여는 중..." });

    if (!GOOGLE_CLIENT_ID) {
      Toast.show({
        type: "error",
        text1: "구글 로그인 설정 필요",
        text2: ".env에 EXPO_PUBLIC_GOOGLE_CLIENT_ID를 설정해주세요.",
      });
      return;
    }
    if (!request || request.clientId === "placeholder") {
      Toast.show({
        type: "error",
        text1: "로그인 준비 중",
        text2: "잠시 후 다시 눌러주세요.",
      });
      return;
    }
    try {
      
      // promptAsync를 호출하되, 타임아웃 설정
      const promptPromise = promptAsync();
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error("타임아웃: promptAsync가 완료되지 않았습니다")), 30000);
      });
      
      const result = await Promise.race([promptPromise, timeoutPromise]) as any;
      console.log("🔍 promptAsync 직접 결과:", JSON.stringify(result, null, 2));
      
      if (result?.type === "success") {
        const code = (result as any)?.params?.code;
        console.log("🔍 promptAsync에서 받은 code:", code ? "있음" : "없음");
        
        // 중복 요청 방지: 이미 처리 중이면 무시 (useEffect에서 처리할 예정)
        if (code && request && code !== processingCode) {
          setProcessingCode(code);
          await fetchTokenAndProfile(code).finally(() => {
            setProcessingCode(null);
          });
        } else if (code === processingCode) {
          console.log("⚠️ 이미 처리 중인 code입니다. 중복 요청 무시");
        }
      } else if (result?.type === "cancel") {
        console.log("ℹ️ 사용자가 취소함");
        Toast.show({ type: "info", text1: "로그인 취소" });
      } else if (result?.type === "error") {
        const errorDetails = (result as any)?.error;
        console.log("❌ promptAsync 에러:", errorDetails);
        Toast.show({
          type: "error",
          text1: "구글 로그인 오류",
          text2: errorDetails?.message || errorDetails?.code || "알 수 없는 오류",
        });
      }
    } catch (error: any) {
      console.log("❌ promptAsync 실행 에러:", error);
      console.log("❌ 에러 메시지:", error?.message);
      console.log("❌ 에러 스택:", error?.stack);
      
      // 타임아웃인 경우 response를 확인
      if (error?.message?.includes("타임아웃")) {
        console.log("⚠️ 타임아웃 발생 - response 확인:", response);
        if (response?.type === "success") {
          const code = (response as any)?.params?.code;
          if (code && request) {
            console.log("✅ response에서 code 발견, 처리 시작");
            // fetchTokenAndProfile 호출
            const API_BASE = (process.env.EXPO_PUBLIC_FUNCTIONS_ENDPOINT ?? "").replace(/\/+$/, "");
            if (API_BASE && request?.codeVerifier) {
              setLoading(true);
              try {
                const tokenRes = await fetch(`${API_BASE}/auth/google/code`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ code, redirectUri, state, codeVerifier: request.codeVerifier }),
                });

                const tokenData = await tokenRes.json();
                if (tokenRes.ok && tokenData.accessToken) {
                  const { profile } = await signInWithGoogleAccessToken(tokenData.accessToken);
                  const name = profile?.name ?? "Google 사용자";
                  await AsyncStorage.setItem("loggedInUser", name);
                  Toast.show({ type: "success", text1: `${name}님 환영합니다!` });
                  return;
                }
              } catch (e: any) {
                console.log("❌ 타임아웃 후 처리 에러:", e);
              } finally {
                setLoading(false);
              }
            }
          }
        }
      }
      
      Toast.show({
        type: "error",
        text1: "로그인 오류",
        text2: error?.message || "알 수 없는 오류",
      });
    }
  };

  return (
    <TouchableOpacity
      onPress={handlePress}
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
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Image
            source={{
              uri: "https://www.google.com/favicon.ico",
            }}
            style={{
              width: 20,
              height: 20,
            }}
            resizeMode="contain"
          />
          <Text style={{ color: "#111", fontWeight: "bold" }}>Google 로그인</Text>
        </View>
      )}
    </TouchableOpacity>
  );
}
