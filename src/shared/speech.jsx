// speech.jsx — 단어/문장 발음 (v1: 브라우저 Web Speech API, 외부 TTS 없음)
// window.jinaSpeak(text, opts) / window.SpeakButton / window.useAutoSpeak
// icons.jsx 다음, 화면 파일들보다 먼저 로드된다 (index.html · canvas.html).
//
// - 영어 음성은 OS/브라우저가 제공하는 것 중 자연스러운 순으로 고른다 (Edge/Windows 'Online' 음성 > Google > 기본).
// - 지원하지 않는 환경(구형 브라우저, 헤드리스)에서는 버튼을 비활성화하고 title 로 이유를 알린다 — 앱은 그대로 동작.
// - Phase 2(ElevenLabs/Azure TTS)로 바꿀 때는 jinaSpeak 구현만 교체하면 된다 — 화면은 이 훅/버튼만 쓴다.

const JINA_TTS = {
  supported: typeof window !== 'undefined' && 'speechSynthesis' in window && typeof SpeechSynthesisUtterance !== 'undefined',
  voiceCache: {},
};

const TTS_PREFERRED = [
  'Microsoft Aria Online', 'Microsoft Jenny Online', 'Microsoft Guy Online', 'Microsoft Ava',
  'Google US English', 'Samantha', 'Microsoft Zira', 'Microsoft David', 'Alex',
];

function jinaPickVoice(lang) {
  if (!JINA_TTS.supported) return null;
  if (JINA_TTS.voiceCache[lang] !== undefined) return JINA_TTS.voiceCache[lang];
  const voices = window.speechSynthesis.getVoices() || [];
  if (!voices.length) return null; // 아직 로드 전 — 캐시하지 않고 다음에 다시 시도
  const norm = (l) => String(l || '').replace('_', '-').toLowerCase();
  const base = norm(lang).slice(0, 2);
  const candidates = voices.filter((v) => norm(v.lang).startsWith(base));
  let pick = null;
  for (const name of TTS_PREFERRED) {
    pick = candidates.find((v) => v.name && v.name.includes(name));
    if (pick) break;
  }
  if (!pick) pick = candidates.find((v) => norm(v.lang) === norm(lang)) || candidates[0] || null;
  JINA_TTS.voiceCache[lang] = pick;
  return pick;
}

if (JINA_TTS.supported) {
  // Chrome 은 음성 목록을 비동기로 채운다 — 바뀌면 캐시를 비운다
  try {
    window.speechSynthesis.addEventListener('voiceschanged', () => { JINA_TTS.voiceCache = {}; });
    window.speechSynthesis.getVoices();
  } catch { /* 무해 */ }
}

// 발음 재생. 이전 재생은 끊는다. 반환: 재생을 시작했으면 true.
function jinaSpeak(text, { lang = 'en-US', rate = 0.95, pitch = 1, onStart, onEnd } = {}) {
  if (!JINA_TTS.supported) return false;
  const t = String(text || '').trim();
  if (!t) return false;
  try {
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
    u.lang = lang;
    u.rate = rate;
    u.pitch = pitch;
    const voice = jinaPickVoice(lang);
    if (voice) u.voice = voice;
    if (onStart) u.onstart = onStart;
    const done = () => { if (onEnd) onEnd(); };
    u.onend = done;
    u.onerror = done;
    window.speechSynthesis.speak(u);
    return true;
  } catch {
    if (onEnd) onEnd();
    return false;
  }
}

// 자동 발음 설정 (기기 단위, localStorage). 기본 ON — 퀴즈 문항이 나올 때 단어를 읽어준다.
const JINA_TTS_AUTO_KEY = 'jina_tts_auto';
function useAutoSpeak() {
  const [auto, setAuto] = React.useState(() => {
    try { return localStorage.getItem(JINA_TTS_AUTO_KEY) !== '0'; } catch { return true; }
  });
  const set = React.useCallback((v) => {
    setAuto(v);
    try { localStorage.setItem(JINA_TTS_AUTO_KEY, v ? '1' : '0'); } catch { /* 무해 */ }
  }, []);
  return [auto && JINA_TTS.supported, set];
}

