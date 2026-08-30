// app-nav.jsx — 공용 모바일 하단 네비 (AppMobileNav)
// mobile.jsx / vocabulary.jsx / progress.jsx 가 참조한다.
// main.jsx 가 아니라 여기 있는 이유: canvas.html 은 main.jsx 를 로드하지 않아
// 캔버스의 모바일 아트보드가 ReferenceError로 깨졌었다.
function AppMobileNav({ theme, active, onNavigate }) {
  const items = [
    { id: 'dashboard',    label: '홈',    icon: Icons.Home },
    { id: 'conversation', label: 'AI 회화', icon: Icons.Chat },
    { id: 'lesson',       label: '학습',   icon: Icons.Book },
    { id: 'vocabulary',   label: '단어장', icon: Icons.BookOpen },
    { id: 'progress',     label: '통계',   icon: Icons.Chart },
  ];
  return (
    <div style={{
      position: 'absolute', bottom: 0, left: 0, right: 0,
      padding: '8px 8px 22px',
      background: theme.glassBg, backdropFilter: 'blur(20px)',
      borderTop: `1px solid ${theme.border}`,
      display: 'flex',
    }}>
      {items.map(({ id, label, icon: Ico }) => (
        <button key={id} onClick={() => onNavigate && onNavigate(id)} style={{
          // .jina-root 리셋 밖(main.jsx 모바일 셸)에서도 UA 기본 버튼(회색 박스)이 비치지 않게 자립형으로 초기화
          background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit',
          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
          color: active === id ? theme.accent : theme.textDim,
          fontSize: 9.5, fontWeight: active === id ? 700 : 400,
          padding: '6px 4px',
          position: 'relative',
        }}>
          <Ico size={21} stroke={active === id ? 2.2 : 1.5} />
          {label}
          {active === id && (
            <span style={{ position: 'absolute', top: 0, left: '50%', transform: 'translateX(-50%)', width: 20, height: 2, borderRadius: 99, background: theme.accent }} />
          )}
        </button>
      ))}
    </div>
  );
}

window.AppMobileNav = AppMobileNav;
