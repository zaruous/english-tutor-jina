// speaking.jsx — 스피킹 연습 화면 (Desktop + Mobile) · 플랜 08 Phase C v1 + 플랜 10 Phase 2
// 기본 모드는 외부 API 0원: 듣기 = jinaSpeak(기기 TTS), 인식 = 브라우저 SpeechRecognition(en-US) → 받아쓰기 일치율.
// 설정 → 음성 인식을 OpenPronounce 로 바꾸면 MediaRecorder 녹음 → /api/speaking/assess → 발음 점수(로컬 사이드카).
// 저장하지 않는 연습 모드다(플랜 §Phase C '저장: v1 무저장') — 이력·점수 추이는 후속(플랜 10 Phase 3).
//
// 문장 은행 = 서버 콘텐츠(GET /api/speaking/sentences — LC 스크립트·시나리오 첫 문장·레슨 예문)
// + 아래 고정 시드 20문장. 서버가 비었거나 실패해도 시드로 연습할 수 있게 항상 뒤에 붙인다.
const SPEAKING_SENTENCES = [
  { text: 'I would recommend the new vendor because their pricing is more competitive.', tag: '비즈니스' },
  { text: 'Could you clarify the second point in the agenda before we move on?', tag: '회의' },
  { text: 'The launch date has been moved up by one week to accommodate the conference.', tag: '비즈니스' },
  { text: 'I am following up on the email I sent last Thursday about the budget.', tag: '이메일' },
  { text: 'We should allocate more resources to the marketing team this quarter.', tag: '비즈니스' },
  { text: 'Please make sure all attendees receive the slides after the presentation.', tag: '회의' },
  { text: 'The audit confirmed full compliance with the new safety regulations.', tag: '시험' },
  { text: 'There is a discrepancy between the invoice and the purchase order.', tag: '시험' },
  { text: 'I have been working as a project coordinator for about three years.', tag: '면접' },
  { text: 'My greatest strength is staying organized under tight deadlines.', tag: '면접' },
  { text: 'Would it be possible to reschedule our call to three in the afternoon?', tag: '전화' },
  { text: 'Let me transfer you to the department that handles refunds.', tag: '전화' },
  { text: 'I usually commute by subway because traffic is unpredictable.', tag: '일상' },
  { text: 'The restaurant on the corner serves excellent seafood at a reasonable price.', tag: '일상' },
  { text: 'She persuaded the committee to approve the proposal without further revisions.', tag: '시험' },
  { text: 'Our team is responsible for maintaining the customer database.', tag: '비즈니스' },
  { text: 'I appreciate your patience while we resolve the technical issue.', tag: '이메일' },
  { text: 'The workshop was postponed due to unexpected scheduling conflicts.', tag: '비즈니스' },
  { text: 'Please attach the updated report before forwarding it to accounting.', tag: '이메일' },
  { text: 'I look forward to hearing your thoughts on the revised timeline.', tag: '이메일' },
];

// 서버 문장 + 고정 시드 — source 태그로 출처를 표시한다(listening/scenario/lesson/seed).
const SOURCE_LABEL = { listening: '리스닝', scenario: '회화', lesson: '레슨', seed: '기본' };

function useSentenceBank() {
  const [sentences, setSentences] = React.useState(SPEAKING_SENTENCES);
  const [loaded, setLoaded] = React.useState(false);
  React.useEffect(() => {
    let cancelled = false;
    if (!window.JINA_API || window.JINA_READONLY) { setLoaded(true); return undefined; }
    window.JINA_API.get('/api/speaking/sentences?limit=40').then((res) => {
      if (cancelled) return;
      const fromServer = res.ok ? (res.sentences || []) : [];
      // 서버 문장을 앞에, 고정 시드를 뒤에 — 중복은 문장 텍스트로 거른다.
      const seen = new Set(fromServer.map((x) => x.text.toLowerCase()));
      const seed = SPEAKING_SENTENCES.filter((x) => !seen.has(x.text.toLowerCase()));
      setSentences([...fromServer, ...seed]);
      setLoaded(true);
    });
    return () => { cancelled = true; };
  }, []);
  return { sentences, loaded };
}


// STT 는 speech.jsx 의 공용 훅(useJinaSpeechRecognition) — 회화 탭 마이크와 같은 구현을 쓴다.

