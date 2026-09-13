// users.jsx — 관리자 · 사용자/역할 관리 (플랜 11 Phase 3)
// 목업 시각 기준: docs/plan/mockups/11-admin-users.html — CSS 는 복사하지 않고 theme.* 인라인 스타일.

const ROLE_TONE = {
  admin: 'warning',
  reviewer: 'success',
  author: 'accent',
  learner: 'textDim',
};

const LOCK_LABELS = {
  self: '본인',
  last_admin: '마지막 관리자',
};

// 한 번에 받아 오는 행 수. 서버 기본 limit(admin.routes.js) 과 같은 값이어야
// '더 보기' 가 offset = 지금까지 받은 행 수로 정확히 이어진다.
const PAGE_SIZE = 50;
// 서버가 limit 을 200 에서 자른다(admin.routes.js). 더 크게 요청하면 조용히 잘리므로
// 조작 후 새로고침에서 이 값을 넘기지 않는다.
const MAX_LIMIT = 200;

// 누적 목록에 다음 페이지를 붙이되 같은 id 는 한 번만 남긴다.
// 두 요청 사이에 사용자가 추가·삭제되면 offset 이 밀려 같은 행이 두 번 올 수 있고,
// 그대로 두면 React key 가 중복된다.
function mergeById(prev, next) {
  const seen = new Set(prev.map((u) => u.id));
  return prev.concat(next.filter((u) => !seen.has(u.id)));
}

function readThemeName() {
  try {
    const saved = JSON.parse(localStorage.getItem('jina_settings_v1') || '{}');
    return saved.themeName || 'aurora';
  } catch {
    return 'aurora';
  }
}

// 감사 로그 한 줄이 이메일 하나로 폭을 다 먹지 않게 줄인다. 전체 값은 title 로 남긴다.
function shortEmail(email, keep = 14) {
  const s = String(email || '');
  const at = s.indexOf('@');
  if (at <= keep) return s;
  return `${s.slice(0, keep)}…${s.slice(at)}`;
}

function roleColor(theme, code) {
  const tone = ROLE_TONE[code] || 'textMuted';
  return theme[tone] || theme.textMuted;
}

function fmtDate(iso) {
  if (!iso) return '—';
  return String(iso).slice(0, 10);
}