// 🔊 버튼. 부모가 클릭 가능한 행이어도(단어 목록) 전파를 막아 행이 열리지 않게 한다.
function SpeakButton({ text, theme, size = 16, style, label, lang = 'en-US', rate }) {
  const [speaking, setSpeaking] = React.useState(false);
  const supported = JINA_TTS.supported;
  const onClick = (e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!supported) return;
    jinaSpeak(text, { lang, rate, onStart: () => setSpeaking(true), onEnd: () => setSpeaking(false) });
  };
  const color = (style && style.color) || (speaking ? theme.accent : theme.textMuted);
  return (
    <button type="button" data-testid="speak-btn" onClick={onClick} disabled={!supported}
      aria-label={label || `${text} 발음 듣기`}
      title={supported ? '발음 듣기 (브라우저 음성)' : '이 브라우저는 음성 합성을 지원하지 않습니다'}
      style={{
        background: 'none', border: 'none', padding: 0, fontFamily: 'inherit',
        width: size + 14, height: size + 14, borderRadius: 8, flex: '0 0 auto',
        display: 'inline-grid', placeItems: 'center',
        cursor: supported ? 'pointer' : 'not-allowed', opacity: supported ? 1 : 0.4,
        transition: 'color .15s, background .15s',
        ...style, color,
        ...(speaking ? { background: theme.accent + '22' } : {}),
      }}>
      <Icons.Volume size={size} />
    </button>
  );
}


// ── 재생 중 화면 이동 가드 ──────────────────────────────────────────
// 리스닝 재생·발음 듣기 등 소리가 나오는 도중 화면을 옮기면 소리만 남아 떠돈다 —
// 이동 전에 물어보고, [중지하고 이동]이면 소리를 끊은 뒤 진행하는 공통 가드.
// speechSynthesis.speaking 이 단일 진실이다(큐 대기 포함, cancel/자연 종료 시 false).
function jinaSpeechActive() {
  return JINA_TTS.supported && window.speechSynthesis.speaking;
}
function jinaSpeechStop() {
  if (!JINA_TTS.supported) return;
  try { window.speechSynthesis.cancel(); } catch { /* 무해 */ }
  // cancel 은 재생 중이던 utterance 의 onend/onerror 를 부른다 — 화면의 playing 스피너가 스스로 풀린다.
}

function SpeechGuardModal({ theme, onConfirm, onCancel }) {
  // Escape = 계속 듣기 (이동 취소)
  React.useEffect(() => {
    const h = (e) => { if (e.key === 'Escape') onCancel(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onCancel]);
  const btn = {
    border: 'none', fontFamily: 'inherit', cursor: 'pointer',
    padding: '10px 18px', borderRadius: 12, fontSize: 13.5, fontWeight: 600,
  };
  return (
    <div data-testid="speech-guard-modal" role="alertdialog" aria-modal="true" aria-label="소리 재생 중 이동 확인"
      onClick={onCancel}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.45)',
        display: 'grid', placeItems: 'center',
      }}>
      <div onClick={(e) => e.stopPropagation()} style={{
        background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 20,
        padding: '26px 26px 22px', width: 340, maxWidth: 'calc(100vw - 48px)',
        boxShadow: theme.shadow, color: theme.text, textAlign: 'center',
      }}>
        <div style={{ fontSize: 15.5, fontWeight: 700, marginBottom: 8 }}>소리가 재생 중이에요</div>
        <div style={{ fontSize: 13, color: theme.textMuted, lineHeight: 1.55, marginBottom: 20 }}>
          화면을 이동하면 재생 중인 소리가 멈춥니다.<br />이동할까요?
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button type="button" data-testid="speech-guard-stay" onClick={onCancel}
            style={{ ...btn, background: theme.chipBg, color: theme.textMuted }}>계속 듣기</button>
          <button type="button" data-testid="speech-guard-stop" onClick={onConfirm}
            style={{ ...btn, background: theme.accent, color: '#fff' }}>중지하고 이동</button>
        </div>
      </div>
    </div>
  );
}

