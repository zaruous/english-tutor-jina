// app-nav.jsx — 공용 내비게이션: 페이지 목록(APP_PAGES) · 데스크탑 좌측 사이드바(AppDesktopSidebar) · 모바일 하단 탭(AppMobileNav)
// main.jsx 가 아니라 여기 있는 이유: canvas.html 은 main.jsx 를 로드하지 않는데 아트보드가 이 컴포넌트들을 참조한다.
//
// 페이지 목록의 단일 소스 = APP_PAGES. main.jsx(라우팅·헤더 제목), 사이드바, 모바일 탭이 전부 이 배열을 읽는다.
//  - soon: true  → 아직 화면이 없는 예정 기능. 사이드바에 비활성 + '준비 중' 배지로만 노출한다 (가까운 페이지로 임의 매핑 금지)
//  - mobile: false → 모바일 하단 탭에서 제외
//  - 배열 순서 = 모바일 탭 순서. 사이드바는 group 별로 묶어 그린다.
const APP_PAGES = [
  { id: 'dashboard',    label: '대시보드',   short: '홈',      icon: 'Home',       group: '학습' },
  { id: 'conversation', label: 'AI 회화',    short: 'AI 회화', icon: 'Chat',       group: '학습', badge: 'LIVE' },
  { id: 'speaking',     label: '스피킹 연습',                  icon: 'Mic',        group: '학습', soon: true, mobile: false },
  { id: 'listening',    label: '리스닝',                      icon: 'Headphones', group: '학습', soon: true, mobile: false },
  { id: 'lesson',       label: 'TOEIC 학습', short: '학습',    icon: 'Book',       group: '시험' },
  { id: 'vocabulary',   label: '단어장',     short: '단어장',  icon: 'BookOpen',   group: '학습' },
  { id: 'progress',     label: '학습 통계',  short: '통계',    icon: 'Chart',      group: '시험' },
  { id: 'mistakes',     label: '오답 노트',                    icon: 'Folder',     group: '시험', soon: true, mobile: false },
];
// 라우팅이 받아주는 id — 준비 중 항목은 제외 (main.jsx navigate()가 이 집합으로 필터한다)
const APP_PAGE_IDS = new Set(APP_PAGES.filter((p) => !p.soon).map((p) => p.id));

// matchMedia 훅 — 인라인 스타일만 쓰는 이 코드베이스에서 미디어쿼리를 대신한다.
function useMediaQuery(query) {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [matches, setMatches] = React.useState(() => (supported ? window.matchMedia(query).matches : false));
  React.useEffect(() => {
    if (!supported) return undefined;
    const mq = window.matchMedia(query);
    const handler = (e) => setMatches(e.matches);
    setMatches(mq.matches);
    if (mq.addEventListener) mq.addEventListener('change', handler); else mq.addListener(handler);
    return () => { if (mq.removeEventListener) mq.removeEventListener('change', handler); else mq.removeListener(handler); };
  }, [query, supported]);
  return matches;
}