function RoleSelect({ theme, user, roles, onChange, busy }) {
  const color = roleColor(theme, user.role);

  if (!user.can_change_role) {
    const meta = roles.find((r) => r.code === user.role);
    const reason = LOCK_LABELS[user.role_lock_reason] || '변경 불가';
    return (
      <div data-testid="role-locked" title={reason} style={{
        display: 'inline-flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '7px 11px', borderRadius: 10, border: `1px dashed ${theme.borderStrong}`,
        fontSize: 12.5, fontWeight: 700, color, opacity: 0.72, cursor: 'not-allowed',
      }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {meta?.name || user.role}
        </span>
        <span style={{ fontSize: 11, color: theme.textDim }}>🔒</span>
      </div>
    );
  }

  return (
    <JinaCodeSelect
      theme={theme}
      lookup="roles"
      items={roles}
      value={user.role}
      onChange={onChange}
      optionColor={(code) => roleColor(theme, code)}
      disabled={busy}
      triggerTestId="role-select"
      menuTestId="role-dropdown"
    />
  );
}

const CREATE_FORM_INIT = { email: '', display_name: '', password: '', password2: '', role: 'learner' };

function CreateRoleSelect({ theme, roles, value, onChange, disabled }) {
  return (
    <JinaCodeSelect
      theme={theme}
      lookup="roles"
      items={roles}
      value={value}
      onChange={onChange}
      optionColor={(code) => roleColor(theme, code)}
      variant="field"
      anchor="absolute"
      align="stretch"
      disabled={disabled}
      triggerTestId="user-create-role"
      menuTestId="user-create-role-dropdown"
    />
  );
}

function UserCreateModal({ theme, roles, open, busy, error, onClose, onSubmit }) {
  const [form, setForm] = React.useState(CREATE_FORM_INIT);
  const dialogRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    setForm(CREATE_FORM_INIT);
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const fieldStyle = {
    width: '100%', boxSizing: 'border-box',
    padding: '9px 12px', borderRadius: 10, fontSize: 13,
    border: `1px solid ${theme.borderStrong}`, background: theme.card,
    color: theme.text, fontFamily: 'inherit', outline: 'none',
  };
  const labelStyle = { display: 'block', fontSize: 12, fontWeight: 700, color: theme.textMuted, marginBottom: 6 };
  const mismatch = form.password2 && form.password !== form.password2;
  const canSubmit = form.email.trim() && form.password.length >= 8 && form.password === form.password2 && !busy;

  return (
    <React.Fragment>
      <div
        data-testid="user-create-backdrop"
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0, zIndex: 400,
          background: 'rgba(0,0,0,0.35)', backdropFilter: 'blur(2px)',
        }}
      />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="user-create-title"
        data-testid="user-create-modal"
        style={{
          position: 'fixed', zIndex: 401, left: '50%', top: '50%',
          transform: 'translate(-50%, -50%)', width: 'min(440px, calc(100vw - 48px))',
          background: theme.surfaceElev, border: `1px solid ${theme.borderStrong}`,
          borderRadius: 16, boxShadow: theme.shadow, padding: '22px 24px 20px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h2 id="user-create-title" style={{ margin: 0, fontSize: 17, fontWeight: 800 }}>사용자 추가</h2>
          <button
            type="button"
            data-testid="user-create-close"
            onClick={onClose}
            aria-label="닫기"
            style={{
              width: 32, height: 32, borderRadius: 8, border: `1px solid ${theme.border}`,
              display: 'grid', placeItems: 'center', color: theme.textMuted, cursor: 'pointer',
              background: 'transparent',
            }}
          ><Icons.X size={16} /></button>
        </div>

        {error && (
          <div data-testid="user-create-error" style={{
            marginBottom: 14, padding: '10px 12px', borderRadius: 10,
            background: theme.error + '18', border: `1px solid ${theme.error}44`,
            color: theme.error, fontSize: 12.5, fontWeight: 600, lineHeight: 1.55,
          }}>{error}</div>
        )}

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!canSubmit) return;
            onSubmit({
              email: form.email.trim(),
              display_name: form.display_name.trim(),
              password: form.password,
              role: form.role,
            });
          }}
          style={{ display: 'flex', flexDirection: 'column', gap: 14 }}
        >
          <label>
            <span style={labelStyle}>이메일 <span style={{ color: theme.error }}>*</span></span>
            <input
              data-testid="user-create-email"
              type="email"
              autoComplete="off"
              value={form.email}
              onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
              placeholder="user@example.com"
              style={fieldStyle}
            />
          </label>
          <label>
            <span style={labelStyle}>이름</span>
            <input
              data-testid="user-create-name"
              type="text"
              autoComplete="off"
              value={form.display_name}
              onChange={(e) => setForm((p) => ({ ...p, display_name: e.target.value }))}
              placeholder="표시 이름 (선택)"
              style={fieldStyle}
            />
          </label>
          <label>
            <span style={labelStyle}>역할</span>
            <CreateRoleSelect
              theme={theme}
              roles={roles}
              value={form.role}
              disabled={busy}
              onChange={(role) => setForm((p) => ({ ...p, role }))}
            />
          </label>
          <label>
            <span style={labelStyle}>임시 비밀번호 <span style={{ color: theme.error }}>*</span></span>
            <input
              data-testid="user-create-password"
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
              placeholder="8자 이상"
              style={fieldStyle}
            />
          </label>
          <label>
            <span style={labelStyle}>비밀번호 확인 <span style={{ color: theme.error }}>*</span></span>
            <input
              data-testid="user-create-password2"
              type="password"
              autoComplete="new-password"
              value={form.password2}
              onChange={(e) => setForm((p) => ({ ...p, password2: e.target.value }))}
              placeholder="다시 입력"
              style={{
                ...fieldStyle,
                borderColor: mismatch ? theme.error : theme.borderStrong,
              }}
            />
            {mismatch && (
              <span style={{ display: 'block', marginTop: 6, fontSize: 11.5, color: theme.error }}>
                비밀번호가 일치하지 않습니다
              </span>
            )}
          </label>

          <p style={{ margin: 0, fontSize: 11.5, color: theme.textDim, lineHeight: 1.65 }}>
            생성 후 임시 비밀번호를 사용자에게 직접 전달하세요. 메일 발송 기능은 없습니다.
          </p>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              data-testid="user-create-cancel"
              onClick={onClose}
              disabled={busy}
              style={{
                padding: '9px 16px', borderRadius: 9, fontSize: 13, fontWeight: 600,
                background: 'transparent', border: `1px solid ${theme.borderStrong}`,
                color: theme.textMuted, cursor: busy ? 'wait' : 'pointer',
              }}
            >취소</button>
            <button
              type="submit"
              data-testid="user-create-submit"
              disabled={!canSubmit}
              style={{
                padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700,
                background: canSubmit ? theme.accent : theme.chipBg,
                border: `1px solid ${canSubmit ? theme.accent : theme.border}`,
                color: canSubmit ? '#fff' : theme.textDim,
                cursor: !canSubmit ? 'not-allowed' : busy ? 'wait' : 'pointer',
              }}
            >{busy ? '등록 중…' : '등록'}</button>
          </div>
        </form>
      </div>
    </React.Fragment>
  );
}

