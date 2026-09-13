// 관리자 저작 서비스 — 레슨·회화 시나리오·단어 세트의 읽기·생성·수정
// (플랜 13 Phase A · §3 API 표면 · 설계 검토 D2·D3 → 플랜 14 Phase C·D 로 유형 3종).
//
// ── 유형 3종이 같은 뼈대를 쓴다 (플랜 14 §1 D2) ──────────────────────────────────────────
// normalize*Input(형태 → 400) → assertValid(내용 규칙 → 422) → withTx: uniqueSlug → INSERT content_items
// → detail(lesson_details+lesson_items / scenario_details / vocab_set_details) → writeAudit('create').
// 수정은 FOR UPDATE → type 불일치 404 → published/archived 는 reviewer 게이트 403 → source seed→curated →
// UPDATE content_items → detail 통째 교체 → writeAudit('update'). 회화·단어는 조인 테이블·FK 가 없어 detail 을
// 통째로 갈아 끼우는 것이 안전하다(레슨은 lesson_items DELETE+INSERT). 학습자 카드(user_vocab_cards)는 vocab_words
// 를 가리키고 세트의 words JSONB 와는 무관하므로 words 교체가 카드를 건드리지 않는다.
//
// 불변식 — (1) 생성은 항상 draft/private/curated. (2) 수정은 status·visibility 를 바꾸지 않는다. (3) 규칙의 단일 소스는
// 검증기(validateGenerated{Lesson,Scenario,VocabSet}, ai-job.service.js)이고 여기서는 형태만 본다.
// (4) 풀(vocab_words) 등록은 하지 않는다 — catalog 생성 경로와 같은 규범이고 등록은 학습자 '담기' 가 한다(vocab_words.source
// CHECK 에 curated 도 없다). (5) 회화의 난도는 폼 필드 하나가 content_items.difficulty 와 scenario_details.level 두 컬럼에
// 같은 값으로 들어간다(AI 경로와 동일 · 플랜 14 열린 질문 1).
//
// 레슨과 다른 점 하나 — 회화·단어는 **content_items.description 을 쓴다.** 학습 화면 카드·검수 큐가 그것을 그린다.
// 레슨은 subtitle 이 lesson_details 에 있어 description 을 쓰지 않는다(기존 동작 유지).
//
// ── 저장 경로는 saveGeneratedLesson(ai-job.service.js)을 거울처럼 따른다 ─────────────────
// content_items(type='lesson') → lesson_details → lesson_items(position 1..n). 여기서 모양이 갈리면
// 학습 화면(listening.jsx 의 lcScript · lesson.service 의 renderPassage)이 "AI 가 만든 레슨" 과
// "사람이 고친 레슨" 두 종류를 읽어야 한다. LC 의 passage.body 는 [{speaker,text}] 객체 배열 그대로다 —
// 10.7 §3.2 가 구조화한 것을 화면이 `M:` 접두 텍스트로 되돌리지 않는다(플랜 13 열린 질문 5 → 화자 토글).
//
// ── 검증 규칙의 단일 소스는 validateGeneratedLesson 이다 (플랜 13 결정 2) ─────────────────
// 이 파일은 **형태**만 본다 — 문자열인가, 배열인가, 허용 enum 인가(→ 400 BAD_REQUEST).
// 내용 규칙(4~8줄 · 화자 라벨 · 괄호 지시문 · 보기 4개 · 해설의 정답 지시…)은 생성 경로가 쓰는 검증기를
// **그대로 호출**하고 실패를 422 + validation_errors 로 돌려준다. 화면은 그 배열을 렌더할 뿐 다시 판단하지
// 않는다. 규칙을 여기 한 줄이라도 다시 적으면 "AI 초안은 통과하는데 사람이 고친 것은 거부되는" 레슨이 생긴다.
// 400 과 422 를 가르는 기준: 400 은 화면이 만들 수 없는 요청(형태가 깨짐), 422 는 화면이 그대로 보여 줄 오류.
//
// ── 학습자 DTO 와의 경계 (설계 검토 D2) ────────────────────────────────────────────────
// lesson.service.getLesson 은 answer·explanation 을 컬럼 나열에서 아예 빼서 유출을 막는다. 에디터는 그것을
// 고쳐야 하므로 여기 readLesson 이 전부 싣는다 — 그래서 라우트가 author 이상으로 막고, 학습자 경로는
// 이 파일을 import 하지 않는다. 학습자 DTO 를 넓혀 이 함수를 대신하게 하지 말 것.
//
// ── 상태·가시성은 건드리지 않는다 ──────────────────────────────────────────────────────
// 생성은 항상 draft/private(결정 1 — DB 기본값에 맡기지 않고 명시한다). 수정은 status·visibility 를 그대로
// 둔다 — 전이는 11 의 …/status 한 경로다. "수정했으니 review 로" 같은 부수 전이를 여기 넣으면 전이표가 두 곳이 된다.
// source 만 seed → curated 로 바뀐다(결정 5): JSON 시드와 어긋난 행의 표식이고 재시드가 이 행을 건너뛴다.
import { HttpError } from '../lib/errors.js';
import { atLeast, loadRoles } from '../lib/roles.js';
import { pool } from '../lib/pool.js';
import { withTx } from '../lib/tx.js';
import { oneOf, posInt, str } from '../lib/validate.js';
import {
  validateGeneratedLesson, validateGeneratedScenario, validateGeneratedVocabSet,
} from './ai-job.service.js';

