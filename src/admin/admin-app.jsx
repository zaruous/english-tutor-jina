// admin-app.jsx — admin.html 진입점 · 콘텐츠 관리 화면 (플랜 11 Phase 2)
// 목업 시각 기준: docs/plan/mockups/11-admin-contents.html — CSS 는 복사하지 않고 theme.* 인라인 스타일.
//
// ── 이 파일이 root 를 넘겨받는 방식 ──────────────────────────────────────────
// users.jsx(Phase 3)는 `const root = ReactDOM.createRoot(#root)` 로 스스로 화면을 그리는
// **완결된 엔트리**다. 이 플랜에서 users.jsx 는 수정 대상이 아니므로(다른 그룹 소유) 그 render 를
// 없앨 수 없다. 그래서 admin.html 은 users.jsx 를 먼저 로드하고 이 파일을 **마지막에** 로드해서
// 같은 root 를 그대로 넘겨받아 다시 render 한다.
//   - 같은 컨테이너에 createRoot 를 두 번 하면 React 가 경고를 내고 두 트리가 같은 DOM 을 두고 다툰다.
//     그래서 새로 만들지 않고 users.jsx 의 root 를 재사용한다(Babel standalone 은 파일마다
//     classic script 를 붙이므로 최상위 const 가 전역 렉시컬 스코프에 있다 — 바로 이름으로 잡힌다).
//   - users.jsx 의 첫 render 와 이 파일의 render 는 같은 동기 블록 안에서 연달아 일어난다.
//     React 18 의 createRoot().render() 는 스케줄만 걸므로 첫 트리는 커밋되지 않는다 = 깜빡임 없음.
//
// ── 이름 규칙 ────────────────────────────────────────────────────────────────
// content-store.jsx 머리말과 같다: 최상위 이름은 전부 전역이다. users.jsx 의
// menuRect·useDismissMenu·readThemeName·fmtDate·SkeletonRows 를 여기서 다시 선언하면
// **users.jsx 쪽이 조용히 깨진다**(함수 선언은 덮어쓴다). 그래서 전부 Admin/admin 접두사를 쓴다.

// 열린 드롭다운의 최대 높이. 아래 공간이 이보다 좁으면 위로 펼친다.
const ADMIN_MENU_MAX = 280;

// 표 컬럼 — 상태 · 제목 · 공개 · 유형 · 문항 · 만든이 · 수정일 · [▾]
// 목업의 7컬럼에 '공개'(visibility) 한 칸을 더했다. status 와 visibility 는 별개 축이고(결정 1),
// 내려도 visibility 는 보존되므로(열린 질문 7 후보 A) 두 값이 같은 줄에 보이지 않으면
// "내렸는데 왜 아직 public 인가" 를 화면에서 확인할 방법이 없다.
const ADMIN_CONTENT_GRID = '92px 1fr 78px 76px 52px 88px 68px 40px';

const ADMIN_ROLE_TONE = {
  admin: 'warning',
  reviewer: 'success',
  author: 'accent',
  learner: 'textDim',
};

// minRole 이 모자라면 탭을 흐리게 둔다. 판정은 /api/auth/me 의 can_* 불린(adminHasRole) — 서버가 어차피 403 을 준다.
const ADMIN_TABS = [
  { key: 'contents', label: '콘텐츠' },
  { key: 'review', label: '검수' },
  // 토픽 구성(플랜 13 Phase B)은 저작이라 author 이상. 화면은 editors/topic.jsx 의 AdminTopicComposer 가 그린다.
  { key: 'topics', label: '토픽', minRole: 'author' },
  { key: 'users', label: '사용자', minRole: 'admin' },
];

// 탭에 없는 라우트가 어느 탭 아래인지. 레슨 에디터는 목록의 [▾] 에서 들어오는 화면이라 콘텐츠 탭을 켜 둔다.
const ADMIN_ROUTE_TAB = { 'edit-lesson': 'contents' };

const ADMIN_TAB_BLOCKED = {
  author: '저작자(author) 이상만 열 수 있습니다',
  reviewer: '검수자(reviewer) 이상만 열 수 있습니다',
  admin: '관리자(admin)만 열 수 있습니다',
};

// theme 팔레트에는 hex(`#B794F4`)와 rgba(`rgba(245,245,250,0.38)`)가 섞여 있다.
// 색 뒤에 알파 2자리를 덧붙이는 흔한 트릭은 **hex 에서만** 통한다 — rgba 에 붙이면
// `rgba(...)22` 라는 파싱 불가 값이 되어 그 선언 하나가 통째로 무시되고, 배경·테두리가
// 소리 없이 사라진다(초안 배지·비공개 칩·learner 역할 배지가 정확히 그 자리다).
// 그래서 hex 가 아니면 알파를 붙이지 않고 대체색으로 떨어진다.
function adminTint(color, hexAlpha, fallback) {
  return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color) ? color + hexAlpha : fallback;
}

function readAdminThemeName() {
  try {
    const saved = JSON.parse(localStorage.getItem('jina_settings_v1') || '{}');
    return saved.themeName || 'aurora';
  } catch {
    return 'aurora';
  }
}

// 테마는 학습 앱의 설정 패널이 localStorage 에 쓰고 이벤트로 알린다. admin.html 에는 설정 UI 가
// 없지만 같은 브라우저의 다른 탭에서 테마를 바꾸면 따라가야 한다(storage 이벤트).
function useAdminTheme() {
  const [name, setName] = React.useState(readAdminThemeName);
  React.useEffect(() => {
    const onChange = () => setName(readAdminThemeName());
    window.addEventListener('jina-theme-change', onChange);
    window.addEventListener('storage', onChange);
    return () => {
      window.removeEventListener('jina-theme-change', onChange);
      window.removeEventListener('storage', onChange);
    };
  }, []);
  return JINA_THEMES[name] || JINA_THEMES.aurora;
}

