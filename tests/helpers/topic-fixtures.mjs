// 주제별 학습(토픽) 테스트 픽스처 — 시드 slug ↔ eligible 임계치(레슨 3 · 시나리오 1 · 단어 20) 조합.
//
// admin-topic.test.mjs · e2e-topics.mjs · AI 초안 패널(topic_id 선택) 검증에서 같은 시드 콘텐츠를
// 가리킬 때 이 모듈을 쓴다. slug 는 db/content/*.json 이 단일 소스다.
import { ELIGIBLE_THRESHOLDS } from '../../api/lib/topic-eligible.js';

/** db/content/topics.json — eligible 충족 시드 TOEIC RC 토픽(대표 1번) */
export const TOPIC_SEED_SLUGS = Object.freeze({
  topic: 'toeic-rc-business-email',
  lessons: {
    part7: ['toeic-part7-set23', 'toeic-part7-set24', 'toeic-rc-meeting-schedule-1'],
    part5Interview: [
      'business-interview-part5-grammar',
      'business-interview-part5-vocabulary',
      'business-interview-part5-situations',
    ],
    lc: ['toeic-lc-short-conversation-1', 'toeic-lc-short-talk-1'],
  },
  scenario: 'toeic-rc-business-email-scenario',
  vocabSet: 'toeic-rc-business-email-words',
  /** 저작 API 시드(면접) — 토픽과 무관하게 catalog 에 남아 있다 */
  legacyScenario: 'business-interview-star',
  legacyVocabSet: 'business-interview-core-20',
});

/** admin-topic.test 의 fullSet — 레슨 3 · 시나리오 1 · 단어 20 (RC 대표 토픽 구성) */
export function topicEligibleContents(seedBySlug) {
  const id = (slug) => {
    const v = seedBySlug[slug];
    if (v == null) throw new Error(`시드 slug 없음: ${slug}`);
    return v;
  };
  const { lessons, scenario, vocabSet } = TOPIC_SEED_SLUGS;
  return [
    { content_id: id(lessons.part7[0]), position: 1 },
    { content_id: id(lessons.part7[1]), position: 2 },
    { content_id: id(lessons.part7[2]), position: 3 },
    { content_id: id(scenario), position: 10 },
    { content_id: id(vocabSet), position: 20 },
  ];
}

/** 시드 RC 토픽 #1(business-email) — topics.json 과 동일 */
export function topicSeedRcEmailContents(seedBySlug) {
  const id = (slug) => seedBySlug[slug];
  return [
    { content_id: id('toeic-part7-set23'), position: 1 },
    { content_id: id('toeic-rc-business-email-2'), position: 2 },
    { content_id: id('toeic-rc-business-email-3'), position: 3 },
    { content_id: id('toeic-rc-business-email-scenario'), position: 10 },
    { content_id: id('toeic-rc-business-email-words'), position: 20 },
  ];
}

/** 임계치 미달 — 레슨 2만 */
export function topicPartialLessonsOnly(seedBySlug) {
  const id = (slug) => seedBySlug[slug];
  return TOPIC_SEED_SLUGS.lessons.part7.slice(0, 2).map((slug, i) => ({
    content_id: id(slug),
    position: i + 1,
  }));
}

export { ELIGIBLE_THRESHOLDS };

/** pool 로 slug → content_items.id 맵을 만든다 */
export async function loadTopicSeedIds(pool, slugs = allTopicSeedSlugs()) {
  const { rows } = await pool.query(
    `SELECT id, slug FROM content_items WHERE slug = ANY($1::text[])`,
    [slugs],
  );
  const map = Object.fromEntries(rows.map((r) => [r.slug, r.id]));
  const missing = slugs.filter((s) => map[s] == null);
  if (missing.length) throw new Error(`시드 콘텐츠 없음: ${missing.join(', ')}`);
  return map;
}

function allTopicSeedSlugs() {
  const s = TOPIC_SEED_SLUGS;
  return [
    ...s.lessons.part7,
    ...s.lessons.part5Interview,
    ...s.lessons.lc,
    s.scenario,
    s.vocabSet,
    s.legacyScenario,
    s.legacyVocabSet,
    'toeic-rc-business-email-2',
    'toeic-rc-business-email-3',
  ];
}