// lesson_details_kind_ck · lesson_items_skill_ck 와 같은 집합이어야 한다. DB 에 맡기면 23514 가 fromPgError 를
// 거쳐 "값이 허용 범위를 벗어났습니다" 로 뭉개져 어느 필드인지 알 수 없으므로 여기서 이름을 대고 400 을 낸다.
export const LESSON_KINDS = Object.freeze(['toeic_lc', 'toeic_part7', 'toeic_part5']);
export const SKILL_CODES = Object.freeze(['grammar', 'vocab', 'detail', 'inference', 'main_idea']);

// passage 의 문자열 필드. Part 7 이메일은 발신·수신·날짜가 문제 단서라(lesson.service 의 PASSAGE_HEADER)
// 시드 레슨을 열어 저장할 때 잃으면 안 된다. 여기 없는 키는 버린다 — 화면이 모르는 필드가 쌓이지 않게.
const PASSAGE_TEXT_KEYS = Object.freeze(['type', 'subject', 'from', 'to', 'cc', 'date']);
// 비워서 보내면 생성 경로와 같은 라벨을 채운다 — 학습 화면이 passage.type 을 배지로 그린다.
const PASSAGE_DEFAULTS = Object.freeze({
  toeic_lc: { type: 'LISTENING', subject: 'Short Conversation' },
  toeic_part5: { type: 'PART 5', subject: 'Incomplete Sentences' },
  toeic_part7: {},
});
// Part 5 의 지문은 안내문 한 줄이 전부다. 화면이 비워 보내면 생성 경로(saveGeneratedLesson)와 **같은 문장**을 채운다 —
// 두 경로의 Part 5 레슨이 학습 화면에서 같은 안내문으로 보여야 한다(플랜 14 §1 C1).
export const PART5_DEFAULT_BODY = Object.freeze(['Choose the word or phrase that best completes each sentence.']);

// 유형별 문구. 404 는 "다른 유형의 id 는 없는 것과 같다" 라 유형 이름을 대고, 403 은 레슨의 문구를 유형에 맞게 바꾼 것이다.
const TYPE_LABELS = Object.freeze({
  lesson: { notFound: '레슨을 찾을 수 없습니다.', published: '공개된 레슨의 본문은 reviewer 이상만 고칠 수 있습니다. 먼저 내리거나(archived) 검수자에게 요청하세요.' },
  scenario: { notFound: '시나리오를 찾을 수 없습니다.', published: '공개된 회화 시나리오의 본문은 reviewer 이상만 고칠 수 있습니다. 먼저 내리거나(archived) 검수자에게 요청하세요.' },
  vocab_set: { notFound: '단어 세트를 찾을 수 없습니다.', published: '공개된 단어 세트의 본문은 reviewer 이상만 고칠 수 있습니다. 먼저 내리거나(archived) 검수자에게 요청하세요.' },
});

const bad = (message) => new HttpError(400, 'BAD_REQUEST', message);

function plainObject(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw bad(`${name} 은 객체여야 합니다.`);
  return value;
}

function arrayOf(value, name, { min = 0, max = 200 } = {}) {
  if (!Array.isArray(value)) throw bad(`${name} 은 배열이어야 합니다.`);
  if (value.length < min || value.length > max) throw bad(`${name} 은 ${min}~${max}개여야 합니다.`);
  return value;
}

// 빈 문자열을 허용하는 문자열 필드. "비어 있다" 는 내용 규칙(검증기의 422)이고 여기서는 문자열인지만 본다 —
// validate.js 의 str 은 '' 를 "없다" 로 취급해 400 을 내므로 stem·대사·해설에는 쓰지 않는다.
function text(value, name, max) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') throw bad(`${name} 은 문자열이어야 합니다.`);
  if (value.length > max) throw bad(`${name} 길이는 ${max}자 이하여야 합니다.`);
  return value.trim();
}