// 라우팅은 해시 하나로 끝낸다. admin.html 은 학습 앱 라우팅(APP_PAGES)에 편입하지 않는다는
// 결정 4 때문에 공용 라우터를 끌어올 수도 없다. 라우트는 { route, id } 객체다 — 플랜 13 이
// id 를 싣는 화면(레슨 에디터·토픽 구성)을 더했다.
//   #/contents · #/review · #/users     → { route, id: null }
//   #/edit/lesson/new                   → { route: 'edit-lesson', id: null }   신규 → POST
//   #/edit/lesson/:id                   → { route: 'edit-lesson', id }         수정 → PATCH
//   #/topics · #/topics/new · #/topics/:id → { route: 'topics', id: null | 'new' | id }   (editors/topic.jsx 의 규약)
// 모르는 경로·숫자가 아닌 id 는 콘텐츠 목록으로 떨어진다 — 빈 화면보다 낫다.
const ADMIN_PLAIN_ROUTES = ['contents', 'review', 'users', 'topics'];

function adminRouteFromHash() {
  const raw = String(window.location.hash || '').replace(/^#\/?/, '').split('?')[0];
  const seg = raw.split('/').filter(Boolean);
  if (seg[0] === 'edit' && seg[1] === 'lesson') {
    if (seg[2] === 'new') return { route: 'edit-lesson', id: null };
    if (/^\d+$/.test(seg[2] || '')) return { route: 'edit-lesson', id: seg[2] };
    return { route: 'contents', id: null };
  }
  if (seg[0] === 'topics' && seg.length > 1) {
    if (seg[1] === 'new' || /^\d+$/.test(seg[1])) return { route: 'topics', id: seg[1] };
    return { route: 'contents', id: null };
  }
  return { route: ADMIN_PLAIN_ROUTES.includes(seg[0]) ? seg[0] : 'contents', id: null };
}

function useAdminRoute() {
  const [nav, setNav] = React.useState(adminRouteFromHash);
  React.useEffect(() => {
    const onHash = () => setNav(adminRouteFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return nav;
}

// adminRouteFromHash 의 역함수. id 를 받는 라우트는 둘뿐이고 그 외는 id 를 버린다.
function adminGoto(route, id) {
  if (route === 'edit-lesson') {
    window.location.hash = `#/edit/lesson/${id == null ? 'new' : encodeURIComponent(id)}`;
    return;
  }
  if (route === 'topics' && id != null) {
    window.location.hash = `#/topics/${encodeURIComponent(id)}`;
    return;
  }
  window.location.hash = `#/${ADMIN_PLAIN_ROUTES.includes(route) ? route : 'contents'}`;
}

// 열린 메뉴 닫기 — 바깥 클릭 · Esc · 리사이즈 · 스크롤.
// position:fixed 메뉴는 표가 스크롤돼도 따라오지 않으므로 어긋나 보이기 전에 닫는다.
// scroll 은 **capture** 로 들어야 내부 스크롤 컨테이너의 이벤트까지 잡힌다(scroll 은 버블링하지 않는다).
function useAdminDismiss(open, setOpen, ref) {
  React.useEffect(() => {
    if (!open) return undefined;
    const outside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    const dismiss = () => setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', onKey);
    window.addEventListener('resize', dismiss);
    window.addEventListener('scroll', dismiss, true);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', dismiss);
      window.removeEventListener('scroll', dismiss, true);
    };
  }, [open, setOpen, ref]);
}

// 열린 드롭다운의 **화면(viewport) 좌표**. position:absolute 로 두면 표의 overflow:auto 에
// 클리핑돼 메뉴가 잘린다 — 그래서 fixed 로 띄우고 좌표를 버튼의 화면 위치에서 직접 계산한다.
// 아래 공간이 모자라면 위로 펼친다.
function adminMenuRect(el, width) {
  const r = el.getBoundingClientRect();
  const below = window.innerHeight - r.bottom - 8;
  const above = r.top - 8;
  const dropUp = below < Math.min(ADMIN_MENU_MAX, above);
  return {
    right: Math.max(8, window.innerWidth - r.right),
    width,
    top: r.bottom + 4,
    bottom: window.innerHeight - r.top + 4,
    dropUp,
    maxHeight: Math.max(140, Math.min(ADMIN_MENU_MAX, dropUp ? above : below)),
  };
}

// 스크롤바는 인라인 스타일로 못 만든다 — 테마 색을 넣은 규칙을 주입한다.
// users.jsx 도 같은 클래스를 주입하지만 두 화면은 동시에 마운트되지 않는다(해시 라우팅).
function AdminScrollStyle({ theme }) {
  return (
    <style>{`
      .jina-scroll { scrollbar-width: thin; scrollbar-color: ${theme.borderStrong} transparent; }
      .jina-scroll::-webkit-scrollbar { width: 10px; height: 10px; }
      .jina-scroll::-webkit-scrollbar-track { background: transparent; }
      .jina-scroll::-webkit-scrollbar-thumb {
        background: ${theme.borderStrong}; border-radius: 999px;
        border: 3px solid transparent; background-clip: content-box;
      }
      .jina-scroll::-webkit-scrollbar-thumb:hover { background: ${theme.textDim}; background-clip: content-box; }
      .jina-scroll::-webkit-scrollbar-corner { background: transparent; }
    `}</style>
  );
}

function AdminTopBar({ theme, me }) {
  const roleTone = ADMIN_ROLE_TONE[me?.role] || 'textMuted';
  const roleColor = theme[roleTone] || theme.textMuted;
  return (
    <nav style={{
      height: 52, display: 'flex', alignItems: 'center', gap: 12, padding: '0 26px',
      borderBottom: `1px solid ${theme.borderStrong}`, background: theme.bgSoft, flexShrink: 0,
    }}>
      <span style={{
        width: 26, height: 26, borderRadius: '50%', color: '#fff',
        background: theme.accentGrad, display: 'grid', placeItems: 'center',
        fontSize: 12, fontWeight: 700,
      }}>J</span>
      <span style={{ fontSize: 16.5, fontWeight: 700 }}>Jina 콘텐츠 관리</span>
      {me?.role && (
        // 목업은 ADMIN 을 박아 뒀지만 실제 역할을 그대로 적는다 — reviewer 로 들어온 사람에게
        // ADMIN 이라고 써 주면 왜 어떤 버튼이 흐린지 설명이 안 된다.
        <span data-testid="admin-role-badge" style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', padding: '3px 9px', borderRadius: 999,
          background: adminTint(roleColor, '26', theme.chipBg),
          color: roleColor,
          border: `1px solid ${adminTint(roleColor, '52', theme.border)}`,
        }}>{String(me.role).toUpperCase()}</span>
      )}
      {me && (
        <span style={{ marginLeft: 'auto', fontSize: 12.5, color: theme.textDim }}>
          {me.email} · role={me.role}
        </span>
      )}
      <a
        href="index.html"
        data-testid="admin-open-app"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          fontSize: 12.5, color: theme.textMuted, textDecoration: 'none',
          border: `1px solid ${theme.borderStrong}`, padding: '7px 13px', borderRadius: 10,
          marginLeft: me ? 14 : 'auto',
        }}
      ><Icons.ArrowLeft size={14} />학습 앱</a>
    </nav>
  );
}

