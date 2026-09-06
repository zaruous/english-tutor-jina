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

function SkeletonRows({ theme, n = 3 }) {
  return (
    <div data-testid="users-skeleton">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{
          // 본 표(gridCols)와 컬럼 수가 같아야 스켈레톤이 어긋나 보이지 않는다.
          display: 'grid', gridTemplateColumns: '40px 1fr 176px 88px 108px 92px 40px',
          alignItems: 'center', gap: 14, padding: '0 18px', height: 62,
          borderTop: i ? `1px solid ${theme.border}` : 'none',
        }}>
          {[1, 2, 3, 4, 5, 6, 7].map((c) => (
            <div key={c} style={{
              height: 14, borderRadius: 6, background: theme.chipBg,
              animation: 'jina-pulse 1.2s infinite',
            }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// 열린 메뉴 닫기 — 바깥 클릭 · Esc · 리사이즈 · 스크롤.
// position:fixed 메뉴는 표가 스크롤돼도 따라오지 않으므로 어긋나 보이기 전에 닫는다.
// scroll 은 capture 로 들어야 내부 스크롤 컨테이너의 이벤트까지 잡힌다(버블링하지 않는다).
function useDismissMenu(open, setOpen, ref) {
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

// 열린 드롭다운의 화면 좌표. 아래 공간이 부족하면 위로 펼친다.
const MENU_MAX = 260;
function menuRect(el) {
  const r = el.getBoundingClientRect();
  const below = window.innerHeight - r.bottom - 8;
  const above = r.top - 8;
  const dropUp = below < Math.min(MENU_MAX, above);
  return {
    left: r.left,
    width: Math.max(r.width, 240),   // 역할 설명이 들어가므로 열 폭보다 넓게
    top: r.bottom + 4,
    bottom: window.innerHeight - r.top + 4,
    dropUp,
    maxHeight: Math.max(120, dropUp ? above : below),
  };
}

function RoleSelect({ theme, user, roles, onChange, busy }) {
  const [open, setOpen] = React.useState(false);
  const [menuPos, setMenuPos] = React.useState({ left: 0, width: 240, top: 0, bottom: 0, dropUp: false, maxHeight: MENU_MAX });
  const ref = React.useRef(null);
  const color = roleColor(theme, user.role);
  const meta = roles.find((r) => r.code === user.role);

  useDismissMenu(open, setOpen, ref);

  if (!user.can_change_role) {
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
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        data-testid="role-select"
        disabled={busy}
        onClick={(e) => {
          const next = !open;
          if (next) setMenuPos(menuRect(e.currentTarget));
          setOpen(next);
        }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, width: '100%',
          padding: '7px 11px', borderRadius: 10, cursor: busy ? 'wait' : 'pointer',
          border: `1px solid ${open ? theme.accent + '99' : theme.borderStrong}`,
          background: open ? theme.accent + '17' : 'transparent',
          fontSize: 12.5, fontWeight: 700, color,
        }}
      >
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ flex: 1, textAlign: 'left' }}>{meta?.name || user.role}</span>
        <span style={{ fontSize: 10, color: theme.textDim }}>{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div data-testid="role-dropdown" className="jina-scroll" style={{
          // position:absolute 는 표의 overflow:auto 컨테이너에 잘린다. fixed 는 뷰포트 기준이라
          // 클리핑을 벗어나므로 좌표를 버튼의 화면 위치에서 직접 계산한다(menuPos).
          position: 'fixed', zIndex: 200,
          left: menuPos.left, width: menuPos.width,
          ...(menuPos.dropUp ? { bottom: menuPos.bottom } : { top: menuPos.top }),
          background: theme.surfaceElev, border: `1px solid ${theme.borderStrong}`,
          borderRadius: 12, boxShadow: theme.shadow, padding: 6,
          maxHeight: menuPos.maxHeight, overflowY: 'auto',
        }}>
          {roles.map((r) => {
            const c = roleColor(theme, r.code);
            const cur = r.code === user.role;
            return (
              <button
                key={r.code}
                disabled={cur || busy}
                onClick={() => { setOpen(false); onChange(r.code); }}
                style={{
                  width: '100%', textAlign: 'left', padding: '9px 11px', borderRadius: 9,
                  display: 'flex', gap: 10, alignItems: 'flex-start', cursor: cur ? 'default' : 'pointer',
                  background: cur ? theme.chipBg : 'transparent', border: 'none', color: theme.text,
                }}
              >
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: c, marginTop: 5, flexShrink: 0 }} />
                <span style={{ minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: cur ? theme.accent : theme.text }}>
                    {r.name}{cur ? ' — 현재' : ''}
                  </span>
                  <span style={{ display: 'block', fontSize: 11, color: theme.textDim, lineHeight: 1.5, marginTop: 2 }}>
                    {r.description}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

function UserRowMenu({ theme, user, onToggleActive, onRevoke, busy }) {
  const [open, setOpen] = React.useState(false);
  const [menuPos, setMenuPos] = React.useState({ right: 0, top: 0, bottom: 0, dropUp: false });
  const ref = React.useRef(null);

  useDismissMenu(open, setOpen, ref);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        data-testid="user-kebab"
        onClick={(e) => {
          const next = !open;
          if (next) {
            const r = e.currentTarget.getBoundingClientRect();
            const below = window.innerHeight - r.bottom - 8;
            const dropUp = below < 120;
            setMenuPos({
              right: window.innerWidth - r.right,
              top: r.bottom + 4,
              bottom: window.innerHeight - r.top + 4,
              dropUp,
            });
          }
          setOpen(next);
        }}
        style={{
          width: 30, height: 30, borderRadius: 9, border: `1px solid ${theme.borderStrong}`,
          display: 'grid', placeItems: 'center', color: theme.textMuted, fontSize: 13, cursor: 'pointer',
          background: 'transparent',
        }}
      >⋯</button>
      {open && (
        <div data-testid="user-kebab-menu" style={{
          // RoleSelect 와 같은 이유로 fixed — 표의 overflow:auto 에 잘리지 않게.
          position: 'fixed', zIndex: 200, minWidth: 160, right: menuPos.right,
          ...(menuPos.dropUp ? { bottom: menuPos.bottom } : { top: menuPos.top }),
          background: theme.surfaceElev, border: `1px solid ${theme.borderStrong}`,
          borderRadius: 10, boxShadow: theme.shadow, padding: 4,
        }}>
          <button
            disabled={busy}
            onClick={() => { setOpen(false); onToggleActive(); }}
            style={{
              width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8,
              fontSize: 12.5, fontWeight: 600, color: theme.text, background: 'transparent', cursor: 'pointer',
            }}
          >{user.is_active ? '사용 중지' : '사용 재개'}</button>
          <button
            disabled={busy}
            onClick={() => { setOpen(false); onRevoke(); }}
            style={{
              width: '100%', textAlign: 'left', padding: '8px 12px', borderRadius: 8,
              fontSize: 12.5, fontWeight: 600, color: theme.text, background: 'transparent', cursor: 'pointer',
            }}
          >세션 모두 종료</button>
        </div>
      )}
    </div>
  );
}

function AdminUsersScreen({ theme }) {
  const [state, setState] = React.useState({
    loading: true, forbidden: false, error: null,
    users: [], total: 0, roles: [], counts: {}, recent_audit: [],
    q: '', roleFilter: '',
  });
  const [toast, setToast] = React.useState(null);
  const [rowBusy, setRowBusy] = React.useState(null);

  const showToast = (msg, isError = false) => {
    setToast({ msg, isError });
    setTimeout(() => setToast(null), 4000);
  };

  const load = React.useCallback(async (q, roleFilter) => {
    setState((p) => ({ ...p, loading: true, error: null, forbidden: false }));
    const qs = new URLSearchParams();
    if (q) qs.set('q', q);
    if (roleFilter) qs.set('role', roleFilter);
    const res = await window.JINA_API.get(`/api/admin/users${qs.toString() ? `?${qs}` : ''}`);
    if (res.ok) {
      setState((p) => ({
        ...p, loading: false,
        users: res.users, total: res.total, roles: res.roles,
        counts: res.counts, recent_audit: res.recent_audit || [],
      }));
    } else if (res.code === 'FORBIDDEN') {
      setState((p) => ({ ...p, loading: false, forbidden: true }));
    } else {
      setState((p) => ({
        ...p, loading: false,
        error: res.hint ? `${res.error} — ${res.hint}` : res.error,
      }));
    }
  }, []);

  React.useEffect(() => { load(state.q, state.roleFilter); }, [load, state.q, state.roleFilter]);

  const patchRole = async (target, to) => {
    setRowBusy(target.id);
    const res = await window.JINA_API.patch(`/api/admin/users/${target.id}/role`, { to });
    setRowBusy(null);
    if (res.ok) {
      setState((p) => ({
        ...p,
        users: p.users.map((u) => (u.id === target.id ? res.user : u)),
      }));
      load(state.q, state.roleFilter);
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
      load(state.q, state.roleFilter);
    } else {
      showToast(res.error || '상태 변경 실패', true);
    }
  };

  const revokeSessions = async (target) => {
    if (!window.confirm(`${target.display_name || target.email}의 모든 세션을 종료하시겠습니까?`)) return;
    setRowBusy(target.id);
    const res = await window.JINA_API.post(`/api/admin/users/${target.id}/sessions/revoke`, {});
    setRowBusy(null);
    if (res.ok) {
      showToast(`세션 ${res.revoked}개를 종료했습니다`);
      load(state.q, state.roleFilter);
    } else {
      showToast(res.error || '세션 종료 실패', true);
    }
  };

  const countChips = ['admin', 'reviewer', 'author', 'learner'].filter((c) => state.counts[c] > 0);

  // No. · 사용자 · 역할 · 가입 · 마지막 로그인 · 활성 세션 · ⋯
  const gridCols = '40px 1fr 176px 88px 108px 92px 40px';

  return (
    // 상단바·탭·테마는 셸(admin-app.jsx)이 담당한다 — 이 화면은 사용자 탭의 본문만 그린다.
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
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
              <button onClick={() => load(state.q, state.roleFilter)} style={{
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
            <div style={{ display: 'flex', gap: 7, paddingBottom: 4 }}>
              {countChips.map((c) => (
                <span key={c} style={{
                  padding: '6px 13px', borderRadius: 9, background: theme.surface,
                  border: `1px solid ${theme.border}`, fontSize: 12, color: theme.textMuted,
                }}>
                  {c} <b style={{ fontWeight: 700, color: roleColor(theme, c) }}>{state.counts[c]}</b>
                </span>
              ))}
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
          </div>

          {/* 표 */}
          <div className="jina-scroll" style={{
            margin: '0 26px', flex: 1, minHeight: 0, overflow: 'auto',
            border: `1px solid ${theme.border}`, borderRadius: 15, background: theme.surface,
          }}>
            <div style={{
              display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', gap: 14,
              padding: '0 18px', height: 40, background: theme.bgSoft,
              borderRadius: '14px 14px 0 0', fontSize: 10.5, color: theme.textDim,
              fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
              position: 'sticky', top: 0, zIndex: 1,
            }}>
              <span style={{ textAlign: 'right' }}>No.</span>
              <span>사용자</span><span>역할</span><span>가입</span><span>마지막 로그인</span><span>활성 세션</span><span />
            </div>
            {state.loading ? (
              <SkeletonRows theme={theme} />
            ) : state.users.length === 0 ? (
              <div data-testid="users-empty" style={{ padding: 40, textAlign: 'center', color: theme.textMuted, fontSize: 14 }}>
                검색 결과가 없습니다
              </div>
            ) : (
              state.users.map((u, idx) => (
                <div key={u.id} data-testid="user-row" style={{
                  display: 'grid', gridTemplateColumns: gridCols, alignItems: 'center', gap: 14,
                  padding: '0 18px', height: 62, borderTop: `1px solid ${theme.border}`,
                  background: u.is_self ? theme.accent + '0e' : 'transparent',
                }}>
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
                </div>
              ))
            )}
          </div>

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
    </div>
  );
}

// AdminApp(셸)과 root 마운트는 admin-app.jsx 로 이동했다 — admin.html 이 마지막에 로드한다.