function normalizePassage(raw, kind) {
  // Part 5 는 passage 자체(또는 body)를 생략할 수 있다 — 지문이 안내문 1줄뿐이라 에디터가 칸을 선택으로 그린다.
  // 다른 kind 는 지문이 본문이므로 생략은 형태 오류(400)다.
  const isPart5 = kind === 'toeic_part5';
  const source = isPart5 && (raw === undefined || raw === null) ? {} : plainObject(raw, 'passage');
  const passage = { ...PASSAGE_DEFAULTS[kind] };
  for (const key of PASSAGE_TEXT_KEYS) {
    const value = str(source[key], `passage.${key}`, { optional: true, max: 200 });
    if (value !== undefined) passage[key] = value;
  }
  const rawBody = isPart5 && (source.body === undefined || source.body === null) ? [] : source.body;
  const body = arrayOf(rawBody, 'passage.body', { max: 50 });
  if (kind === 'toeic_lc') {
    // 줄 수·화자·대사 길이는 전부 검증기(validateLcScript)의 몫이다. speaker 는 그대로 넘긴다 —
    // 토글이 비어 있으면 검증기가 "M 또는 W" 로 답하고 화면은 그 줄을 빨갛게 그린다(목업 3번 줄).
    passage.body = body.map((line, i) => {
      const row = plainObject(line, `passage.body[${i}]`);
      return {
        speaker: typeof row.speaker === 'string' ? row.speaker.trim() : row.speaker ?? null,
        text: text(row.text, `passage.body[${i}].text`, 1000),
      };
    });
    return passage;
  }
  // RC 지문은 문단 문자열 배열이다. 검증기에 RC 규칙이 아직 없어 빈 지문만 여기서 막는다 —
  // 그대로 두면 지문 없는 Part 7 이 저장되고 학습 화면이 빈 카드를 그린다.
  passage.body = body
    .map((para, i) => text(para, `passage.body[${i}]`, 4000))
    .filter(Boolean);
  if (passage.body.length === 0) {
    if (!isPart5) throw bad('passage.body 에 지문이 없습니다.');
    passage.body = [...PART5_DEFAULT_BODY];
  }
  return passage;
}

function normalizeItem(raw, i) {
  const item = plainObject(raw, `items[${i}]`);
  // options 가 배열이 아니면 빈 배열로 넘겨 검증기가 "A-D 보기 4개" 로 답하게 한다. id 는 손대지 않는다 —
  // 'A'..'D' 인지도 검증기의 규칙이다.
  const options = Array.isArray(item.options)
    ? item.options.map((option, j) => {
      const row = plainObject(option, `items[${i}].options[${j}]`);
      return {
        id: typeof row.id === 'string' ? row.id.trim() : row.id,
        text: text(row.text, `items[${i}].options[${j}].text`, 500),
      };
    })
    : [];
  const skill = item.skill_code === undefined || item.skill_code === null || item.skill_code === ''
    ? null : oneOf(item.skill_code, `items[${i}].skill_code`, SKILL_CODES);
  return {
    stem: text(item.stem, `items[${i}].stem`, 2000),
    options,
    answer: text(item.answer, `items[${i}].answer`, 8),
    explanation: text(item.explanation, `items[${i}].explanation`, 4000),
    skill_code: skill,
  };
}

// 요청 본문 → 저장 모양. 여기서 던지는 것은 전부 400 이다.
// 문항 1~50 은 lesson_items_position_ck 의 범위다 — LC 2~4 · Part 5 3~10 같은 실전 규격은 생성 요청(normalizeJobInput)의
// 규칙이고 저작에서는 화면이 보낸 수를 그대로 받는다(최소형은 문항 추가/삭제가 없다, 플랜 13 §0).
export function normalizeLessonInput(body) {
  const raw = plainObject(body, '요청 본문');
  const kind = oneOf(raw.kind, 'kind', LESSON_KINDS);
  const items = arrayOf(raw.items, 'items', { min: 1, max: 50 }).map(normalizeItem);
  return {
    // title 은 비어 있어도 여기서는 통과시킨다 — "title이 비어 있습니다" 는 검증기가 다른 오류와 함께 한 번에 돌려준다.
    title: str(raw.title, 'title', { optional: true, max: 200 }) ?? '',
    subtitle: str(raw.subtitle, 'subtitle', { optional: true, max: 200 }) ?? '',
    difficulty: posInt(raw.difficulty, 'difficulty', { optional: true, max: 5 }) ?? 3,
    kind,
    // 생성 경로와 같은 추정치(문항당 1.2분, 최소 3분).
    est_minutes: posInt(raw.est_minutes, 'est_minutes', { optional: true, max: 180 })
      ?? Math.max(3, Math.ceil(items.length * 1.2)),
    passage: normalizePassage(raw.passage, kind),
    vocab: raw.vocab === undefined || raw.vocab === null
      ? [] : arrayOf(raw.vocab, 'vocab', { max: 50 }).map((entry, i) => plainObject(entry, `vocab[${i}]`)),
    faq: raw.faq === undefined || raw.faq === null
      ? [] : arrayOf(raw.faq, 'faq', { max: 20 }).map((q, i) => str(q, `faq[${i}]`, { min: 1, max: 300 })),
    items,
  };
}