// 화면 탭. users.jsx 는 자기 화면에 똑같은 스트립을 비활성 span 으로 그려 두었다 —
// 그쪽을 고칠 수 없어 이 스트립은 콘텐츠 화면에만 있고, 사용자 화면에서 돌아오는 길은
// AdminBackToContents 가 맡는다(그 주석 참조).
function AdminTabs({ theme, route, me }) {
  // 탭이 없는 라우트(레슨 에디터)는 상위 탭을 켠다 — 어느 탭도 켜지지 않으면 "어디에 있나" 를 잃는다.
  const tab = ADMIN_ROUTE_TAB[route] || route;
  return (
    <div style={{ display: 'flex', gap: 7, padding: '16px 26px 0', flexShrink: 0 }}>
      {ADMIN_TABS.map((t) => {
        const active = t.key === tab;
        const blocked = t.soon || (t.minRole && !adminHasRole(me, t.minRole));
        const title = t.soon || (blocked ? ADMIN_TAB_BLOCKED[t.minRole] : undefined);
        const style = {
          padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
          background: active ? theme.surface : 'transparent',
          border: `1px solid ${active ? theme.borderStrong : theme.border}`,
          color: active ? theme.text : theme.textDim,
        };
        if (blocked) {
          return (
            <span
              key={t.key}
              data-testid={`admin-tab-${t.key}`}
              aria-disabled="true"
              title={title}
              style={{
                ...style,
                // 비활성은 흐리게만 두지 않는다 — 눌리지 않는다는 것이 커서로도 보여야 한다.
                opacity: 0.4, cursor: 'not-allowed', textDecoration: 'line-through',
              }}
            >{t.label}</span>
          );
        }
        return (
          <button
            key={t.key}
            data-testid={`admin-tab-${t.key}`}
            onClick={() => adminGoto(t.key)}
            style={{ ...style, cursor: active ? 'default' : 'pointer' }}
          >{t.label}</button>
        );
      })}
    </div>
  );
}

function AdminStatusBadge({ theme, status }) {
  const meta = ADMIN_STATUS_META[status] || { label: status || '—', tone: 'textMuted', dot: 'ring' };
  const color = theme[meta.tone] || theme.textMuted;
  const dot = meta.dot === 'solid'
    ? { background: color }
    : meta.dot === 'faded'
      ? { background: adminTint(color, '59', 'transparent'), border: `1.5px solid ${color}` }
      : { background: 'transparent', border: `1.5px solid ${color}` };
  return (
    <span data-testid="content-status-badge" data-status={status} style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      fontSize: 12.5, fontWeight: 700, color,
    }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, ...dot }} />
      {meta.label}
    </span>
  );
}

// 공개 범위 — [▾] 메뉴가 아니라 별도 조작이다(플랜 §2 결정, 목업 각주).
// 내리기(archived)는 visibility 를 건드리지 않으므로 이 칩과 상태 배지는 서로 독립적으로 움직인다.
function AdminVisibilityChip({ theme, item, me, busy, onChange }) {
  const isPublic = item.visibility === 'public';
  const to = isPublic ? 'private' : 'public';
  const can = adminCanSetVisibility(item, to, me);
  // 공개는 accent(hex), 비공개는 무채색. 무채색 토큰은 rgba 라 알파를 덧붙일 수 없어
  // chipBg/border 를 그대로 쓴다(adminTint 주석 참조).
  const color = isPublic ? theme.accent : theme.textMuted;
  const reason = can ? `공개 범위를 ${to === 'public' ? '공개' : '비공개'}로 바꿉니다` : adminVisibilityBlockReason(item, to, me);
  return (
    <button
      data-testid="content-visibility-chip"
      data-visibility={item.visibility}
      disabled={!can || busy}
      title={reason}
      onClick={() => onChange(to)}
      style={{
        justifySelf: 'start', padding: '5px 10px', borderRadius: 999,
        fontSize: 11.5, fontWeight: 700, color,
        background: can ? adminTint(color, '14', theme.chipBg) : 'transparent',
        border: `1px solid ${can ? adminTint(color, '55', theme.borderStrong) : theme.border}`,
        cursor: !can ? 'not-allowed' : busy ? 'wait' : 'pointer',
        opacity: can ? 1 : 0.5,
      }}
    >{isPublic ? '공개' : '비공개'}</button>
  );
}

