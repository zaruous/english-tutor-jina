// ai-draft.jsx — 관리자 · AI 초안 요청 패널 (플랜 14 Phase B)
// 검수 큐(review-queue.jsx) 헤더 아래 접이식으로 그려진다. 전역 이름 AdminAiDraftPanel 하나만 내놓고
// review-queue 가 렌더 시점에 typeof 로 확인해 마운트한다(admin.html 의 script 순서: ai-draft → review-queue).
//
// ── 이 화면이 하는 일 ──────────────────────────────────────────────────────
// 학습 앱의 레슨 목록에서 '카탈로그' 라디오를 골라야만 검수 큐로 오던 AI 초안 요청(lesson_gen)을,
// 회화(scenario_gen)·단어(vocab_set)까지 포함해 관리 화면에서 직접 보낸다. **저장 대상은 catalog 고정**이다 —
// personal 라디오는 두지 않는다(플랜 14 결정 B3: 관리자의 개인 레슨은 이 화면의 일이 아니다).
// 요청의 결과가 곧 큐의 새 행이라 큐 옆에 있어야 하고, 그래서 별도 탭이 아니라 #/review/new 로 열린다.
//
// ── 세 가지 규범 ─────────────────────────────────────────────────────────────
// 1. 입력 규칙의 단일 소스는 서버(normalizeJobInput)다. 여기서는 선택지를 서버 허용 범위로 좁혀 그릴 뿐이고
//    (LC 2~4 · Part 5 3~10 · 난도 1~5 · 주제 ≤80), 400/404/409/429 봉투는 error+hint 를 **그대로** 보인다.
// 2. 종료 상태는 succeeded·failed **둘 다** 처리한다. failed 의 hint 는 서버가 싣는 값(hintFor)이라 code→문구 표를
//    화면에 따로 두지 않는다. VALIDATION_FAILED 는 예외로 result.validation_errors 를 나열한다 — 그 초안은
//    lesson_drafts 에만 남고 검수 큐에는 **오르지 않으므로** "큐에서 확인하세요" 라고 안내하면 틀린 말이 된다.
// 3. 멱등 재사용(reused:true)은 서버 규칙이다. 같은 사용자의 같은 task·input 은 새 작업을 만들지 않고 기존 잡을
//    돌려주므로, "왜 새 초안이 안 생기나" 를 화면이 설명해야 한다 — 주제를 바꾸라는 안내가 그것이다.
//
// 최상위 이름은 전부 전역이다(content-store.jsx 머리말) — AdminAiDraft/adminAiDraft/ADMIN_AI_DRAFT_ 접두를 쓴다.
// admin-app.jsx 는 이 파일 **뒤에** 로드되므로 adminGoto·adminTint 같은 헬퍼를 최상위에서 참조하면 안 된다.