// ── 회화 시나리오 본문 → 저장 모양 (플랜 14 §1 D3). 여기서 던지는 것은 전부 400 이다. ──────────────
// title·system_prompt·opening_message 가 비었는지, objectives 가 2~5개인지는 검증기(422)의 몫이라 여기서는 빈 값을
// 그대로 통과시킨다 — str() 은 '' 를 "없다" 로 취급해 400 을 내므로 title 만 optional 로 받고 나머지는 text() 를 쓴다.
// objectives 의 상한 10 은 형태 상한이다(2~5 는 검증기) — 배열이 아니거나 원소가 문자열이 아니면 400.
export function normalizeScenarioInput(body) {
  const raw = plainObject(body, '요청 본문');
  return {
    title: str(raw.title, 'title', { optional: true, max: 200 }) ?? '',
    description: str(raw.description, 'description', { optional: true, max: 500 }) ?? '',
    // 비면 scenario_details.tag 의 DB 기본값과 같은 'AI 회화' — 학습 화면이 태그 배지를 늘 그린다.
    tag: str(raw.tag, 'tag', { optional: true, max: 60 }) ?? 'AI 회화',
    difficulty: posInt(raw.difficulty, 'difficulty', { optional: true, max: 5 }) ?? 3,
    system_prompt: text(raw.system_prompt, 'system_prompt', 4000),
    opening_message: text(raw.opening_message, 'opening_message', 1000),
    objectives: raw.objectives === undefined || raw.objectives === null
      ? [] : arrayOf(raw.objectives, 'objectives', { max: 10 }).map((o, i) => text(o, `objectives[${i}]`, 200)),
  };
}

// ── 단어 세트 본문 → 저장 모양 (플랜 14 §1 D4). ──────────────────────────────────────────────
// words 의 상한 60 은 형태 상한이다(1~50 은 검증기 — 0개도 여기서는 통과시켜 'words 는 1~50개' 422 로 보낸다).
// 행의 모르는 키는 버린다(화면이 모르는 필드가 쌓이지 않게). word 는 대소문자를 보존한다 — 고유명사·약어가 있고 중복
// 판정은 검증기가 lower 로 한다. 시드 세트는 pos·word·meaning_ko 세 필드뿐이라 나머지는 '' 로 채워 저장된다 —
// 소비자(vocab.service 담기·topic 진행률) 전부가 그 필드를 선택 취급한다.
function normalizeWord(raw, i) {
  const entry = plainObject(raw, `words[${i}]`);
  const path = `words[${i}]`;
  return {
    word: text(entry.word, `${path}.word`, 64),
    pos: text(entry.pos, `${path}.pos`, 16),
    ipa: text(entry.ipa, `${path}.ipa`, 64),
    meaning_ko: text(entry.meaning_ko, `${path}.meaning_ko`, 200),
    example_en: text(entry.example_en, `${path}.example_en`, 400),
    example_ko: text(entry.example_ko, `${path}.example_ko`, 400),
    difficulty: posInt(entry.difficulty, `${path}.difficulty`, { optional: true, max: 5 }) ?? 3,
  };
}

export function normalizeVocabSetInput(body) {
  const raw = plainObject(body, '요청 본문');
  return {
    title: str(raw.title, 'title', { optional: true, max: 200 }) ?? '',
    description: str(raw.description, 'description', { optional: true, max: 500 }) ?? '',
    difficulty: posInt(raw.difficulty, 'difficulty', { optional: true, max: 5 }) ?? 3,
    words: (raw.words === undefined || raw.words === null ? [] : arrayOf(raw.words, 'words', { max: 60 }))
      .map(normalizeWord),
  };
}

// 검증기 결과 → 422. 세 유형이 같은 모양으로 던진다 — 라우트(sendAuthoring)가 validation_errors 를 그대로 싣는다.
function assertNoErrors(errors) {
  if (errors.length) {
    throw new HttpError(422, 'VALIDATION_FAILED',
      `검증에 걸린 항목이 ${errors.length}건 있습니다.`, { validation_errors: errors });
  }
}

