// 토픽 '채움' 판정의 단일 소스 — 임계치와 집계 SQL 조각을 학습 API(topic.service)와 관리 API(admin-topic.service)가
// 함께 쓴다. 예전에는 두 파일이 3/1/20 리터럴과 부질의 세 개를 각자 들고 있어서, 임계치를 바꾸는 날
// 한쪽만 고치면 학습자 화면과 관리자 배지가 서로 다른 답을 냈다(라운드 05 리뷰).
//
// eligible 은 **필터가 아니라 배지다**(플랜 11 결정 3). 노출 여부는 status 가 정하고, 이 값은
// "콘텐츠를 얼마나 채웠나" 를 관리 화면이 경고로 보여주는 재료다.
import { discoverable } from './content-scope.js';

export const ELIGIBLE_THRESHOLDS = Object.freeze({ lesson: 3, scenario: 1, vocab: 20 });

export function isEligible(row) {
  return row.lesson_count >= ELIGIBLE_THRESHOLDS.lesson
    && row.scenario_count >= ELIGIBLE_THRESHOLDS.scenario
    && row.vocab_count >= ELIGIBLE_THRESHOLDS.vocab;
}

// 토픽 t 에 붙은 콘텐츠 집계 세 컬럼(lesson_count · scenario_count · vocab_count). 분모는 discoverable —
// 내린(archived) 콘텐츠는 학습자에게도 관리자 배지에도 세지 않는다(플랜 11 §3 진행률 분모 규칙과 같은 이유).
// alias 는 topics 의 별칭, userParam 은 discoverable 의 소유자 예외에 쓰는 '$n'.
export function topicCountCols(alias, userParam) {
  const ofType = (a, type) => `${a}.type = '${type}' AND ${discoverable(a, userParam)}`;
  return `
         (SELECT count(*)::int
            FROM topic_contents tc
            JOIN content_items l ON l.id = tc.content_id
           WHERE tc.topic_id = ${alias}.id AND ${ofType('l', 'lesson')}) AS lesson_count,
         (SELECT count(*)::int
            FROM topic_contents tc
            JOIN content_items s ON s.id = tc.content_id
           WHERE tc.topic_id = ${alias}.id AND ${ofType('s', 'scenario')}) AS scenario_count,
         (SELECT COALESCE(sum(jsonb_array_length(vd.words)), 0)::int
            FROM topic_contents tc
            JOIN content_items v ON v.id = tc.content_id
            JOIN vocab_set_details vd ON vd.content_id = v.id
           WHERE tc.topic_id = ${alias}.id AND ${ofType('v', 'vocab_set')}) AS vocab_count`;
}