// 사용: const [guardedNavigate, speechGuardModal] = useSpeechNavGuard(navigate, theme);
// 이동뿐 아니라 "소리를 끊는 어떤 동작"이든 proceed 로 감싸 재사용할 수 있다.
function useSpeechNavGuard(proceed, theme) {
  const [pending, setPending] = React.useState(null); // 대기 중인 proceed 인자 배열 | null
  const guarded = React.useCallback((...args) => {
    if (jinaSpeechActive()) setPending(args);
    else proceed(...args);
  }, [proceed]);
  const confirm = React.useCallback(() => {
    jinaSpeechStop();
    if (pending) proceed(...pending);
    setPending(null);
  }, [pending, proceed]);
  const cancel = React.useCallback(() => setPending(null), []);
  const modal = pending == null ? null
    : <SpeechGuardModal theme={theme} onConfirm={confirm} onCancel={cancel} />;
  return [guarded, modal];
}

window.jinaSpeechActive = jinaSpeechActive;
window.jinaSpeechStop = jinaSpeechStop;
window.useSpeechNavGuard = useSpeechNavGuard;

// ── 브라우저 STT (SpeechRecognition) ─────────────────────────────────
// 스피킹 연습(문장 읽기)과 회화 탭 마이크 입력이 같은 구현을 쓴다.
// 미지원/권한 거부를 화면이 구분해 안내할 수 있도록 error 를 'unsupported'|'denied'|<code> 로 노출한다.
const JinaSpeechRecognition = typeof window !== 'undefined'
  ? (window.SpeechRecognition || window.webkitSpeechRecognition || null)
  : null;

function useJinaSpeechRecognition({ lang = 'en-US', continuous = false } = {}) {
  const [listening, setListening] = React.useState(false);
  const [transcript, setTranscript] = React.useState('');
  const [error, setError] = React.useState(null);
  const ref = React.useRef(null);

  // 인식 종료 요청. rec.stop() 은 남은 오디오를 마저 처리해 final result 를 낸 뒤 onend 를 부른다 —
  // 그래서 listening 을 여기서 미리 내리면 안 된다. 미리 내리면 화면이 중간 결과로 한 번 확정되고,
  // 뒤늦게 도착한 final result 가 같은 시도를 또 한 번 확정시킨다. 종료 판정은 onend 한 곳에만 맡긴다.
  const stop = React.useCallback(() => {
    if (!ref.current) { setListening(false); return; }
    try { ref.current.stop(); } catch { setListening(false); }
  }, []);

  // 즉시 폐기 — 남은 인식 결과를 버린다. 전송 직후처럼 인식 결과가 되살아나면 안 되는 자리에서 쓴다.
  const abort = React.useCallback(() => {
    const rec = ref.current;
    ref.current = null; // 이후 도착하는 콜백은 아래 가드에 걸려 무시된다
    try { rec?.abort(); } catch { /* 무해 */ }
    setListening(false);
    setTranscript('');
  }, []);

  const start = React.useCallback(() => {
    if (!JinaSpeechRecognition) { setError('unsupported'); return; }
    try { ref.current?.abort(); } catch { /* 무해 */ }
    setError(null);
    setTranscript('');
    const rec = new JinaSpeechRecognition();
    ref.current = rec;
    rec.lang = lang;
    rec.interimResults = true;
    rec.continuous = continuous;
    // ref.current !== rec 이면 폐기됐거나 다음 인식으로 교체된 것 — 뒤늦은 콜백은 무시한다.
    rec.onresult = (e) => {
      if (ref.current !== rec) return;
      let text = '';
      for (let i = 0; i < e.results.length; i++) text += `${e.results[i][0].transcript} `;
      setTranscript(text.trim());
    };
    rec.onerror = (e) => {
      if (ref.current !== rec) return;
      setError(e.error === 'not-allowed' || e.error === 'service-not-allowed' ? 'denied' : e.error || 'error');
      setListening(false);
    };
    rec.onend = () => { if (ref.current === rec) setListening(false); };
    try { rec.start(); setListening(true); } catch { setError('error'); setListening(false); }
  }, [lang, continuous]);

  React.useEffect(() => () => { try { ref.current?.abort(); } catch {} }, []);
  return { supported: Boolean(JinaSpeechRecognition), listening, transcript, error, start, stop, abort, setTranscript };
}

window.useJinaSpeechRecognition = useJinaSpeechRecognition;