// 검증기 시그니처는 생성 경로의 것이다: (data, expectedCount, { part }). data.script 는 LC 에서만 본다.
// expectedCount 에 items.length 를 넘기므로 문항 수 규칙은 여기서 항상 통과한다 — 생성 때의 count 는
// 요청자가 정한 수였고, 저작에서는 화면이 보낸 수가 곧 기대값이다.
function assertValid(input) {
  const isLc = input.kind === 'toeic_lc';
  const data = { title: input.title, items: input.items, ...(isLc ? { script: input.passage.body } : {}) };
  assertNoErrors(validateGeneratedLesson(data, input.items.length, { part: isLc ? 'lc' : undefined }));
}

// 회화·단어는 expectedCount 없이 부른다 — 20 은 생성 경로의 계약이고 저작은 1~50 이다(플랜 14 §1 D4).
const assertScenarioValid = (input) => assertNoErrors(validateGeneratedScenario(input));
const assertVocabSetValid = (input) => assertNoErrors(validateGeneratedVocabSet(input));

// slug 는 content_items_slug_ck(^[a-z0-9]+(?:-[a-z0-9]+)*$) 를 통과해야 한다. 한국어 제목은 남는 글자가 없어
// '<유형>-<timestamp>' 로 폴백한다(lesson- · scenario- · vocab-set-). 80자에서 자른다 — 제목은 200자까지인데
// slug 는 URL 과 topics.json 에 박힌다.
function slugify(title, fallbackPrefix = 'lesson') {
  const base = String(title).toLowerCase().normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 80).replace(/-+$/g, '');
  return base || `${fallbackPrefix}-${Date.now()}`;
}

// UNIQUE 충돌이면 -2, -3 … 을 붙인다. 후보를 고르는 SELECT 와 INSERT 사이에 다른 트랜잭션이 같은 후보를
// 잡으면 23505 가 fromPgError 를 거쳐 409 로 나간다 — 재시도로 풀리는 드문 경합이라 잠금까지 하지 않는다.
async function uniqueSlug(client, title, fallbackPrefix = 'lesson') {
  const base = slugify(title, fallbackPrefix);
  const { rows } = await client.query(
    `SELECT slug FROM content_items WHERE slug = $1 OR slug LIKE $2`, [base, `${base}-%`],
  );
  const taken = new Set(rows.map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let n = 2; ; n += 1) {
    if (!taken.has(`${base}-${n}`)) return `${base}-${n}`;
  }
}

// 상세 한 벌. 목록(admin-content.service 의 LIST_COLS)과 같은 메타에 유형별 detail 을 붙인다. 레슨의 items 는
// answer·explanation·skill_code 까지 싣는다 — 학습자 getLesson 과 여기가 갈리는 한 줄이다. 회화의 system_prompt 도
// 관리자 DTO 에만 있다 — 학습자 listScenarios 는 의도적으로 뺀다(플랜 14 §1 D8, 레슨 answer 경계와 같은 규범).
const CONTENT_META_COLS = `
  c.id, c.type, c.slug, c.title, c.description, c.difficulty,
  c.status, c.visibility, c.source,
  c.created_at, c.updated_at, c.created_by, c.updated_by,
  COALESCE(NULLIF(btrim(cu.display_name), ''), cu.email) AS created_by_name,
  COALESCE(NULLIF(btrim(uu.display_name), ''), uu.email) AS updated_by_name`;
const LESSON_COLS = `${CONTENT_META_COLS},
  d.kind, d.subtitle, d.est_minutes, d.passage, d.vocab, d.faq, d.position`;
const SCENARIO_COLS = `${CONTENT_META_COLS},
  sd.tag, sd.level, sd.system_prompt, sd.opening_message, sd.objectives`;
const VOCAB_SET_COLS = `${CONTENT_META_COLS},
  vd.words`;

async function fetchScenario(client, contentId) {
  const { rows: [row] } = await client.query(
    `SELECT ${SCENARIO_COLS}
       FROM content_items c
       JOIN scenario_details sd ON sd.content_id = c.id
       LEFT JOIN users cu ON cu.id = c.created_by
       LEFT JOIN users uu ON uu.id = c.updated_by
      WHERE c.id = $1 AND c.type = 'scenario'`,
    [contentId],
  );
  return row ?? null;
}