// 유형 칩 — key 는 POST /api/ai-jobs 의 task 그대로(ai-job.service AI_JOB_TASKS).
const ADMIN_AI_DRAFT_TASKS = [
  { key: 'lesson_gen', label: '레슨' },
  { key: 'scenario_gen', label: '회화' },
  { key: 'vocab_set', label: '단어' },
];
// 레슨 파트 — 서버는 input.part 를 5(정수) 또는 'lc'(문자열)로 받는다. 요청 해시에 part 가 들어가므로
// 같은 주제라도 파트가 다르면 다른 작업으로 큐잉된다.
const ADMIN_AI_DRAFT_PARTS = [
  { key: 5, label: 'Part 5' },
  { key: 'lc', label: 'LC' },
];
// 문항 수 선택지 — 서버 허용 범위(LC 2~4 · Part 5 3~10) 안의 실전 규격만 고른다. 기본은 서버 기본값과 같다.
const ADMIN_AI_DRAFT_COUNTS = { 5: [3, 5, 7, 10], lc: [2, 3, 4] };
const ADMIN_AI_DRAFT_COUNT_DEFAULT = { 5: 5, lc: 3 };
const ADMIN_AI_DRAFT_DIFFICULTIES = [1, 2, 3, 4, 5];
const ADMIN_AI_DRAFT_TOPIC_MAX = 80;
// 단어 세트의 count 는 서버가 20 으로 고정한다(normalizeJobInput). 본문에 보내지 않고 표기만 한다.
const ADMIN_AI_DRAFT_VOCAB_COUNT = 20;
// 폴링 — 워커가 CLI/Ollama 를 부르는 동안 1.5초마다 GET /api/ai-jobs/:id. 5분을 넘기면 화면만 손을 뗀다
// (서버 작업은 계속 돌고, 큐 새로고침으로 결과를 볼 수 있다).
const ADMIN_AI_DRAFT_POLL_MS = 1500;
const ADMIN_AI_DRAFT_DEADLINE_MS = 5 * 60_000;
// 폴링 GET 이 연속으로 이만큼 실패하면 멈춘다 — 서버가 잠깐 재시작하는 정도는 넘기고, 죽어 있으면 빙빙 돌지 않게.
const ADMIN_AI_DRAFT_POLL_RETRIES = 3;
const ADMIN_AI_DRAFT_TERMINAL = ['succeeded', 'failed'];
// 토픽 선택지 상한 — 관리자 토픽 API 는 limit 을 200 에서 자른다.
const ADMIN_AI_DRAFT_TOPIC_LIMIT = 200;

// client_request_id — 제출마다 새 UUID. crypto.randomUUID 는 보안 컨텍스트(localhost 포함)에서만 있으므로
// http://<LAN IP> 로 열었을 때를 위해 v4 폴백을 둔다(서버는 UUID_RE 형식만 본다).
function adminAiDraftUuid() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function adminAiDraftSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// 폼 → POST 본문. publish_target 은 catalog 고정. topic 은 trim 해서 비면 **키를 빼서** 보낸다 — 서버 shortText 는
// undefined 일 때만 fallback('일반 비즈니스 및 사무 환경')을 쓰고 빈 문자열은 400 이다(레슨만 선택, 회화·단어는 필수라
// 제출 버튼이 먼저 막는다). provider 는 목록을 받아 왔을 때만 싣고 model 은 서버 기본값에 맡긴다.
function adminAiDraftBody(form, providerAvailable) {
  const topic = form.topic.trim();
  const input = { publish_target: 'catalog' };
  if (form.task === 'lesson_gen') {
    input.part = form.part;
    input.count = form.count;
    input.difficulty = form.difficulty;
  } else if (form.task === 'scenario_gen') {
    input.difficulty = form.difficulty;
  }
  if (topic) input.topic = topic;
  if (form.topicId) input.topic_id = Number(form.topicId);
  return {
    task: form.task,
    input,
    client_request_id: adminAiDraftUuid(),
    ...(providerAvailable && form.provider ? { provider: form.provider } : {}),
  };
}

// 성공 결과의 새 콘텐츠 id — task 별 키가 다르다(saveGeneratedLesson/Scenario/VocabSet 의 반환 그대로).
function adminAiDraftResultId(job) {
  const result = job?.result;
  if (!result) return null;
  return result.lesson_id ?? result.scenario_id ?? result.vocab_set_id ?? null;
}

// 주제 검증 — 회화·단어는 필수(서버 min 1), 레슨은 선택. 길이는 서버와 같은 80.
function adminAiDraftTopicProblem(form) {
  const topic = form.topic.trim();
  if (topic.length > ADMIN_AI_DRAFT_TOPIC_MAX) return `주제는 ${ADMIN_AI_DRAFT_TOPIC_MAX}자 이하여야 합니다.`;
  if (!topic && form.task !== 'lesson_gen') return '주제를 입력하세요.';
  return null;
}

function adminAiDraftInitialForm() {
  return { task: 'lesson_gen', part: 5, count: ADMIN_AI_DRAFT_COUNT_DEFAULT[5], difficulty: 3, topic: '', topicId: '', provider: '' };
}