function AdminMenuRow({ theme, testid, disabled, tone, icon, label, tag, onClick }) {
  const IconCmp = icon ? Icons[icon] : null;
  return (
    <button
      data-testid={testid}
      disabled={disabled}
      onClick={onClick}
      style={{
        width: '100%', textAlign: 'left', padding: '9px 12px', borderRadius: 8,
        display: 'flex', gap: 9, alignItems: 'center',
        fontSize: 13, fontWeight: disabled ? 600 : 700,
        color: disabled ? theme.textDim : (tone || theme.text),
        background: 'transparent',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {IconCmp ? <IconCmp size={15} /> : <span style={{ width: 15, flexShrink: 0 }} />}
      <span style={{ flex: 1, minWidth: 0 }}>{label}</span>
      {tag && (
        <span style={{
          marginLeft: 'auto', fontSize: 9.5, fontWeight: 800, letterSpacing: '0.05em',
          padding: '2px 6px', borderRadius: 999, background: theme.chipBg, color: theme.textDim,
        }}>{tag}</span>
      )}
    </button>
  );
}

function AdminRowMenu({ theme, item, me, busy, onTransition, onPreview }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ right: 0, width: 236, top: 0, bottom: 0, dropUp: false, maxHeight: ADMIN_MENU_MAX });
  const ref = React.useRef(null);
  useAdminDismiss(open, setOpen, ref);
  const transitions = adminTransitionsFor(item, me);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        data-testid="content-kebab"
        disabled={busy}
        onClick={(e) => {
          const next = !open;
          if (next) setPos(adminMenuRect(e.currentTarget, 236));
          setOpen(next);
        }}
        style={{
          width: 30, height: 30, borderRadius: 9,
          border: `1px solid ${open ? `${theme.accent}8c` : theme.borderStrong}`,
          background: open ? `${theme.accent}1a` : 'transparent',
          display: 'grid', placeItems: 'center',
          color: open ? theme.accent : theme.textMuted,
          cursor: busy ? 'wait' : 'pointer',
        }}
      ><Icons.ChevronDown size={15} /></button>
      {open && (
        <div data-testid="content-kebab-menu" className="jina-scroll" style={{
          // absolute 는 표의 overflow:auto 에 잘린다. fixed 는 뷰포트 기준이라 클리핑을 벗어난다.
          position: 'fixed', zIndex: 200,
          right: pos.right, width: pos.width,
          ...(pos.dropUp ? { bottom: pos.bottom } : { top: pos.top }),
          background: theme.surfaceElev, border: `1px solid ${theme.borderStrong}`,
          borderRadius: 12, boxShadow: theme.shadow, padding: 6,
          maxHeight: pos.maxHeight, overflowY: 'auto',
        }}>
          {transitions.map((t) => (
            <AdminMenuRow
              key={t.to}
              theme={theme}
              testid={`content-transition-${t.to}`}
              icon={t.allowed ? t.icon : null}
              // 전이 방향을 색으로 말한다 — 올리는 것은 success, 내리는 것은 error.
              tone={t.to === 'archived' ? theme.error : t.to === 'published' ? theme.success : theme.text}
              label={t.label}
              tag={t.allowed ? null : `${t.minRole}+`}
              disabled={!t.allowed}
              onClick={() => { setOpen(false); onTransition(t.to); }}
            />
          ))}
          <hr style={{ border: 'none', borderTop: `1px solid ${theme.border}`, margin: '5px 8px' }} />
          <AdminMenuRow
            theme={theme}
            testid="content-preview"
            icon="Eye"
            label="미리보기"
            onClick={() => { setOpen(false); onPreview(); }}
          />
          {/* 수정은 레슨만(플랜 13 Phase A 최소형 — editors/lc.jsx). 다른 유형은 경계를 보여주기 위해
              흐리게 남긴다: 사라지면 "이 유형은 편집이 없다" 가 아니라 "버그" 로 읽힌다. */}
          <AdminMenuRow
            theme={theme}
            testid="content-edit"
            icon={item.type === 'lesson' ? 'Book' : null}
            label="수정"
            tag={item.type === 'lesson' ? null : '플랜 13 범위 밖'}
            disabled={item.type !== 'lesson'}
            onClick={() => { setOpen(false); adminGoto('edit-lesson', item.id); }}
          />
          <AdminMenuRow theme={theme} testid="content-delete" label="삭제" tag="범위 밖" disabled />
        </div>
      )}
    </div>
  );
}