async function fetchVocabSet(client, contentId) {
  const { rows: [row] } = await client.query(
    `SELECT ${VOCAB_SET_COLS}
       FROM content_items c
       JOIN vocab_set_details vd ON vd.content_id = c.id
       LEFT JOIN users cu ON cu.id = c.created_by
       LEFT JOIN users uu ON uu.id = c.updated_by
      WHERE c.id = $1 AND c.type = 'vocab_set'`,
    [contentId],
  );
  return row ?? null;
}

async function fetchLesson(client, contentId) {
  const { rows: [row] } = await client.query(
    `SELECT ${LESSON_COLS}
       FROM content_items c
       JOIN lesson_details d ON d.content_id = c.id
       LEFT JOIN users cu ON cu.id = c.created_by
       LEFT JOIN users uu ON uu.id = c.updated_by
      WHERE c.id = $1 AND c.type = 'lesson'`,
    [contentId],
  );
  if (!row) return null;
  const { rows: items } = await client.query(
    `SELECT position, stem, options, answer, explanation, skill_code
       FROM lesson_items WHERE content_id = $1 ORDER BY position`,
    [contentId],
  );
  return { ...row, items };
}

async function insertItems(client, contentId, items) {
  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    await client.query(
      `INSERT INTO lesson_items (content_id, position, stem, options, answer, explanation, skill_code)
       VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
      [contentId, i + 1, item.stem, JSON.stringify(item.options), item.answer, item.explanation, item.skill_code],
    );
  }
}

// 감사 1행. 전이가 아니라 create/update 를 쓴다 — "action='status_change' = 상태 전이 1건" 불변식(admin-content.service)을
// 깨지 않으면서 "누가 언제 고쳤는지" 는 남는다. 시드가 curated 로 바뀐 순간은 note 에 적어 어긋남의 시작점을 찾을 수 있게 한다.
async function writeAudit(client, { contentId, actorId, action, from, to, note }) {
  await client.query(
    `INSERT INTO content_audit_log (content_id, actor_id, action, from_status, to_status, note)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [contentId, actorId, action, from ?? null, to ?? null, note || ''],
  );
}

// 수정의 공통 앞부분 — 행을 FOR UPDATE 로 잠근 뒤 type 을 본다: 다른 유형의 id 는 없는 것과 같은 404 다
// (admin-content.service.lockContent 와 같은 이유). 공개·내림 상태의 본문을 author 가 제자리에서 고치면 검수 게이트
// (전이표)가 우회된다 — 승인된 것을 승인 없이 바꾸는 길이다. 그 두 상태의 본문 수정은 reviewer 부터(라운드 05 리뷰 sec-1).
// draft·review 는 author 도 된다. 돌려주는 source 는 seed → curated 로 바꾼 값이다(결정 5).
async function lockForEdit(client, actor, contentId, type) {
  const { rows: [row] } = await client.query(
    `SELECT id, type, status, source FROM content_items WHERE id = $1 FOR UPDATE`, [contentId],
  );
  if (!row || row.type !== type) throw new HttpError(404, 'NOT_FOUND', TYPE_LABELS[type].notFound);
  if (['published', 'archived'].includes(row.status)) {
    await loadRoles();
    if (!atLeast(actor.role, 'reviewer')) throw new HttpError(403, 'FORBIDDEN', TYPE_LABELS[type].published);
  }
  return { row, source: row.source === 'seed' ? 'curated' : row.source };
}

export async function readLesson(contentId) {
  const lesson = await fetchLesson(pool, contentId);
  if (!lesson) throw new HttpError(404, 'NOT_FOUND', TYPE_LABELS.lesson.notFound);
  return { lesson };
}

export async function createLesson(actor, body) {
  const input = normalizeLessonInput(body);
  assertValid(input);
  return withTx(async (client) => {
    const slug = await uniqueSlug(client, input.title);
    const { rows: [pos] } = await client.query(
      `SELECT COALESCE(max(position), 0)::int + 1 AS next FROM lesson_details`,
    );
    const { rows: [row] } = await client.query(
      `INSERT INTO content_items (type, slug, title, difficulty, status, visibility, source, created_by)
       VALUES ('lesson', $1, $2, $3, 'draft', 'private', 'curated', $4)
       RETURNING id`,
      [slug, input.title, input.difficulty, actor.id],
    );
    await client.query(
      `INSERT INTO lesson_details
         (content_id, kind, subtitle, est_minutes, passage, vocab, faq, position)
       VALUES ($1, $2, $3, $4, $5::jsonb, $6::jsonb, $7::jsonb, $8)`,
      [row.id, input.kind, input.subtitle, input.est_minutes, JSON.stringify(input.passage),
        JSON.stringify(input.vocab), JSON.stringify(input.faq), pos.next],
    );
    await insertItems(client, row.id, input.items);
    await writeAudit(client, { contentId: row.id, actorId: actor.id, action: 'create', from: null, to: 'draft' });
    return { lesson: await fetchLesson(client, row.id) };
  });
}

