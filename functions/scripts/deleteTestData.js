/**
 * 테스트 데이터 삭제 스크립트
 *
 * 공간, 채팅, 동네부탁, 동네생활, 거래 내역 등 테스트 데이터를 모두 삭제합니다.
 *
 * 실행 방법:
 *   cd functions
 *   node scripts/deleteTestData.js
 *
 * 실행 전 Firebase 프로젝트 설정:
 *   firebase use  (또는 firebase use <프로젝트ID>)
 *
 * 필요 시 서비스 계정 키:
 *   GOOGLE_APPLICATION_CREDENTIALS=./serviceAccountKey.json node scripts/deleteTestData.js
 */

const admin = require("firebase-admin");

// Firebase Admin 초기화
if (!admin.apps.length) {
  admin.initializeApp();
}

const db = admin.firestore();

async function deleteCollection(path, batchSize = 100) {
  const colRef = db.collection(path);
  const query = colRef.orderBy("__name__").limit(batchSize);
  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve, reject);
  });
}

async function deleteQueryBatch(query, resolve, reject) {
  const snapshot = await query.get();
  const batchSize = snapshot.size;

  if (batchSize === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();

  process.nextTick(() => deleteQueryBatch(query, resolve, reject));
}

async function deleteSubcollections(parentPath) {
  const parentRef = db.collection(parentPath);
  const parents = await parentRef.get();

  for (const parentDoc of parents.docs) {
    const subcollections = await parentDoc.ref.listCollections();
    for (const subcol of subcollections) {
      await deleteCollection(`${parentPath}/${parentDoc.id}/${subcol.id}`);
    }
  }
}

async function deleteCollectionWithSubcollections(collectionPath) {
  console.log(`  삭제 중: ${collectionPath} (서브컬렉션 포함)`);
  const colRef = db.collection(collectionPath);
  const docs = await colRef.get();

  for (const doc of docs.docs) {
    const subcollections = await doc.ref.listCollections();
    for (const subcol of subcollections) {
      await deleteCollection(`${collectionPath}/${doc.id}/${subcol.id}`);
    }
    await doc.ref.delete();
  }
  console.log(`  완료: ${collectionPath}`);
}

async function main() {
  console.log("Firebase 테스트 데이터 삭제를 시작합니다...\n");

  const collections = [
    { path: "spaces", name: "공간 등록" },
    { path: "chats", name: "채팅방", hasSub: "messages" },
    { path: "neighborhoodRequests", name: "동네부탁" },
    { path: "communityPosts", name: "동네생활", hasSub: "comments" },
    { path: "transactions", name: "거래 내역" },
  ];

  for (const col of collections) {
    try {
      await deleteCollectionWithSubcollections(col.path);
    } catch (e) {
      console.error(`  에러 (${col.path}):`, e.message);
    }
  }

  // users/favorites는 spaces를 참조하므로, 공간 삭제 후 즐겨찾기도 비우기 (선택)
  console.log("\n  users/{uid}/favorites 서브컬렉션 삭제 중...");
  const usersSnap = await db.collection("users").get();
  for (const userDoc of usersSnap.docs) {
    const favRef = db.collection(`users/${userDoc.id}/favorites`);
    const favs = await favRef.get();
    if (favs.size > 0) {
      const batch = db.batch();
      favs.docs.forEach((d) => batch.delete(d.ref));
      await batch.commit();
    }
  }
  console.log("  완료: favorites\n");

  console.log("테스트 데이터 삭제가 완료되었습니다.");
  process.exit(0);
}

main().catch((e) => {
  console.error("스크립트 실행 실패:", e);
  process.exit(1);
});
