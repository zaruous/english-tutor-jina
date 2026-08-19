// tokens.jsx — Design tokens and themes for Jina English Tutor
// 4 themes available, set via window.__JINA_THEME

const JINA_THEMES = {
  aurora: {
    name: 'Midnight Aurora',
    bg: '#0A0B1A',
    bgSoft: '#0F1124',
    surface: '#14162B',
    surfaceElev: '#1C1F38',
    card: 'rgba(255,255,255,0.035)',
    cardHover: 'rgba(255,255,255,0.06)',
    border: 'rgba(255,255,255,0.08)',
    borderStrong: 'rgba(255,255,255,0.14)',
    text: '#F5F5FA',
    textMuted: 'rgba(245,245,250,0.62)',
    textDim: 'rgba(245,245,250,0.38)',
    accent: '#B794F4',
    accent2: '#F687B3',
    accent3: '#4FD1C5',
    accentGrad: 'linear-gradient(135deg, #9F7AEA 0%, #ED64A6 55%, #4FD1C5 100%)',
    accentGradSoft: 'linear-gradient(135deg, rgba(159,122,234,0.18) 0%, rgba(237,100,166,0.14) 55%, rgba(79,209,197,0.16) 100%)',
    success: '#4FD1C5',
    warning: '#F6AD55',
    error: '#FC8181',
    chipBg: 'rgba(255,255,255,0.06)',
    glassBg: 'rgba(20,22,43,0.7)',
    shadow: '0 24px 80px -20px rgba(0,0,0,0.6), 0 2px 8px rgba(0,0,0,0.3)',
    isDark: true,
  },
  ivory: {
    name: 'Warm Ivory',
    bg: '#EFE7D3',
    bgSoft: '#F5EFE0',
    surface: '#FFFCF4',
    surfaceElev: '#FFFFFF',
    card: '#FFFCF4',
    cardHover: '#FFFFFF',
    border: 'rgba(60,40,20,0.10)',
    borderStrong: 'rgba(60,40,20,0.20)',
    text: '#1F1A14',
    textMuted: 'rgba(31,26,20,0.62)',
    textDim: 'rgba(31,26,20,0.40)',
    accent: '#B84C2E',
    accent2: '#2D5237',
    accent3: '#C9885A',
    accentGrad: 'linear-gradient(135deg, #B84C2E 0%, #D4733E 100%)',
    accentGradSoft: 'linear-gradient(135deg, rgba(184,76,46,0.10) 0%, rgba(212,115,62,0.08) 100%)',
    success: '#2D5237',
    warning: '#C9885A',
    error: '#B84C2E',
    chipBg: 'rgba(60,40,20,0.06)',
    glassBg: 'rgba(255,252,244,0.85)',
    shadow: '0 24px 80px -28px rgba(60,40,20,0.20), 0 1px 3px rgba(60,40,20,0.06)',
    isDark: false,
  },
  sage: {
    name: 'Sage Study',
    bg: '#E6EBE2',
    bgSoft: '#EEF1E9',
    surface: '#FBFCF8',
    surfaceElev: '#FFFFFF',
    card: '#FBFCF8',
    cardHover: '#FFFFFF',
    border: 'rgba(40,60,40,0.10)',
    borderStrong: 'rgba(40,60,40,0.18)',
    text: '#16201A',
    textMuted: 'rgba(22,32,26,0.62)',
    textDim: 'rgba(22,32,26,0.40)',
    accent: '#2F6850',
    accent2: '#C9885A',
    accent3: '#4A7C59',
    accentGrad: 'linear-gradient(135deg, #2F6850 0%, #4A7C59 100%)',
    accentGradSoft: 'linear-gradient(135deg, rgba(47,104,80,0.08) 0%, rgba(74,124,89,0.06) 100%)',
    success: '#2F6850',
    warning: '#C9885A',
    error: '#A04848',
    chipBg: 'rgba(40,60,40,0.06)',
    glassBg: 'rgba(251,252,248,0.85)',
    shadow: '0 24px 80px -28px rgba(40,60,40,0.22), 0 1px 3px rgba(40,60,40,0.06)',
    isDark: false,
  },
  sunset: {
    name: 'Sunset Glass',
    bg: 'radial-gradient(120% 100% at 0% 0%, #FFE8F0 0%, #F4ECFF 50%, #E8F0FF 100%)',
    bgSoft: '#FCF8FF',
    surface: 'rgba(255,255,255,0.78)',
    surfaceElev: 'rgba(255,255,255,0.92)',
    card: 'rgba(255,255,255,0.78)',
    cardHover: 'rgba(255,255,255,0.92)',
    border: 'rgba(80,40,120,0.10)',
    borderStrong: 'rgba(80,40,120,0.18)',
    text: '#1A0F2E',
    textMuted: 'rgba(26,15,46,0.62)',
    textDim: 'rgba(26,15,46,0.38)',
    accent: '#C44CE0',
    accent2: '#FF6B6B',
    accent3: '#6A6BFF',
    accentGrad: 'linear-gradient(135deg, #FF6B6B 0%, #C44CE0 50%, #6A6BFF 100%)',
    accentGradSoft: 'linear-gradient(135deg, rgba(255,107,107,0.14) 0%, rgba(196,76,224,0.12) 50%, rgba(106,107,255,0.14) 100%)',
    success: '#3FA67A',
    warning: '#F0A04C',
    error: '#E05C5C',
    chipBg: 'rgba(80,40,120,0.06)',
    glassBg: 'rgba(255,255,255,0.65)',
    shadow: '0 24px 80px -28px rgba(80,40,120,0.22), 0 1px 3px rgba(80,40,120,0.06)',
    isDark: false,
  },
};