function UserRowMenu({ theme, user, onToggleActive, onRevoke, busy }) {
  return (
    <JinaDropdown
      theme={theme}
      align="right"
      minWidth={160}
      maxHeight={160}
      menuTestId="user-kebab-menu"
      menuStyle={{ borderRadius: 10, padding: 4, minWidth: 160 }}
      renderTrigger={({ toggle }) => (
        <button
          data-testid="user-kebab"
          onClick={toggle}
          style={{
            width: 30, height: 30, borderRadius: 9, border: `1px solid ${theme.borderStrong}`,
            display: 'grid', placeItems: 'center', color: theme.textMuted, fontSize: 13, cursor: 'pointer',
            background: 'transparent',
          }}
        >⋯</button>
      )}
    >
      {({ close }) => (
        <React.Fragment>
          <button
            disabled={busy}
            onClick={() => { close(); onToggleActive(); }}
            style={{
              width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8,
              fontSize: 12.5, fontWeight: 600, color: theme.text, background: 'transparent', cursor: 'pointer',
            }}
          >{user.is_active ? '사용 중지' : '사용 재개'}</button>
          <button
            disabled={busy}
            onClick={() => { close(); onRevoke(); }}
            style={{
              width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8,
              fontSize: 12.5, fontWeight: 600, color: theme.text, background: 'transparent', cursor: 'pointer',
            }}
          >세션 모두 종료</button>
        </React.Fragment>
      )}
    </JinaDropdown>
  );
}

