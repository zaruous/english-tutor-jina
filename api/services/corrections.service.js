// 첨삭 SRS 복습 서비스 — vocab.service.js의 review()를 테이블명만 바꿔 복제한 것.
// 신규 SRS 코드 0줄: applyReview/predict는 srs.js 그대로 재사용한다
// (corrections가 user_vocab_cards와 같은 SRS 컬럼 세트를 가진 이유가 이것).
//
// 트랜잭션 안에 CLI 호출이 없다 — 이 라우트는 AI 무관 ("AI 먼저 DB 나중" 규칙 자연 준수).
import { HttpError } from '../lib/errors.js';
import { withTx } from '../lib/tx.js';
import { fetchCorrectionStats, getCorrectionDto } from './conversation.service.js';
import { applyReview, SRS_RESULTS } from './srs.js';

export async function reviewCorrection(user, correctionId, { result, clientRequestId, elapsedMs }) {
  if (!SRS_RESULTS.includes(result)) {
    throw new HttpError(400, 'BAD_REQUEST', `result는 ${SRS_RESULTS.join('/')} 중 하나여야 합니다.`);
  }
  return withTx(async (client) => {
    // 멱등: 같은 client_request_id가 이미 처리됐으면 현재 상태를 replay로 응답
    if (clientRequestId) {
      const { rows: [existing] } = await client.query(
        `SELECT correction_id FROM public.correction_reviews
          WHERE client_request_id = $1 AND user_id = $2`,
        [clientRequestId, user.id],
      );
      if (existing) {
        return {
          correction: await getCorrectionDto(user, existing.correction_id, client),
          stats: await fetchCorrectionStats(user.id, client),
          replay: true,
        };
      }
    }

    const { rows: [row] } = await client.query(
      `SELECT * FROM public.corrections WHERE id = $1 AND user_id = $2 FOR UPDATE`,
      [correctionId, user.id],
    );
    if (!row) throw new HttpError(404, 'NOT_FOUND', '첨삭을 찾을 수 없습니다.');

    const next = applyReview(row, result);
    // again → now()+10분, 그 외 → 사용자 TZ 자정 버킷 + N일.
    // 같은 파라미터를 ::int 캐스트와 || 텍스트 연결에 재사용하면 PG 42804 — make_interval만 쓴다.
    const { rows: [updated] } = await client.query(
      `UPDATE public.corrections
          SET next_review = CASE WHEN $3::int IS NOT NULL
                                 THEN now() + make_interval(mins => $3::int)
                                 ELSE (date_trunc('day', now() AT TIME ZONE $4) + make_interval(days => $5::int)) AT TIME ZONE $4
                            END,
              interval_days = $5, ease_factor = $6,
              review_count = review_count + 1,
              fail_count = fail_count + CASE WHEN $7 = 'again' THEN 1 ELSE 0 END,
              last_result = $7, last_reviewed_at = now(), updated_at = now()
        WHERE id = $1 AND user_id = $2
        RETURNING next_review`,
      [correctionId, user.id, next.againMinutes, user.tz,
       next.interval_days, next.ease_factor, result],
    );

    await client.query(
      `INSERT INTO public.correction_reviews
         (correction_id, user_id, result, prev_interval_days, prev_ease_factor,
          next_interval_days, next_ease_factor, next_review, elapsed_ms, client_request_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [correctionId, user.id, result, row.interval_days, row.ease_factor,
       next.interval_days, next.ease_factor, updated.next_review,
       elapsedMs ?? null, clientRequestId ?? null],
    );

    return {
      correction: await getCorrectionDto(user, correctionId, client),
      stats: await fetchCorrectionStats(user.id, client),
    };
  });
}
