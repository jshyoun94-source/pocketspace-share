// hooks/useKakaoLogin.ts
import KakaoLogins from "@react-native-seoul/kakao-login";
import { useCallback } from "react";
import { Alert } from "react-native";

export default function useKakaoLogin() {
  // ✅ 로그인 함수
  const signInWithKakao = useCallback(async () => {
    try {
      const result = await KakaoLogins.login();
      console.log("✅ 카카오 로그인 성공:", result);

      const profile = await KakaoLogins.getProfile();
      console.log("✅ 프로필:", profile);

      Alert.alert("로그인 성공", `${profile.nickname}님 환영합니다!`);
      return profile;
    } catch (error: any) {
      console.log("❌ 로그인 실패:", error);
      Alert.alert("로그인 실패", error.message || "로그인 중 오류 발생");
    }
  }, []);

  // ✅ 로그아웃 함수
  const signOutKakao = useCallback(async () => {
    try {
      await KakaoLogins.logout();
      Alert.alert("로그아웃 완료");
    } catch (error: any) {
      console.log("❌ 로그아웃 실패:", error);
    }
  }, []);

  return { signInWithKakao, signOutKakao };
}
