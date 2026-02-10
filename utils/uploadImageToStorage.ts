/**
 * React Native에서 ArrayBuffer/Blob 미지원 문제 우회
 * Cloud Function으로 업로드 후 클라이언트에서 getDownloadURL (재시도로 일시적 object-not-found 방지)
 */
import "react-native-get-random-values";
import { getDownloadURL, getStorage, ref } from "firebase/storage";
import { app, auth } from "../firebase";

const FUNCTIONS_ENDPOINT = (process.env.EXPO_PUBLIC_FUNCTIONS_ENDPOINT ?? "").replace(/\/+$/, "");

export async function uploadBase64ToStorage(
  base64: string,
  path: string,
  contentType = "image/jpeg"
): Promise<string> {
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  if (!FUNCTIONS_ENDPOINT) throw new Error("EXPO_PUBLIC_FUNCTIONS_ENDPOINT가 설정되지 않았습니다.");

  const token = await user.getIdToken();
  const storage = getStorage(app);
  const storageBucket = (app.options as { storageBucket?: string }).storageBucket ?? undefined;

  const res = await fetch(`${FUNCTIONS_ENDPOINT}/upload-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ base64, path, contentType, storageBucket }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `업로드 실패 (${res.status})`);
  }

  const { path: uploadedPath, bucket: usedBucket } = data;
  if (!uploadedPath) throw new Error("서버 응답에 path가 없습니다.");

  // Function이 실제로 사용한 버킷으로 URL 조회 (앱 설정은 .appspot.com, 실제 버킷은 .firebasestorage.app일 수 있음)
  const storageForUrl = usedBucket ? getStorage(app, usedBucket) : storage;
  const storageRef = ref(storageForUrl, uploadedPath);

  // 업로드 직후 동기화 지연으로 object-not-found 나올 수 있음 → 최대 5회, 1.5초 간격 재시도
  for (let attempt = 1; attempt <= 5; attempt++) {
    try {
      return await getDownloadURL(storageRef);
    } catch (e: any) {
      if ((e?.code === "storage/object-not-found" || e?.message?.includes("object-not-found")) && attempt < 5) {
        await new Promise((r) => setTimeout(r, 1500));
        continue;
      }
      throw e;
    }
  }
  throw new Error("이미지 URL을 가져오지 못했습니다.");
}