// 진행 상태 한 덩어리. status 는 data-status 로 그대로 나간다:
//   idle | submitting | queued | running | succeeded | failed | timeout | error
// error 는 POST 봉투(400/404/409/429) 또는 폴링 GET 연속 실패, timeout 은 5분 데드라인이다.
function adminAiDraftIdleRun() {
  return { status: 'idle', job: null, reused: false, error: null, startedAt: null, elapsedMs: 0 };
}

function AdminAiDraftChip({ theme, active, disabled, onClick, testid, children, title }) {
  return (
    <button type="button" data-testid={testid} aria-pressed={active} disabled={disabled} onClick={onClick} title={title} style={{
      padding: '7px 12px', borderRadius: 999, fontSize: 12.5, fontWeight: active ? 700 : 500, cursor: disabled ? 'not-allowed' : 'pointer',
      background: active ? theme.accent : theme.chipBg, color: active ? theme.bg : theme.textMuted,
      border: `1px solid ${active ? theme.accent : theme.borderStrong}`, opacity: disabled ? 0.55 : 1,
    }}>{children}</button>
  );
}

function AdminAiDraftField({ theme, label, children, style }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5, ...style }}>
      <span style={{ fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: theme.textDim, textTransform: 'uppercase' }}>{label}</span>
      {children}
    </label>
  );
}