function AdminSkeletonRows({ theme, n = 4 }) {
  return (
    <div data-testid="contents-skeleton">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{
          // 본 표와 컬럼 수가 같아야 스켈레톤이 어긋나 보이지 않는다.
          display: 'grid', gridTemplateColumns: ADMIN_CONTENT_GRID,
          alignItems: 'center', gap: 14, padding: '0 18px', height: 57,
          borderTop: i ? `1px solid ${theme.border}` : 'none',
        }}>
          {[1, 2, 3, 4, 5, 6, 7, 8].map((c) => (
            <div key={c} style={{
              height: 13, borderRadius: 6, background: theme.chipBg,
              animation: 'jina-pulse 1.2s infinite',
            }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// '미리보기' — 본문이 아니라 **카탈로그 레코드**를 편다. 본문 렌더는 에디터(플랜 13)의 몫이고,
// 지금 이 화면이 가진 것은 목록 DTO 뿐이다. 그래도 slug·설명·id 는 내릴지 말지 정할 때 필요한 정보다.
// 없는 것을 있는 척 그리지 않으려고 패널 안에 경계를 적어 둔다.
function AdminPreviewPanel({ theme, item }) {
  const rows = [
    ['slug', item.slug],
    ['id', `${item.type}#${item.id}`],
    ['상태 · 공개', `${ADMIN_STATUS_META[item.status]?.label || item.status} · ${item.visibility === 'public' ? '공개' : '비공개'}`],
    ['출처', item.source || '—'],
    ['문항', item.item_count == null ? '—' : String(item.item_count)],
    ['수정일', item.updated_at ? String(item.updated_at).slice(0, 19).replace('T', ' ') : '—'],
  ];
  return (
    <div data-testid="content-preview-panel" style={{
      padding: '14px 18px 16px', borderTop: `1px dashed ${theme.borderStrong}`,
      background: theme.card,
    }}>
      {item.description ? (
        <div style={{ fontSize: 12.5, color: theme.textMuted, lineHeight: 1.7, marginBottom: 10 }}>
          {item.description}
        </div>
      ) : null}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 22px' }}>
        {rows.map(([k, v]) => (
          <span key={k} style={{ fontSize: 11.5, color: theme.textDim }}>
            {k} <b style={{
              fontWeight: 700, color: theme.textMuted,
              fontFamily: 'ui-monospace, Consolas, monospace',
            }}>{v || '—'}</b>
          </span>
        ))}
      </div>
      <div style={{ fontSize: 11, color: theme.textDim, marginTop: 10 }}>
        본문 미리보기는 저작 에디터(플랜 13)에서 붙는다 — 여기서는 카탈로그 레코드만 보여준다.
      </div>
    </div>
  );
}

function AdminContentsScreen() {
  const { user: me } = useAuth();
  const theme = useAdminTheme();
  const store = useAdminContents();
  const [expanded, setExpanded] = React.useState(null);

  const canAuthor = Boolean(me?.can_author);
  const shown = store.items.length;

  return (
    <React.Fragment>
      {/* 유형 탭 — 카운트는 서버가 counts 를 줄 때만 붙인다. 없는 수를 0 으로 그리면
          "0개" 와 "모른다" 를 구분할 수 없게 된다. */}
      <div style={{ display: 'flex', gap: 7, alignItems: 'center', padding: '15px 26px 0', flexShrink: 0 }}>
        {ADMIN_CONTENT_TYPES.map((t) => {
          const active = store.filters.type === t.key;
          const n = store.counts?.[t.key || 'all'];
          return (
            <button
              key={t.key || 'all'}
              data-testid={`content-type-${t.key || 'all'}`}
              onClick={() => { setExpanded(null); store.setFilter({ type: t.key }); }}
              style={{
                padding: '7px 13px', borderRadius: 999, fontSize: 12.5, fontWeight: 700, cursor: 'pointer',
                background: active ? `${theme.accent}22` : theme.chipBg,
                border: `1px solid ${active ? theme.accent : theme.border}`,
                color: active ? theme.accent : theme.textMuted,
              }}
            >
              {t.label}
              {Number.isFinite(n) && (
                <b style={{ marginLeft: 7, fontWeight: 800, color: active ? theme.accent : theme.textDim }}>{n}</b>
              )}
            </button>
          );
        })}
      </div>

      {/* 제목 + 총계 */}
      <div style={{
        padding: '16px 26px 0', display: 'flex', alignItems: 'flex-end',
        justifyContent: 'space-between', gap: 20, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>콘텐츠</h1>
          {/* 보이는 행이 전부인지 아닌지를 화면이 말해 준다. 없으면 부분 목록인 줄 모른다. */}
          {!store.loading && (
            <span style={{ fontSize: 12.5, color: theme.textDim }}>
              {shown === store.total ? `${store.total}개` : `${store.total}개 중 ${shown}개`}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: theme.textDim, paddingBottom: 4, textAlign: 'right' }}>
          만들기는 플랜 13 · AI 초안 검수는 플랜 12 —
          이 화면은 <b style={{ color: theme.textMuted }}>내리고 올리는 것</b>만 한다
        </div>
      </div>

      {/* 검색 + 상태 필터 */}
      <div style={{
        display: 'flex', gap: 8, alignItems: 'center', padding: '14px 26px 13px', flexShrink: 0,
      }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, background: theme.card,
          border: `1px solid ${theme.borderStrong}`, borderRadius: 10, padding: '8px 13px', width: 262,
        }}>
          <Icons.Search size={15} style={{ color: theme.textDim, flexShrink: 0 }} />
          <input
            data-testid="content-search"
            value={store.filters.q}
            onChange={(e) => { setExpanded(null); store.setFilter({ q: e.target.value }); }}
            placeholder="제목 · slug 검색"
            style={{
              flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none',
              color: theme.text, fontSize: 12.5, fontFamily: 'inherit',
            }}
          />
        </div>
        {ADMIN_STATUS_FILTERS.map((s) => {
          const active = store.filters.status === s;
          const meta = ADMIN_STATUS_META[s];
          const color = meta ? (theme[meta.tone] || theme.textMuted) : theme.accent;
          return (
            <button
              key={s || 'all'}
              data-testid={`content-status-filter-${s || 'all'}`}
              onClick={() => { setExpanded(null); store.setFilter({ status: s }); }}
              style={{
                padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                // '초안' 칩의 색은 textDim(rgba)이라 알파를 덧붙일 수 없다 — adminTint 주석 참조.
                background: active ? adminTint(color, '22', theme.chipBg) : theme.chipBg,
                border: `1px solid ${active ? color : theme.border}`,
                color: active ? color : theme.textMuted,
              }}
            >{meta ? meta.label : '전체'}</button>
          );
        })}
        <span style={{ marginLeft: 'auto', fontSize: 11.5, color: theme.textDim }}>
          status = 생명주기 · visibility = 누가 보나 — 별개 축
        </span>
      </div>

      {store.error && (
        <div data-testid="contents-error" style={{
          margin: '0 26px 12px', padding: '10px 14px', borderRadius: 10,
          background: `${theme.error}18`, border: `1px solid ${theme.error}44`,
          color: theme.error, fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0,
        }}>
          <span style={{ flex: 1 }}>{store.error}</span>
          <button onClick={() => store.reload()} style={{
            padding: '6px 12px', borderRadius: 8, background: theme.error, color: '#fff',
            fontSize: 12, fontWeight: 700, cursor: 'pointer',
          }}>재시도</button>
        </div>
      )}

      {/* 표 */}
      <div className="jina-scroll" style={{
        margin: '0 26px', flex: 1, minHeight: 0, overflow: 'auto',
        border: `1px solid ${theme.border}`, borderRadius: 15, background: theme.surface,
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: ADMIN_CONTENT_GRID, alignItems: 'center', gap: 14,
          padding: '0 18px', height: 40, background: theme.bgSoft,
          borderRadius: '14px 14px 0 0', fontSize: 10.5, color: theme.textDim,
          fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          position: 'sticky', top: 0, zIndex: 1,
        }}>
          <span>상태</span><span>제목</span><span>공개</span><span>유형</span>
          <span style={{ textAlign: 'right' }}>문항</span><span>만든이</span><span>수정일</span><span />
        </div>

        {!canAuthor ? (
          // 서버가 어차피 403 을 준다(결정 4 — 가드를 클라이언트에 맡기지 않는다).
          // 이 안내는 빈 표 대신 왜 비었는지를 말해 주기 위한 것뿐이다.
          <div data-testid="contents-need-author" style={{
            padding: '48px 40px', textAlign: 'center', color: theme.textMuted, fontSize: 14, lineHeight: 1.8,
          }}>
            콘텐츠 관리는 <b style={{ color: theme.accent }}>author</b> 이상만 열 수 있습니다.
            <div style={{ fontSize: 12.5, color: theme.textDim, marginTop: 6 }}>
              현재 역할: {me?.role || '—'} — 관리자에게 권한을 요청하세요.
            </div>
          </div>
        ) : store.forbidden ? (
          <div data-testid="contents-forbidden" style={{
            padding: '48px 40px', textAlign: 'center', color: theme.textMuted, fontSize: 14,
          }}>권한이 없습니다</div>
        ) : store.loading ? (
          <AdminSkeletonRows theme={theme} />
        ) : shown === 0 ? (
          <div data-testid="contents-empty" style={{
            padding: '48px 40px', textAlign: 'center', color: theme.textMuted, fontSize: 14,
          }}>조건에 맞는 콘텐츠가 없습니다</div>
        ) : (
          store.items.map((item) => {
            const key = adminContentKey(item);
            const busy = store.rowBusy === key;
            const open = expanded === key;
            return (
              <div key={key}>
                <div data-testid="content-row" data-content-key={key} style={{
                  display: 'grid', gridTemplateColumns: ADMIN_CONTENT_GRID, alignItems: 'center', gap: 14,
                  padding: '0 18px', height: 57, borderTop: `1px solid ${theme.border}`,
                  background: open ? `${theme.accent}0e` : 'transparent',
                  opacity: busy ? 0.6 : 1,
                }}>
                  <AdminStatusBadge theme={theme} status={item.status} />
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
                    <span style={{
                      fontSize: 14, fontWeight: 600, minWidth: 0,
                      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }} title={item.title}>{item.title}</span>
                    {item.source === 'ai' && (
                      <span style={{
                        flexShrink: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.05em',
                        padding: '2px 7px', borderRadius: 999,
                        background: `${theme.accent}29`, color: theme.accent,
                      }}>AI 초안</span>
                    )}
                    {/* eligible 미달 토픽도 숨기지 않는다(결정 3) — 숨기면 관리자가 새 토픽을
                        채우는 동안 그 토픽이 화면에서 사라져 저작이 막힌다. 경고만 단다. */}
                    {item.eligible === false && (
                      <span data-testid="content-eligible-warn" title="토픽 구성 임계치(레슨 3 · 시나리오 1 · 단어 20) 미달 — 학습 앱 목록에는 노출되지 않습니다" style={{
                        flexShrink: 0, fontSize: 10, fontWeight: 700,
                        padding: '2px 8px', borderRadius: 999,
                        background: `${theme.warning}22`, color: theme.warning,
                        border: `1px solid ${theme.warning}47`,
                      }}>eligible 미달</span>
                    )}
                  </div>
                  <AdminVisibilityChip
                    theme={theme} item={item} me={me} busy={busy}
                    onChange={(to) => store.setVisibility(item, to)}
                  />
                  <span style={{ fontSize: 12.5, color: theme.textMuted }}>{adminTypeLabel(item)}</span>
                  <span style={{
                    fontSize: 12.5, textAlign: 'right',
                    color: item.item_count ? theme.textMuted : theme.textDim,
                    fontFamily: 'ui-monospace, Consolas, monospace',
                  }}>{item.item_count == null ? '—' : item.item_count}</span>
                  <span style={{
                    fontSize: 12, color: theme.textDim,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>{adminActorLabel(item)}</span>
                  <span style={{ fontSize: 12.5, color: theme.textDim }}>{adminFmtDate(item.updated_at)}</span>
                  <AdminRowMenu
                    theme={theme} item={item} me={me} busy={busy}
                    onTransition={(to) => store.transition(item, to)}
                    onPreview={() => setExpanded(open ? null : key)}
                  />
                </div>
                {open && <AdminPreviewPanel theme={theme} item={item} />}
              </div>
            );
          })
        )}

        {/* 목록이 잘렸으면 그 사실을 말하고 이어 받게 한다 — 없으면 limit(50)을 넘는 순간
            51번째부터 화면에서 조용히 사라진다. 페이지네이션은 만들지 않는다. */}
        {canAuthor && !store.loading && shown > 0 && shown < store.total && (
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: '14px 18px', borderTop: `1px solid ${theme.border}`,
          }}>
            <button
              data-testid="contents-load-more"
              disabled={store.loadingMore}
              onClick={() => store.loadMore()}
              style={{
                padding: '7px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700,
                cursor: store.loadingMore ? 'wait' : 'pointer',
                background: theme.chipBg, border: `1px solid ${theme.borderStrong}`, color: theme.text,
              }}
            >{store.loadingMore
              ? '불러오는 중…'
              : `${Math.min(ADMIN_CONTENT_PAGE_SIZE, store.total - shown)}개 더 보기`}</button>
          </div>
        )}
      </div>

      {/* 하단 각주 — 이 화면의 두 규범(결정 2 · 열린 질문 7 후보 A)을 화면에서 읽히게 둔다. */}
      <div style={{
        padding: '14px 26px 24px', fontSize: 11.5, color: theme.textDim,
        lineHeight: 1.75, maxWidth: 900, flexShrink: 0,
      }}>
        <b style={{ color: theme.textMuted }}>내리면</b> 목록·추천·진행률 분모에서 즉시 빠지고,
        이미 푼 사용자의 <b style={{ color: theme.textMuted }}>오답 노트·통계에는 남는다</b>.
        내려도 공개 범위는 그대로 보존되므로 다시 공개하면 원래 보이던 사람에게 그대로 돌아온다.
        전이마다 <b style={{ color: theme.textMuted }}>content_audit_log</b> 에 1행이 남는다.
      </div>
    </React.Fragment>
  );
}

// 사용자 화면에서 콘텐츠 화면으로 돌아오는 유일한 길.
//
// users.jsx 는 자기 nav·탭 스트립·100vh 루트를 직접 그리는 완결된 화면이고 이 플랜에서는
// 수정 대상이 아니다. 그 안의 탭 스트립은 클릭되지 않는 span 이라 콘텐츠로 나올 수가 없다.
// 그래서 라우팅을 쥔 이쪽에서 fixed 버튼 하나를 얹는다. 좌표(top 68)는 users.jsx 의
// nav 52 + 탭 스트립 상단 여백 16 이라 그 줄의 **빈 오른쪽**에 앉는다.
// 이 버튼은 users.jsx 의 nav·탭 스트립이 AdminShell 로 올라오면 사라져야 한다(report 참조).
function AdminBackToContents({ theme }) {
  return (
    // jina-root 로 한 번 감싼다 — users.jsx 의 루트 **바깥**에 뜨는 요소라
    // 감싸지 않으면 이 버튼만 Pretendard 도 버튼 리셋도 못 받는다.
    <div className="jina-root" style={{ position: 'fixed', top: 68, right: 26, zIndex: 300 }}>
      <button
        data-testid="admin-back-to-contents"
        onClick={() => adminGoto('contents')}
        title="콘텐츠 관리로 돌아가기"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 7,
          padding: '8px 14px', borderRadius: 9, fontSize: 13, fontWeight: 600,
          background: theme.surface, border: `1px solid ${theme.borderStrong}`,
          color: theme.text, boxShadow: theme.shadow, cursor: 'pointer',
        }}
      ><Icons.ArrowLeft size={15} />콘텐츠</button>
    </div>
  );
}

function AdminCentered({ theme, children }) {
  return (
    <div className="jina-root" style={{
      width: '100vw', height: '100vh', display: 'grid', placeItems: 'center',
      background: theme.bg, color: theme.text, textAlign: 'center', padding: 24,
    }}>{children}</div>
  );
}

// 에디터 파일이 로드되지 않았을 때(admin.html 의 script 순서·경로가 어긋났을 때) 트리를 죽이지 않고 말해 준다.
// users.jsx 에 대해 AdminShell 이 하는 것과 같은 방식이다. 전체 화면이 아니라 탭 아래 영역에 그린다 —
// 상단바·탭은 살려 두어야 다른 화면으로 나갈 수 있다.
function AdminMissingScreen({ theme, label, file }) {
  return (
    <div data-testid="admin-missing-screen" data-file={file} style={{
      padding: '48px 40px', textAlign: 'center', color: theme.error, fontSize: 13.5, lineHeight: 1.8,
    }}>
      {label}({file})가 로드되지 않았습니다 — admin.html 의 script 순서를 확인하세요.
    </div>
  );
}

function AdminShell() {
  const theme = useAdminTheme();
  const nav = useAdminRoute();
  const { route } = nav;
  const { status, user: me, error: authError, refresh } = useAuth();

  if (status === 'loading') {
    return <AdminCentered theme={theme}><span style={{ color: theme.textMuted, fontSize: 14 }}>로딩 중…</span></AdminCentered>;
  }
  if (status === 'offline') {
    return (
      <AdminCentered theme={theme}>
        <div>
          <div style={{ fontSize: 13.5, color: theme.error, marginBottom: 14, maxWidth: 460, lineHeight: 1.7 }}>
            {authError || 'API 서버에 연결할 수 없습니다.'}
          </div>
          <button data-testid="admin-retry" onClick={() => refresh()} style={{
            padding: '9px 20px', borderRadius: 8, background: theme.accent, color: '#fff',
            fontWeight: 700, cursor: 'pointer',
          }}>다시 시도</button>
        </div>
      </AdminCentered>
    );
  }
  if (status === 'anon') {
    // users.jsx 의 AdminApp 은 이 분기가 없어 로그인 전 화면이 그대로 403 표로 떨어졌다.
    // 관리 화면에는 로그인 폼이 없으므로(학습 앱에만 있다) 어디로 가야 하는지를 알려 준다.
    return (
      <AdminCentered theme={theme}>
        <div style={{ lineHeight: 1.9 }}>
          <div style={{ fontSize: 15, fontWeight: 700 }}>로그인이 필요합니다</div>
          <a href="index.html" style={{ fontSize: 13, color: theme.accent, textDecoration: 'none' }}>
            학습 앱에서 로그인한 뒤 다시 열어 주세요 →
          </a>
        </div>
      </AdminCentered>
    );
  }

  // 사용자 화면은 users.jsx 가 자기 nav·탭까지 통째로 그린다. 여기서 감싸면 상단바가 두 벌이 되므로
  // 그대로 두고 돌아오는 버튼만 얹는다.
  if (route === 'users') {
    // users.jsx 가 로드되지 않았거나 파싱에 실패하면 여기서 전체 트리가 죽는다(빈 화면).
    // admin.html 의 script 순서가 어긋난 것이므로 그렇게 말해 준다.
    if (typeof AdminUsersScreen !== 'function') {
      return (
        <AdminCentered theme={theme}>
          <span style={{ color: theme.error, fontSize: 13.5 }}>
            사용자 화면(src/admin/users.jsx)이 로드되지 않았습니다 — admin.html 의 script 순서를 확인하세요.
          </span>
        </AdminCentered>
      );
    }
    return (
      <React.Fragment>
        <AdminUsersScreen />
        <AdminBackToContents theme={theme} />
      </React.Fragment>
    );
  }

  return (
    // jina-root — tokens.jsx 가 주입하는 기본 스타일이 이 클래스에 스코프돼 있다.
    // 빠뜨리면 box-sizing: border-box · Pretendard 폰트 · 버튼 리셋이 이 화면에만 적용되지 않는다.
    <div className="jina-root" style={{
      width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
      background: theme.bg, color: theme.text,
    }}>
      <AdminScrollStyle theme={theme} />
      <AdminTopBar theme={theme} me={me} />
      <AdminTabs theme={theme} route={route} me={me} />
      {/* 에디터 둘(플랜 13)은 editors/*.jsx 가 전역 이름으로 내놓는다. key 에 id 를 걸어 다른 레슨·토픽으로
          해시가 바뀌면 폼 상태를 통째로 새로 시작한다 — 이전 레슨의 입력이 다음 레슨에 남으면 오저장이 된다. */}
      {route === 'review' ? <AdminReviewQueue theme={theme} me={me} />
        : route === 'edit-lesson' ? (
          typeof AdminLcEditor === 'function'
            ? <AdminLcEditor key={nav.id ?? 'new'} theme={theme} me={me} lessonId={nav.id} />
            : <AdminMissingScreen theme={theme} label="LC 편집기" file="src/admin/editors/lc.jsx" />
        )
        : route === 'topics' ? (
          typeof AdminTopicComposer === 'function'
            ? <AdminTopicComposer key={nav.id ?? 'list'} theme={theme} me={me} topicId={nav.id} />
            : <AdminMissingScreen theme={theme} label="토픽 편집기" file="src/admin/editors/topic.jsx" />
        )
        : <AdminContentProvider>
          <AdminContentsScreen />
          <AdminNotice theme={theme} />
        </AdminContentProvider>}
    </div>
  );
}

// 안내/오류 토스트. 409(금지 전이·상태 충돌)는 서버 문구를 그대로 띄운다 —
// "왜 안 되는가" 가 상태에 달린 정보라 화면이 다시 쓸 수 없다.
function AdminNotice({ theme }) {
  const { notice, dismissNotice } = useAdminContents();
  if (!notice) return null;
  const isError = notice.tone === 'error';
  return (
    <div
      data-testid="admin-notice"
      data-tone={notice.tone}
      onClick={dismissNotice}
      style={{
        position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
        maxWidth: 'min(720px, calc(100vw - 48px))',
        padding: '10px 18px', borderRadius: 10, zIndex: 400, cursor: 'pointer',
        background: isError ? theme.error : theme.success,
        color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: theme.shadow,
      }}
    >{notice.msg}</div>
  );
}

// users.jsx 가 만들어 둔 root 를 넘겨받는다 — 파일 머리말의 "root 인수인계" 참조.
// (같은 컨테이너에 createRoot 를 두 번 하면 React 경고 + 두 트리가 같은 DOM 을 두고 다툰다.)
const adminRoot = (typeof root !== 'undefined' && root && typeof root.render === 'function')
  ? root
  : ReactDOM.createRoot(document.getElementById('root'));

adminRoot.render(
  <AuthProvider>
    <AdminShell />
  </AuthProvider>,
);
