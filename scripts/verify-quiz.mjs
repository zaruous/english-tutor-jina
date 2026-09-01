// '오늘의 단어' AI 퀴즈 API 검증 — 생성(AI) → today 조회 → 채점(9/10) → 틀린 단어 추가 → 전체 추가 → 단어장 +10
// 사용: `npm run dev` 상태에서 `node scripts/verify-quiz.mjs [kind] [keyword]` (기본 keyword coffee). E2E_API 로 대상 API 지정.
const API = process.env.E2E_API || 'http://localhost:3004';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'jina', Origin: API.replace(/:(\d+)$/, (_, p) => `:${Number(p) - 1}`) };
const get = async (p) => (await fetch(API + p, { headers: H })).json();
const post = async (p, body) => (await fetch(API + p, { method: 'POST', headers: H, body: JSON.stringify(body) })).json();
const results = [];
const t = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`); };

const kind = process.argv[2] || 'keyword';
const keyword = process.argv[3] || (kind === 'keyword' ? 'coffee' : undefined);
const provider = process.env.QUIZ_PROVIDER || 'claude';

async function main() {
  const before = (await get('/api/vocab')).cards.length;

  const bad = await post('/api/vocab/quiz', { kind: 'nope' });
  t('kind 검증 (400)', bad.ok === false && bad.code === 'BAD_REQUEST', bad.error);
  const bad2 = await post('/api/vocab/quiz', { kind: 'keyword', keyword: '' });
  t('keyword 필수 (400)', bad2.ok === false && bad2.code === 'BAD_REQUEST', bad2.error);
  const bad3 = await post('/api/vocab/quiz', { kind: 'keyword', keyword: '<script>' });
  t('keyword 형식 검증 (400)', bad3.ok === false && bad3.code === 'BAD_REQUEST', bad3.error);

  const started = Date.now();
  const gen = await post('/api/vocab/quiz', { kind, keyword, provider });
  t('퀴즈 생성 ok', gen.ok === true, gen.error ? `${gen.code}: ${gen.error}` : `${Math.round((Date.now() - started) / 1000)}s · ${gen.quiz?.topic_title}`);
  if (!gen.ok) return;
  const q = gen.quiz;
  t('단어 10개', q.words.length === 10, q.words.map((w) => w.word).join(', '));
  t('보기 4개 × 정답 포함 × 중복 없음', q.words.every((w) => w.options.length === 4 && w.options.includes(w.meaning_ko) && new Set(w.options).size === 4));
  t('단어 중복 없음', new Set(q.words.map((w) => w.word.toLowerCase())).size === 10);
  t('예문/발음/품사 채워짐', q.words.every((w) => w.example_en && w.example_ko && w.ipa && w.pos && w.meaning_ko));
  // 어원·유의어·반의어 — 필드는 전 단어 존재(스키마 계약), 내용은 모델 재량("확실하지 않으면 빈 값")이라 완만하게 단정
  const rels = q.words.flatMap((w) => [...w.synonyms, ...w.antonyms]);
  t('어원/유의어/반의어 필드 형태 (관계어 = {word, ipa, meaning_ko})', q.words.every((w) =>
    typeof w.etymology === 'string' && Array.isArray(w.synonyms) && Array.isArray(w.antonyms)
    && w.synonyms.length <= 3 && w.antonyms.length <= 3)
    && rels.every((r) => r && typeof r.word === 'string' && typeof r.ipa === 'string' && typeof r.meaning_ko === 'string'));
  const withEty = q.words.filter((w) => w.etymology.length >= 10).length;
  const withRel = q.words.filter((w) => w.synonyms.length + w.antonyms.length > 0).length;
  t('어원 채움 ≥5 단어 · 유의/반의 ≥5 단어', withEty >= 5 && withRel >= 5, `어원 ${withEty}/10 · 관계어 ${withRel}/10`);
  const relFilled = rels.filter((r) => r.word && r.meaning_ko).length;
  t('관계어 뜻 채움 ≥80%', rels.length > 0 && relFilled / rels.length >= 0.8, `${relFilled}/${rels.length}`);
  const owned = new Set((await get('/api/vocab')).cards.map((c) => c.word.toLowerCase()));
  t('보유 단어 미포함 (제외 목록 반영)', q.words.every((w) => !owned.has(w.word.toLowerCase())),
    q.words.filter((w) => owned.has(w.word.toLowerCase())).map((w) => w.word).join(', ') || '겹침 0');

  // 플랜 09 Phase 1 — 생성 직후: 풀(vocab_words)에 10단어 자동 등록, 나만의 단어장(카드)은 불변
  const cardsAfterGen = (await get('/api/vocab')).cards.length;
  t('생성 직후 나만의 단어장 불변 (자동 담기 없음)', cardsAfterGen === before, `${before} → ${cardsAfterGen}`);
  let pooled = 0;
  let pooledNotMine = 0;
  for (const w of q.words) {
    const p = await get(`/api/vocab/pool?q=${encodeURIComponent(w.word)}`);
    const hit = p.ok && (p.words || []).find((x) => x.word.toLowerCase() === w.word.toLowerCase());
    if (hit) { pooled += 1; if (!hit.in_my_vocab) pooledNotMine += 1; }
  }
  t('퀴즈 10단어 풀 자동 등록 (vocab_words)', pooled === 10, `풀 존재 ${pooled}/10`);
  t('풀 등록분 in_my_vocab=false (기보유 제외)', pooledNotMine >= 10 - q.words.filter((w) => owned.has(w.word.toLowerCase())).length,
    `미보유 ${pooledNotMine}/10`);
  // 플랜 09 Phase 2 — pool API 형태·검증
  const poolRes = await get('/api/vocab/pool');
  t('GET /api/vocab/pool — 목록·페이지·집계', poolRes.ok && Array.isArray(poolRes.words) && poolRes.page === 1
    && poolRes.summary && poolRes.summary.total >= 10 && typeof poolRes.summary.mine === 'number'
    && typeof poolRes.summary.by_source?.ai === 'number', `total=${poolRes.summary?.total} mine=${poolRes.summary?.mine}`);
  const badSrc = await get('/api/vocab/pool?source=nope');
  t('pool source 검증 (400)', badSrc.ok === false && badSrc.code === 'BAD_REQUEST', badSrc.error);

  const today = await get('/api/vocab/quiz/today');
  t('today = 방금 만든 퀴즈 (미완료)', today.ok && today.quiz && today.quiz.id === q.id && today.quiz.completed_at === null);
  t('보기 순서 결정적 (재조회 동일)', JSON.stringify(today.quiz.words.map((w) => w.options)) === JSON.stringify(q.words.map((w) => w.options)));

  // 채점: 1번 문항만 오답 → 9/10
  const answers = q.words.map((w, i) => ({ index: w.index, choice: i === 0 ? w.options.find((o) => o !== w.meaning_ko) : w.meaning_ko }));
  const graded = await post(`/api/vocab/quiz/${q.id}/answer`, { answers });
  t('채점 ok · score 9/10 · completed_at', graded.ok && graded.quiz.score === 9 && Boolean(graded.quiz.completed_at), `score=${graded.quiz?.score}`);
  t('answers 에 정답 여부 기록', graded.ok && graded.quiz.answers.length === 10 && graded.quiz.answers[0].correct === false && graded.quiz.answers[1].correct === true);
  const dupAns = await post(`/api/vocab/quiz/${q.id}/answer`, { answers: [{ index: 0, choice: 'x' }, { index: 0, choice: 'y' }] });
  t('같은 문항 중복 답 거절 (400)', dupAns.ok === false && dupAns.code === 'BAD_REQUEST');

  // 제외 목록은 프롬프트 지시라 드물게 보유 단어가 출제될 수 있다 — 추가 단정은 preOwned 만큼 보정
  const preOwned = new Set(q.words.filter((w) => owned.has(w.word.toLowerCase())).map((w) => w.word.toLowerCase()));
  const addWrong = await post(`/api/vocab/quiz/${q.id}/add`, { indexes: [0] });
  t('틀린 단어 1개 추가 (AI 재호출 없음)', addWrong.ok && addWrong.added + addWrong.duplicates === 1
    && addWrong.cards[0].word === q.words[0].word, `added=${addWrong.added} dup=${addWrong.duplicates}`);
  const addAll = await post(`/api/vocab/quiz/${q.id}/add`, {});
  t('전체 추가 → 10단어 전부 처리 (재추가는 중복)', addAll.ok && addAll.added + addAll.duplicates === 10
    && addAll.duplicates >= 1, `added=${addAll.added} dup=${addAll.duplicates}`);
  const after = (await get('/api/vocab')).cards;
  t(`단어장 +${10 - preOwned.size} (기보유 ${preOwned.size} 제외)`, after.length === before + 10 - preOwned.size, `${before} → ${after.length}`);
  const added = after.filter((c) => q.words.some((w) => w.word.toLowerCase() === c.word.toLowerCase()));
  t('추가된 카드 status=new · 예문 보존 · source 사전 재사용', added.length === 10
    && added.filter((c) => !preOwned.has(c.word.toLowerCase())).every((c) => c.status === 'new' && c.examples.length >= 1));
  // 담기 후 풀의 in_my_vocab=true 로 파생 (플랜 09 Phase 2)
  const pAfterAdd = await get(`/api/vocab/pool?q=${encodeURIComponent(q.words[0].word)}`);
  t('담은 단어 pool in_my_vocab=true', pAfterAdd.ok
    && pAfterAdd.words.some((x) => x.word.toLowerCase() === q.words[0].word.toLowerCase() && x.in_my_vocab === true));

  // 유의어/반의어 → 단어장 추가 (뜻·IPA 는 저장된 퀴즈 데이터에서 — AI 재호출 없음)
  const relTarget = q.words.map((w) => ({ i: w.index, rel: w.synonyms[0] || w.antonyms[0] })).find((x) => x.rel?.meaning_ko);
  if (!relTarget) {
    t('related 추가 (대상 관계어 존재)', false, '뜻 있는 유의어/반의어 0건');
  } else {
    const r1 = await post(`/api/vocab/quiz/${q.id}/related`, { index: relTarget.i, word: relTarget.rel.word });
    t('POST /related · 단어장 추가 ok', r1.ok === true && (r1.added === true || r1.duplicate === true)
      && r1.card?.word?.toLowerCase() === relTarget.rel.word.toLowerCase(),
      `${relTarget.rel.word} added=${r1.added} dup=${r1.duplicate}`);
    const r2 = await post(`/api/vocab/quiz/${q.id}/related`, { index: relTarget.i, word: relTarget.rel.word });
    t('related 재추가 → duplicate', r2.ok === true && r2.duplicate === true);
    const bad = await post(`/api/vocab/quiz/${q.id}/related`, { index: relTarget.i, word: 'zzznotinlist' });
    t('목록에 없는 단어 → NOT_FOUND', bad.ok === false && bad.code === 'NOT_FOUND', bad.error);
  }
}

await main();
const failed = results.filter((r) => !r).length;
console.log(`\n총 ${results.length}개 중 ${results.length - failed}개 통과${failed ? ` · 실패 ${failed}` : ''}`);
process.exitCode = failed ? 1 : 0;
