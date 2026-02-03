/**
 * 마음공간(Mind Space) 평가 및 계산 로직
 * 당근마켓 매너온도 방식 참고
 */

export const MIND_SPACE = {
  DEFAULT: 50,
  MIN: 0,
  MAX: 100,
  MAX_CHANGE_PER_TRANSACTION: 3,
} as const;

/** 거래 상태 (보관 단계) */
export type TransactionStatus = "보관신청중" | "약속중" | "보관중" | "보관종료" | "거절됨";

/** 별점 → 마음공간 변동 (최종 평균 별점 기준) */
const SCORE_DELTA: { min: number; max: number; delta: number }[] = [
  { min: 5.0, max: 5.0, delta: 0.3 },
  { min: 4.0, max: 4.9, delta: 0.2 },
  { min: 3.0, max: 3.9, delta: 0.1 },
  { min: 2.0, max: 2.9, delta: -0.1 },
  { min: 1.0, max: 1.9, delta: -0.2 },
  { min: 0, max: 0.9, delta: -0.2 },
];

/**
 * 별점 배열의 평균으로 마음공간 변동값 계산
 * 단일 거래로 ±3 초과 방지
 */
export function calcMindSpaceDelta(scores: number[]): number {
  if (scores.length === 0) return 0;
  const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
  const entry = SCORE_DELTA.find((r) => avg >= r.min && avg <= r.max);
  let delta = entry?.delta ?? 0;
  delta = Math.max(-MIND_SPACE.MAX_CHANGE_PER_TRANSACTION, Math.min(MIND_SPACE.MAX_CHANGE_PER_TRANSACTION, delta));
  return Math.round(delta * 10) / 10; // 소수점 1자리
}

/**
 * 마음공간에 변동 적용 (0~100 범위 유지)
 */
export function applyMindSpaceDelta(current: number, delta: number): number {
  const next = current + delta;
  return Math.max(MIND_SPACE.MIN, Math.min(MIND_SPACE.MAX, Math.round(next * 10) / 10));
}

/** 공간대여자 평가 항목 (사용자 → 공간대여자) */
export const OWNER_EVAL_ITEMS = [
  { key: "schedule", label: "일정 준수", desc: "약속한 시간 및 장소를 잘 지켰는지" },
  { key: "storageCondition", label: "물건 보관 상태", desc: "보관 전과 동일한 상태로 유지되었는지" },
  { key: "manners", label: "기본적인 매너", desc: "소통, 응대 태도 등 전반적인 매너" },
] as const;

/** 사용자 평가 항목 (공간대여자 → 사용자) */
export const CUSTOMER_EVAL_ITEMS = [
  { key: "schedule", label: "일정 준수", desc: "약속 시간 및 반납 일정 준수 여부" },
  { key: "manners", label: "기본적인 매너", desc: "공간 이용 태도, 소통 매너 등" },
] as const;

/** 정책 고지 문구 */
export const MIND_SPACE_DISCLAIMER = [
  "마음공간은 다른 이용자의 참고를 위한 지표이며, 공간 상태나 이용 결과를 보증하지 않습니다.",
  "개별 거래의 만족도나 결과와는 다를 수 있습니다.",
] as const;
