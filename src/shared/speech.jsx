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
