import {
  collection,
  query,
  where,
  getDocs,
  limit,
  Timestamp,
} from "firebase/firestore";
import type { Firestore } from "firebase/firestore";

const DAILY_LIMIT = 5;

/** 오늘 00:00:00 (로컬) 기준 Timestamp */
function getStartOfToday(): Timestamp {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return Timestamp.fromDate(d);
}

/**
 * 해당 컬렉션에서 오늘 현재 사용자가 등록한 건수가 5건 미만이면 true, 5건 이상이면 false.
 * (6번째 등록 시도 시 false 반환 → "하루에 5건까지 등록이 가능합니다" 안내용)
 */
export async function canPostToday(
  db: Firestore,
  collectionName: string,
  userIdField: "authorId" | "ownerId",
  userId: string
): Promise<boolean> {
  const startOfToday = getStartOfToday();
  const ref = collection(db, collectionName);
  const q = query(
    ref,
    where(userIdField, "==", userId),
    where("createdAt", ">=", startOfToday),
    limit(DAILY_LIMIT + 1)
  );
  const snap = await getDocs(q);
  return snap.size < DAILY_LIMIT;
}