// 비교용 정규화 — 소문자 + 구두점 제거. 표시는 원문을 쓰고 비교만 이 값으로 한다.
const normWord = (w) => w.toLowerCase().replace(/[^a-z0-9']/g, '');

// LCS 정렬 — 목표 문장과 인식 결과를 맞춰 단어별 상태를 만든다.
//   ok   = 인식됨            (theme.success)
//   bad  = 다른 단어로 인식됨 (theme.error, heard 에 들린 단어)
//   miss = 인식되지 않음      (theme.textDim, 취소선)
// 인접한 miss+extra 를 한 쌍으로 묶어 '치환(bad)'으로 본다 — "vendor를 bender로 읽었다"가
// "vendor 누락 + bender 추가" 두 줄로 흩어지지 않게 한다.
function matchWords(targetWords, heardWords) {
  const a = targetWords.map(normWord);
  const b = heardWords.map(normWord);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] && a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] && a[i] === b[j]) { ops.push({ t: 'ok', i }); i += 1; j += 1; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { ops.push({ t: 'miss', i }); i += 1; }
    else { ops.push({ t: 'extra', word: heardWords[j] }); j += 1; }
  }
  while (i < n) { ops.push({ t: 'miss', i }); i += 1; }
  while (j < m) { ops.push({ t: 'extra', word: heardWords[j] }); j += 1; }

  const words = targetWords.map((w) => ({ word: w, status: 'miss', heard: null }));
  for (let k = 0; k < ops.length; k++) {
    const op = ops[k];
    if (op.t === 'ok') { words[op.i].status = 'ok'; continue; }
    if (op.t !== 'miss') continue;
    // miss 바로 앞/뒤의 extra 를 치환으로 흡수
    const near = ops[k + 1]?.t === 'extra' ? k + 1 : (ops[k - 1]?.t === 'extra' ? k - 1 : -1);
    if (near >= 0 && !ops[near].used) {
      ops[near].used = true;
      words[op.i].status = 'bad';
      words[op.i].heard = ops[near].word;
    }
  }
  const matched = words.filter((w) => w.status === 'ok').length;
  return { words, matched, rate: n ? Math.round((matched / n) * 100) : 0 };
}

// 교정 힌트 — 점수보다 "무엇을 고칠지"를 크게 다룬다(플랜 08 §0 설계 결정 3).
function buildHint(result) {
  if (!result) return null;
  const subs = result.words.filter((w) => w.status === 'bad');
  const miss = result.words.filter((w) => w.status === 'miss');
  if (!subs.length && !miss.length) return '완벽해요! 모든 단어가 정확히 인식됐습니다.';
  const parts = [];
  if (subs.length) {
    parts.push(subs.slice(0, 3).map((w) => `"${w.word}"가 "${w.heard}"로 인식됐어요`).join(', '));
  }
  if (miss.length) {
    parts.push(`${miss.slice(0, 3).map((w) => `"${w.word}"`).join(', ')}는 인식되지 않았어요`);
  }
  return `${parts.join(' · ')}. 또박또박 조금 천천히 다시 읽어보세요.`;
}

// 인식 결과 한 줄 — 단어별 3색 (HANDOFF §7 색상 규격)
function TranscriptWords({ theme, result }) {
  return (
    <p data-testid="speaking-words" style={{ fontSize: 16.5, lineHeight: 2, margin: 0 }}>
      {result.words.map((w, i) => {
        const style = w.status === 'ok'
          ? { color: theme.success }
          : w.status === 'bad'
            ? { color: theme.error, fontWeight: 700, textDecoration: 'underline wavy', textUnderlineOffset: 4 }
            : { color: theme.textDim, textDecoration: 'line-through' };
        return (
          <React.Fragment key={i}>
            <span data-testid={`speaking-word-${w.status}`} title={w.heard ? `들린 단어: ${w.heard}` : undefined} style={style}>{w.word}</span>{' '}
          </React.Fragment>
        );
      })}
    </p>
  );
}

function SpeakingUnsupported({ theme, reason }) {
  return (
    <div data-testid="speaking-unsupported" style={{
      padding: '28px 24px', borderRadius: 14,
      background: theme.card, border: `1px dashed ${theme.border}`,
      textAlign: 'center', color: theme.textMuted, lineHeight: 1.7,
    }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: theme.text, marginBottom: 6 }}>
        {reason === 'denied' ? '마이크 권한이 필요해요' : '이 브라우저는 음성 인식을 지원하지 않아요'}
      </div>
      <div style={{ fontSize: 13 }}>
        {reason === 'denied'
          ? '주소창의 마이크 아이콘에서 권한을 허용한 뒤 다시 시도해 주세요.'
          : 'Chrome·Edge 등 음성 입력(SpeechRecognition / MediaRecorder)을 지원하는 브라우저에서 열면 읽기 연습을 할 수 있어요. 듣기(🔊)는 이 브라우저에서도 동작합니다.'}
      </div>
    </div>
  );
}