// 문항은 통째로 갈아 끼운다(DELETE 후 INSERT, position 1..n 재부여). lesson_items.id 를 참조하는 테이블이 없고
// 채점 기록(user_lesson_attempts.answers)은 position 키라 문항 행이 바뀌어도 기록은 남는다.
// 행을 FOR UPDATE 로 잠근 뒤 type 을 본다 — 다른 유형의 id 는 없는 것과 같은 404 다(admin-content.service.lockContent 와 같은 이유).
export async function updateLesson(actor, contentId, body) {
  const input = normalizeLessonInput(body);
  assertValid(input);
  return withTx(async (client) => {
    const { row, source } = await lockForEdit(client, actor, contentId, 'lesson');
    await client.query(
      `UPDATE content_items
          SET title = $1, difficulty = $2, source = $3, updated_at = now(), updated_by = $4
        WHERE id = $5`,
      [input.title, input.difficulty, source, actor.id, contentId],
    );
    const { rowCount } = await client.query(
      `UPDATE lesson_details
          SET kind = $1, subtitle = $2, est_minutes = $3, passage = $4::jsonb, vocab = $5::jsonb, faq = $6::jsonb
        WHERE content_id = $7`,
      [input.kind, input.subtitle, input.est_minutes, JSON.stringify(input.passage),
        JSON.stringify(input.vocab), JSON.stringify(input.faq), contentId],
    );
    if (rowCount === 0) throw new HttpError(404, 'NOT_FOUND', TYPE_LABELS.lesson.notFound);
    await client.query(`DELETE FROM lesson_items WHERE content_id = $1`, [contentId]);
    await insertItems(client, contentId, input.items);
    // 이 레슨이 AI 초안에서 왔으면 초안 행의 payload 도 같은 본문으로 맞춘다. 검수 큐(listDrafts)는
    // lesson_drafts.payload 를 우선 렌더하므로, 여기서 안 맞추면 '승인 전 수정' 뒤에도 검수자가
    // **고치기 전 본문**을 보고 승인한다(라운드 05 리뷰 high). 서버 검증을 통과한 저장이므로 validation_errors 는 비운다.
    await client.query(
      `UPDATE lesson_drafts
          SET payload = $2::jsonb, validation_errors = '[]'::jsonb, updated_at = now()
        WHERE published_content_id = $1`,
      [contentId, JSON.stringify({
        title: input.title, subtitle: input.subtitle,
        script: input.kind === 'toeic_lc' ? input.passage.body : undefined,
        items: input.items,
      })],
    );
    await writeAudit(client, {
      contentId, actorId: actor.id, action: 'update', from: row.status, to: row.status,
      note: source === row.source ? '' : `source ${row.source} → ${source}`,
    });
    return { lesson: await fetchLesson(client, contentId) };
  });
}

// ── 회화 시나리오 (플랜 14 §1 D2·D3) ─────────────────────────────────────────────────────
// saveGeneratedScenario 와 같은 컬럼 집합이다. level 에는 difficulty 를 그대로 넣는다 — 폼 필드 하나가 두 컬럼에
// 같은 값(머리말 불변식 5). 감사·상태·slug 규칙은 레슨과 같다.
export async function readScenario(contentId) {
  const scenario = await fetchScenario(pool, contentId);
  if (!scenario) throw new HttpError(404, 'NOT_FOUND', TYPE_LABELS.scenario.notFound);
  return { scenario };
}

