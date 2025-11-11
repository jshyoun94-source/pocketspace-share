// utils/kakaoAuth.ts
import * as AuthSession from "expo-auth-session";
import Constants from "expo-constants";
import * as WebBrowser from "expo-web-browser";

WebBrowser.maybeCompleteAuthSession();

const extra = (Constants.expoConfig?.extra || {}) as any;

// ✅ .env 값 불러오기
const kakaoRestApiKey = extra.EXPO_PUBLIC_KAKAO_REST_API_KEY as string;
const redirectUri = extra.EXPO_PUBLIC_KAKAO_REDIRECT_URI as string;

// ✅ Kakao OAuth 엔드포인트
const discovery = {
  authorizationEndpoint: "https://kauth.kakao.com/oauth/authorize",
};

/**
 * 🔐 Kakao 로그인 (Functions Redirect Bridge 기반)
 * Kakao 로그인 화면 → code 발급 → Firebase Functions(https) → 앱 리다이렉트
 */
export async function loginWithKakaoAuthCode(): Promise<string | null> {
  try {
    // ✅ .env 값 실제 반영 확인용 로그
    console.log("🔥 ENV TEST REST_API_KEY:", kakaoRestApiKey);
    console.log("🔥 ENV TEST REDIRECT_URI:", redirectUri);

    if (!kakaoRestApiKey || !redirectUri) {
      console.warn("❌ Kakao 설정(.env)이 비어있습니다.");
      return null;
    }

    console.log("📍 Kakao redirectUri in app:", redirectUri);

    // OAuth 요청 설정
    const request = new AuthSession.AuthRequest({
      clientId: kakaoRestApiKey,
      redirectUri, // Firebase Functions redirect endpoint
      responseType: AuthSession.ResponseType.Code,
    });

    // 실제 카카오 로그인 URL 생성
    const authUrl = await request.makeAuthUrlAsync(discovery);
    console.log("🔗 Kakao authUrl:", authUrl);

    // 카카오 로그인 창 실행
    const result = await request.promptAsync(discovery);
    console.log("🔍 Kakao Auth Result:", result);

    // 로그인 실패/취소 시
    if (result.type !== "success") {
      console.log("❌ Kakao 로그인 취소 또는 실패:", result);
      return null;
    }

    // 인가 코드 추출
    const code = result.params?.code;
    if (!code || typeof code !== "string") {
      console.log("⚠️ 인가 코드 없음:", result.params);
      return null;
    }

    console.log("✅ Kakao 인가 코드:", code);
    return code;
  } catch (error: any) {
    console.error("🔥 Kakao 로그인 중 오류:", error);
    return null;
  }
}
