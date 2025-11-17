// hooks/useKakaoLogin.ts
import * as KakaoLogin from "@react-native-seoul/kakao-login";
import { signInWithCustomToken, User } from "firebase/auth";
import { useCallback } from "react";
import { Alert } from "react-native";
import { auth } from "../firebase";

// .env에 설정한 Functions 엔드포인트
const FUNCTIONS_ENDPOINT = process.env
  .EXPO_PUBLIC_FUNCTIONS_ENDPOINT as string | undefined;

export default function useKakaoLogin() {
  const signInWithKakao = useCallback(async (): Promise<User | undefined> => {
    try {
      // 0) 환경 변수 체크
      if (!FUNCTIONS_ENDPOINT) {
        console.log("⚠️ EXPO_PUBLIC_FUNCTIONS_ENDPOINT가 설정되지 않았습니다.");
        Alert.alert(
          "설정 오류",
          "서버 주소가 설정되지 않았어요.\n.env의 EXPO_PUBLIC_FUNCTIONS_ENDPOINT 값을 확인해 주세요."
        );
        return;
      }

      // 1) 네이티브 모듈 체크
      if (!KakaoLogin || typeof KakaoLogin.login !== "function") {
        console.log("⚠️ Kakao native module not available:", KakaoLogin);
        Alert.alert(
          "로그인 오류",
          "카카오 로그인 모듈이 올바르게 로드되지 않았어요.\n앱을 한번 완전히 종료 후 다시 실행해 주세요."
        );
        return;
      }

      // 2) 카카오 로그인 (여기까지는 이미 잘 동작 중)
      const token = await KakaoLogin.login();
      console.log("LOG  ✅ 카카오 로그인 성공:", token);

      const { accessToken } = token;

      // 3) Cloud Functions(Express api의 /auth/kakao)에 accessToken 전송
      const resp = await fetch(`${FUNCTIONS_ENDPOINT}/auth/kakao`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accessToken }),
      });

      if (!resp.ok) {
        const text = await resp.text();
        console.log("LOG  ❌ /auth/kakao 호출 실패:", text);
        Alert.alert("로그인 실패", "카카오 서버 인증에 실패했어요.");
        return;
      }

      const { customToken } = await resp.json();
      if (!customToken) {
        Alert.alert("로그인 실패", "서버에서 토큰을 받지 못했어요.");
        return;
      }

      // 4) Firebase Auth 로그인
      const userCredential = await signInWithCustomToken(auth, customToken);
      const user = userCredential.user;

      console.log("LOG  ✅ Firebase 카카오 로그인 완료:", user.uid);

      Alert.alert("로그인 성공", "카카오 계정으로 로그인되었습니다.");

      return user;
    } catch (error: any) {
      console.log("LOG  ❌ 카카오 로그인 전체 플로우 에러:", error);
      Alert.alert(
        "로그인 실패",
        error?.message ?? "로그인 중 오류가 발생했어요."
      );
    }
  }, []);

  const signOutKakao = useCallback(async () => {
    try {
      if (!KakaoLogin || typeof KakaoLogin.logout !== "function") {
        console.log(
          "⚠️ Kakao native module not available for logout:",
          KakaoLogin
        );
      } else {
        await KakaoLogin.logout();
      }

      await auth.signOut();
      Alert.alert("로그아웃 완료");
    } catch (error: any) {
      console.log("LOG  ❌ 카카오 로그아웃 실패:", error);
    }
  }, []);

  return { signInWithKakao, signOutKakao };
}
