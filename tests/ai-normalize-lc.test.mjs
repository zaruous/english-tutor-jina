// AI 초안 파이프라인의 LC 선행 결함 2건을 잠근다 (플랜 14 §1 B1). AI 호출·DB 없이 순수 함수만 본다.
//
// ① normalizeLessonGen 이 LC script 의 {speaker,text} 를 String(line) 으로 뭉개 "[object Object]" 가 되던 회귀 —
//    5902ae7b 가 스키마·검증기·저장만 객체형으로 바꾸고 정규화는 남겨 두어 워커 LC 생성이 항상 VALIDATION_FAILED 였다.
// ② LESSON_GEN_LC_SCHEMA 가 Part 5 의 items minItems 3 을 상속해 normalizeJobInput 이 허용하는 count=2 가
//    SCHEMA_VIOLATION 이었다.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { normalizeLessonGen } from '../api/ai/normalize.js';
import { LESSON_GEN_LC_SCHEMA, LESSON_GEN_SCHEMA, validateAgainst } from '../api/ai/schemas.js';
import { validateGeneratedLesson } from '../api/services/ai-job.service.js';

const item = (n) => ({
  stem: `Question ${n}: What does the man ask for?`,
  options: [
    { id: 'A', text: 'A room reservation' }, { id: 'B', text: 'A lunch order' },
    { id: 'C', text: 'A parking permit' }, { id: 'D', text: 'A new laptop' },
  ],
  answer: 'A', explanation: '(A) 남자가 회의실 예약을 요청한다.', skill_code: 'detail',
});
const items = (n) => Array.from({ length: n }, (_, i) => item(i + 1));

// 모델 응답 모양 — 스키마(enum M/W)를 통과한 뒤 정규화로 들어오는 값이지만, 정규화는 방어적으로 다듬는다.
const script = [
  { speaker: 'M', text: 'Could I reserve the conference room for tomorrow morning?' },
  { speaker: 'W', text: 'The large room is available after ten in the morning.' },
  { speaker: 'M', text: 'Please reserve it for the weekly planning meeting.' },
  { speaker: 'W', text: 'I will send you a confirmation email right away.' },
];

describe('normalizeLessonGen — LC script', () => {
  it('객체 script 를 {speaker,text} 로 보존한다 — 문자열로 뭉개지 않는다', () => {
    const out = normalizeLessonGen({ title: 'LC', subtitle: '회의실', script, items: items(3) });
    assert.deepEqual(out.script, script);
    assert.equal(out.script.some((line) => typeof line === 'string'), false);
    assert.equal(JSON.stringify(out).includes('[object Object]'), false);
  });

  it('객체 줄의 speaker 는 대문자 1글자, text 는 trim·400자 — 빈 대사 줄은 남겨 검증기가 지목하게 한다', () => {
    const out = normalizeLessonGen({
      title: 'LC',
      script: [
        { speaker: ' m ', text: '  Could I reserve the room?  ' },
        { speaker: 'W', text: 'x'.repeat(500) },
        { speaker: null, text: '' },
        { speaker: 'W', text: 'Sure, I will send a confirmation.' },
      ],
      items: items(3),
    });
    assert.deepEqual(out.script[0], { speaker: 'M', text: 'Could I reserve the room?' });
    assert.equal(out.script[1].text.length, 400);
    assert.deepEqual(out.script[2], { speaker: '', text: '' });
    assert.equal(out.script.length, 4);
  });

  it('문자열 script 도 여전히 통과한다 — 라벨을 파싱해 객체로 만들지 않는다(10.7 이 없앤 코드를 되살리지 않음)', () => {
    const legacy = ['M: Could I reserve the room?', '  W: Sure, after ten.  ', '', 'M: Thanks.'];
    const out = normalizeLessonGen({ title: 'LC', script: legacy, items: items(3) });
    assert.deepEqual(out.script, ['M: Could I reserve the room?', 'W: Sure, after ten.', 'M: Thanks.']);
  });

  it('script 가 없거나(Part 5) 비면 키 자체를 싣지 않는다 — Part 5 응답 모양은 그대로', () => {
    assert.equal('script' in normalizeLessonGen({ title: 'P5', items: items(3) }), false);
    assert.equal('script' in normalizeLessonGen({ title: 'P5', script: [], items: items(3) }), false);
    assert.equal('script' in normalizeLessonGen({ title: 'P5', script: ['', '  '], items: items(3) }), false);
  });

  it('9줄 이상은 8줄에서 자른다', () => {
    const long = Array.from({ length: 10 }, (_, i) => ({ speaker: i % 2 ? 'W' : 'M', text: `Line number ${i} of the script.` }));
    assert.equal(normalizeLessonGen({ title: 'LC', script: long, items: items(3) }).script.length, 8);
  });
});

