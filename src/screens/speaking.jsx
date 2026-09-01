// speaking.jsx — 스피킹 연습 화면 (Desktop + Mobile) · 플랜 08 Phase C v1
// v1은 외부 API 0원: 듣기 = jinaSpeak(기기 TTS), 인식 = 브라우저 SpeechRecognition(en-US).
// 저장하지 않는 연습 모드다(플랜 §Phase C '저장: v1 무저장') — 이력·점수 추이는 후속.
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
          : 'Chrome·Edge 등 SpeechRecognition 을 지원하는 브라우저에서 열면 읽기 연습을 할 수 있어요. 듣기(🔊)는 이 브라우저에서도 동작합니다.'}
      </div>
    </div>
  );
}

// 연습 카드 본체 — Desktop/Mobile 공용
function SpeakingPractice({ theme, compact = false }) {
  const [idx, setIdx] = React.useState(0);
  const [result, setResult] = React.useState(null);
  const [rates, setRates] = React.useState([]); // 이번 세션의 일치율 (무저장 — 새로고침하면 사라진다)
  const stt = useJinaSpeechRecognition();
  const { sentences } = useSentenceBank();
  const sentence = sentences[idx % sentences.length];
  const targetWords = React.useMemo(() => sentence.text.replace(/[."]/g, '').split(/\s+/).filter(Boolean), [sentence]);

  // 인식이 끝나면 채점 — 인식 중에는 중간 결과를 그대로 보여준다
  React.useEffect(() => {
    if (stt.listening || !stt.transcript) return;
    const heard = stt.transcript.replace(/[.,"?!]/g, '').split(/\s+/).filter(Boolean);
    const r = matchWords(targetWords, heard);
    setResult(r);
    setRates((prev) => [...prev, r.rate]);
  }, [stt.listening, stt.transcript, targetWords]);

  const reset = (nextIdx) => {
    setResult(null);
    stt.setTranscript('');
    if (nextIdx !== undefined) setIdx(nextIdx);
  };
  const avg = rates.length ? Math.round(rates.reduce((a, b) => a + b, 0) / rates.length) : null;
  const pad = compact ? 18 : 32;
  const hint = buildHint(result);

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

        {!stt.supported || stt.error === 'denied' ? (
          <div style={{ padding: pad }}>
            <SpeakingUnsupported theme={theme} reason={stt.error === 'denied' ? 'denied' : 'unsupported'} />
          </div>
        ) : (
          <div style={{
            padding: `${pad - 14}px ${pad}px`, display: 'flex', alignItems: 'center',
            gap: 18, justifyContent: 'center', flexWrap: 'wrap',
          }}>
            <button data-testid="speaking-record" onClick={() => (stt.listening ? stt.stop() : (reset(), stt.start()))} style={{
              width: 60, height: 60, borderRadius: '50%',
              background: stt.listening ? theme.error + '24' : theme.chipBg,
              border: `2px solid ${stt.listening ? theme.error + '8c' : theme.borderStrong}`,
              display: 'grid', placeItems: 'center',
            }}>
              <span style={{
                width: stt.listening ? 20 : 22, height: stt.listening ? 20 : 22,
                borderRadius: stt.listening ? 6 : '50%',
                background: stt.listening ? theme.error : theme.textMuted,
                animation: stt.listening ? 'jina-pulse 1.2s infinite' : 'none',
              }} />
            </button>
            <div style={{ textAlign: 'left', minWidth: 220 }}>
              <div style={{
                fontSize: 14, fontWeight: 700, marginBottom: 3,
                color: stt.listening ? theme.error : theme.text,
              }}>{stt.listening ? '듣는 중… 다 읽으면 멈춤' : result ? '녹음 완료' : '녹음 시작'}</div>
              <div style={{ fontSize: 12, color: theme.textDim }}>
                브라우저 음성 인식(SpeechRecognition) · en-US
              </div>
            </div>
          </div>
        )}

        {(stt.listening || result) && (
          <React.Fragment>
            <div style={{ borderTop: `1px solid ${theme.border}` }} />
            <div style={{ padding: `${pad - 14}px ${pad}px ${pad - 8}px` }}>
              <div style={{
                fontSize: 11, color: theme.textDim, fontWeight: 600,
                letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10,
              }}>인식 결과 — 단어별 일치</div>
              {stt.listening ? (
                <p style={{ fontSize: 15, color: theme.textMuted, lineHeight: 1.8, margin: 0, fontStyle: 'italic' }}>
                  {stt.transcript || '…'}
                </p>
              ) : (
                <TranscriptWords theme={theme} result={result} />
              )}

              {result && !stt.listening && (
                <React.Fragment>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginTop: 16, flexWrap: 'wrap' }}>
                    <span style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <b data-testid="speaking-rate" style={{
                        fontSize: 34, fontWeight: 800,
                        color: result.rate >= 85 ? theme.success : result.rate >= 65 ? theme.warning : theme.error,
                      }}>{result.rate}%</b>
                      <span style={{ fontSize: 13, color: theme.textMuted }}>일치율</span>
                    </span>
                    <span style={{
                      flex: 1, minWidth: 220, fontSize: 12.5, color: theme.textMuted, lineHeight: 1.6,
                      padding: '10px 14px', borderRadius: 10,
                      background: theme.success + '14', border: `1px solid ${theme.success}40`,
                    }}>{hint}</span>
                  </div>
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
                </React.Fragment>
              )}
            </div>
          </React.Fragment>
        )}
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
        {[
          { v: avg === null ? '—' : `${avg}%`, k: '이번 세션 평균 일치율', c: theme.success },
          { v: rates.length, k: '읽은 문장', c: theme.text },
          { v: sentences.length, k: '문장 은행 (학습 콘텐츠 + 시드)', c: theme.accent },
        ].map(({ v, k, c }) => (
          <div key={k} style={{
            flex: 1, padding: '13px 16px', borderRadius: 14,
            background: theme.surface, border: `1px solid ${theme.border}`,
          }}>
            <div style={{ fontSize: 19, fontWeight: 800, color: c }}>{v}</div>
            <div style={{ fontSize: 11.5, color: theme.textDim, marginTop: 3 }}>{k}</div>
          </div>
        ))}
      </div>
      <div style={{ marginTop: 14, fontSize: 11.5, color: theme.textDim, textAlign: 'center' }}>
        <b style={{ color: theme.warning }}>v1 무저장 연습 모드</b> — 발음 평가 API와 이력 저장은 후속 단계입니다
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