// 데스크탑 1차 내비. main.jsx 셸이 모든 페이지에서 같은 자리에 렌더한다.
//  - collapsed(레일 모드): 아이콘만 72px — 좁은 데스크탑에서 본문 폭을 지킨다 (라벨은 title/aria-label로 유지)
//  - .jina-root 밖에서 렌더되므로 버튼은 자립형 스타일로 초기화한다 (UA 회색 박스 방지)
function AppDesktopSidebar({ theme, page, onNavigate, onOpenSettings, user, collapsed }) {
  const narrow = useMediaQuery('(max-width: 1299px)');
  const rail = collapsed != null ? collapsed : narrow;
  const groups = [];
  for (const p of APP_PAGES) {
    let g = groups.find((x) => x.name === p.group);
    if (!g) { g = { name: p.group, items: [] }; groups.push(g); }
    g.items.push(p);
  }
  const buttonReset = { background: 'none', border: 'none', fontFamily: 'inherit', color: 'inherit', padding: 0 };
  const displayName = user ? (user.display_name || (user.email || '').split('@')[0]) : '';

  return (
    <aside className="jina-root" aria-label="주요 메뉴" style={{
      width: rail ? 72 : 240, flex: '0 0 auto',
      padding: rail ? '20px 10px 16px' : '24px 16px 16px',
      borderRight: `1px solid ${theme.border}`,
      background: theme.bgSoft, color: theme.text,
      display: 'flex', flexDirection: 'column', gap: 4,
      overflowY: 'auto', overflowX: 'hidden',
      transition: 'width .15s ease',
    }}>
      {/* 로고 — 클릭하면 홈(대시보드). 레일 모드에서는 아바타만 보이므로 aria-label/title 로 목적지를 알린다 */}
      <button type="button" onClick={() => onNavigate && onNavigate('dashboard')} aria-label="홈(대시보드)으로" title="홈으로" style={{
        ...buttonReset, cursor: 'pointer', textAlign: 'left', width: '100%',
        display: 'flex', alignItems: 'center', justifyContent: rail ? 'center' : 'flex-start', gap: 10,
        padding: rail ? '0 0 18px' : '4px 8px 22px',
      }}>
        <JinaAvatar size={32} theme={theme} />
        {!rail && (
          <div>
            <div className="jina-serif" style={{ fontSize: 22, color: theme.text, fontStyle: 'italic', lineHeight: 1 }}>Jina</div>
            <div style={{ fontSize: 10.5, color: theme.textDim, letterSpacing: '0.08em', textTransform: 'uppercase', marginTop: 2 }}>AI English Tutor</div>
          </div>
        )}
      </button>

      {groups.map((g, gi) => (
        <React.Fragment key={g.name}>
          {rail
            ? (gi > 0 && <div style={{ height: 1, background: theme.border, margin: '8px 6px' }} />)
            : <div style={{ fontSize: 11, color: theme.textDim, padding: gi === 0 ? '8px 12px 4px' : '16px 12px 4px', letterSpacing: '0.08em', textTransform: 'uppercase', fontWeight: 600 }}>{g.name}</div>}
          {g.items.map((p) => {
            const Ico = Icons[p.icon] || Icons.Bolt;
            const active = page === p.id;
            const title = p.soon ? `${p.label} (준비 중)` : p.label;
            return (
              <button key={p.id} type="button"
                onClick={() => { if (!p.soon && onNavigate) onNavigate(p.id); }}
                disabled={p.soon} aria-disabled={p.soon || undefined}
                aria-current={active ? 'page' : undefined}
                aria-label={rail ? title : undefined} title={title}
                style={{
                  ...buttonReset,
                  display: 'flex', alignItems: 'center', gap: 12, width: '100%',
                  justifyContent: rail ? 'center' : 'flex-start',
                  padding: rail ? '11px 0' : '10px 12px', borderRadius: 10,
                  color: p.soon ? theme.textDim : active ? theme.text : theme.textMuted,
                  background: active ? theme.chipBg : 'transparent',
                  fontSize: 14, fontWeight: active ? 600 : 500, textAlign: 'left',
                  cursor: p.soon ? 'not-allowed' : 'pointer', opacity: p.soon ? 0.55 : 1,
                  position: 'relative', transition: 'all .15s',
                }}>
                <Ico size={18} stroke={active ? 2 : 1.6} />
                {!rail && <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.label}</span>}
                {!rail && p.badge && !p.soon && (
                  <span style={{ fontSize: 11, padding: '2px 7px', borderRadius: 999, background: theme.accent, color: '#fff', fontWeight: 600 }}>{p.badge}</span>
                )}
                {!rail && p.soon && (
                  <span style={{ fontSize: 10, padding: '2px 6px', borderRadius: 999, border: `1px solid ${theme.border}`, color: theme.textDim, fontWeight: 600 }}>준비 중</span>
                )}
                {rail && active && (
                  <span aria-hidden="true" style={{ position: 'absolute', left: -10, top: 10, bottom: 10, width: 3, borderRadius: 99, background: theme.accent }} />
                )}
              </button>
            );
          })}
        </React.Fragment>
      ))}

      <div style={{ flex: 1 }} />

      {/* 사용자 — 클릭하면 설정(계정 섹션) */}
      <button type="button" onClick={onOpenSettings} title={user ? `${displayName} · 설정` : '설정'} style={{
        ...buttonReset,
        display: 'flex', alignItems: 'center', justifyContent: rail ? 'center' : 'flex-start', gap: 10,
        padding: rail ? '10px 0 4px' : '14px 8px 4px', width: '100%', cursor: 'pointer', textAlign: 'left',
      }}>
        <div style={{
          width: 32, height: 32, borderRadius: '50%', flex: '0 0 auto',
          background: `linear-gradient(135deg, ${theme.accent2}, ${theme.accent3})`,
          display: 'grid', placeItems: 'center', color: '#fff', fontSize: 13, fontWeight: 600,
        }}>{(displayName || '·').charAt(0).toUpperCase()}</div>
        {!rail && (
          <>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13, color: theme.text, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{displayName || '—'}</div>
              <div style={{ fontSize: 11, color: theme.textDim }}>계정 · 설정</div>
            </div>
            <Icons.Settings size={16} style={{ color: theme.textDim }} />
          </>
        )}
      </button>
    </aside>
  );
}

// 모바일 하단 탭 — APP_PAGES 중 mobile !== false 이고 soon 이 아닌 항목만
function AppMobileNav({ theme, active, onNavigate }) {
  const items = APP_PAGES.filter((p) => !p.soon && p.mobile !== false);
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '8px 8px 22px',
      background: theme.glassBg, backdropFilter: 'blur(20px)',
      borderTop: `1px solid ${theme.border}`,
      display: 'flex',
    }}>
      {items.map(({ id, label, short, icon }) => {
        const Ico = Icons[icon] || Icons.Bolt;
        const isActive = active === id;
        return (
          <button key={id} type="button" onClick={() => onNavigate && onNavigate(id)} aria-current={isActive ? 'page' : undefined} style={{
            // .jina-root 리셋 밖(main.jsx 모바일 셸)에서도 UA 기본 버튼(회색 박스)이 비치지 않게 자립형으로 초기화
            background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
            flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
            color: isActive ? theme.accent : theme.textDim,
            fontSize: 9.5, fontWeight: isActive ? 700 : 400,
            padding: '6px 4px',
            position: 'relative',
          }}>
            <Ico size={21} stroke={isActive ? 2.2 : 1.5} />
            {short || label}
            {isActive && (
              <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 20, height: 2, borderRadius: 99, background: theme.accent }} />
            )}
          </button>
        );
      })}
    </div>
  );
}

window.APP_PAGES = APP_PAGES;
window.APP_PAGE_IDS = APP_PAGE_IDS;
window.useMediaQuery = useMediaQuery;
window.AppDesktopSidebar = AppDesktopSidebar;
window.AppMobileNav = AppMobileNav;
