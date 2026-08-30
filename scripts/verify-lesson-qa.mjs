// 레슨 Q&A API 검증 — 목록·추천 → dry_run(pre/post submit) → 실제 AI 호출(resume)
// 사용: `npm run dev` 상태에서 `node scripts/verify-lesson-qa.mjs`
//   E2E_API — 대상 API (기본 http://localhost:3004)
//   SKIP_AI=1 — §D 실제 AI 호출 단계 건너뜀
const API = process.env.E2E_API || 'http://localhost:3004';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'jina', Origin: API.replace(/:(\d+)$/, (_, p) => `:${Number(p) - 1}`) };
const get = async (p) => (await fetch(API + p, { headers: H })).json();
const post = async (p, body) => (await fetch(API + p, { method: 'POST', headers: H, body: JSON.stringify(body) })).json();
const postRes = async (p, body) => {
  const res = await fetch(API + p, { method: 'POST', headers: H, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
};
const results = [];
const t = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`); };

const norm = (s) => s.replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
// 서버 renderPassage(lesson.service.js)와 같은 기준 — 헤더 값(type/from/to/cc/date) + subject + body 가 인용 검증 대상
const PASSAGE_HEADER_KEYS = ['type', 'from', 'to', 'cc', 'date'];
const passageText = (passage) => norm([...PASSAGE_HEADER_KEYS.map((k) => passage?.[k]), passage?.subject, ...(passage?.body || [])]
  .filter((s) => typeof s === 'string' && s.trim()).join(' '));

async function main() {
  let L, D, A;
  const lessonIds = new Set();

  // A. 목록·추천
  const list = await get('/api/lessons');
  t('GET /api/lessons ok · lessons 1개 이상', list.ok === true && Array.isArray(list.lessons) && list.lessons.length >= 1);
  if (!list.ok || !list.lessons?.length) return;
  L = list.lessons[0];
  list.lessons.forEach((l) => lessonIds.add(l.id));

  const byKind = await get(`/api/lessons?kind=${encodeURIComponent(L.kind)}`);
  t('GET /api/lessons?kind=<L.kind> · kind 일치', byKind.ok === true && byKind.lessons.every((l) => l.kind === L.kind));

  const bogus = await get('/api/lessons?status=bogus');
  t('GET /api/lessons?status=bogus → BAD_REQUEST', bogus.ok === false && bogus.code === 'BAD_REQUEST', bogus.error);

  const attempted = await get('/api/lessons?status=attempted');
  t('GET /api/lessons?status=attempted · attempt_count ≥ 1', attempted.ok === true && attempted.lessons.every((l) => l.attempt_count >= 1));

  const rec = await get('/api/lessons/recommended');
  const recOk = rec.ok === true
    && Array.isArray(rec.lessons)
    && rec.lessons.length <= 3
    && rec.lessons.every((l) => typeof l.reason_code === 'string' && l.reason_code.length > 0)
    && rec.lessons.every((l) => lessonIds.has(l.id));
  t('GET /api/lessons/recommended · ok · ≤3 · reason_code · id 존재', recOk);

  // B. 제출 전 컨텍스트 (dry_run)
  const detail = await get(`/api/lessons/${L.id}`);
  t('GET /api/lessons/:id · items 1개 이상', detail.ok === true && Array.isArray(detail.lesson?.items) && detail.lesson.items.length >= 1);
  if (!detail.ok) return;
  D = detail.lesson;
  const dStr = JSON.stringify(D);
  t('상세에 answer/explanation 키 없음', !dStr.includes('"answer"') && !dStr.includes('"explanation"'));

  const preQa = await post(`/api/lessons/${L.id}/qa`, { question: '요지?', dry_run: true });
  t('POST /qa dry_run · ok · pre_submit', preQa.ok === true && preQa.dry_run === true && preQa.mode === 'pre_submit');

  const ctx = preQa.context || '';
  const subj = D.passage?.subject;
  const body0 = D.passage?.body?.[0] || '';
  const ctxHasPassage = (subj && ctx.includes(subj)) || (body0 && ctx.includes(body0.slice(0, 30)));
  t('pre_submit context · 지문(subject 또는 body[0] 앞 30자) 포함', ctxHasPassage);

  const stems = D.items.flatMap((it) => [it.stem]).filter(Boolean);
  const optTexts = D.items.flatMap((it) => (it.options || []).map((o) => o.text)).filter(Boolean);
  const noStems = stems.every((s) => !ctx.includes(s));
  const noOpts = optTexts.every((s) => !ctx.includes(s));
  t('pre_submit context · stem/선택지 text 미포함', noStems && noOpts);

  const badItem = await postRes(`/api/lessons/${L.id}/qa`, { question: 'x', item_id: 999, dry_run: true });
  const badItemOk = badItem.status === 400 || (badItem.status === 200 && badItem.data.ok === true);
  t('POST /qa item_id=999 · 400 또는 무시(200)', badItemOk, badItem.status === 200 ? '(무시 구현)' : `status=${badItem.status}`);

  // C. 제출 → 제출 후 컨텍스트
  const answers = Object.fromEntries(D.items.map((it) => [String(it.position), it.options[0].id]));
  const chosenText = D.items[0].options[0].text;
  const attempt = await post(`/api/lessons/${L.id}/attempts`, { answers, client_request_id: crypto.randomUUID() });
  t('POST /attempts · ok · attempt.id', attempt.ok === true && Boolean(attempt.attempt?.id));
  if (!attempt.ok) return;
  A = attempt.attempt.id;

  const postQa = await post(`/api/lessons/${L.id}/qa`, {
    question: '1번 왜 틀렸어?',
    attempt_id: A,
    item_id: D.items[0].position,
    dry_run: true,
  });
  t('POST /qa dry_run · post_submit', postQa.ok === true && postQa.mode === 'post_submit');

  const postCtx = postQa.context || '';
  t('post_submit context · stem · 사용자 선택 text 포함', postCtx.includes(D.items[0].stem) && postCtx.includes(chosenText));

  const noLeak = !postCtx.includes('explanation') && !postCtx.includes('explanation:') && !postCtx.includes('정답:');
  t('post_submit context · 정답/해설 문자열 미포함', noLeak);

  const badAttempt = await postRes(`/api/lessons/${L.id}/qa`, { question: 'x', attempt_id: 999999999, dry_run: true });
  t('POST /qa attempt_id=999999999 → 403/404', badAttempt.data.ok === false && (badAttempt.status === 403 || badAttempt.status === 404), `status=${badAttempt.status}`);

  const emptyQ = await postRes(`/api/lessons/${L.id}/qa`, { question: '', dry_run: true });
  t('POST /qa question="" → 400', emptyQ.status === 400);

  // D. 실제 AI 호출
  if (process.env.SKIP_AI === '1') {
    console.log('(SKIP_AI) 건너뜀');
  } else {
    const ai1 = await post(`/api/lessons/${L.id}/qa`, { question: '이 지문의 요지를 한 문장으로 한국어로 요약해줘.' });
    t('POST /qa · pre_submit · answer ≥20자', ai1.ok === true && ai1.mode === 'pre_submit' && (ai1.answer?.length || 0) >= 20);

    const pText = passageText(D.passage);
    const cites = ai1.citations || [];
    const citesOk = cites.every((c) => !c.quote || pText.includes(norm(c.quote)));
    t('citations quote · 지문 부분문자열', citesOk, cites.length ? `${cites.length}건` : '0건');

    const ai2 = await post(`/api/lessons/${L.id}/qa`, {
      question: '1번 문항에서 내가 고른 답이 왜 맞거나 틀린지 설명해줘.',
      attempt_id: A,
      item_id: D.items[0].position,
    });
    t('POST /qa · post_submit · answer ≥20자', ai2.ok === true && ai2.mode === 'post_submit' && (ai2.answer?.length || 0) >= 20);

    const ai3 = await post(`/api/lessons/${L.id}/qa`, {
      question: '1번 문항에서 내가 고른 답이 왜 맞거나 틀린지 설명해줘.',
      attempt_id: A,
      item_id: D.items[0].position,
    });
    t('POST /qa 동일 요청 재호출 · resumed=true', ai3.ok === true && ai3.resumed === true);
  }
}

await main();
const failed = results.filter((r) => !r).length;
console.log(`\n총 ${results.length}개 중 ${results.length - failed}개 통과${failed ? ` · 실패 ${failed}` : ''}`);
process.exitCode = failed ? 1 : 0;
