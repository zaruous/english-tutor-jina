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
  const owned = new Set((await get('/api/vocab')).cards.map((c) => c.word.toLowerCase()));
  t('보유 단어 미포함 (제외 목록 반영)', q.words.every((w) => !owned.has(w.word.toLowerCase())),
    q.words.filter((w) => owned.has(w.word.toLowerCase())).map((w) => w.word).join(', ') || '겹침 0');

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

  const addWrong = await post(`/api/vocab/quiz/${q.id}/add`, { indexes: [0] });
  t('틀린 단어 1개 추가 (AI 재호출 없음)', addWrong.ok && addWrong.added === 1 && addWrong.cards[0].word === q.words[0].word, `added=${addWrong.added} dup=${addWrong.duplicates}`);
  const addAll = await post(`/api/vocab/quiz/${q.id}/add`, {});
  t('전체 추가 → 9 추가 + 1 중복', addAll.ok && addAll.added === 9 && addAll.duplicates === 1, `added=${addAll.added} dup=${addAll.duplicates}`);
  const after = (await get('/api/vocab')).cards;
  t('단어장 +10', after.length === before + 10, `${before} → ${after.length}`);
  const added = after.filter((c) => q.words.some((w) => w.word.toLowerCase() === c.word.toLowerCase()));
  t('추가된 카드 status=new · 예문 보존 · source 사전 재사용', added.length === 10 && added.every((c) => c.status === 'new' && c.examples.length >= 1));
}

await main();
const failed = results.filter((r) => !r).length;
console.log(`\n총 ${results.length}개 중 ${results.length - failed}개 통과${failed ? ` · 실패 ${failed}` : ''}`);
process.exitCode = failed ? 1 : 0;
