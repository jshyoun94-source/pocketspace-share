/**
 * 특정 이메일 계정이 쓴 동네부탁 게시글 1건 삭제
 *
 * 사용 (functions 폴더에서):
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/deleteOneRequestByEmail.js
 *
 * serviceAccountKey.json: Firebase 콘솔 → 프로젝트 설정 → 서비스 계정 → 키 추가 → JSON 다운로드
 */

const admin = require("firebase-admin");

if (!admin.apps.length) {
  admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT || "tangential-sled-352810" });
}

const auth = admin.auth();
const db = admin.firestore();

const EMAIL = "jshyoun94@gmail.com";

async function main() {
  const user = await auth.getUserByEmail(EMAIL);
  const uid = user.uid;
  console.log("사용자:", EMAIL, "uid:", uid);

  const snap = await db.collection("neighborhoodRequests").where("authorId", "==", uid).limit(1).get();
  if (snap.empty) {
    console.log("해당 계정의 동네부탁 게시글이 없습니다.");
    process.exit(0);
    return;
  }
  const doc = snap.docs[0];
  console.log("삭제할 글:", doc.id, doc.data()?.title ?? "(제목 없음)");
  await doc.ref.delete();
  console.log("삭제 완료.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
