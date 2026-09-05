// AI 생성 파이프라인(ai_jobs · lesson_gen) 검증 — docs/plan/07 Phase 2 완료 판정.
// 사용: 서버 기동 상태에서 `node scripts/verify-lesson-gen.mjs`
//   E2E_API — 대상 API (기본 http://localhost:3004)
//   SKIP_AI=1 — §F 실제 생성 단계 건너뜀 (§F 의존 단정도 함께 건너뜀)
// DB 직접 검증(가짜 큐 주입·복구·정리)을 위해 api 모듈을 임포트한다 — .env 는 config 가 로드.
import { pool } from '../api/lib/pool.js';
import {
  normalizeJobInput,
  requestHash,
  recoverRunningJobs,
  saveGeneratedLesson,
  validateGeneratedLesson,
} from '../api/services/ai-job.service.js';

const API = process.env.E2E_API || 'http://localhost:3004';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'jina', Origin: API.replace(/:(\d+)$/, (_, p) => `:${Number(p) - 1}`) };
const get = async (p) => (await fetch(API + p, { headers: H })).json();
const postRes = async (p, body) => {
  const res = await fetch(API + p, { method: 'POST', headers: H, body: JSON.stringify(body) });
  return { status: res.status, data: await res.json() };
};
const results = [];
const t = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? '✔' : '✖'} ${name}${detail ? ' — ' + detail : ''}`); };

// 가짜/생성 흔적 정리는 request_hash 마커로 — 실패해도 finally 에서 지운다.
const FAKE_HASH = 'verify-lesson-gen-fake';
const goodItem = (n) => ({
  stem: `Sentence ${n} requires _____ review.`,
  options: [
    { id: 'A', text: `careful ${n}` }, { id: 'B', text: `carefully ${n}` },
    { id: 'C', text: `care ${n}` }, { id: 'D', text: `caring ${n}` },
  ],
  answer: 'A',
  explanation: `(A) careful ${n}이 명사를 수식하는 형용사라 정답입니다.`,
  skill_code: 'grammar',
});

async function main() {
  const { rows: [devUser] } = await pool.query(
    `SELECT id FROM users WHERE email = $1`,
    [process.env.DEV_USER_EMAIL || 'jina@dev.local'],
  );
  if (!devUser) { t('dev 사용자 존재', false); return; }
  const uid = devUser.id;

  // ── A. 입력 검증 (HTTP 400/404) ──
  const newReq = () => crypto.randomUUID();
  const badTask = await postRes('/api/ai-jobs', { task: 'essay_gen', input: {}, client_request_id: newReq() });
  t('task=essay_gen → 400', badTask.status === 400, badTask.data.error);
  const noReqId = await postRes('/api/ai-jobs', { task: 'lesson_gen', input: { part: 5 } });
  t('client_request_id 누락 → 400', noReqId.status === 400);
  const badCount = await postRes('/api/ai-jobs', { task: 'lesson_gen', input: { part: 5, count: 11 }, client_request_id: newReq() });
  t('count=11 → 400', badCount.status === 400);
  const badPart = await postRes('/api/ai-jobs', { task: 'lesson_gen', input: { part: 7 }, client_request_id: newReq() });
  t('part=7 → 400 (Part 5만)', badPart.status === 400);
  const badProvider = await postRes('/api/ai-jobs', { task: 'lesson_gen', input: { part: 5 }, client_request_id: newReq(), provider: 'nope' });
  t('provider=nope → 400', badProvider.status === 400);
  const badTopicId = await postRes('/api/ai-jobs', { task: 'lesson_gen', input: { part: 5, topic_id: 999999 }, client_request_id: newReq() });
  t('topic_id=999999 → 404', badTopicId.status === 404);
  const missingJob = await fetch(`${API}/api/ai-jobs/999999999`, { headers: H });
  t('GET /api/ai-jobs/999999999 → 404', missingJob.status === 404);

  // 플랜 12 — 대상은 input 안에 남아야 같은 입력의 개인/카탈로그 작업을 잘못 재사용하지 않는다.
  const personal = normalizeJobInput('lesson_gen', { topic: '대상 검증' });
  const catalog = normalizeJobInput('lesson_gen', { topic: '대상 검증', publish_target: 'catalog' });
  t('publish_target 기본 personal · catalog input 보관', personal.publish_target === 'personal' && catalog.publish_target === 'catalog');
  t('personal/catalog request_hash 분리', requestHash('lesson_gen', personal) !== requestHash('lesson_gen', catalog));
  const badTarget = await postRes('/api/ai-jobs', {
    task: 'lesson_gen', input: { publish_target: 'public' }, client_request_id: newReq(),
  });
  t('publish_target=public → 400', badTarget.status === 400);

  // ── B. 자동 검증 규칙 (validateGeneratedLesson 단위) ──
  const good = { title: '검증', subtitle: 's', items: [goodItem(1), goodItem(2), goodItem(3)] };
  t('정상 payload → 오류 0', validateGeneratedLesson(good, 3).length === 0);
  t('문항 수 불일치 → 오류', validateGeneratedLesson(good, 5).length > 0);
  const badAnswer = structuredClone(good); badAnswer.items[0].answer = 'E';
  t('answer 보기 밖(E) → 오류', validateGeneratedLesson(badAnswer, 3).some((e) => e.includes('answer')));
  const dupOption = structuredClone(good); dupOption.items[1].options[1].text = dupOption.items[1].options[0].text;
  t('보기 텍스트 중복 → 오류', validateGeneratedLesson(dupOption, 3).some((e) => e.includes('중복')));
  const dupStem = structuredClone(good); dupStem.items[2].stem = dupStem.items[0].stem;
  t('stem 중복 → 오류', validateGeneratedLesson(dupStem, 3).some((e) => e.includes('중복')));
  const badExplain = structuredClone(good); badExplain.items[0].explanation = '이게 맞는 표현이라 정답입니다.';
  t('해설이 정답 id 미지시 → 오류', validateGeneratedLesson(badExplain, 3).some((e) => e.includes('explanation')));

  // ── C. 스키마 실패 저장 0 — 검증 실패 payload 는 draft 만 남고 lessons 미게시 ──
  const { rows: [failJob] } = await pool.query(
    `INSERT INTO ai_jobs (user_id, task, input, request_hash, client_request_id, provider, status)
     VALUES ($1, 'lesson_gen', '{"part":5,"count":3,"difficulty":3,"topic":"검증"}'::jsonb, $2, $3, 'claude', 'failed')
     RETURNING *`,
    [uid, FAKE_HASH, crypto.randomUUID()],
  );
  const badSave = await saveGeneratedLesson(failJob, badAnswer, null);
  t('검증 실패 → draft 저장 + lesson_id null',
    badSave.validation_errors.length > 0 && badSave.lesson_id === null, `draft #${badSave.draft_id}`);
  const { rows: [draftRow] } = await pool.query(
    `SELECT review_status, published_content_id AS published_lesson_id, jsonb_array_length(validation_errors) AS n
       FROM lesson_drafts WHERE id = $1`, [badSave.draft_id]);
  t('실패 draft — validation_errors 기록 · 미게시', draftRow.n > 0 && draftRow.published_lesson_id === null);
  const { rows: [orphan] } = await pool.query(
    `SELECT count(*)::int AS n FROM content_items WHERE slug = $1`, [`ai-toeic-part5-${uid}-${failJob.id}`]);
  t('검증 실패 lessons 저장 0건', orphan.n === 0);

  // ── D. 사용자 대기 한도 — queued 3건 초과 시 429, 워커 kick 이전에 거절 ──
  for (let i = 0; i < 3; i += 1) {
    await pool.query(
      `INSERT INTO ai_jobs (user_id, task, input, request_hash, client_request_id, provider, status)
       VALUES ($1, 'lesson_gen', '{"part":5,"count":3,"difficulty":3,"topic":"대기"}'::jsonb, $2, $3, 'claude', 'queued')`,
      [uid, `${FAKE_HASH}-q${i}`, crypto.randomUUID()],
    );
  }
  const overflowReqId = crypto.randomUUID();
  const overflow = await postRes('/api/ai-jobs', {
    task: 'lesson_gen', input: { part: 5, topic: `대기 한도 ${Date.now()}`, count: 3 }, client_request_id: overflowReqId,
  });
  t('대기 3건 상태에서 4번째 → 429 RATE_LIMITED', overflow.status === 429 && overflow.data.code === 'RATE_LIMITED');
  const { rows: [notSaved] } = await pool.query(
    `SELECT count(*)::int AS n FROM ai_jobs WHERE user_id = $1 AND client_request_id = $2`,
    [uid, overflowReqId],
  );
  t('429 요청은 job 미생성', notSaved.n === 0);
  await pool.query(`DELETE FROM ai_jobs WHERE request_hash LIKE $1`, [`${FAKE_HASH}-q%`]);

  // ── E. 재시작 복구 — running → queued (서버 부팅 시 startAiJobWorker 가 호출하는 함수) ──
  const { rows: [stuck] } = await pool.query(
    `INSERT INTO ai_jobs (user_id, task, input, request_hash, client_request_id, provider, status, started_at)
     VALUES ($1, 'lesson_gen', '{"part":5,"count":3,"difficulty":3,"topic":"복구"}'::jsonb, $2, $3, 'claude', 'running', now())
     RETURNING id`,
    [uid, `${FAKE_HASH}-r`, crypto.randomUUID()],
  );
  const recovered = await recoverRunningJobs();
  const { rows: [afterRecover] } = await pool.query(
    `SELECT status, started_at FROM ai_jobs WHERE id = $1`, [stuck.id]);
  t('recoverRunningJobs — running → queued · started_at 초기화',
    recovered >= 1 && afterRecover.status === 'queued' && afterRecover.started_at === null);
  await pool.query(`DELETE FROM ai_jobs WHERE request_hash = $1`, [`${FAKE_HASH}-r`]);

  // ── F. 실제 생성 → 게시 → 멱등 (SKIP_AI=1 이면 건너뜀) ──
  if (process.env.SKIP_AI === '1') { console.log('(SKIP_AI) §F/§G 건너뜀'); return; }
  // topic 에 타임스탬프 — request_hash 재사용에 걸리지 않고 매 실행 실제 생성을 검증한다.
  const input = { part: 5, topic: `검증 스크립트 ${Date.now()}`, difficulty: 2, count: 3 };
  const reqId = crypto.randomUUID();
  const created = await postRes('/api/ai-jobs', { task: 'lesson_gen', input, client_request_id: reqId });
  t('POST /api/ai-jobs → 202 + job id', created.status === 202 && Boolean(created.data.job?.id), `status=${created.status}`);
  if (!created.data.job?.id) return;
  let job = created.data.job;
  t('생성 직후 status=queued|running', ['queued', 'running'].includes(job.status), job.status);

  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline && ['queued', 'running'].includes(job.status)) {
    await new Promise((r) => setTimeout(r, 2000));
    const polled = await get(`/api/ai-jobs/${job.id}`);
    if (!polled.ok) break;
    job = polled.job;
  }
  t('폴링 종결 status=succeeded', job.status === 'succeeded', `${job.status}${job.error ? ' · ' + job.error.message : ''}`);
  const lessonId = job.result?.lesson_id;
  t('result.lesson_id 존재', Boolean(lessonId), `#${lessonId}`);
  if (!lessonId) return;

  try {
    // 게시 결과 — 개인 소유 private, 문항 3, 정답 비노출, 목록 노출
    const detailRes = await fetch(`${API}/api/lessons/${lessonId}`, { headers: H });
    const detailRaw = await detailRes.text();
    const detail = JSON.parse(detailRaw);
    t('GET /api/lessons/:id — source=ai · visibility=private',
      detail.ok === true && detail.lesson.source === 'ai' && detail.lesson.visibility === 'private');
    t('생성 레슨 문항 3개', detail.lesson.question_count === 3);
    t('생성 레슨 상세에 정답·해설 비노출', !detailRaw.includes('"answer"') && !detailRaw.includes('"explanation"'));
    const list = await get('/api/lessons');
    t('내 목록에 생성 레슨 노출', list.ok && list.lessons.some((l) => l.id === lessonId));
    const { rows: [draft] } = await pool.query(
      `SELECT review_status, published_content_id AS published_lesson_id FROM lesson_drafts WHERE job_id = $1`, [job.id]);
    t('draft — published_lesson_id 연결 · review_status=draft',
      draft?.published_lesson_id === lessonId && draft?.review_status === 'draft');

    // 멱등 — 같은 client_request_id 재전송 → 같은 job 재사용 (202)
    const replay = await postRes('/api/ai-jobs', { task: 'lesson_gen', input, client_request_id: reqId });
    t('같은 client_request_id 재전송 → 같은 job 재사용',
      replay.status === 202 && replay.data.reused === true && replay.data.job.id === job.id);
    // 같은 입력 + 새 client_request_id → request_hash 로 성공 job 재사용 (재생성 없음)
    const sameHash = await postRes('/api/ai-jobs', { task: 'lesson_gen', input, client_request_id: crypto.randomUUID() });
    t('같은 입력 새 요청 → request_hash 성공 job 재사용',
      sameHash.status === 202 && sameHash.data.reused === true && sameHash.data.job.id === job.id);
    // 같은 client_request_id + 다른 입력 → 409
    const conflict = await postRes('/api/ai-jobs', {
      task: 'lesson_gen', input: { ...input, difficulty: 5 }, client_request_id: reqId,
    });
    t('같은 client_request_id 다른 입력 → 409 CONFLICT', conflict.status === 409 && conflict.data.code === 'CONFLICT');

    // ── G. 신고 — 승격 아님 ──
    const report = await postRes(`/api/lessons/${lessonId}/reports`, { reason: 'ambiguous', details: '검증 스크립트' });
    t('POST /reports → 201', report.status === 201 && Boolean(report.data.report?.id));
    const reportAgain = await postRes(`/api/lessons/${lessonId}/reports`, { reason: 'other' });
    t('재신고 → 같은 사용자 upsert', reportAgain.status === 201 && reportAgain.data.report?.reason === 'other');
    const badReason = await postRes(`/api/lessons/${lessonId}/reports`, { reason: 'spam' });
    t('reason=spam → 400', badReason.status === 400);
    const { rows: [afterReport] } = await pool.query(
      `SELECT l.visibility, d.review_status
         FROM content_items l JOIN lesson_drafts d ON d.published_content_id = l.id
        WHERE l.id = $1`, [lessonId]);
    t('신고 후에도 private · draft (신고만으로 승격 불가)',
      afterReport?.visibility === 'private' && afterReport?.review_status === 'draft');
  } finally {
    // 생성 흔적 정리 — content_items 삭제로 details/items/reports/topic_contents cascade, job 삭제로 draft cascade
    await pool.query(`DELETE FROM content_items WHERE id = $1 AND source = 'ai' AND created_by = $2`, [lessonId, uid]);
    await pool.query(`DELETE FROM ai_jobs WHERE id = $1`, [job.id]);
    console.log(`· 정리: 생성 레슨 #${lessonId} · job #${job.id} 삭제`);
  }
}

try {
  await main();
} finally {
  await pool.query(`DELETE FROM ai_jobs WHERE request_hash LIKE $1`, [`${FAKE_HASH}%`]).catch(() => {});
  await pool.end();
}
const failed = results.filter((r) => !r).length;
console.log(`\n총 ${results.length}개 중 ${results.length - failed}개 통과${failed ? ` · 실패 ${failed}` : ''}`);
process.exitCode = failed ? 1 : 0;