// Hook to read the current theme
function useJinaTheme() {
  const [key, setKey] = React.useState(window.__JINA_THEME || 'aurora');
  React.useEffect(() => {
    const handler = (e) => {
      if (e?.detail?.theme) setKey(e.detail.theme);
    };
    window.addEventListener('jina-theme-change', handler);
    return () => window.removeEventListener('jina-theme-change', handler);
  }, []);
  return { ...JINA_THEMES[key], key };
}

function setJinaTheme(k) {
  window.__JINA_THEME = k;
  window.dispatchEvent(new CustomEvent('jina-theme-change', { detail: { theme: k } }));
}

// Inject base fonts once
if (typeof document !== 'undefined' && !document.getElementById('jina-fonts')) {
  const link = document.createElement('link');
  link.id = 'jina-fonts';
  link.rel = 'stylesheet';
  link.href = 'https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css';
  document.head.appendChild(link);

  const gf = document.createElement('link');
  gf.rel = 'stylesheet';
  gf.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&display=swap';
  document.head.appendChild(gf);

  const style = document.createElement('style');
  style.id = 'jina-base-styles';
  style.textContent = `
    .jina-root, .jina-root *, .jina-root *::before, .jina-root *::after { box-sizing: border-box; }
    .jina-root { font-family: 'Pretendard Variable', Pretendard, -apple-system, system-ui, sans-serif; -webkit-font-smoothing: antialiased; -moz-osx-font-smoothing: grayscale; letter-spacing: -0.01em; }
    .jina-serif { font-family: 'Instrument Serif', 'Newsreader', Georgia, serif; letter-spacing: -0.01em; }
    .jina-root button { font-family: inherit; cursor: pointer; border: none; background: none; color: inherit; padding: 0; }
    .jina-root input, .jina-root textarea { font-family: inherit; }
    @keyframes jina-pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.6; transform: scale(0.92); } }
    @keyframes jina-shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
    @keyframes jina-wave { 0%, 100% { transform: scaleY(0.3); } 50% { transform: scaleY(1); } }
    @keyframes jina-orbit { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
    @keyframes jina-rise { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
  `;
  document.head.appendChild(style);
}

window.JINA_THEMES = JINA_THEMES;
window.useJinaTheme = useJinaTheme;
window.setJinaTheme = setJinaTheme;