// embedded — admin-app.jsx 셸(상단바·AdminTabs) 안에 본문만 그릴 때 true.
// admin.html 은 admin-app 이 마지막에 root 를 다시 render 하므로 실제로는 항상 embedded 다.
function AdminUsersScreen({ embedded = false, theme: themeProp }) {
  const { user: me } = useAuth();
  const [themeName, setThemeName] = React.useState(readThemeName);
  const themeFromState = JINA_THEMES[themeName] || JINA_THEMES.aurora;
  const theme = themeProp || themeFromState;

  const [state, setState] = React.useState({
    // loading 은 목록 전체 교체(스켈레톤), loadingMore 는 '더 보기'(기존 행 유지)를 구분한다.
    loading: true, loadingMore: false, forbidden: false, error: null,
    users: [], total: 0, roles: [], counts: {}, recent_audit: [],
    q: '', roleFilter: '',
  });
  const [toast, setToast] = React.useState(null);
  const [rowBusy, setRowBusy] = React.useState(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [createBusy, setCreateBusy] = React.useState(false);
  const [createError, setCreateError] = React.useState(null);

  React.useEffect(() => {
    if (embedded) return undefined;
    const onTheme = () => setThemeName(readThemeName());
    window.addEventListener('jina-theme-change', onTheme);
    window.addEventListener('storage', onTheme);
    return () => {
      window.removeEventListener('jina-theme-change', onTheme);
      window.removeEventListener('storage', onTheme);
    };
  }, [embedded]);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 4000);
  };

  // append=true 면 받은 행을 뒤에 이어 붙이고, 아니면 목록을 통째로 갈아끼운다.
  // 검색·필터가 바뀔 때는 아래 useEffect 가 append 없이 부르므로 누적이 저절로 초기화된다 —
  // 초기화하지 않으면 옛 조건으로 받은 행이 새 결과 뒤에 그대로 남는다.
  const load = React.useCallback(async (q, roleFilter, { offset = 0, limit = PAGE_SIZE, append = false } = {}) => {
    setState((p) => ({
      ...p, error: null, forbidden: false,
      loading: !append, loadingMore: append,
    }));
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (roleFilter) qs.set('role', roleFilter);
    qs.set('limit', String(limit));
    if (offset) qs.set('offset', String(offset));
    const res = await window.JINA_API.get(`/api/admin/users?${qs}`);
    if (res.ok) {
      setState((p) => ({
        ...p, loading: false, loadingMore: false,
        users: append ? mergeById(p.users, res.users) : res.users,
        total: res.total, roles: res.roles,
        counts: res.counts, recent_audit: res.recent_audit || [],
      }));
    } else if (res.code === 'FORBIDDEN') {
      setState((p) => ({ ...p, loading: false, loadingMore: false, forbidden: true }));
    } else {
      setState((p) => ({
        ...p, loading: false, loadingMore: false,
        error: res.hint ? `${res.error} — ${res.hint}` : res.error,
      }));
    }
  }, []);

  React.useEffect(() => { load(state.q, state.roleFilter); }, [load, state.q, state.roleFilter]);

  // 조작 뒤 새로고침. '더 보기' 로 펼쳐 둔 만큼을 한 번에 다시 받는다 —
  // 기본 크기로 되돌리면 역할 하나 바꿨다고 화면이 접혀 버린다.
  const reload = () => load(state.q, state.roleFilter, {
    limit: Math.min(MAX_LIMIT, Math.max(PAGE_SIZE, state.users.length)),
  });

  const loadMore = () => load(state.q, state.roleFilter, {
    offset: state.users.length, append: true,
  });

  const patchRole = async (target, to) => {
    setRowBusy(target.id);
    const res = await window.JINA_API.patch(`/api/admin/users/${target.id}/role`, { to });
    setRowBusy(null);
    if (res.ok) {
      setState((p) => ({
        ...p,
        users: p.users.map((u) => (u.id === target.id ? res.user : u)),
      }));
      reload();
    } else {
      showToast(res.error || '역할 변경 실패', true);
    }
  };

  const patchActive = async (target) => {
    const to = !target.is_active;
    const label = to ? '사용 재개' : '사용 중지';
    if (!window.confirm(`${target.display_name || target.email} 계정을 ${label}하시겠습니까?`)) return;
    setRowBusy(target.id);
    const res = await window.JINA_API.patch(`/api/admin/users/${target.id}/active`, { to });
    setRowBusy(null);
    if (res.ok) {
      setState((p) => ({
        ...p,
        users: p.users.map((u) => (u.id === target.id ? res.user : u)),
      }));
      reload();
    } else {
      showToast(res.error || '상태 변경 실패', true);
    }
  };

  const createUser = async ({ email, display_name, password, role }) => {
    setCreateBusy(true);
    setCreateError(null);
    const res = await window.JINA_API.post('/api/admin/users', {
      email, display_name, password, role,
    });
    setCreateBusy(false);
    if (res.ok) {
      setCreateOpen(false);
      showToast(`${res.user.display_name || res.user.email} 계정을 만들었습니다`);
      reload();
    } else {
      setCreateError(res.error || '사용자 등록에 실패했습니다');
    }
  };

  const revokeSessions = async (target) => {
    if (!window.confirm(`${target.display_name || target.email}의 모든 세션을 종료하시겠습니까?`)) return;
    setRowBusy(target.id);
    const res = await window.JINA_API.post(`/api/admin/users/${target.id}/sessions/revoke`, {});
    setRowBusy(null);
    if (res.ok) {
      showToast(`세션 ${res.revoked}개를 종료했습니다`);
      reload();
    } else {
      showToast(res.error || '세션 종료 실패', true);
    }
  };

  // 0인 등급도 칩을 만든다 — `reviewer 0` 이 사라지면 "없다" 는 정보를 잃고,
  // 5개가 다 보이는 아래 필터 칩과도 어긋난다(리뷰 03 R8).
  // 등급 목록은 서버가 준 roles 를 그대로 쓴다 — listUsers 가 counts 를 roles 기준으로 0까지
  // 채워 주므로 화면이 등급 목록을 다시 하드코딩할 이유가 없다. 순서만 rank 내림차순으로
  // 뒤집어 필터 칩(admin→learner)과 같은 방향으로 읽히게 한다.
  const countChips = [...state.roles].sort((a, b) => b.rank - a.rank);

  // No. · 사용자 · 역할 · 가입 · 마지막 로그인 · 활성 세션 · ⋯
  const gridCols = '40px 1fr 176px 88px 108px 92px 40px';

  const body = (
    <React.Fragment>
      {state.forbidden ? (
        <div data-testid="admin-forbidden" style={{ padding: 40, fontSize: 15, color: theme.textMuted }}>
          관리자 권한이 필요합니다
        </div>
      ) : (
        <React.Fragment>
          {state.error && (
            <div style={{
              margin: '12px 26px 0', padding: '10px 14px', borderRadius: 10,
              background: theme.error + '18', border: `1px solid ${theme.error}44`,
              color: theme.error, fontSize: 13, fontWeight: 600,
              display: 'flex', alignItems: 'center', gap: 12,
            }}>
              <span style={{ flex: 1 }}>{state.error}</span>
              <button onClick={() => reload()} style={{
                padding: '6px 12px', borderRadius: 8, background: theme.error, color: '#fff',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
              }}>재시도</button>
            </div>
          )}

          {/* 헤더 + 카운트 */}
          <div style={{
            padding: '18px 26px 0', display: 'flex', alignItems: 'flex-end',
            justifyContent: 'space-between', flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
              <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>사용자</h1>
              {/* 보이는 행이 전부인지 아닌지를 화면이 말해 준다. 없으면 부분 목록인 줄 모른다. */}
              {!state.loading && (
                <span style={{ fontSize: 12.5, color: theme.textDim }}>
                  {state.users.length === state.total
                    ? `${state.total}명`
                    : `${state.total}명 중 ${state.users.length}명`}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: 7, paddingBottom: 4, alignItems: 'center' }}>
              {countChips.map((r) => {
                const n = state.counts[r.code] ?? 0;
                return (
                  <span key={r.code} data-testid={`count-${r.code}`} title={r.description || undefined} style={{
                    padding: '6px 13px', borderRadius: 9, background: theme.surface,
                    border: `1px solid ${theme.border}`, fontSize: 12, color: theme.textMuted,
                    // 0 은 숨기는 대신 흐리게만 둔다 — 있는데 비었다는 것과 아예 없는 등급은 다르다.
                    opacity: n > 0 ? 1 : 0.55,
                  }}>
                    {r.code} <b style={{ fontWeight: 700, color: roleColor(theme, r.code) }}>{n}</b>
                  </span>
                );
              })}
            </div>
          </div>

          {/* 필터 */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '15px 26px 13px', flexShrink: 0 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 9, background: theme.card,
              border: `1px solid ${theme.borderStrong}`, borderRadius: 10, padding: '8px 13px', width: 262,
            }}>
              <input
                data-testid="user-search"
                value={state.q}
                onChange={(e) => setState((p) => ({ ...p, q: e.target.value }))}
                placeholder="이메일 · 이름 검색"
                style={{
                  flex: 1, border: 'none', background: 'transparent', outline: 'none',
                  color: theme.text, fontSize: 12.5, fontFamily: 'inherit',
                }}
              />
            </div>
            {['', 'admin', 'reviewer', 'author', 'learner'].map((r) => {
              const active = state.roleFilter === r;
              const label = r || '전체';
              return (
                <button
                  key={label}
                  data-testid={r ? `filter-${r}` : 'filter-all'}
                  onClick={() => setState((p) => ({ ...p, roleFilter: r }))}
                  style={{
                    padding: '7px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, cursor: 'pointer',
                    background: active ? theme.accent + '22' : theme.chipBg,
                    border: `1px solid ${active ? theme.accent : theme.border}`,
                    color: active ? theme.accent : theme.textMuted,
                  }}
                >{label === '전체' ? '전체' : r}</button>
              );
            })}
            <button
              data-testid="user-create-open"
              onClick={() => { setCreateError(null); setCreateOpen(true); }}
              style={{
                marginLeft: 'auto',
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 700,
                background: theme.accent, color: '#fff', border: 'none', cursor: 'pointer',
                flexShrink: 0,
              }}
            ><Icons.Plus size={14} />사용자 추가</button>
          </div>

          {/* 표 — JinaTable(components/JinaTable.jsx) */}
          <JinaTable theme={theme}>
            <JinaTableHead theme={theme} columns={gridCols}>
              <span style={{ textAlign: 'right' }}>No.</span>
              <span>사용자</span><span>역할</span><span>가입</span><span>마지막 로그인</span><span>활성 세션</span><span />
            </JinaTableHead>
            {state.loading ? (
              <JinaTableSkeleton theme={theme} columns={gridCols} testId="users-skeleton" />
            ) : state.users.length === 0 ? (
              <JinaTableEmpty theme={theme} testId="users-empty">검색 결과가 없습니다</JinaTableEmpty>
            ) : (
              state.users.map((u, idx) => (
                <JinaTableRow
                  key={u.id}
                  theme={theme}
                  columns={gridCols}
                  testId="user-row"
                  style={{ background: u.is_self ? theme.accent + '0e' : 'transparent' }}
                >
                  {/* 화면 순번. u.id 가 아니다 — 검색·필터를 걸면 1부터 다시 센다. */}
                  <span style={{
                    fontSize: 12, color: theme.textDim, textAlign: 'right',
                    fontFamily: 'ui-monospace, Consolas, monospace',
                  }}>{idx + 1}</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 11, minWidth: 0 }}>
                    <span style={{
                      width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
                      display: 'grid', placeItems: 'center', fontSize: 12, fontWeight: 700, color: '#fff',
                      background: u.is_self ? theme.accentGrad : theme.chipBg,
                    }}>{(u.display_name || u.email)[0].toUpperCase()}</span>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {u.display_name || '(이름 없음)'}
                        </span>
                        {u.is_self && (
                          <span style={{
                            fontSize: 9, fontWeight: 800, padding: '2px 6px', borderRadius: 999,
                            background: theme.accent + '29', color: theme.accent,
                          }}>나</span>
                        )}
                      </div>
                      <div style={{
                        fontSize: 11.5, color: theme.textDim,
                        fontFamily: 'ui-monospace, Consolas, monospace',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>{u.email}</div>
                    </div>
                  </div>
                  <RoleSelect
                    theme={theme} user={u} roles={state.roles}
                    busy={rowBusy === u.id}
                    onChange={(to) => patchRole(u, to)}
                  />
                  <span style={{ fontSize: 12.5, color: theme.textMuted }}>{fmtDate(u.created_at)}</span>
                  <span style={{ fontSize: 12.5, color: theme.textMuted }}>{fmtDate(u.last_login_at)}</span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5,
                    color: u.active_sessions > 0 ? theme.textMuted : theme.textDim,
                  }}>
                    <span style={{
                      width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                      background: u.active_sessions > 0 ? theme.success : theme.textDim,
                    }} />
                    {u.active_sessions}
                  </span>
                  <UserRowMenu
                    theme={theme} user={u} busy={rowBusy === u.id}
                    onToggleActive={() => patchActive(u)}
                    onRevoke={() => revokeSessions(u)}
                  />
                </JinaTableRow>
              ))
            )}
            {/* 목록이 잘렸으면 그 사실을 말하고 이어 받게 한다 —
                없으면 limit(50)을 넘는 순간 51번째부터 화면에서 조용히 사라진다(리뷰 03 R4).
                페이지네이션은 만들지 않는다. 지금 규모(21명)에서는 누적 로드로 충분하다. */}
            {!state.loading && state.users.length > 0 && state.users.length < state.total && (
              <JinaTableFooter theme={theme}>
                {/* 몇 명 중 몇 명인지는 제목 옆 총계가 이미 말한다 — 여기서는 남은 수만 반복하지 않는다. */}
                <button
                  data-testid="users-load-more"
                  disabled={state.loadingMore}
                  onClick={loadMore}
                  style={{
                    padding: '7px 16px', borderRadius: 9, fontSize: 12.5, fontWeight: 700,
                    cursor: state.loadingMore ? 'wait' : 'pointer',
                    background: theme.chipBg, border: `1px solid ${theme.borderStrong}`,
                    color: theme.text,
                  }}
                >{state.loadingMore
                  ? '불러오는 중…'
                  : `${Math.min(PAGE_SIZE, state.total - state.users.length)}명 더 보기`}</button>
              </JinaTableFooter>
            )}
          </JinaTable>

          {/* 하단 */}
          <div style={{
            padding: '15px 26px 26px', display: 'flex', gap: 22, alignItems: 'flex-end', flexShrink: 0,
          }}>
            <div style={{ fontSize: 11.5, color: theme.textDim, lineHeight: 1.7, maxWidth: 520 }}>
              역할 변경은 <b style={{ color: theme.textMuted }}>다음 요청부터</b> 즉시 적용됩니다.
              마지막 <span style={{ color: theme.warning }}>admin</span> 강등·본인 강등은 차단됩니다.
            </div>
            {state.recent_audit?.length > 0 && (
              <div style={{
                marginLeft: 'auto', minWidth: 320, border: `1px dashed ${theme.borderStrong}`,
                borderRadius: 12, padding: '11px 15px', background: theme.card,
              }}>
                <div style={{
                  fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', color: theme.textDim,
                  textTransform: 'uppercase', marginBottom: 7,
                }}>최근 감사 로그</div>
                {state.recent_audit.map((a) => (
                  <div key={a.id} style={{
                    fontSize: 11.5, color: theme.textMuted,
                    fontFamily: 'ui-monospace, Consolas, monospace', lineHeight: 1.85,
                  }}>
                    <span style={{ color: theme.textDim }}>{String(a.created_at).slice(0, 19).replace('T', ' ')}</span>
                    {' '}{a.action} · <span title={a.target_email}>{shortEmail(a.target_email)}</span>
                    {a.from_role && a.to_role ? ` ${a.from_role}→${a.to_role}` : ''}
                  </div>
                ))}
              </div>
            )}
          </div>
        </React.Fragment>
      )}

      {toast && (
        <div style={{
          position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          padding: '10px 18px', borderRadius: 10, zIndex: 200,
          background: toast.isError ? theme.error : theme.success,
          color: '#fff', fontSize: 13, fontWeight: 600, boxShadow: theme.shadow,
        }}>{toast.msg}</div>
      )}

      <UserCreateModal
        theme={theme}
        roles={state.roles}
        open={createOpen}
        busy={createBusy}
        error={createError}
        onClose={() => { if (!createBusy) setCreateOpen(false); }}
        onSubmit={createUser}
      />
    </React.Fragment>
  );

  if (embedded) {
    return (
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {body}
      </div>
    );
  }

  return (
    // jina-root — tokens.jsx 가 주입하는 기본 스타일이 이 클래스에 스코프돼 있다.
    // 빠뜨리면 box-sizing: border-box · Pretendard 폰트 · 버튼 리셋이 관리 화면에만 적용되지 않는다.
    <div className="jina-root" style={{
      width: '100vw', height: '100vh', display: 'flex', flexDirection: 'column',
      background: theme.bg, color: theme.text,
    }}>
      {/* 스크롤바는 인라인 스타일로 못 만든다 — 테마 색을 넣은 규칙을 주입한다. */}
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
      {/* 상단바 — admin-app.jsx 가 없을 때만(단독 엔트리) */}
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
        <span style={{
          fontSize: 10, fontWeight: 800, letterSpacing: '0.07em', padding: '3px 9px', borderRadius: 999,
          background: theme.warning + '26', color: theme.warning, border: `1px solid ${theme.warning}52`,
        }}>ADMIN</span>
        {me && (
          <span style={{ marginLeft: 'auto', fontSize: 12.5, color: theme.textDim }}>
            {me.email} · role={me.role}
          </span>
        )}
      </nav>
      {body}
    </div>
  );
}

function AdminApp() {
  const { status, refresh } = useAuth();
  const themeName = readThemeName();
  const theme = JINA_THEMES[themeName] || JINA_THEMES.aurora;

  if (status === 'loading') {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'grid', placeItems: 'center', background: theme.bg }}>
        <span style={{ color: theme.textMuted, fontSize: 14 }}>로딩 중…</span>
      </div>
    );
  }
  if (status === 'offline') {
    return (
      <div style={{
        width: '100vw', height: '100vh', display: 'grid', placeItems: 'center',
        background: theme.bg, color: theme.text,
      }}>
        <button onClick={() => refresh()} style={{
          padding: '9px 20px', borderRadius: 8, background: theme.accent, color: '#fff', fontWeight: 700,
        }}>다시 시도</button>
      </div>
    );
  }
  return <AdminUsersScreen />;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <AuthProvider>
    <AdminApp />
  </AuthProvider>,
);
