// utils/authApple.ts - Sign in with Apple (백엔드 Custom Token 방식, nonce 이슈 우회)
import {
  onAuthStateChanged,
  signInWithCustomToken,
  updateProfile,
} from "firebase/auth";
import { arrayUnion, doc, serverTimestamp, setDoc } from "firebase/firestore";
import { auth, db } from "../firebase";

const API_BASE = (process.env.EXPO_PUBLIC_FUNCTIONS_ENDPOINT ?? "").replace(
  /\/+$/,
  ""
);

/** auth.currentUser가 세팅될 때까지 대기 */
function waitForAuthUser(timeoutMs = 5000): Promise<string> {
  return new Promise((resolve, reject) => {
    if (auth.currentUser?.uid) {
      resolve(auth.currentUser.uid);
      return;
    }
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

type AppleProfile = {
  id?: string;
  name?: string | null;
  email?: string | null;
  [k: string]: unknown;
};

/**
 * Apple identityToken을 백엔드로 보내 Custom Token을 받아 로그인 (nonce 검증 우회).
 */
export async function signInWithAppleCredential(
  identityToken: string,
  fullName?: { givenName?: string; familyName?: string } | null,
  email?: string | null
) {
  if (!API_BASE) {
    throw new Error("EXPO_PUBLIC_FUNCTIONS_ENDPOINT가 설정되지 않았습니다.");
  }

  const res = await fetch(`${API_BASE}/auth/apple`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      identityToken,
      email: email ?? null,
      fullName: fullName ?? null,
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    console.error("[Apple 로그인] 백엔드 실패:", data);
    throw new Error(data?.error ?? "Apple 로그인 실패");
  }

  const { customToken, profile: backendProfile } = data;
  if (!customToken) {
    throw new Error("서버에서 토큰을 받지 못했습니다.");
  }

  await signInWithCustomToken(auth, customToken);
  const uid = auth.currentUser?.uid ?? (await waitForAuthUser());

  const displayName =
    fullName?.givenName || fullName?.familyName
      ? [fullName.givenName, fullName.familyName].filter(Boolean).join(" ")
      : backendProfile?.name ?? undefined;

  await setDoc(
    doc(db, "users", uid),
    {
      providers: arrayUnion("apple"),
      name: displayName ?? null,
      email: email ?? auth.currentUser?.email ?? null,
      photoURL: null,
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  if (auth.currentUser && displayName) {
    await updateProfile(auth.currentUser, { displayName });
  }

  const profile: AppleProfile = {
    id: uid,
    name: displayName,
    email: email ?? auth.currentUser?.email ?? null,
  };

  console.log("✅ Apple 로그인 & Firestore 저장 완료:", uid);
  return { uid, profile };
}