window.jinaSpeak = jinaSpeak;
window.SpeakButton = SpeakButton;
window.useAutoSpeak = useAutoSpeak;
window.JINA_TTS = JINA_TTS;


// ── STT 모드 (설정 → 음성 인식) ───────────────────────────────────
// 'browser'      = SpeechRecognition 받아쓰기 (기본, 비용 0)
// 'openpronounce' = MediaRecorder 녹음 → 서버 /api/speaking/assess → 발음 점수 (로컬 사이드카, 플랜 10)
// 값은 main.jsx 가 jina_settings_v1 에 저장하고 window.__JINA_STT_MODE + 'jina-stt-change' 로 전파한다.
// 사이드카가 꺼져 있으면 화면은 자동으로 'browser' 처럼 동작한다 — 설정값과 실제 모드는 다를 수 있다.
const JINA_STT_MODES = ['browser', 'openpronounce'];
function readJinaSttMode() {
  if (JINA_STT_MODES.includes(window.__JINA_STT_MODE)) return window.__JINA_STT_MODE;
  try {
    const s = JSON.parse(localStorage.getItem('jina_settings_v1')) || {};
    return JINA_STT_MODES.includes(s.sttMode) ? s.sttMode : 'browser';
  } catch { return 'browser'; }
}
function useJinaSttMode() {
  const [mode, setMode] = React.useState(readJinaSttMode);
  React.useEffect(() => {
    const h = (e) => setMode(JINA_STT_MODES.includes(e.detail?.mode) ? e.detail.mode : readJinaSttMode());
    window.addEventListener('jina-stt-change', h);
    return () => window.removeEventListener('jina-stt-change', h);
  }, []);
  return mode;
}

// ── 녹음 (MediaRecorder) — 발음 평가 모드 전용 ─────────────────────
// SpeechRecognition 은 오디오를 넘겨주지 않아 별도 캡처가 필요하다(플랜 10 §6 Phase 2).
// stop() 은 비동기이고 마지막 dataavailable 이 늦게 오므로, Blob 은 onstop 에서 한 번만 만든다(§7).
function useJinaRecorder() {
  const [recording, setRecording] = React.useState(false);
  const [error, setError] = React.useState(null); // 'unsupported' | 'denied' | 'error'
  const ref = React.useRef(null);
  const chunksRef = React.useRef([]);
  const resolveRef = React.useRef(null);
  const supported = typeof window !== 'undefined' && Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

  const start = React.useCallback(async () => {
    if (!supported) { setError('unsupported'); return false; }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const pick = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find((m) => window.MediaRecorder.isTypeSupported?.(m));
      const rec = pick ? new window.MediaRecorder(stream, { mimeType: pick }) : new window.MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunksRef.current.push(e.data); };
      rec.onstop = () => {
        try { stream.getTracks().forEach((t) => t.stop()); } catch { /* 무해 */ }
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' });
        chunksRef.current = [];
        setRecording(false);
        const resolve = resolveRef.current;
        resolveRef.current = null;
        if (resolve) resolve(blob);
      };
      ref.current = rec;
      rec.start();
      setRecording(true);
      return true;
    } catch (err) {
      setError(err?.name === 'NotAllowedError' || err?.name === 'SecurityError' ? 'denied' : 'error');
      setRecording(false);
      return false;
    }
  }, [supported]);

  // 녹음 종료 → Blob. 녹음 중이 아니면 null.
  const stop = React.useCallback(() => new Promise((resolve) => {
    const rec = ref.current;
    if (!rec || rec.state === 'inactive') { setRecording(false); resolve(null); return; }
    resolveRef.current = resolve;
    try { rec.stop(); } catch { resolveRef.current = null; setRecording(false); resolve(null); }
  }), []);

  React.useEffect(() => () => { try { ref.current?.stream?.getTracks().forEach((t) => t.stop()); } catch { /* 무해 */ } }, []);
  return { supported, recording, error, start, stop };
}

window.JINA_STT_MODES = JINA_STT_MODES;
window.readJinaSttMode = readJinaSttMode;
window.useJinaSttMode = useJinaSttMode;
window.useJinaRecorder = useJinaRecorder;