// ── 발음 평가 모드(OpenPronounce) 렌더 보조 ─────────────────────
// 단어 점수 색은 HANDOFF §7 규격 그대로: ≥85 success · ≥65 warning · 미만 error.
const pronTier = (score) => (score === null || score === undefined ? 'na' : score >= 85 ? 'ok' : score >= 65 ? 'mid' : 'low');

function PronWords({ theme, result }) {
  return (
    <p data-testid="speaking-pron-words" style={{ fontSize: 16.5, lineHeight: 2, margin: 0 }}>
      {result.words.map((w, i) => {
        const tier = pronTier(w.score);
        const color = tier === 'ok' ? theme.success : tier === 'mid' ? theme.warning : tier === 'low' ? theme.error : theme.textMuted;
        const ipa = w.expected_ipa || w.heard_ipa ? `기대 /${w.expected_ipa || '?'}/ · 들림 /${w.heard_ipa || '—'}/` : undefined;
        return (
          <React.Fragment key={i}>
            <span data-testid={`speaking-word-pron-${tier}`} title={ipa ? `${w.score}점 · ${ipa}` : `${w.score ?? '—'}점`} style={{
              color, fontWeight: tier === 'low' ? 700 : 500,
              textDecoration: tier === 'low' ? 'underline wavy' : tier === 'mid' ? 'underline dotted' : 'none', textUnderlineOffset: 4,
            }}>{w.word}</span>{' '}
          </React.Fragment>
        );
      })}
    </p>
  );
}

// 교정 힌트(발음 평가) — 점수보다 "어느 단어를 어떻게"를 크게. IPA 두 줄이 있으면 그대로 보여준다.
function buildPronHint(result) {
  if (!result) return null;
  const low = result.words.filter((w) => pronTier(w.score) === 'low');
  const mid = result.words.filter((w) => pronTier(w.score) === 'mid');
  if (!low.length && !mid.length) return '좋아요! 눈에 띄는 발음 오류가 없습니다.';
  const parts = low.slice(0, 3).map((w) => (w.expected_ipa
    ? `"${w.word}" — 기대 /${w.expected_ipa}/ · 들림 /${w.heard_ipa || '—'}/`
    : `"${w.word}" (${w.score}점)`));
  if (mid.length) parts.push(`${mid.slice(0, 3).map((w) => `"${w.word}"`).join(', ')}는 조금 더 또박또박`);
  return `${parts.join(' · ')}.`;
}

