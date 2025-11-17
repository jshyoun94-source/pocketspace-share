// hooks/useKakaoLogin.ts
import { useCallback } from "react";
import { Alert } from "react-native";
// ✅ default import 말고, 모듈 전체를 * as 로 가져오기
import * as KakaoLogin from "@react-native-seoul/kakao-login";

export default function useKakaoLogin() {
  // ✅ 카카오 로그인
  const signInWithKakao = useCallback(async () => {
    try {
      // 안전 체크: 모듈이 제대로 올라왔는지 확인
      if (!KakaoLogin || typeof KakaoLogin.login !== "function") {
        console.log("⚠️ Kakao native module not available:", KakaoLogin);
        Alert.alert(
          "로그인 오류",
          "카카오 로그인 모듈이 올바르게 로드되지 않았어요.\n앱을 한번 완전히 종료 후 다시 실행해 주세요."
        );
        return;
      }

      const token = await KakaoLogin.login();
      console.log("✅ 카카오 로그인 성공:", token);

      const profile = await KakaoLogin.getProfile();
      console.log("✅ 카카오 프로필:", profile);

      Alert.alert(
        "로그인 성공",
        `${profile?.nickname ?? "사용자"}님, 환영합니다!`
      );

      return profile;
    } catch (error: any) {
      console.log("❌ 카카오 로그인 실패:", error);
      Alert.alert(
        "로그인 실패",
        error?.message ?? "로그인 중 오류가 발생했어요."
      );
    }
  }, []);

  // ✅ 카카오 로그아웃
  const signOutKakao = useCallback(async () => {
    try {
      if (!KakaoLogin || typeof KakaoLogin.logout !== "function") {
        console.log(
          "⚠️ Kakao native module not available for logout:",
          KakaoLogin
        );
        return;
      }

      await KakaoLogin.logout();
      Alert.alert("로그아웃 완료");
    } catch (error: any) {
      console.log("❌ 카카오 로그아웃 실패:", error);
    }
  }, []);

  return { signInWithKakao, signOutKakao };
}
