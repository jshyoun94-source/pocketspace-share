// utils/authGoogle.ts
import { onAuthStateChanged, signInWithCustomToken, updateProfile } from "firebase/auth";
import { arrayUnion, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

type GoogleProfile = {
  id?: string;
  name?: string | null;
  email?: string | null;
  picture?: string | null;
  [k: string]: any;
};

type TokenResponse = {
  customToken?: string;
  profile?: GoogleProfile;
  error?: string;
};

const RAW = process.env.EXPO_PUBLIC_FUNCTIONS_ENDPOINT as string | undefined;
// 끝의 슬래시가 중복되면 404 날 수 있어 정규화
const API_BASE = (RAW ?? "").replace(/\/+$/, "");

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

export async function signInWithGoogleAccessToken(accessToken: string) {
  if (!API_BASE) throw new Error("FUNCTIONS endpoint가 설정되지 않았습니다. (.env 확인)");

  // 1) Functions에 커스텀 토큰 요청
  let data: TokenResponse;
  try {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken }),
    });
    data = (await res.json()) as TokenResponse;
    if (!res.ok) {
      throw new Error(data?.error || `서버 오류 (HTTP ${res.status})`);
    }
  } catch (e: any) {
    throw new Error(`토큰 교환 실패: ${e?.message ?? e}`);
  }

  const { customToken, profile = {} } = data;
  if (!customToken) throw new Error("커스텀 토큰이 없습니다.");

  // 2) Firebase Auth 로그인
  await signInWithCustomToken(auth, customToken);

  // 2.5) auth.currentUser 설정될 때까지 대기 (플랫폼/네트워크에 따라 약간 지연될 수 있음)
  const uid = auth.currentUser?.uid ?? (await waitForAuthUser());

  // 3) Firestore upsert (merge: true로 기존 provider 정보 유지)
  await setDoc(
    doc(db, "users", uid),
    {
      // providers 배열에 "google" 추가 (이미 있으면 중복되지 않음)
      providers: arrayUnion("google"),
      googleId: profile.id ?? null,
      name: profile.name ?? null,
      email: profile.email ?? null,
      photoURL: profile.picture ?? null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // 4) Firebase Auth 프로필 동기화
  if (auth.currentUser) {
    await updateProfile(auth.currentUser, {
      displayName: profile.name ?? undefined,
      photoURL: profile.picture ?? undefined,
    });
  }

  console.log("✅ Google 로그인 & Firestore 저장 완료:", uid);
  return { uid, profile };
}