// 연습 카드 본체 — Desktop/Mobile 공용
// 두 모드가 한 카드를 공유한다:
//  - browser      : SpeechRecognition 받아쓰기 → matchWords → '받아쓰기 일치율' (v1, 기본)
//  - openpronounce: MediaRecorder 녹음 → POST /api/speaking/assess → '발음 점수' (플랜 10 Phase 2)
// 설정값이 openpronounce 라도 사이드카가 응답하지 않으면 browser 로 동작하고 그 사실을 배지로 밝힌다(플랜 10 §4-4·§5-3).
// 두 모드의 수치는 섞지 않는다 — 세션 평균도 각자 따로 쌓는다.
function SpeakingPractice({ theme, compact = false }) {
  const [idx, setIdx] = React.useState(0);
  const [result, setResult] = React.useState(null);       // browser 모드 결과 (matchWords)
  const [rates, setRates] = React.useState([]);           // browser 모드 일치율 (무저장)
  const [pronResult, setPronResult] = React.useState(null); // openpronounce 모드 결과 (공통 계약)
  const [pronScores, setPronScores] = React.useState([]);   // openpronounce 모드 점수 (무저장)
  const [assessing, setAssessing] = React.useState(false);
  const [assessError, setAssessError] = React.useState(null);
  const stt = useJinaSpeechRecognition();
  const recorder = useJinaRecorder();
  const sttMode = useJinaSttMode();
  const { sentences } = useSentenceBank();
  const sentence = sentences[idx % sentences.length];
  const targetWords = React.useMemo(() => sentence.text.replace(/[."]/g, '').split(/\s+/).filter(Boolean), [sentence]);
  // 이번 녹음 회차를 이미 채점했는가. 녹음을 시작할 때만 false 가 된다.
  const scoredRef = React.useRef(true);

  // 발음 평가 서버 상태 — 설정이 openpronounce 일 때만 묻는다. { checked, available, detail }
  const [pron, setPron] = React.useState({ checked: false, available: false, detail: null });
  React.useEffect(() => {
    if (sttMode !== 'openpronounce' || !window.JINA_API || window.JINA_READONLY) { setPron({ checked: true, available: false, detail: null }); return undefined; }
    let cancelled = false;
    setPron((p) => ({ ...p, checked: false }));
    window.JINA_API.get('/api/speaking/assess/status').then((res) => {
      if (cancelled) return;
      setPron({ checked: true, available: Boolean(res.ok && res.available), detail: res.detail || res.error || null });
    });
    return () => { cancelled = true; };
  }, [sttMode]);
  const pronMode = sttMode === 'openpronounce' && pron.available;

  // browser 모드 채점 — 인식이 끝나면 채점, 인식 중에는 중간 결과를 그대로 보여준다.
  // 회차 가드가 없으면 (a) 정지 직후 도착한 final result, (b) 문장 은행이 서버 응답으로 늘어나
  // targetWords 가 바뀌는 순간에 같은 시도가 rates 에 여러 번 쌓여 세션 평균이 오염된다.
  React.useEffect(() => {
    if (stt.listening || !stt.transcript || scoredRef.current) return;
    scoredRef.current = true;
    const heard = stt.transcript.replace(/[.,"?!]/g, '').split(/\s+/).filter(Boolean);
    const r = matchWords(targetWords, heard);
    setResult(r);
    setRates((prev) => [...prev, r.rate]);
  }, [stt.listening, stt.transcript, targetWords]);

  const reset = (nextIdx) => {
    scoredRef.current = true;
    setResult(null);
    setPronResult(null);
    setAssessError(null);
    stt.setTranscript('');
    if (nextIdx !== undefined) setIdx(nextIdx);
  };

  const startRecording = () => {
    reset();
    if (pronMode) { recorder.start(); return; }
    scoredRef.current = false;
    stt.start();
  };

  // openpronounce 모드: 녹음 종료 → 업로드는 onstop 이후 한 번만(플랜 10 §7) → 결과.
  const stopAndAssess = async () => {
    const blob = await recorder.stop();
    if (!blob || !blob.size) { setAssessError('녹음된 소리가 없습니다. 다시 시도해 주세요.'); return; }
    setAssessing(true);
    setAssessError(null);
    const form = new FormData();
    form.append('reference_text', sentence.text);
    form.append('audio', blob, blob.type.includes('mp4') ? 'clip.m4a' : 'clip.webm');
    const res = await window.JINA_API.post('/api/speaking/assess', form, { timeoutMs: 180_000 });
    setAssessing(false);
    if (!res.ok) { setAssessError(`평가 실패 — ${res.error || res.code}`); return; }
    if (res.available === false) {
      // 녹음 뒤에 사이드카가 죽은 경우 — 이번 시도는 채점 불가, 다음 시도부터 받아쓰기 모드로 내려간다.
      setPron((p) => ({ ...p, available: false, detail: res.detail || res.reason }));
      setAssessError(`발음 평가 서버를 사용할 수 없어 채점하지 못했습니다 (${res.detail || res.reason}). 다음 시도는 받아쓰기 모드로 진행됩니다.`);
      return;
    }
    setPronResult(res);
    if (Number.isInteger(res.pron_score)) setPronScores((prev) => [...prev, res.pron_score]);
  };

  const active = pronMode ? recorder.recording : stt.listening;
  const onRecordClick = () => {
    if (pronMode) { recorder.recording ? stopAndAssess() : startRecording(); return; }
    stt.listening ? stt.stop() : startRecording();
  };
  const unsupported = pronMode ? (!recorder.supported || recorder.error === 'denied') : (!stt.supported || stt.error === 'denied');
  const unsupportedReason = (pronMode ? recorder.error : stt.error) === 'denied' ? 'denied' : 'unsupported';

  const avgRate = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
  const avgPron = pronScores.length ? Math.round(pronScores.reduce((a, b) => a + b, 0) / pronScores.length) : null;
  const pad = compact ? 18 : 32;
  const hint = pronMode ? buildPronHint(pronResult) : buildHint(result);
  const showResultPane = active || assessing || assessError || (pronMode ? pronResult : result);

  return (
    <div style={{ width: '100%', maxWidth: 720 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
        <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>Q{idx + 1}</span>
        <span style={{ flex: 1, height: 5, borderRadius: 99, background: theme.surface, overflow: 'hidden' }}>
          <span style={{
            display: 'block', height: '100%', borderRadius: 99, background: theme.accentGrad,
            width: `${((idx % sentences.length) / sentences.length) * 100}%`,
            transition: 'width .4s ease',
          }} />
        </span>
        <span style={{ fontSize: 12, color: theme.textMuted, fontWeight: 600 }}>
          {(idx % sentences.length) + 1}/{sentences.length} 문장
        </span>
      </div>

      <div style={{
        borderRadius: 20, background: theme.surface, border: `1px solid ${theme.border}`,
        boxShadow: theme.shadow, overflow: 'hidden',
      }}>
        <div style={{ padding: `${pad - 6}px ${pad}px ${pad - 12}px`, textAlign: 'center' }}>
          <div style={{
            fontSize: 11, color: theme.textDim, fontWeight: 600,
            letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>아래 문장을 소리 내어 읽어보세요 · {SOURCE_LABEL[sentence.source] || sentence.tag || '기본'}</div>
          <p data-testid="speaking-sentence" style={{
            fontSize: compact ? 17 : 20, fontWeight: 600, lineHeight: 1.5, margin: '10px 0 12px',
          }}>"{sentence.text}"</p>
          <span style={{
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '7px 14px',
            borderRadius: 999, background: theme.chipBg, fontSize: 13, color: theme.textMuted,
          }}>
            <SpeakButton text={sentence.text} theme={theme} size={14} /> 원어민 발음 듣기
          </span>
        </div>

        <div style={{ borderTop: `1px solid ${theme.border}` }} />

        {unsupported ? (
          <div style={{ padding: pad }}>
            <SpeakingUnsupported theme={theme} reason={unsupportedReason} />
          </div>
        ) : (
          <div style={{
            padding: `${pad - 14}px ${pad}px`, display: 'flex', alignItems: 'center',
            gap: 18, justifyContent: 'center', flexWrap: 'wrap',
          }}>
            <button data-testid="speaking-record" disabled={assessing} onClick={onRecordClick} style={{
              width: 60, height: 60, borderRadius: '50%',
              background: active ? theme.error + '24' : theme.chipBg,
              border: `2px solid ${active ? theme.error + '8c' : theme.borderStrong}`,
              display: 'grid', placeItems: 'center', opacity: assessing ? 0.5 : 1,
            }}>
              <span style={{
                width: active ? 20 : 22, height: active ? 20 : 22,
                borderRadius: active ? 6 : '50%',
                background: active ? theme.error : theme.textMuted,
                animation: active ? 'jina-pulse 1.2s infinite' : 'none',
              }} />
            </button>
            <div style={{ textAlign: 'left', minWidth: 220 }}>
              <div style={{
                fontSize: 14, fontWeight: 700, marginBottom: 3,
                color: active ? theme.error : theme.text,
              }}>{active ? (pronMode ? '녹음 중… 다 읽으면 멈춤' : '듣는 중… 다 읽으면 멈춤')
                : assessing ? '발음 평가 중…'
                : (pronMode ? pronResult : result) ? (pronMode ? '평가 완료' : '녹음 완료') : '녹음 시작'}</div>
              <div data-testid="speaking-mode-badge" style={{ fontSize: 12, color: theme.textDim, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{
                  fontSize: 10, fontWeight: 800, padding: '1px 6px', borderRadius: 999, letterSpacing: '0.04em',
                  background: (pronMode ? theme.accent : theme.textMuted) + '22', color: pronMode ? theme.accent : theme.textMuted,
                }}>{pronMode ? '발음 평가' : '받아쓰기'}</span>
                {pronMode ? 'OpenPronounce · 로컬 서버' : '브라우저 음성 인식(SpeechRecognition) · en-US'}
              </div>
              {sttMode === 'openpronounce' && pron.checked && !pron.available && (
                <div data-testid="speaking-mode-fallback" style={{ fontSize: 11, color: theme.warning, marginTop: 4 }}>
                  발음 평가 서버에 연결되지 않아 받아쓰기로 동작합니다{pron.detail ? ` — ${pron.detail}` : ''}
                </div>
              )}
            </div>
          </div>
        )}

        {showResultPane && (
          <React.Fragment>
            <div style={{ borderTop: `1px solid ${theme.border}` }} />
            <div style={{ padding: `${pad - 14}px ${pad}px ${pad - 8}px` }}>
              <div style={{
                fontSize: 11, color: theme.textDim, fontWeight: 600,
                letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10,
              }}>{pronMode ? '발음 평가 — 단어별 점수' : '인식 결과 — 단어별 일치'}</div>

              {assessError && (
                <div data-testid="speaking-assess-error" style={{
                  fontSize: 12.5, color: theme.error, lineHeight: 1.6, padding: '10px 14px', borderRadius: 10,
                  background: theme.error + '14', border: `1px solid ${theme.error}40`, marginBottom: 12,
                }}>{assessError}</div>
              )}

              {pronMode ? (
                active || assessing ? (
                  <p style={{ fontSize: 15, color: theme.textMuted, lineHeight: 1.8, margin: 0, fontStyle: 'italic' }}>
                    {assessing ? '서버가 음소를 정렬하고 있어요…' : '녹음 중 — 문장을 끝까지 읽고 멈춤을 누르세요'}
                  </p>
                ) : pronResult ? <PronWords theme={theme} result={pronResult} /> : null
              ) : (
                stt.listening ? (
                  <p style={{ fontSize: 15, color: theme.textMuted, lineHeight: 1.8, margin: 0, fontStyle: 'italic' }}>
                    {stt.transcript || '…'}
                  </p>
                ) : result ? <TranscriptWords theme={theme} result={result} /> : null
              )}

              {!active && !assessing && (pronMode ? pronResult : result) && (
                <React.Fragment>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 16, flexWrap: 'wrap' }}>
                    {pronMode ? (
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <b data-testid="speaking-pron-score" style={{
                          fontSize: 34, fontWeight: 800,
                          color: pronResult.pron_score === null ? theme.textMuted
                            : pronResult.pron_score >= 85 ? theme.success : pronResult.pron_score >= 65 ? theme.warning : theme.error,
                        }}>{pronResult.pron_score === null ? '—' : pronResult.pron_score}</b>
                        <span style={{ fontSize: 13, color: theme.textMuted }}>발음 점수</span>
                        {pronResult.completeness !== null && pronResult.completeness !== undefined && (
                          <span style={{ fontSize: 11.5, color: theme.textDim, marginLeft: 6 }}>완성도 {pronResult.completeness}%</span>
                        )}
                      </span>
                    ) : (
                      <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                        <b data-testid="speaking-rate" style={{
                          fontSize: 34, fontWeight: 800,
                          color: result.rate >= 85 ? theme.success : result.rate >= 65 ? theme.warning : theme.error,
                        }}>{result.rate}%</b>
                        <span style={{ fontSize: 13, color: theme.textMuted }}>받아쓰기 일치율</span>
                      </span>
                    )}
                    <span data-testid="speaking-hint" style={{
                      flex: 1, minWidth: 220, fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6,
                      padding: '10px 14px', borderRadius: 10,
                      background: theme.success + '14', border: `1px solid ${theme.success}40`,
                    }}>{hint}</span>
                  </div>
                  {pronMode && pronResult.transcript && (
                    <div style={{ fontSize: 11.5, color: theme.textDim, marginTop: 8 }}>서버가 들은 문장: <i>{pronResult.transcript}</i></div>
                  )}
                </React.Fragment>
              )}

              {!active && !assessing && ((pronMode ? pronResult : result) || assessError) && (
                <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
                  <button data-testid="speaking-again" onClick={() => reset()} style={{
                    padding: '11px 16px', borderRadius: 12, background: 'transparent',
                    border: `1px solid ${theme.borderStrong}`, color: theme.text,
                    fontSize: 13.5, fontWeight: 600,
                  }}>다시 읽기</button>
                  <button data-testid="speaking-next" onClick={() => reset(idx + 1)} style={{
                    padding: '11px 18px', borderRadius: 12, background: theme.accentGrad,
                    color: '#fff', fontSize: 13.5, fontWeight: 700,
                  }}>다음 문장 →</button>
                </div>
              )}
            </div>
          </React.Fragment>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        {[
          pronMode
            ? { v: avgPron === null ? '—' : avgPron, k: '이번 세션 평균 발음 점수', c: theme.accent, t: 'speaking-avg' }
            : { v: avgRate === null ? '—' : `${avgRate}%`, k: '이번 세션 평균 받아쓰기 일치율', c: theme.success, t: 'speaking-avg' },
          { v: pronMode ? pronScores.length : rates.length, k: '읽은 문장', c: theme.text, t: 'speaking-count' },
          { v: sentences.length, k: '문장 은행 (학습 콘텐츠 + 시드)', c: theme.accent, t: 'speaking-bank' },
        ].map(({ v, k, c, t }) => (
          <div key={k} data-testid={t} style={{
            flex: 1, padding: '13px 16px', borderRadius: 14,
            background: theme.surface, border: `1px solid ${theme.border}`,
          }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: c }}>{v}</div>
            <div style={{ fontSize: 11.5, color: theme.textDim, marginTop: 3 }}>{k}</div>
          </div>
        ))}
      </div>
      <div data-testid="speaking-disclaimer" style={{
        marginTop: 14, fontSize: 11.5, color: theme.textDim, textAlign: 'center', lineHeight: 1.7,
      }}>
        {pronMode ? (
          <React.Fragment>
            <b style={{ color: theme.accent }}>OpenPronounce 발음 점수 (실험 · 무저장)</b> — 사람 채점과 <b>캘리브레이션되지 않은 값</b>입니다.
            점수 절대값보다 단어별 표시와 기대/들림 음소를 참고하세요. 설정 → 음성 인식에서 모드를 바꿀 수 있습니다
          </React.Fragment>
        ) : (
          <React.Fragment>
            <b style={{ color: theme.warning }}>v1 받아쓰기 기반 연습 모드 (무저장)</b> — 브라우저 음성 인식은 문맥으로 단어를
            보정하기 때문에 <b>이 수치는 발음 점수가 아닙니다.</b> 음소 단위 발음 평가는 설정 → 음성 인식에서 OpenPronounce 를 켜면 사용할 수 있습니다
          </React.Fragment>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Desktop
// ─────────────────────────────────────────────────────
function SpeakingDesktop({ theme, onNavigate }) {
  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%', background: theme.bg, color: theme.text,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <header style={{ padding: '22px 40px 0', background: theme.bgSoft, borderBottom: `1px solid ${theme.border}` }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <div style={{
              fontSize: 11, color: theme.textDim, fontWeight: 600,
              letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4,
            }}>학습</div>
            <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>스피킹 연습</h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, paddingBottom: 14 }}>
          <span style={{
            padding: '7px 14px', borderRadius: 999, background: theme.text, color: theme.bg,
            fontSize: 13, fontWeight: 700,
          }}>문장 읽기</span>
          <button onClick={() => onNavigate && onNavigate('conversation')} style={{
            padding: '7px 14px', borderRadius: 999, background: theme.chipBg,
            color: theme.textMuted, fontSize: 13, fontWeight: 500,
          }}>자유 회화 → AI 회화 탭</button>
        </div>
      </header>
      <main style={{ flex: 1, overflow: 'auto', padding: '24px 0', display: 'flex', justifyContent: 'center' }}>
        <SpeakingPractice theme={theme} />
      </main>
    </div>
  );
}

// ─────────────────────────────────────────────────────
// Mobile
// ─────────────────────────────────────────────────────
function MobileSpeaking({ theme, noNav = false, onNavigate }) {
  return (
    <div className="jina-root" style={{
      width: '100%', height: '100%', background: theme.bg, color: theme.text,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 20px 10px' }}>
        <div style={{
          fontSize: 11, color: theme.textDim, fontWeight: 600,
          letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 2,
        }}>학습</div>
        <div style={{ fontSize: 22, fontWeight: 700 }}>스피킹 연습</div>
      </div>
      <main style={{ flex: 1, overflow: 'auto', padding: `0 16px ${noNav ? 24 : 100}px` }}>
        <SpeakingPractice theme={theme} compact />
      </main>
      {!noNav && <AppMobileNav theme={theme} active="speaking" onNavigate={onNavigate} />}
    </div>
  );
}

window.SPEAKING_SENTENCES = SPEAKING_SENTENCES;
window.jinaMatchWords = matchWords; // e2e 가 STT 모킹 없이 매칭 로직만 단정할 때 사용
window.SpeakingDesktop = SpeakingDesktop;
window.MobileSpeaking = MobileSpeaking;