describe('LESSON_GEN_LC_SCHEMA — items 2~4', () => {
  const lc = (n) => ({ title: 'LC', subtitle: '회의실', script, items: items(n) });

  it('문항 2개를 통과시키고 5개를 거절한다 — normalizeJobInput 의 LC count 2~4 와 같은 범위', () => {
    assert.deepEqual(validateAgainst(LESSON_GEN_LC_SCHEMA, lc(2)), []);
    assert.deepEqual(validateAgainst(LESSON_GEN_LC_SCHEMA, lc(4)), []);
    assert.ok(validateAgainst(LESSON_GEN_LC_SCHEMA, lc(5)).some((e) => e.includes('items') && e.includes('최대 4')));
    assert.ok(validateAgainst(LESSON_GEN_LC_SCHEMA, lc(1)).some((e) => e.includes('items') && e.includes('최소 2')));
  });

  it('Part 5 스키마(LESSON_GEN_SCHEMA)는 3~10 그대로다 — 파생이 원본을 건드리지 않는다', () => {
    assert.equal(LESSON_GEN_SCHEMA.properties.items.minItems, 3);
    assert.equal(LESSON_GEN_SCHEMA.properties.items.maxItems, 10);
    assert.ok(validateAgainst(LESSON_GEN_SCHEMA, { title: 'P5', subtitle: '', items: items(2) })
      .some((e) => e.includes('최소 3')));
    assert.deepEqual(validateAgainst(LESSON_GEN_SCHEMA, { title: 'P5', subtitle: '', items: items(10) }), []);
  });

  it('LC 스키마는 script 필수·{speaker,text} 객체 줄을 요구한다', () => {
    assert.deepEqual(LESSON_GEN_LC_SCHEMA.required, ['title', 'subtitle', 'script', 'items']);
    assert.ok(validateAgainst(LESSON_GEN_LC_SCHEMA, { title: 'LC', subtitle: '', items: items(3) })
      .some((e) => e.includes('script') && e.includes('누락')));
    assert.ok(validateAgainst(LESSON_GEN_LC_SCHEMA, { ...lc(3), script: ['M: hi', 'W: hello', 'M: ok', 'W: bye'] })
      .some((e) => e.includes('script[0]') && e.includes('object')));
  });
});

describe('정규화 → 검증기 연결', () => {
  it('정규화된 객체 script 는 validateGeneratedLesson(…, { part: "lc" }) 에서 오류 0 이다', () => {
    const data = normalizeLessonGen({ title: 'LC', subtitle: '회의실', script, items: items(2) });
    assert.deepEqual(validateGeneratedLesson(data, 2, { part: 'lc' }), []);
  });

  it('고치기 전 모양(문자열로 뭉개진 script)이면 검증기가 4줄 전부를 지목했다 — 회귀의 증상 재현', () => {
    const smashed = { title: 'LC', script: script.map((line) => String(line)), items: items(3) };
    const errors = validateGeneratedLesson(smashed, 3, { part: 'lc' });
    assert.equal(errors.filter((e) => e.includes('.speaker')).length, 4);
  });
});
