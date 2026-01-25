// hooks/useKakaoLogin.ts
import * as KakaoLogin from "@react-native-seoul/kakao-login";
import { onAuthStateChanged, signInWithCustomToken, updateProfile, User } from "firebase/auth";
import { arrayUnion, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { useCallback } from "react";
import { Alert } from "react-native";
import { auth, db } from "../firebase";

// .env에 설정한 Functions 엔드포인트
const RAW = process.env.EXPO_PUBLIC_FUNCTIONS_ENDPOINT as string | undefined;
// 끝의 슬래시가 중복되면 404 날 수 있어 정규화
const FUNCTIONS_ENDPOINT = (RAW ?? "").replace(/\/+$/, "");

type KakaoProfile = {
  id?: number;
  email?: string | null;
  nickname?: string | null;
  profileImageUrl?: string | null;
  [k: string]: any;
};

type TokenResponse = {
  customToken?: string;
  profile?: KakaoProfile;
  error?: string;
};

/** auth.currentUser가 세팅될 때까지 잠깐 대기 */
function waitForAuthUser(timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      unsub();
      reject(new Error("로그인 실패 (uid 타임아웃)"));
    }, timeoutMs);
    const unsub = onAuthStateChanged(auth, (u) => {
      if (u?.uid) {
        clearTimeout(t);
        unsub();
        resolve(u.uid);
      }
    });
  });
}

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
      let data: TokenResponse;
      try {
        const resp = await fetch(`${FUNCTIONS_ENDPOINT}/auth/kakao`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accessToken }),
        });
        data = (await resp.json()) as TokenResponse;
        if (!resp.ok) {
          throw new Error(data?.error || `서버 오류 (HTTP ${resp.status})`);
        }
      } catch (e: any) {
        console.log("LOG  ❌ /auth/kakao 호출 실패:", e);
        Alert.alert("로그인 실패", `카카오 서버 인증에 실패했어요.\n${e?.message ?? e}`);
        return;
      }

      const { customToken, profile = {} } = data;
      if (!customToken) {
        Alert.alert("로그인 실패", "서버에서 토큰을 받지 못했어요.");
        return;
      }

      // 4) Firebase Auth 로그인
      await signInWithCustomToken(auth, customToken);

      // 4.5) auth.currentUser 설정될 때까지 대기 (플랫폼/네트워크에 따라 약간 지연될 수 있음)
      const uid = auth.currentUser?.uid ?? (await waitForAuthUser());

      // 5) Firestore에 유저 정보 저장 (merge: true로 기존 provider 정보 유지)
      await setDoc(
        doc(db, "users", uid),
        {
          // providers 배열에 "kakao" 추가 (이미 있으면 중복되지 않음)
          providers: arrayUnion("kakao"),
          kakaoId: profile.id ?? null,
          nickname: profile.nickname ?? null,
          email: profile.email ?? null,
          photoURL: profile.profileImageUrl ?? null,
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      );

      // 6) Firebase Auth 프로필 동기화
      if (auth.currentUser) {
        await updateProfile(auth.currentUser, {
          displayName: profile.nickname ?? undefined,
          photoURL: profile.profileImageUrl ?? undefined,
        });
      }

      console.log("LOG  ✅ Firebase 카카오 로그인 & Firestore 저장 완료:", uid);

      // Alert 제거 - 로그인 화면에서 처리
      return auth.currentUser ?? undefined;
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