function AdminAiDraftPanel({ theme, me, onSucceeded }) {
  const [form, setForm] = React.useState(adminAiDraftInitialForm);
  const [run, setRun] = React.useState(adminAiDraftIdleRun);
  // 선택지 — topics 는 published 만, providers 는 실패하면 null 로 두고 셀렉트를 숨긴다(본문에서 provider 생략).
  const [topics, setTopics] = React.useState([]);
  const [providers, setProviders] = React.useState(null);
  // 언마운트 뒤 setState·onSucceeded 를 막는 플래그와, 새 제출이 이전 폴링 루프를 끊는 순번.
  const alive = React.useRef(true);
  const runSeq = React.useRef(0);
  const canAuthor = Boolean(me?.can_author);

  React.useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  // 두 조회는 따로 기다린다 — /api/ai/providers 는 모델 캐시(10분)가 식으면 CLI 를 spawn 해 수 초가 걸리는데,
  // Promise.all 로 묶으면 4ms 짜리 토픽 선택지까지 그 시간 동안 '없음' 하나로 보인다(실측 3.7초).
  React.useEffect(() => {
    if (!canAuthor) return;
    (async () => {
      const res = await window.JINA_API.get(`/api/admin/topics?limit=${ADMIN_AI_DRAFT_TOPIC_LIMIT}`);
      if (!alive.current) return;
      // 내린(archived)·초안 토픽은 서버 assertTopicAccess 가 404 를 돌려주므로 선택지에서 미리 뺀다.
      if (res.ok && Array.isArray(res.topics)) setTopics(res.topics.filter((topic) => topic.status === 'published'));
    })();
    (async () => {
      const res = await window.JINA_API.get('/api/ai/providers');
      if (!alive.current) return;
      if (res.ok && Array.isArray(res.providers) && res.providers.length) {
        setProviders(res.providers);
        setForm((old) => ({ ...old, provider: old.provider || res.default || res.providers[0].id }));
      } else {
        setProviders(null); // 실패하면 셀렉트를 숨기고 본문에서 provider 를 생략한다(서버 기본값).
      }
    })();
  }, [canAuthor]);

  const busy = run.status === 'submitting' || run.status === 'queued' || run.status === 'running';
  const topicProblem = adminAiDraftTopicProblem(form);
  const patch = (fields) => setForm((old) => ({ ...old, ...fields }));
  // 파트를 바꾸면 문항 수를 그 파트의 기본값으로 — LC 에서 고른 4 는 Part 5 범위(3~10) 안이지만 선택지에 없고,
  // Part 5 의 7·10 은 LC 범위 밖이라 그대로 두면 400 이 된다.
  const setPart = (part) => patch({ part, count: ADMIN_AI_DRAFT_COUNT_DEFAULT[part] });

  const submit = async () => {
    if (busy || topicProblem) return;
    const seq = ++runSeq.current;
    const providerAvailable = Array.isArray(providers) && providers.length > 0;
    const body = adminAiDraftBody(form, providerAvailable);
    setRun({ ...adminAiDraftIdleRun(), status: 'submitting' });
    const res = await window.JINA_API.post('/api/ai-jobs', body);
    if (!alive.current || seq !== runSeq.current) return;
    if (!res.ok || !res.job) {
      setRun({ ...adminAiDraftIdleRun(), status: 'error', error: res });
      return;
    }
    let job = res.job;
    const reused = Boolean(res.reused);
    const startedAt = Date.now();
    setRun({ status: job.status, job, reused, error: null, startedAt, elapsedMs: 0 });
    let failures = 0;
    while (!ADMIN_AI_DRAFT_TERMINAL.includes(job.status)) {
      if (Date.now() - startedAt > ADMIN_AI_DRAFT_DEADLINE_MS) {
        setRun((old) => ({ ...old, status: 'timeout', elapsedMs: Date.now() - startedAt }));
        return;
      }
      await adminAiDraftSleep(ADMIN_AI_DRAFT_POLL_MS);
      if (!alive.current || seq !== runSeq.current) return;
      const poll = await window.JINA_API.get(`/api/ai-jobs/${encodeURIComponent(job.id)}`);
      if (!alive.current || seq !== runSeq.current) return;
      if (!poll.ok || !poll.job) {
        failures += 1;
        if (failures >= ADMIN_AI_DRAFT_POLL_RETRIES) {
          setRun((old) => ({ ...old, status: 'error', error: poll, elapsedMs: Date.now() - startedAt }));
          return;
        }
        continue;
      }
      failures = 0;
      job = poll.job;
      setRun((old) => ({ ...old, status: job.status, job, elapsedMs: Date.now() - startedAt }));
    }
    if (job.status === 'succeeded' && typeof onSucceeded === 'function') onSucceeded(job);
  };

  const panel = {
    margin: '14px 26px 0', padding: '14px 18px', borderRadius: 14, background: theme.surface,
    border: `1px solid ${theme.border}`, fontSize: 13, color: theme.text,
  };
  if (!canAuthor) {
    return (
      <section data-testid="ai-draft-panel" aria-label="AI 초안 요청" style={panel}>
        <p data-testid="ai-draft-forbidden" style={{ margin: 0, color: theme.textMuted }}>
          AI 초안 요청은 저작자(author) 이상만 할 수 있습니다. 생성된 초안은 검수 큐(catalog)로 들어갑니다.
        </p>
      </section>
    );
  }

  const control = {
    padding: '8px 11px', borderRadius: 9, fontSize: 13, background: theme.bg, color: theme.text,
    border: `1px solid ${theme.borderStrong}`, fontFamily: 'inherit', minWidth: 0,
  };
  const isLesson = form.task === 'lesson_gen';
  const isVocab = form.task === 'vocab_set';
  const elapsedSec = Math.round(run.elapsedMs / 1000);
  const resultId = adminAiDraftResultId(run.job);
  const failedCode = run.job?.error?.code;
  const validationErrors = Array.isArray(run.job?.result?.validation_errors) ? run.job.result.validation_errors : [];

  return (
    <section data-testid="ai-draft-panel" aria-label="AI 초안 요청" style={panel}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 12 }}>
        <h2 style={{ margin: 0, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}><Icons.Sparkles size={15} /> AI 초안 요청</h2>
        <span style={{ fontSize: 11.5, color: theme.textDim }}>저장 대상: 검수 큐(catalog)</span>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end' }}>
        <AdminAiDraftField theme={theme} label="유형">
          <div style={{ display: 'flex', gap: 6 }}>
            {ADMIN_AI_DRAFT_TASKS.map((task) => (
              <AdminAiDraftChip key={task.key} theme={theme} testid={`ai-draft-task-${task.key}`} active={form.task === task.key}
                disabled={busy} onClick={() => patch({ task: task.key })}>{task.label}</AdminAiDraftChip>
            ))}
          </div>
        </AdminAiDraftField>
        {isLesson && (
          <AdminAiDraftField theme={theme} label="파트">
            <div style={{ display: 'flex', gap: 6 }}>
              {ADMIN_AI_DRAFT_PARTS.map((part) => (
                <AdminAiDraftChip key={String(part.key)} theme={theme} testid={`ai-draft-part-${part.key}`} active={form.part === part.key}
                  disabled={busy} onClick={() => setPart(part.key)}>{part.label}</AdminAiDraftChip>
              ))}
            </div>
          </AdminAiDraftField>
        )}
        {isLesson && (
          <AdminAiDraftField theme={theme} label="문항 수">
            <select data-testid="ai-draft-count" value={form.count} disabled={busy} onChange={(event) => patch({ count: Number(event.target.value) })} style={control}>
              {ADMIN_AI_DRAFT_COUNTS[form.part].map((count) => <option key={count} value={count}>{count}문항</option>)}
            </select>
          </AdminAiDraftField>
        )}
        {isVocab && (
          <AdminAiDraftField theme={theme} label="단어 수">
            <span data-testid="ai-draft-count" data-fixed="true" style={{ ...control, display: 'inline-block', color: theme.textMuted, background: theme.chipBg }}>
              {ADMIN_AI_DRAFT_VOCAB_COUNT}개 고정
            </span>
          </AdminAiDraftField>
        )}
        {!isVocab && (
          <AdminAiDraftField theme={theme} label="난도">
            <select data-testid="ai-draft-difficulty" value={form.difficulty} disabled={busy} onChange={(event) => patch({ difficulty: Number(event.target.value) })} style={control}>
              {ADMIN_AI_DRAFT_DIFFICULTIES.map((level) => <option key={level} value={level}>{level}</option>)}
            </select>
          </AdminAiDraftField>
        )}
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'flex-end', marginTop: 12 }}>
        <AdminAiDraftField theme={theme} label={isLesson ? '주제 (선택)' : '주제 (필수)'} style={{ flex: '1 1 260px' }}>
          <input data-testid="ai-draft-topic" value={form.topic} disabled={busy} maxLength={ADMIN_AI_DRAFT_TOPIC_MAX}
            onChange={(event) => patch({ topic: event.target.value })}
            placeholder={isLesson ? '비우면 서버 기본 주제(일반 비즈니스 및 사무 환경)' : '예: 비즈니스 이메일 작성'}
            style={{ ...control, width: '100%', boxSizing: 'border-box' }} />
        </AdminAiDraftField>
        <AdminAiDraftField theme={theme} label="토픽 (선택)" style={{ flex: '0 1 220px' }}>
          <select data-testid="ai-draft-topic-id" value={form.topicId} disabled={busy} onChange={(event) => patch({ topicId: event.target.value })} style={control}>
            <option value="">없음</option>
            {topics.map((topic) => <option key={topic.id} value={String(topic.id)}>{topic.label_ko}</option>)}
          </select>
        </AdminAiDraftField>
        {providers && (
          <AdminAiDraftField theme={theme} label="공급자" style={{ flex: '0 1 220px' }}>
            <select data-testid="ai-draft-provider" value={form.provider} disabled={busy} onChange={(event) => patch({ provider: event.target.value })} style={control}>
              {providers.map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.label || provider.id}{provider.defaultModel ? ` · ${provider.defaultModel}` : ''}
                </option>
              ))}
            </select>
          </AdminAiDraftField>
        )}
        <button type="button" data-testid="ai-draft-submit" disabled={busy || Boolean(topicProblem)} onClick={submit}
          title={topicProblem || undefined} style={{
            padding: '9px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700, background: theme.accent, color: theme.bg,
            border: `1px solid ${theme.accent}`, cursor: busy || topicProblem ? 'not-allowed' : 'pointer', opacity: busy || topicProblem ? 0.55 : 1,
          }}>
          <Icons.Sparkles size={13} /> {busy ? '진행 중…' : '요청'}
        </button>
      </div>
      {topicProblem && form.topic.trim().length > 0 && <p style={{ margin: '8px 0 0', fontSize: 12, color: theme.error }}>{topicProblem}</p>}

      {/* 진행·결과 — status 별로 한 줄. 종료 상태(succeeded/failed)와 재사용·검증 실패는 아래 별도 블록이 잇는다. */}
      <div data-testid="ai-draft-status" data-status={run.status} role="status" style={{ marginTop: 12, fontSize: 12.5, color: theme.textMuted, minHeight: run.status === 'idle' ? 0 : 18 }}>
        {run.status === 'submitting' && '요청을 보내는 중…'}
        {(run.status === 'queued' || run.status === 'running') && (
          <span>#{run.job.id} {run.status === 'queued' ? '대기 중' : '생성 중'} · {elapsedSec}초{run.job.provider ? ` · ${run.job.provider}${run.job.model ? ' / ' + run.job.model : ''}` : ''}</span>
        )}
        {run.status === 'timeout' && (
          <span style={{ color: theme.warning }}>#{run.job?.id} 5분 안에 끝나지 않았습니다 — 서버에서 계속 진행됩니다. 큐 새로고침으로 확인하세요.</span>
        )}
        {run.status === 'succeeded' && <span style={{ color: theme.success }}>#{run.job.id} 완료 · {elapsedSec}초</span>}
        {run.status === 'failed' && <span style={{ color: theme.error }}>#{run.job.id} 실패 · {elapsedSec}초</span>}
      </div>

      {run.reused && run.job && (
        <p data-testid="ai-draft-reused" style={{ margin: '8px 0 0', fontSize: 12.5, color: theme.warning }}>
          같은 조건의 기존 작업(#{run.job.id})을 재사용했습니다 — 새 초안이 필요하면 주제를 바꾸세요.
        </p>
      )}
      {run.status === 'succeeded' && (
        <p data-testid="ai-draft-done" data-content-id={resultId ?? ''} style={{ margin: '8px 0 0', fontSize: 12.5, color: theme.success, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Icons.Check size={13} /> 검수 큐에 들어왔습니다{resultId != null ? ` (#${resultId})` : ''}.
          {run.reused && ' 재사용한 작업의 결과라 이미 검수를 마쳤으면 큐에 없을 수 있습니다.'}
        </p>
      )}
      {run.status === 'failed' && run.job?.error && (
        <div data-testid="ai-draft-error" data-code={failedCode || ''} role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, color: theme.error, lineHeight: 1.6 }}>
          <div>{run.job.error.message || 'AI 생성 작업에 실패했습니다.'}</div>
          {run.job.error.hint && <div style={{ color: theme.textMuted }}>{run.job.error.hint}</div>}
        </div>
      )}
      {run.status === 'failed' && failedCode === 'VALIDATION_FAILED' && (
        <div data-testid="ai-draft-validation" style={{ margin: '8px 0 0', padding: 12, borderRadius: 10, border: `1px solid ${theme.borderStrong}`, fontSize: 12.5, lineHeight: 1.7 }}>
          <b style={{ color: theme.warning }}>자동 검증 실패 {validationErrors.length}건</b>
          {validationErrors.length > 0 && <ul style={{ margin: '6px 0', paddingLeft: 20 }}>{validationErrors.map((message, i) => <li key={i}>{String(message)}</li>)}</ul>}
          <div style={{ color: theme.textMuted }}>이 초안은 검수 큐에 오르지 않습니다(lesson_drafts 에만 남음). 조건을 바꿔 다시 요청하세요.</div>
        </div>
      )}
      {run.status === 'error' && run.error && (
        <div data-testid="ai-draft-error" data-code={run.error.code || ''} role="alert" style={{ margin: '8px 0 0', fontSize: 12.5, color: theme.error, lineHeight: 1.6 }}>
          <div>{run.error.error || 'AI 초안 요청을 보내지 못했습니다.'}</div>
          {run.error.hint && <div style={{ color: theme.textMuted }}>{run.error.hint}</div>}
        </div>
      )}
    </section>
  );
}

window.AdminAiDraftPanel = AdminAiDraftPanel;
