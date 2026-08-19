// SRS — vocabulary.jsx applyReview(133-153) 이관.
// 변경점(계획 확정):
//  - again → interval_days=0, next_review = now()+10분 (Anki 관행. 라벨도 서버가
//    "10분"으로 내려 기존 하드코딩 "1분"과의 불일치를 영구 해소)
//  - hard/good/easy → 기존 공식 유지, next_review = 사용자 TZ 자정 버킷 + N일
//    (now()+1day 로 하면 23:50에 복습한 카드가 다음날 23:50에야 due가 되어
//    UI의 "Tomorrow"와 어긋난다)
export const SRS_RESULTS = ['again', 'hard', 'good', 'easy'];

// 순수 계산: 카드 상태 → 결과별 다음 상태
export function applyReview(card, result) {
  const { interval_days, ease_factor } = card;
  let newEF = ease_factor;
  let newInterval = interval_days;
  let againMinutes = null;

  if (result === 'again') {
    newInterval = 0;
    againMinutes = 10;
    newEF = Math.max(1.3, ease_factor - 0.2);
  } else if (result === 'hard') {
    newInterval = Math.max(1, Math.round(interval_days * 1.2));
    newEF = Math.max(1.3, ease_factor - 0.15);
  } else if (result === 'good') {
    newInterval = Math.max(2, Math.round(interval_days * ease_factor));
  } else if (result === 'easy') {
    newInterval = Math.max(4, Math.round(interval_days * ease_factor * 1.3));
    newEF = Math.min(3.0, ease_factor + 0.15);
  } else {
    throw new Error(`알 수 없는 result: ${result}`);
  }

  return {
    interval_days: newInterval,
    ease_factor: Number(newEF.toFixed(2)),
    againMinutes, // null이면 자정 버킷 + interval_days
    label: againMinutes !== null ? `${againMinutes}분` : `${newInterval}일`,
  };
}

// 4개 결과의 실제 예측치 — 복습 버튼 부제가 실제 계산과 어긋날 수 없게
// applyReview와 같은 공식으로 dry-run 한다.
export function predict(card) {
  const preview = {};
  for (const result of SRS_RESULTS) {
    const next = applyReview(card, result);
    preview[result] = {
      interval_days: next.interval_days,
      ease_factor: next.ease_factor,
      in_days: next.againMinutes !== null ? 0 : next.interval_days,
      label: next.label,
    };
  }
  return preview;
}