export async function createScenario(actor, body) {
  const input = normalizeScenarioInput(body);
  assertScenarioValid(input);
  return withTx(async (client) => {
    const slug = await uniqueSlug(client, input.title, 'scenario');
    const { rows: [row] } = await client.query(
      `INSERT INTO content_items (type, slug, title, description, difficulty, status, visibility, source, created_by)
       VALUES ('scenario', $1, $2, $3, $4, 'draft', 'private', 'curated', $5)
       RETURNING id`,
      [slug, input.title, input.description, input.difficulty, actor.id],
    );
    await client.query(
      `INSERT INTO scenario_details (content_id, tag, level, system_prompt, opening_message, objectives)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [row.id, input.tag, input.difficulty, input.system_prompt, input.opening_message, JSON.stringify(input.objectives)],
    );
    await writeAudit(client, { contentId: row.id, actorId: actor.id, action: 'create', from: null, to: 'draft' });
    return { scenario: await fetchScenario(client, row.id) };
  });
}

// 진행 중 회화 세션은 매 전송마다 system_prompt 를 라이브 조회하므로 수정이 즉시 반영된다(플랜 14 §1 D9) —
// published 편집을 reviewer 로 묶는 lockForEdit 의 게이트가 방어선이다. 시나리오에는 lesson_drafts 같은 초안 사본이
// 없다(검수 큐는 scenario_details 를 직접 그린다) — 동기화할 것이 없다.
export async function updateScenario(actor, contentId, body) {
  const input = normalizeScenarioInput(body);
  assertScenarioValid(input);
  return withTx(async (client) => {
    const { row, source } = await lockForEdit(client, actor, contentId, 'scenario');
    await client.query(
      `UPDATE content_items
          SET title = $1, description = $2, difficulty = $3, source = $4, updated_at = now(), updated_by = $5
        WHERE id = $6`,
      [input.title, input.description, input.difficulty, source, actor.id, contentId],
    );
    const { rowCount } = await client.query(
      `UPDATE scenario_details
          SET tag = $1, level = $2, system_prompt = $3, opening_message = $4, objectives = $5::jsonb
        WHERE content_id = $6`,
      [input.tag, input.difficulty, input.system_prompt, input.opening_message, JSON.stringify(input.objectives), contentId],
    );
    if (rowCount === 0) throw new HttpError(404, 'NOT_FOUND', TYPE_LABELS.scenario.notFound);
    await writeAudit(client, {
      contentId, actorId: actor.id, action: 'update', from: row.status, to: row.status,
      note: source === row.source ? '' : `source ${row.source} → ${source}`,
    });
    return { scenario: await fetchScenario(client, contentId) };
  });
}

// ── 단어 세트 (플랜 14 §1 D2·D4·D6) ──────────────────────────────────────────────────────
// words 는 JSONB 한 덩어리라 통째로 교체한다. 풀(vocab_words) 등록은 하지 않는다(머리말 불변식 4) — 학습자가 '담기' 를
// 누를 때 vocab.service 가 source='lesson' 으로 등록한다. 그래서 여기서 words 를 바꿔도 이미 담긴 카드(user_vocab_cards)
// 는 그대로다 — 카드는 vocab_words 를 가리키고 세트를 가리키지 않는다.
export async function readVocabSet(contentId) {
  const vocabSet = await fetchVocabSet(pool, contentId);
  if (!vocabSet) throw new HttpError(404, 'NOT_FOUND', TYPE_LABELS.vocab_set.notFound);
  return { vocab_set: vocabSet };
}

export async function createVocabSet(actor, body) {
  const input = normalizeVocabSetInput(body);
  assertVocabSetValid(input);
  return withTx(async (client) => {
    const slug = await uniqueSlug(client, input.title, 'vocab-set');
    const { rows: [row] } = await client.query(
      `INSERT INTO content_items (type, slug, title, description, difficulty, status, visibility, source, created_by)
       VALUES ('vocab_set', $1, $2, $3, $4, 'draft', 'private', 'curated', $5)
       RETURNING id`,
      [slug, input.title, input.description, input.difficulty, actor.id],
    );
    await client.query(
      `INSERT INTO vocab_set_details (content_id, words) VALUES ($1, $2::jsonb)`,
      [row.id, JSON.stringify(input.words)],
    );
    await writeAudit(client, { contentId: row.id, actorId: actor.id, action: 'create', from: null, to: 'draft' });
    return { vocab_set: await fetchVocabSet(client, row.id) };
  });
}

export async function updateVocabSet(actor, contentId, body) {
  const input = normalizeVocabSetInput(body);
  assertVocabSetValid(input);
  return withTx(async (client) => {
    const { row, source } = await lockForEdit(client, actor, contentId, 'vocab_set');
    await client.query(
      `UPDATE content_items
          SET title = $1, description = $2, difficulty = $3, source = $4, updated_at = now(), updated_by = $5
        WHERE id = $6`,
      [input.title, input.description, input.difficulty, source, actor.id, contentId],
    );
    const { rowCount } = await client.query(
      `UPDATE vocab_set_details SET words = $1::jsonb WHERE content_id = $2`,
      [JSON.stringify(input.words), contentId],
    );
    if (rowCount === 0) throw new HttpError(404, 'NOT_FOUND', TYPE_LABELS.vocab_set.notFound);
    await writeAudit(client, {
      contentId, actorId: actor.id, action: 'update', from: row.status, to: row.status,
      note: source === row.source ? '' : `source ${row.source} → ${source}`,
    });
    return { vocab_set: await fetchVocabSet(client, contentId) };
  });
}
