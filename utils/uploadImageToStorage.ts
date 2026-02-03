/**
 * React Native에서 ArrayBuffer/Blob 미지원 문제 우회
 * Cloud Function을 통해 서버에서 업로드 (Blob 사용 없음)
 */
import "react-native-get-random-values";
import { getDownloadURL, ref } from "firebase/storage";
import { app, auth } from "../firebase";
import { getStorage } from "firebase/storage";

const FUNCTIONS_ENDPOINT = (process.env.EXPO_PUBLIC_FUNCTIONS_ENDPOINT ?? "").replace(/\/+$/, "");

export async function uploadBase64ToStorage(
  base64: string,
  path: string,
  contentType = "image/jpeg"
): Promise<string> {
  const storage = getStorage(app);
  const user = auth.currentUser;
  if (!user) throw new Error("로그인이 필요합니다.");
  if (!FUNCTIONS_ENDPOINT) throw new Error("EXPO_PUBLIC_FUNCTIONS_ENDPOINT가 설정되지 않았습니다.");

  const token = await user.getIdToken();

  const res = await fetch(`${FUNCTIONS_ENDPOINT}/upload-image`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ base64, path, contentType }),
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.error || `업로드 실패 (${res.status})`);
  }

  const { path: uploadedPath } = data;
  if (!uploadedPath) throw new Error("서버 응답에 path가 없습니다.");

  const storageRef = ref(storage, uploadedPath);
  return await getDownloadURL(storageRef);
}
