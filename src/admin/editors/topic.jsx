// editors/topic.jsx — 토픽 목록 · 새 토픽 · 구성(붙이기·순서·저장) 화면 (플랜 13 Phase B).
// 목업 시각 기준: docs/plan/mockups/13-topic-composer.html — CSS 는 복사하지 않고 theme.* 인라인.
//
// ── 이 화면이 하지 않는 것 ──────────────────────────────────────────────────
// - eligible 계산. 서버(topic.service topicDto)가 준 eligible 을 배지로만 그린다. 임계치를 여기 다시 적으면
//   규칙이 두 곳이 되고 서버가 값을 바꾼 날 화면이 거짓말을 한다 — 11 결정 3 은 "필터 → 배지" 였고
//   "계산을 화면으로" 가 아니다. 진행 막대의 분모는 서버가 thresholds 를 실어 줄 때만 그린다.
// - 붙일 콘텐츠의 상태 검사. 초안·검토 콘텐츠도 붙는다 — 구성은 상태와 무관하게 짜 두고 공개는 콘텐츠 각자의
//   전이로 간다(플랜 13 화면 미리보기). 대신 붙인 줄마다 상태 점을 같이 그려 섞여 있다는 사실이 보이게 한다.
// - 전이·가시성 판정. 버튼은 reviewer 이상에게만 그리되 허용 여부는 서버(assertTransition/assertSetVisibility)가
//   정하고 403/409 문구를 그대로 띄운다. 폼 값 검증도 서버 몫이다(slug 형식·제목 길이) — 400 문구를 그대로 보인다.
// - 드래그. 순서는 ▲▼ 로만 바꾼다. 목업의 "드래그로 순서 변경" 은 장식이고 v1 에 라이브러리를 들이지 않는다.
//
// ── 서버 계약 (api/routes/admin-topics.routes.js · api/services/admin-topic.service.js 기준) ─────────
//   GET    /api/admin/topics?q=&limit=&offset=  → { topics: [row…], total, statuses, thresholds: { lesson, scenario, vocab } }
//   GET    /api/admin/topics/:id                → { topic: row, contents: [{ content_id, position, type, slug, title, status, visibility, source }] }
//   POST   /api/admin/topics                    { slug?, label_ko, description? } → 201 { topic: row, contents: [] }
//                                                 slug 를 비우면 서버가 label 로 만든다(한글은 topic, topic-2 …).
//   PATCH  /api/admin/topics/:id                { label_ko?, description? }       → { topic: row }   **slug 는 받지 않는다**(URL 값)
//   PUT    /api/admin/topics/:id/contents       { contents: [{ content_id, position }] } → { topic: row, contents: […] }  일괄 교체·트랜잭션
//   POST   /api/admin/topics/:id/status         { to, note? }                     → { topic: row, audit_logged: false }
//   POST   /api/admin/topics/:id/visibility     { to }                            → { topic: row, audit_logged: false }
//   GET    /api/admin/contents?type=&q=&limit=  (플랜 11 그대로) → { contents: [{ id, type, title, slug, status, visibility, item_count }], total }
//   row = { id, slug, label_ko, description, status, visibility, created_at, updated_at, created_by_name, updated_by_name,
//           content_count, lesson_count, scenario_count, vocab_count, eligible }
//   - thresholds 는 **목록 응답**에만 실린다. 구성 화면으로 곧장 들어오면(새로고침) 목록을 limit=1 로 한 번 받아 채운다 —
//     임계치를 화면에 적지 않기 위한 왕복 하나다. 값은 스크립트 수명 동안 캐시한다(adminTopicThresholds).
//   - lesson_count/scenario_count/vocab_count 는 학습자에게 **보이는** 콘텐츠만 센다(discoverable). content_count 가 붙인 전체다 —
//     초안을 붙이면 둘이 어긋나고 화면은 그 차이를 "붙였지만 아직 학습자에게 안 보인다" 로 설명한다.
//   - audit_logged:false = 토픽 감사 테이블이 아직 없다. 안내 문구에 그대로 적는다 — 콘텐츠 전이와 같은 모양이라
//     "감사가 남았겠지" 로 읽히는 것을 막는다.
//   - 변경 응답에 topic/contents 가 빠지면 GET 으로 다시 맞춘다(방어).
//   - window.JINA_API 에는 put 이 없다(api-client.jsx 는 다른 그룹 파일) → fetch(path, { method: 'PUT' }) 로 보낸다.
//
// ── 이름 · 로드 순서 ─────────────────────────────────────────────────────────
// 최상위 이름은 전부 전역이다(content-store.jsx 머리말). 그래서 전부 AdminTopic/adminTopic/ADMIN_TOPIC_ 접두.
// content-store.jsx 의 상수·헬퍼(ADMIN_STATUS_META · ADMIN_CONTENT_TYPES · adminTypeLabel · adminTransitionsFor ·
// adminFmtDate)와 admin-app.jsx 의 헬퍼(useAdminDismiss · adminMenuRect · adminTint · AdminStatusBadge ·
// AdminVisibilityChip · AdminMenuRow)를 **렌더 시점에만** 참조한다 — 최상위에서 쓰면 이 파일이 그쪽보다 먼저
// 로드될 때 ReferenceError 로 스크립트가 통째로 죽는다. 첫 커밋은 모든 스크립트가 실행된 뒤라 렌더 시점 참조는
// admin.html 의 순서와 무관하게 안전하다.
//
// ── 라우팅 ──────────────────────────────────────────────────────────────────
// admin-app.jsx 의 해시 라우터(adminRouteFromHash)가 route 'topics' 에서 <AdminTopicComposer theme me topicId /> 를
// 그린다. 그 라우터는 #/topics 와 #/topics/<숫자> 만 알고 `topics/` 뒤에 숫자가 아닌 것이 오면 콘텐츠 목록으로
// 받는다(#/topics/new → { route:'topics', id:'new' }). 예전 초안은 ?id=new 를 썼는데 두 형식이 공존하면 헷갈려 하나로 통일했다. 라우터는 `?` 뒤를 잘라
// 'topics' 로 읽어 이 화면을 유지하고, id 는 이 파일이 해시에서 직접 읽는다(adminTopicUseHashId).
// 숫자 id 는 #/topics/:id 로 적어 라우터가 topicId prop 으로 넘겨준다. prop 이 있으면 prop, 없으면 해시 폴백 —
// 그래서 뒤로 가기도, 라우터가 id 를 안 넘겨도 화면이 움직인다.

const ADMIN_TOPIC_API = '/api/admin/topics';
const ADMIN_TOPIC_SEARCH_DELAY = 250;
// 붙이기 검색은 페이지네이션이 없다. 이 수를 넘으면 "N개 중 M개" 를 적고 검색어로 좁히게 한다.
const ADMIN_TOPIC_SEARCH_LIMIT = 30;
const ADMIN_TOPIC_MENU_WIDTH = 236;
// 목록 표 컬럼 — 상태 · 제목(slug·eligible) · 공개 · 구성(전체·레슨·회화·단어) · 수정일 · [구성 →]
const ADMIN_TOPIC_GRID = '92px minmax(0,1fr) 78px 250px 68px 90px';

// 유형 칩 색 — 목업 .ty.ls/.sc/.vs 를 theme 토큰으로 옮긴 것. 스피킹은 목업에 없어(Phase C 게이트) accent3 로 둔다.
const ADMIN_TOPIC_TYPE_TONE = { lesson: 'success', scenario: 'accent2', vocab_set: 'accent', speaking_set: 'accent3' };

// eligible 임계치 캐시 — 서버 목록 응답의 thresholds. 화면에 숫자를 적지 않으려고 서버 값을 기억해 둔다.
// 스크립트 수명 동안만 산다(새로고침이면 다시 받는다). 값이 없으면 막대 없이 수만 그린다.
let adminTopicThresholds = null;

function adminTopicRememberThresholds(res) {
  const th = res?.thresholds;
  if (th && typeof th === 'object') adminTopicThresholds = th;
  return adminTopicThresholds;
}

function adminTopicGoto(id) {
  if (id == null) window.location.hash = '#/topics';
  else if (id === 'new') window.location.hash = '#/topics/new';   // admin-app 라우터가 { route:'topics', id:'new' } 로 받는다
  else window.location.hash = `#/topics/${encodeURIComponent(String(id))}`;
}

// 화면을 넘어가며 보일 토스트 한 건. admin-app.jsx 는 nav.id 를 key 로 걸어 해시가 바뀌면 이 화면을 통째로 새로
// 마운트한다 — "만들었습니다" 를 그냥 띄우면 새 토픽 화면으로 넘어가는 순간 사라진다. 그래서 여기 맡겨 두고
// 다음 화면(id 가 바뀐 뒤)이 집어 간다. 5초를 넘긴 것은 버린다 — 나중 방문에 낡은 토스트가 뜨면 안 된다.
let adminTopicPendingNotice = null;

function adminTopicHandoffNotice(msg, tone = 'ok') {
  adminTopicPendingNotice = { msg, tone, at: Date.now() };
}

function adminTopicTakeNotice() {
  const p = adminTopicPendingNotice;
  adminTopicPendingNotice = null;
  return p && Date.now() - p.at < 5000 ? p : null;
}

// prop 이든 해시든 셋 중 하나로 만든다: null(목록) · 'new' · 양의 정수.
function adminTopicNormalizeId(v) {
  if (v == null || v === '') return null;
  if (v === 'new') return 'new';
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

// #/topics/new · #/topics/12 · #/topics?id=12 세 형태를 받는다 — 라우터가 어느 쪽으로 적어도 깨지지 않게.
function adminTopicIdFromHash() {
  const raw = String(window.location.hash || '').replace(/^#\/?/, '');
  const [path, query = ''] = raw.split('?');
  const segs = path.split('/').filter(Boolean);
  if (segs[0] !== 'topics') return null;
  return adminTopicNormalizeId(segs[1] ?? new URLSearchParams(query).get('id'));
}

function adminTopicUseHashId() {
  const [id, setId] = React.useState(adminTopicIdFromHash);
  React.useEffect(() => {
    const onHash = () => setId(adminTopicIdFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  return id;
}

// PUT 은 api-client 에 없다. 봉투({ok, …})는 같다.
function adminTopicPut(path, body) {
  return window.JINA_API.fetch(path, { method: 'PUT', body });
}

// 실패 봉투 → 문구. 403/409 는 서버 문구 그대로 — 무엇이 부족한지(역할)·왜 안 되는지(상태)는 서버만 안다.
function adminTopicErrorText(res, fallback) {
  if (!res || res.ok) return '';
  if (res.hint) return `${res.error} — ${res.hint}`;
  return res.error || fallback;
}

function adminTopicIsForbidden(res) {
  return res?.code === 'FORBIDDEN' || res?.code === 'UNAUTHORIZED';
}

// 붙인 콘텐츠 행 정규화. 구성 응답은 content_id 로, 검색 응답(/api/admin/contents)은 id 로 준다 — 한 이름으로 받는다.
function adminTopicNormalizeContent(row) {
  const id = row?.content_id ?? row?.id;
  return { ...row, content_id: id == null ? null : Number(id) };
}

// 순서까지 포함한 지문. 저장된 것과 다르면 dirty.
function adminTopicIds(list) {
  return list.map((c) => c.content_id).join(',');
}

// adminMenuRect 는 메뉴를 버튼 **오른쪽 끝**에 맞춘다(표의 [▾] 가 맨 오른쪽 열이라서). 이 화면의 전이 버튼은
// 왼쪽 카드 안에 있어 같은 식이면 메뉴가 화면 왼쪽 밖으로 나간다 → 세로 계산은 그대로 쓰고 가로만 버튼 왼쪽에 맞춘다.
function adminTopicMenuRect(el, width) {
  const rect = adminMenuRect(el, width);
  const r = el.getBoundingClientRect();
  return { ...rect, left: Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) };
}

function adminTopicBtn(theme, kind = 'ghost', disabled = false) {
  const base = {
    display: 'inline-flex', alignItems: 'center', gap: 6,
    padding: '8px 14px', borderRadius: 9, fontSize: 12.5, fontWeight: 700,
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.5 : 1,
  };
  if (kind === 'primary') return { ...base, background: theme.accent, color: '#fff', border: `1px solid ${theme.accent}` };
  return { ...base, background: theme.chipBg, color: theme.text, border: `1px solid ${theme.borderStrong}` };
}

// ▲▼✕ 같은 한 글자 버튼.
function adminTopicIconBtn(theme, disabled, tone) {
  return {
    width: 26, height: 26, borderRadius: 7, display: 'grid', placeItems: 'center', flexShrink: 0,
    background: 'transparent', border: `1px solid ${theme.border}`,
    color: disabled ? theme.textDim : (tone || theme.textMuted),
    cursor: disabled ? 'not-allowed' : 'pointer', opacity: disabled ? 0.4 : 1, fontSize: 11,
  };
}

function adminTopicInput(theme, extra) {
  return {
    display: 'block', width: '100%', background: theme.card, border: `1px solid ${theme.borderStrong}`,
    borderRadius: 10, padding: '9px 12px', fontSize: 13, color: theme.text, fontFamily: 'inherit', outline: 'none',
    ...extra,
  };
}

// 성공은 짧게, 실패는 길게 — 409/403 문구는 읽고 다음 행동을 정해야 하는 정보다(content-store 의 showNotice 와 같은 규약).
function adminTopicUseNotice() {
  const [notice, setNotice] = React.useState(null);
  const timer = React.useRef(null);
  React.useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const show = React.useCallback((msg, tone = 'ok') => {
    if (timer.current) clearTimeout(timer.current);
    setNotice({ msg, tone });
    timer.current = setTimeout(() => setNotice(null), tone === 'ok' ? 3500 : 7000);
  }, []);
  const dismiss = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setNotice(null);
  }, []);
  return { notice, show, dismiss };
}

function AdminTopicNotice({ theme, notice, onDismiss }) {
  if (!notice) return null;
  const isError = notice.tone === 'error';
  return (
    <div data-testid="topic-notice" data-tone={notice.tone} onClick={onDismiss} style={{
      position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)',
      maxWidth: 'min(720px, calc(100vw - 48px))', padding: '10px 18px', borderRadius: 10, zIndex: 400,
      cursor: 'pointer', background: isError ? theme.error : theme.success, color: '#fff',
      fontSize: 13, fontWeight: 600, boxShadow: theme.shadow,
    }}>{notice.msg}</div>
  );
}

// hover·focus·반응형은 인라인으로 못 쓴다 — 테마 색을 넣은 규칙을 주입한다(AdminScrollStyle 과 같은 방식).
function AdminTopicStyle({ theme }) {
  return (
    <style>{`
      .admin-topic-row:hover, .admin-topic-res:hover { background: ${theme.cardHover}; }
      .admin-topic-input:focus { border-color: ${theme.accent} !important; }
      @media (max-width: 900px) {
        .admin-topic-layout { grid-template-columns: 1fr !important; overflow: auto !important; }
        .admin-topic-layout > * { overflow: visible !important; min-height: auto !important; }
      }
    `}</style>
  );
}

function AdminTopicMessage({ theme, testid, tone = 'muted', children, onRetry }) {
  const color = tone === 'error' ? theme.error : theme.textMuted;
  return (
    <div data-testid={testid} style={{ padding: '48px 40px', textAlign: 'center', color, fontSize: 14, lineHeight: 1.8 }}>
      <div>{children}</div>
      {onRetry && (
        <button data-testid={`${testid}-retry`} onClick={onRetry} style={{ ...adminTopicBtn(theme), marginTop: 14 }}>
          <Icons.Refresh size={13} /> 다시 시도
        </button>
      )}
    </div>
  );
}

function AdminTopicSkeleton({ theme, n = 4, grid }) {
  const cols = grid ? grid.split(' ').length : 3;
  return (
    <div data-testid="topic-skeleton">
      {Array.from({ length: n }, (_, i) => (
        <div key={i} style={{
          display: 'grid', gridTemplateColumns: grid || '1fr 1fr 1fr', alignItems: 'center', gap: 14,
          padding: '0 18px', height: 57, borderTop: i ? `1px solid ${theme.border}` : 'none',
        }}>
          {Array.from({ length: cols }, (__, c) => (
            <div key={c} style={{ height: 13, borderRadius: 6, background: theme.chipBg, animation: 'jina-pulse 1.2s infinite' }} />
          ))}
        </div>
      ))}
    </div>
  );
}

// 유형 칩(리스닝·회화·단어). lesson 은 kind 가 오면 더 좁게 적는다(adminTypeLabel).
function AdminTopicTypeChip({ theme, item }) {
  const color = theme[ADMIN_TOPIC_TYPE_TONE[item?.type]] || theme.textMuted;
  return (
    <span style={{
      flexShrink: 0, fontSize: 9.5, fontWeight: 800, letterSpacing: '0.05em', padding: '3px 8px', borderRadius: 999,
      background: adminTint(color, '24', theme.chipBg), color,
    }}>{adminTypeLabel(item)}</span>
  );
}

// 작은 상태 표시 — 붙인 콘텐츠·검색 결과 줄에 들어간다. AdminStatusBadge 는 표 행 크기라 여기엔 크다.
// 점 규약은 ADMIN_STATUS_META 를 그대로 따른다(초안 = 빈 원, 나머지 = 채운 원).
function AdminTopicStatusDot({ theme, status }) {
  const meta = ADMIN_STATUS_META[status] || { label: status || '—', tone: 'textMuted', dot: 'ring' };
  const color = theme[meta.tone] || theme.textMuted;
  return (
    <span data-status={status} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11, color, flexShrink: 0 }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        ...(meta.dot === 'ring' ? { border: `1.5px solid ${color}` } : { background: color }),
      }} />
      {meta.label}
    </span>
  );
}

// eligible 배지 — 서버 값만 쓴다. 미달일 때만 그린다(충족은 배지가 아니라 기본 상태다). 숨기지 않는다(11 결정 3).
function AdminTopicEligibleBadge({ theme, topic }) {
  if (topic?.eligible !== false) return null;
  return (
    <span data-testid="topic-eligible-badge" title="토픽 구성 임계치 미달(서버 판정) — 저작·공개는 막지 않는다. 학습 앱 노출은 status 만 본다." style={{
      flexShrink: 0, fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999,
      background: adminTint(theme.warning, '22', theme.chipBg), color: theme.warning,
      border: `1px solid ${adminTint(theme.warning, '47', theme.border)}`,
    }}>eligible 미달</span>
  );
}

// 구성 요약. content_count(붙인 전체)와 유형별 집계(학습자에게 보이는 것만)는 다른 수다 — 둘을 같이 적어
// "3개 붙였는데 레슨 1" 이 초안이 섞였다는 뜻으로 읽히게 한다.
function AdminTopicCounts({ theme, topic }) {
  const dot = <span style={{ color: theme.textDim }}> · </span>;
  return (
    <span title="전체 = 붙인 콘텐츠 수. 레슨·회화·단어 = 그중 학습자에게 보이는 것만 센다." style={{
      fontSize: 12, color: theme.textMuted, fontFamily: 'ui-monospace, Consolas, monospace', whiteSpace: 'nowrap',
    }}>
      {Number.isFinite(topic.content_count) && <React.Fragment><b style={{ fontWeight: 800 }}>{topic.content_count}</b>개{dot}</React.Fragment>}
      레슨 {topic.lesson_count ?? '—'}{dot}회화 {topic.scenario_count ?? '—'}{dot}단어 {topic.vocab_count ?? '—'}
    </span>
  );
}

function AdminTopicField({ theme, label, hint, children }) {
  return (
    <div style={{ marginBottom: 12 }}>
      <span style={{
        display: 'block', fontSize: 10, fontWeight: 800, letterSpacing: '0.06em',
        color: theme.textDim, textTransform: 'uppercase', marginBottom: 5,
      }}>{label}</span>
      {children}
      {hint && <div style={{ fontSize: 11, color: theme.textDim, marginTop: 5, lineHeight: 1.5 }}>{hint}</div>}
    </div>
  );
}

// ── 목록 ────────────────────────────────────────────────────────────────────

function AdminTopicList({ theme, me, onOpen, onNew }) {
  const [state, setState] = React.useState({ loading: true, topics: [], total: 0, error: null, forbidden: false });
  const [query, setQuery] = React.useState('');
  const seq = React.useRef(0);

  const load = React.useCallback(async () => {
    const my = ++seq.current;
    setState((p) => ({ ...p, loading: true, error: null, forbidden: false }));
    // limit 상한 200 — 토픽은 수십 개 규모라 한 번에 받고 화면에서 거른다. 넘치면 total 과 어긋나는 것을 표에서 말한다.
    const res = await window.JINA_API.get(`${ADMIN_TOPIC_API}?limit=200`);
    if (my !== seq.current) return;
    if (res.ok) {
      adminTopicRememberThresholds(res);
      const topics = Array.isArray(res.topics) ? res.topics : [];
      setState({
        loading: false, topics, error: null, forbidden: false,
        total: Number.isFinite(res.total) ? res.total : topics.length,
      });
    } else if (adminTopicIsForbidden(res)) {
      setState({ loading: false, topics: [], error: null, forbidden: true });
    } else {
      setState({ loading: false, topics: [], error: adminTopicErrorText(res, '토픽 목록을 불러오지 못했습니다.'), forbidden: false });
    }
  }, []);
  React.useEffect(() => { load(); return () => { seq.current += 1; }; }, [load]);

  // 토픽은 수십 개 규모라 서버 왕복 없이 화면에서 거른다 — 제목·slug.
  const q = query.trim().toLowerCase();
  const shown = q
    ? state.topics.filter((t) => String(t.label_ko || '').toLowerCase().includes(q) || String(t.slug || '').toLowerCase().includes(q))
    : state.topics;

  return (
    <React.Fragment>
      <div style={{
        padding: '16px 26px 0', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexShrink: 0,
      }}>
        <div style={{ display: 'flex', alignItems: 'baseline', gap: 10 }}>
          <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800 }}>토픽</h1>
          {!state.loading && !state.error && !state.forbidden && (
            <span data-testid="topic-total" style={{ fontSize: 12.5, color: theme.textDim }}>
              {shown.length === state.topics.length ? `${state.topics.length}개` : `${state.topics.length}개 중 ${shown.length}개`}
              {state.total > state.topics.length && ` (서버 전체 ${state.total}개 — 앞 ${state.topics.length}개만 받았다)`}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: theme.textDim, paddingBottom: 4, textAlign: 'right', lineHeight: 1.6 }}>
          eligible 미달은 <b style={{ color: theme.textMuted }}>경고 배지</b>일 뿐 숨기지 않는다 —
          노출은 status 가 정한다(11 결정 3)
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '14px 26px 13px', flexShrink: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 9, background: theme.card,
          border: `1px solid ${theme.borderStrong}`, borderRadius: 10, padding: '8px 13px', width: 262,
        }}>
          <Icons.Search size={15} style={{ color: theme.textDim, flexShrink: 0 }} />
          <input
            data-testid="topic-search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="제목 · slug 검색"
            style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', color: theme.text, fontSize: 12.5, fontFamily: 'inherit' }}
          />
        </div>
        <button type="button" data-testid="topic-refresh" disabled={state.loading} onClick={load} style={adminTopicBtn(theme, 'ghost', state.loading)}>
          <Icons.Refresh size={13} /> 새로고침
        </button>
        <button type="button" data-testid="topic-new" onClick={onNew} style={{ ...adminTopicBtn(theme, 'primary'), marginLeft: 'auto' }}>
          <Icons.Plus size={14} /> 새 토픽
        </button>
      </div>

      <div data-testid="topic-list" className="jina-scroll" style={{
        margin: '0 26px', flex: 1, minHeight: 0, overflow: 'auto',
        border: `1px solid ${theme.border}`, borderRadius: 15, background: theme.surface,
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: ADMIN_TOPIC_GRID, alignItems: 'center', gap: 14,
          padding: '0 18px', height: 40, background: theme.bgSoft, borderRadius: '14px 14px 0 0',
          fontSize: 10.5, color: theme.textDim, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase',
          position: 'sticky', top: 0, zIndex: 1,
        }}>
          <span>상태</span><span>제목</span><span>공개</span><span>구성</span><span>수정일</span><span />
        </div>

        {state.forbidden ? (
          <AdminTopicMessage theme={theme} testid="topic-forbidden">권한이 없습니다 — 토픽 관리는 author 이상만 열 수 있습니다.</AdminTopicMessage>
        ) : state.error ? (
          <AdminTopicMessage theme={theme} testid="topic-error" tone="error" onRetry={load}>{state.error}</AdminTopicMessage>
        ) : state.loading ? (
          <AdminTopicSkeleton theme={theme} grid={ADMIN_TOPIC_GRID} />
        ) : shown.length === 0 ? (
          <AdminTopicMessage theme={theme} testid="topic-empty">
            {state.topics.length === 0 ? '토픽이 없습니다 — [새 토픽]으로 시작하세요.' : '검색어에 맞는 토픽이 없습니다.'}
          </AdminTopicMessage>
        ) : shown.map((t) => (
          <div
            key={t.id}
            data-testid="topic-row"
            data-topic-id={t.id}
            className="admin-topic-row"
            onClick={() => onOpen(t)}
            style={{
              display: 'grid', gridTemplateColumns: ADMIN_TOPIC_GRID, alignItems: 'center', gap: 14,
              padding: '0 18px', height: 57, borderTop: `1px solid ${theme.border}`, cursor: 'pointer',
            }}
          >
            <AdminStatusBadge theme={theme} status={t.status} />
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, minWidth: 0 }}>
              <span title={t.label_ko} style={{
                fontSize: 14, fontWeight: 600, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{t.label_ko}</span>
              <span style={{ fontSize: 11, color: theme.textDim, fontFamily: 'ui-monospace, Consolas, monospace', flexShrink: 0 }}>{t.slug}</span>
              <AdminTopicEligibleBadge theme={theme} topic={t} />
            </div>
            <span data-visibility={t.visibility} style={{
              justifySelf: 'start', padding: '4px 10px', borderRadius: 999, fontSize: 11.5, fontWeight: 700,
              color: t.visibility === 'public' ? theme.accent : theme.textMuted,
              background: t.visibility === 'public' ? adminTint(theme.accent, '14', theme.chipBg) : 'transparent',
              border: `1px solid ${t.visibility === 'public' ? adminTint(theme.accent, '55', theme.borderStrong) : theme.border}`,
            }}>{t.visibility === 'public' ? '공개' : '비공개'}</span>
            <AdminTopicCounts theme={theme} topic={t} />
            <span style={{ fontSize: 12.5, color: theme.textDim }}>{adminFmtDate(t.updated_at)}</span>
            <button
              type="button"
              data-testid="topic-open"
              onClick={(e) => { e.stopPropagation(); onOpen(t); }}
              style={{ ...adminTopicBtn(theme), padding: '6px 10px', fontSize: 12, justifySelf: 'end' }}
            >구성 <Icons.ArrowRight size={12} /></button>
          </div>
        ))}
      </div>

      <div style={{ padding: '14px 26px 24px', fontSize: 11.5, color: theme.textDim, lineHeight: 1.75, maxWidth: 900, flexShrink: 0 }}>
        토픽의 status·visibility 는 콘텐츠와 <b style={{ color: theme.textMuted }}>같은 4상태 축·같은 전이표</b>를 쓴다.
        전이·공개는 구성 화면에서 reviewer 이상이 한다. 구성(어떤 콘텐츠가 어떤 순서로)은 상태와 무관하게 언제든 고칠 수 있다.
      </div>
    </React.Fragment>
  );
}

// ── 구성 화면 ────────────────────────────────────────────────────────────────

// 전이 드롭다운. 목록 표의 [▾](AdminRowMenu) 와 같은 규약 — fixed + getBoundingClientRect + useAdminDismiss.
// 역할이 모자란 항목도 지우지 않고 흐리게 남긴다(content-store adminTransitionsFor 주석). 판정은 서버.
function AdminTopicTransitionMenu({ theme, topic, me, busy, onTransition }) {
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState({ left: 0, width: ADMIN_TOPIC_MENU_WIDTH, top: 0, bottom: 0, dropUp: false, maxHeight: 280 });
  const ref = React.useRef(null);
  useAdminDismiss(open, setOpen, ref);
  const rows = adminTransitionsFor(topic, me);
  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        type="button"
        data-testid="topic-transition"
        disabled={busy}
        onClick={(e) => {
          const next = !open;
          if (next) setPos(adminTopicMenuRect(e.currentTarget, ADMIN_TOPIC_MENU_WIDTH));
          setOpen(next);
        }}
        style={{
          ...adminTopicBtn(theme, 'ghost', busy), padding: '5px 10px', fontSize: 11.5,
          border: `1px solid ${open ? theme.accent : theme.borderStrong}`, color: open ? theme.accent : theme.text,
        }}
      >상태 전이 <Icons.ChevronDown size={13} /></button>
      {open && (
        <div data-testid="topic-transition-menu" className="jina-scroll" style={{
          position: 'fixed', zIndex: 200, left: pos.left, width: pos.width,
          ...(pos.dropUp ? { bottom: pos.bottom } : { top: pos.top }),
          background: theme.surfaceElev, border: `1px solid ${theme.borderStrong}`, borderRadius: 12,
          boxShadow: theme.shadow, padding: 6, maxHeight: pos.maxHeight, overflowY: 'auto',
        }}>
          {rows.length === 0 && (
            <div style={{ padding: '9px 12px', fontSize: 12, color: theme.textDim }}>이 상태에서 갈 수 있는 전이가 없습니다</div>
          )}
          {rows.map((t) => (
            <AdminMenuRow
              key={t.to}
              theme={theme}
              testid={`topic-transition-${t.to}`}
              icon={t.allowed ? t.icon : null}
              tone={t.to === 'archived' ? theme.error : t.to === 'published' ? theme.success : theme.text}
              label={t.label}
              tag={t.allowed ? null : `${t.minRole}+`}
              disabled={!t.allowed}
              onClick={() => { setOpen(false); onTransition(t.to); }}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// eligible 패널. 판정(eligible)은 서버 값이고, 막대 분모는 서버 thresholds 가 있을 때만 그린다 — 없으면 수만 적는다.
function AdminTopicEligiblePanel({ theme, topic, thresholds }) {
  const verdict = topic?.eligible === true ? 'ok' : topic?.eligible === false ? 'no' : 'unknown';
  const th = thresholds && typeof thresholds === 'object' ? thresholds : null;
  const color = verdict === 'ok' ? theme.success : verdict === 'no' ? theme.warning : theme.textMuted;
  const rows = [
    ['레슨', topic?.lesson_count, th?.lesson],
    ['회화', topic?.scenario_count, th?.scenario],
    ['단어', topic?.vocab_count, th?.vocab],
  ];
  return (
    <div data-testid="topic-eligible-panel" data-eligible={String(topic?.eligible)} style={{
      marginTop: 14, borderRadius: 12, padding: '13px 15px',
      background: adminTint(color, '12', theme.card), border: `1px solid ${adminTint(color, '47', theme.border)}`,
    }}>
      <div style={{ fontSize: 12, fontWeight: 700, color, marginBottom: 10 }}>
        {verdict === 'ok' ? '✓ eligible 충족'
          : verdict === 'no' ? '⚠ eligible 미달 — 경고일 뿐, 저작·공개는 막지 않는다'
            : '구성 현황 — 서버가 eligible 을 주지 않았다'}
      </div>
      {rows.map(([nm, v, max], i) => {
        const has = Number.isFinite(v);
        const hasMax = Number.isFinite(max) && max > 0;
        const full = hasMax && v >= max;
        return (
          <div key={nm} style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, marginBottom: i === rows.length - 1 ? 0 : 7 }}>
            <span style={{ color: theme.textMuted, width: 62, flexShrink: 0 }}>{nm}</span>
            <span style={{ flex: 1, height: 6, borderRadius: 999, background: theme.chipBg, overflow: 'hidden' }}>
              {hasMax && (
                <i style={{
                  display: 'block', height: '100%', borderRadius: 999,
                  width: `${Math.min(100, Math.round((v / max) * 100))}%`,
                  background: full ? theme.success : theme.warning,
                }} />
              )}
            </span>
            <span style={{
              width: 56, textAlign: 'right', fontSize: 11.5, fontWeight: 700, fontFamily: 'ui-monospace, Consolas, monospace',
              color: hasMax ? (full ? theme.success : theme.warning) : theme.textMuted,
            }}>{has ? (hasMax ? `${v} / ${max}` : v) : '—'}</span>
          </div>
        );
      })}
      <div style={{ marginTop: 9, fontSize: 11, color: theme.textDim, lineHeight: 1.6 }}>
        {Number.isFinite(topic?.content_count) && (
          <React.Fragment>
            붙인 콘텐츠 <b style={{ color: theme.textMuted }}>{topic.content_count}개</b> 중
            학습자에게 <b style={{ color: theme.textMuted }}>보이는 것만</b> 센다 — 초안·검토·비공개는 붙어 있어도 집계에 안 든다.{' '}
          </React.Fragment>
        )}
        예전에는 이 임계치가 <b style={{ color: theme.textMuted }}>목록 필터</b>였다 — 채우기 전까지 토픽이 사라져 저작이 막혔다.
        지금은 노출을 <b style={{ color: theme.textMuted }}>status</b> 가 정하고 임계치는 배지로만 쓴다(11 결정 3).
        수치는 저장된 구성 기준이다 — 저장 전 변경은 반영되지 않는다.
      </div>
    </div>
  );
}

function AdminTopicContentRow({ theme, item, index, count, disabled, onMove, onRemove }) {
  const first = index === 0;
  const last = index === count - 1;
  return (
    <div data-testid="topic-content-row" data-content-id={item.content_id} data-position={index + 1} style={{
      display: 'flex', alignItems: 'center', gap: 11, padding: '10px 13px', marginBottom: 8,
      border: `1px solid ${theme.border}`, borderRadius: 12, background: theme.card,
    }}>
      <span style={{
        width: 20, height: 20, borderRadius: 6, background: theme.chipBg, display: 'grid', placeItems: 'center',
        fontSize: 10.5, fontWeight: 800, color: theme.textDim, flexShrink: 0,
      }}>{index + 1}</span>
      <AdminTopicTypeChip theme={theme} item={item} />
      <span title={item.title} style={{
        fontSize: 13, fontWeight: 600, flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{item.title || `#${item.content_id}`}</span>
      <AdminTopicStatusDot theme={theme} status={item.status} />
      <button type="button" data-testid="topic-move-up" title="위로" disabled={disabled || first}
        onClick={() => onMove(index, -1)} style={adminTopicIconBtn(theme, disabled || first)}>▲</button>
      <button type="button" data-testid="topic-move-down" title="아래로" disabled={disabled || last}
        onClick={() => onMove(index, 1)} style={adminTopicIconBtn(theme, disabled || last)}>▼</button>
      <button type="button" data-testid="topic-remove" title="구성에서 빼기(저장 전까지는 화면에서만)" disabled={disabled}
        onClick={() => onRemove(index)} style={adminTopicIconBtn(theme, disabled, theme.error)}><Icons.X size={12} /></button>
    </div>
  );
}

// 붙이기 검색 — 플랜 11 의 GET /api/admin/contents 를 그대로 쓴다(관리 목록이라 draft·review 도 온다).
// type 은 content_items.type 4종만 서버가 받는다('topic' 은 400) — 칩에서 빼 둔다.
// disabled = 토픽이 아직 없다(검색 자체를 안 한다). busy = 저장 중이라 버튼만 잠근다 — busy 를 검색 조건에 섞으면
// 저장마다 검색이 다시 나간다.
function AdminTopicSearch({ theme, attachedIds, disabled, busy, onAdd }) {
  const [type, setType] = React.useState('');
  const [query, setQuery] = React.useState('');
  const [q, setQ] = React.useState('');
  const [state, setState] = React.useState({ loading: false, rows: [], total: 0, error: null });
  const seq = React.useRef(0);

  React.useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), ADMIN_TOPIC_SEARCH_DELAY);
    return () => clearTimeout(t);
  }, [query]);

  React.useEffect(() => {
    if (disabled) return undefined;
    const my = ++seq.current;
    setState((p) => ({ ...p, loading: true, error: null }));
    const qs = new URLSearchParams();
    if (type) qs.set('type', type);
    if (q) qs.set('q', q);
    qs.set('limit', String(ADMIN_TOPIC_SEARCH_LIMIT));
    window.JINA_API.get(`/api/admin/contents?${qs}`).then((res) => {
      if (my !== seq.current) return;
      if (res.ok) {
        const rows = Array.isArray(res.contents) ? res.contents : [];
        setState({ loading: false, rows, total: Number.isFinite(res.total) ? res.total : rows.length, error: null });
      } else {
        setState({ loading: false, rows: [], total: 0, error: adminTopicErrorText(res, '콘텐츠를 검색하지 못했습니다.') });
      }
    });
    return () => { seq.current += 1; };
  }, [type, q, disabled]);

  const types = ADMIN_CONTENT_TYPES.filter((t) => t.key !== 'topic');

  return (
    <div data-testid="topic-search-panel" style={{ marginTop: 15, paddingTop: 14, borderTop: `1px solid ${theme.border}` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 12 }}>
        <span style={{ fontSize: 13.5, fontWeight: 700 }}>콘텐츠 붙이기</span>
        <span style={{ fontSize: 11, color: theme.textDim }}>상태 무관 — 초안·검토도 붙는다. 공개는 콘텐츠 각자의 전이로.</span>
      </div>
      <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginBottom: 10 }}>
        {types.map((t) => {
          const active = type === t.key;
          return (
            <button key={t.key || 'all'} type="button" data-testid={`topic-search-type-${t.key || 'all'}`} disabled={disabled}
              onClick={() => setType(t.key)} style={{
                padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: disabled ? 'not-allowed' : 'pointer',
                background: active ? adminTint(theme.accent, '22', theme.chipBg) : theme.chipBg,
                border: `1px solid ${active ? theme.accent : theme.border}`,
                color: active ? theme.accent : theme.textMuted,
              }}>{t.label}</button>
          );
        })}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 9, background: theme.card,
        border: `1px solid ${theme.borderStrong}`, borderRadius: 10, padding: '8px 13px', marginBottom: 10,
      }}>
        <Icons.Search size={14} style={{ color: theme.textDim, flexShrink: 0 }} />
        <input
          data-testid="topic-search-q"
          value={query}
          disabled={disabled}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="제목 · slug 검색"
          style={{ flex: 1, minWidth: 0, border: 'none', background: 'transparent', outline: 'none', color: theme.text, fontSize: 13, fontFamily: 'inherit' }}
        />
        {state.total > state.rows.length && (
          <span style={{ fontSize: 10.5, color: theme.textDim, border: `1px solid ${theme.border}`, padding: '2px 7px', borderRadius: 6 }}>
            {state.total}개 중 {state.rows.length} — 검색어로 좁히세요
          </span>
        )}
      </div>

      {state.error && (
        <div data-testid="topic-search-error" style={{ padding: '8px 12px', borderRadius: 9, fontSize: 12, color: theme.error, background: adminTint(theme.error, '18', theme.chipBg) }}>
          {state.error}
        </div>
      )}
      {disabled && (
        <div style={{ padding: '12px 13px', fontSize: 12, color: theme.textDim }}>토픽을 먼저 만들면 검색이 열린다.</div>
      )}
      {!disabled && state.loading && state.rows.length === 0 && (
        <div style={{ padding: '12px 13px', fontSize: 12, color: theme.textDim }}>검색 중…</div>
      )}
      {!disabled && !state.loading && !state.error && state.rows.length === 0 && (
        <div data-testid="topic-search-empty" style={{ padding: '12px 13px', fontSize: 12, color: theme.textDim }}>조건에 맞는 콘텐츠가 없습니다</div>
      )}
      <div style={{ opacity: state.loading ? 0.6 : 1 }}>
        {state.rows.map((r) => {
          const already = attachedIds.has(Number(r.id));
          return (
            <div key={`${r.type}:${r.id}`} data-testid="topic-search-row" data-content-id={r.id} className="admin-topic-res" style={{
              display: 'flex', alignItems: 'center', gap: 11, padding: '9px 13px', borderRadius: 10,
            }}>
              <AdminTopicTypeChip theme={theme} item={r} />
              <span title={r.title} style={{
                fontSize: 12.5, flex: 1, minWidth: 0, color: theme.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              }}>{r.title}</span>
              <AdminTopicStatusDot theme={theme} status={r.status} />
              <button
                type="button"
                data-testid="topic-add"
                disabled={already || disabled || busy}
                onClick={() => onAdd(r)}
                style={{
                  flexShrink: 0, fontSize: 11, fontWeight: 700, padding: '4px 10px', borderRadius: 8,
                  color: already ? theme.textDim : theme.accent, background: 'transparent',
                  border: `1px solid ${already ? theme.border : adminTint(theme.accent, '66', theme.borderStrong)}`,
                  cursor: already || disabled || busy ? 'not-allowed' : 'pointer', opacity: already ? 0.6 : 1,
                }}
              >{already ? '붙어 있음' : '+ 붙이기'}</button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AdminTopicEditor({ theme, me, topicId, onBack, onCreated, notify }) {
  const isNew = topicId === 'new';
  const idPath = `${ADMIN_TOPIC_API}/${encodeURIComponent(String(topicId))}`;
  const canReview = Boolean(me?.can_review);

  const [state, setState] = React.useState({ loading: !isNew, error: null, forbidden: false, topic: null });
  const [form, setForm] = React.useState({ label_ko: '', slug: '', description: '' });
  const [attached, setAttached] = React.useState([]);
  const [savedIds, setSavedIds] = React.useState('');
  // 진행 중인 조작 하나. 화면 전체를 잠근다 — 구성 저장 중에 전이를 누르면 어느 응답이 먼저 오든 화면이 어긋난다.
  const [busy, setBusy] = React.useState(null);
  const [metaErrors, setMetaErrors] = React.useState([]);
  // 임계치는 목록 응답에만 실린다. 목록을 거쳐 왔으면 캐시가 있고, 새로고침으로 곧장 들어왔으면 아래 effect 가 한 번 받는다.
  const [thresholds, setThresholds] = React.useState(adminTopicThresholds);
  const seq = React.useRef(0);

  React.useEffect(() => {
    if (isNew || thresholds) return undefined;
    let alive = true;
    window.JINA_API.get(`${ADMIN_TOPIC_API}?limit=1`).then((res) => {
      // 실패해도 화면은 산다 — 막대 없이 수만 그린다.
      if (alive && res.ok) setThresholds(adminTopicRememberThresholds(res));
    });
    return () => { alive = false; };
  }, [isNew, thresholds]);

  const dirty = adminTopicIds(attached) !== savedIds;
  const dirtyRef = React.useRef(dirty);
  dirtyRef.current = dirty;

  const applyTopic = React.useCallback((topic) => {
    setState({ loading: false, error: null, forbidden: false, topic });
    setForm({ label_ko: topic.label_ko || '', slug: topic.slug || '', description: topic.description || '' });
  }, []);

  const applyContents = React.useCallback((rows) => {
    const list = rows.map(adminTopicNormalizeContent).filter((c) => c.content_id != null);
    setAttached(list);
    setSavedIds(adminTopicIds(list));
  }, []);

  // quiet = 스켈레톤으로 갈아엎지 않는다(조작 뒤 새로고침). 저장 전 구성 변경이 있으면 그 목록은 건드리지 않는다 —
  // 전이 한 번에 방금 옮긴 순서가 서버 값으로 되돌아가면 사용자는 작업을 잃은 것으로 읽는다.
  const load = React.useCallback(async ({ quiet = false } = {}) => {
    if (isNew) return;
    const my = ++seq.current;
    setState((p) => ({ ...p, loading: quiet ? p.loading : true, error: null, forbidden: false }));
    const res = await window.JINA_API.get(idPath);
    if (my !== seq.current) return;
    if (res.ok && res.topic) {
      applyTopic(res.topic);
      const rows = Array.isArray(res.contents) ? res.contents : Array.isArray(res.topic.contents) ? res.topic.contents : [];
      if (!dirtyRef.current) applyContents(rows);
    } else if (adminTopicIsForbidden(res)) {
      setState({ loading: false, error: null, forbidden: true, topic: null });
    } else {
      // ok 인데 topic 이 없는 응답도 여기로 — 빈 topic 으로 폼을 그리면 topic.id 에서 죽는다.
      const msg = res.ok ? '응답에 topic 이 없습니다 — 서버 계약(GET /api/admin/topics/:id → { topic, contents })을 확인하세요.'
        : adminTopicErrorText(res, '토픽을 불러오지 못했습니다.');
      setState({ loading: false, error: msg, forbidden: false, topic: null });
    }
  }, [isNew, idPath, applyTopic, applyContents]);
  React.useEffect(() => { load(); return () => { seq.current += 1; }; }, [load]);

  const topic = state.topic;
  // slug 는 수정 대상이 아니다(PATCH 가 받지 않는다 — URL 에 박히는 값). 그래서 dirty 판정에서도 뺀다.
  const labelChanged = Boolean(topic) && form.label_ko.trim() !== (topic.label_ko || '');
  const descChanged = Boolean(topic) && form.description.trim() !== (topic.description || '');
  const metaDirty = isNew || !topic || labelChanged || descChanged;

  // 폼 저장 — 신규는 POST(status 는 서버가 draft/private 로 놓는다, 결정 1), 기존은 PATCH 로 **바뀐 필드만**.
  // 검증 문구(slug 형식·제목 길이·slug 중복 409)는 서버 것을 그대로 띄운다.
  const saveMeta = async () => {
    setBusy('meta');
    setMetaErrors([]);
    let res;
    if (isNew) {
      const body = { label_ko: form.label_ko.trim(), description: form.description.trim() };
      // 비운 slug 는 보내지 않는다 — 서버가 label 로 만든다(한글 제목은 topic, topic-2 …).
      if (form.slug.trim()) body.slug = form.slug.trim();
      res = await window.JINA_API.post(ADMIN_TOPIC_API, body);
    } else {
      const body = {};
      if (labelChanged) body.label_ko = form.label_ko.trim();
      if (descChanged) body.description = form.description.trim();
      res = await window.JINA_API.patch(idPath, body);
    }
    setBusy(null);
    if (res.ok) {
      if (isNew) {
        // 다음 화면(새 토픽의 구성 화면)이 띄운다 — 이 화면은 곧 언마운트된다(adminTopicHandoffNotice 주석).
        adminTopicHandoffNotice(`'${res.topic?.label_ko || form.label_ko.trim()}' 토픽을 초안으로 만들었습니다 — 이제 콘텐츠를 붙일 수 있습니다.`);
        onCreated(res.topic?.id);
        return;
      }
      notify('토픽 정보를 저장했습니다.');
      if (res.topic) applyTopic(res.topic); else load({ quiet: true });
      return;
    }
    const errs = Array.isArray(res.validation_errors) ? res.validation_errors.map(String) : [];
    setMetaErrors(errs.length ? errs : [adminTopicErrorText(res, '저장하지 못했습니다.')]);
  };

  // 구성 저장 — 순서까지 한 번에(PUT, 서버 트랜잭션). position 은 1부터, 화면 순서 그대로.
  const saveContents = async () => {
    setBusy('contents');
    const res = await adminTopicPut(`${idPath}/contents`, {
      contents: attached.map((c, i) => ({ content_id: c.content_id, position: i + 1 })),
    });
    setBusy(null);
    if (!res.ok) {
      notify(adminTopicErrorText(res, '구성을 저장하지 못했습니다.'), 'error');
      return;
    }
    notify(`구성을 저장했습니다 — ${attached.length}개`);
    if (Array.isArray(res.contents)) applyContents(res.contents); else setSavedIds(adminTopicIds(attached));
    // 카운트·eligible 은 저장된 구성으로 다시 계산돼야 한다.
    if (res.topic) applyTopic(res.topic); else load({ quiet: true });
  };

  // 전이·가시성. 판정은 서버 — 403(역할)·409(금지 전이·이미 그 값) 문구를 그대로 보인다.
  // audit_logged:false 는 토픽 감사 테이블이 아직 없다는 서버의 명시다 — 콘텐츠 전이와 달리 기록이 남지 않았음을 적어 준다.
  const mutate = async (path, body, okMsg) => {
    setBusy(path);
    const res = await window.JINA_API.post(`${idPath}/${path}`, body);
    setBusy(null);
    if (!res.ok) {
      notify(adminTopicErrorText(res, '요청을 처리하지 못했습니다.'), 'error');
      return;
    }
    notify(res.audit_logged === false ? `${okMsg} · 감사 로그는 남지 않았다(토픽 감사 테이블 없음)` : okMsg);
    if (res.topic) applyTopic(res.topic); else load({ quiet: true });
  };
  const transition = (to) => mutate('status', { to }, `'${topic?.label_ko}' → ${ADMIN_STATUS_META[to]?.label || to}`);
  const setVisibility = (to) => mutate('visibility', { to }, `'${topic?.label_ko}' 공개 범위 → ${to === 'public' ? '공개' : '비공개'}`);

  const move = (i, d) => setAttached((p) => {
    const j = i + d;
    if (j < 0 || j >= p.length) return p;
    const n = p.slice();
    [n[i], n[j]] = [n[j], n[i]];
    return n;
  });
  const remove = (i) => setAttached((p) => p.filter((_, k) => k !== i));
  const add = (row) => setAttached((p) => {
    const c = adminTopicNormalizeContent(row);
    return c.content_id == null || p.some((x) => x.content_id === c.content_id) ? p : p.concat(c);
  });

  const back = () => {
    if (dirty && !window.confirm('저장하지 않은 구성 변경이 있습니다. 버리고 목록으로 갈까요?')) return;
    onBack();
  };

  const attachedIds = new Set(attached.map((c) => c.content_id));
  const locked = Boolean(busy);
  const inputCls = 'admin-topic-input';

  const body = state.forbidden ? (
    <AdminTopicMessage theme={theme} testid="topic-forbidden">권한이 없습니다 — 토픽 구성은 author 이상만 열 수 있습니다.</AdminTopicMessage>
  ) : state.error ? (
    <AdminTopicMessage theme={theme} testid="topic-error" tone="error" onRetry={() => load()}>{state.error}</AdminTopicMessage>
  ) : state.loading ? (
    <div style={{ padding: '0 0 18px' }}><AdminTopicSkeleton theme={theme} n={3} /></div>
  ) : (
    <main className="admin-topic-layout" data-testid="topic-composer" data-topic-id={isNew ? 'new' : topic?.id} aria-busy={locked} style={{
      display: 'grid', gridTemplateColumns: '372px minmax(0, 1fr)', gap: 18, padding: '18px 26px 0',
      flex: 1, minHeight: 0, overflow: 'hidden',
    }}>
      {/* 왼쪽 — 토픽 폼 + eligible */}
      <div className="jina-scroll" style={{ minHeight: 0, overflowY: 'auto', paddingBottom: 8 }}>
        <section style={{ background: theme.surface, border: `1px solid ${theme.border}`, borderRadius: 15, padding: '16px 18px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
            <span style={{ fontSize: 13.5, fontWeight: 700 }}>토픽</span>
            <span style={{ fontSize: 11, color: theme.textDim, fontFamily: 'ui-monospace, Consolas, monospace' }}>
              {isNew ? 'topics · 신규' : `topics #${topic.id}`}
            </span>
          </div>
          <AdminTopicField theme={theme} label="제목">
            <input className={inputCls} data-testid="topic-label" value={form.label_ko} disabled={locked}
              onChange={(e) => setForm((p) => ({ ...p, label_ko: e.target.value }))}
              placeholder="예: 면접 준비" style={adminTopicInput(theme, { fontWeight: 600 })} />
          </AdminTopicField>
          <AdminTopicField
            theme={theme}
            label="slug"
            hint={isNew
              ? '소문자·숫자·하이픈(예: interview-prep). 비우면 서버가 제목으로 만든다 — 한글 제목은 topic, topic-2 … 로 떨어지니 URL 에 쓸 값을 직접 적는 편이 낫다. 형식·중복은 서버가 판정한다.'
              : 'URL 에 박히는 값이라 만든 뒤에는 바꾸지 않는다(PATCH 가 받지 않는다).'}
          >
            <input className={inputCls} data-testid="topic-slug" value={form.slug} disabled={locked || !isNew} readOnly={!isNew}
              onChange={(e) => setForm((p) => ({ ...p, slug: e.target.value }))}
              placeholder="interview-prep" spellCheck={false}
              style={adminTopicInput(theme, {
                fontFamily: 'ui-monospace, Consolas, monospace', fontSize: 12, color: theme.textMuted,
                ...(isNew ? {} : { background: 'transparent', borderStyle: 'dashed', cursor: 'default' }),
              })} />
          </AdminTopicField>
          <AdminTopicField theme={theme} label="설명">
            <textarea className={inputCls} data-testid="topic-description" value={form.description} disabled={locked} rows={3}
              onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))}
              placeholder="학습자 목록에 보이는 한 줄 설명"
              style={adminTopicInput(theme, { resize: 'vertical', lineHeight: 1.5, fontSize: 12.5, color: theme.textMuted })} />
          </AdminTopicField>
          <AdminTopicField theme={theme} label="상태 · 공개">
            {isNew ? (
              <div style={{ ...adminTopicInput(theme), color: theme.textDim, fontSize: 12 }}>
                만들면 초안(draft) · 비공개로 시작한다 — 공개는 전이로(플랜 11)
              </div>
            ) : (
              <div data-testid="topic-status-row" style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', minHeight: 30 }}>
                <AdminStatusBadge theme={theme} status={topic.status} />
                {canReview ? (
                  <React.Fragment>
                    <AdminVisibilityChip theme={theme} item={topic} me={me} busy={locked} onChange={setVisibility} />
                    <AdminTopicTransitionMenu theme={theme} topic={topic} me={me} busy={locked} onTransition={transition} />
                  </React.Fragment>
                ) : (
                  <span style={{ fontSize: 11.5, color: theme.textDim }}>
                    {topic.visibility === 'public' ? '공개' : '비공개'} · 전이·공개는 reviewer 이상
                  </span>
                )}
              </div>
            )}
          </AdminTopicField>

          {metaErrors.length > 0 && (
            <div data-testid="topic-meta-errors" role="alert" style={{
              margin: '0 0 12px', padding: '9px 12px', borderRadius: 9, fontSize: 12, lineHeight: 1.6,
              color: theme.error, background: adminTint(theme.error, '18', theme.chipBg), border: `1px solid ${adminTint(theme.error, '44', theme.border)}`,
            }}>
              {metaErrors.map((m, i) => <div key={i}>{m}</div>)}
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
            {!isNew && !metaDirty && <span style={{ fontSize: 11, color: theme.textDim }}>변경 없음</span>}
            <button type="button" data-testid="topic-meta-save" disabled={locked || (!isNew && !metaDirty)} onClick={saveMeta}
              style={adminTopicBtn(theme, isNew ? 'primary' : 'ghost', locked || (!isNew && !metaDirty))}>
              {busy === 'meta' ? '저장 중…' : isNew ? '토픽 만들기' : '토픽 정보 저장'}
            </button>
          </div>
        </section>

        {!isNew && <AdminTopicEligiblePanel theme={theme} topic={topic} thresholds={thresholds} />}
      </div>

      {/* 오른쪽 — 붙인 콘텐츠 + 검색 */}
      <section className="jina-scroll" style={{
        minHeight: 0, overflowY: 'auto', background: theme.surface, border: `1px solid ${theme.border}`,
        borderRadius: 15, padding: '16px 18px', marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 14 }}>
          <span style={{ fontSize: 13.5, fontWeight: 700 }}>붙인 콘텐츠</span>
          <span data-testid="topic-attached-count" style={{ fontSize: 11, color: theme.textDim }}>
            {isNew ? '—' : `${attached.length}개 · ▲▼ 로 순서 · ✕ 로 빼기`}
          </span>
          {dirty && (
            <span data-testid="topic-dirty" style={{
              marginLeft: 'auto', fontSize: 11, fontWeight: 700, color: theme.warning,
              border: `1px solid ${adminTint(theme.warning, '55', theme.borderStrong)}`, padding: '4px 10px', borderRadius: 9,
            }}>저장 전 변경</span>
          )}
        </div>

        {isNew ? (
          <div data-testid="topic-contents-locked" style={{
            border: `1px dashed ${adminTint(theme.accent, '80', theme.borderStrong)}`, borderRadius: 12, padding: 16,
            textAlign: 'center', fontSize: 12.5, color: theme.textMuted, lineHeight: 1.7,
          }}>
            토픽을 먼저 만들면 콘텐츠를 붙일 수 있다 — 구성 저장(PUT)에 토픽 id 가 필요하다.
          </div>
        ) : attached.length === 0 ? (
          <div data-testid="topic-contents-empty" style={{
            border: `1px dashed ${theme.borderStrong}`, borderRadius: 12, padding: 16,
            textAlign: 'center', fontSize: 12.5, color: theme.textDim,
          }}>아직 붙인 콘텐츠가 없습니다 — 아래에서 검색해 붙이세요</div>
        ) : attached.map((c, i) => (
          <AdminTopicContentRow key={c.content_id} theme={theme} item={c} index={i} count={attached.length}
            disabled={locked} onMove={move} onRemove={remove} />
        ))}

        <AdminTopicSearch theme={theme} attachedIds={attachedIds} disabled={isNew} busy={locked} onAdd={add} />
      </section>
    </main>
  );

  return (
    <React.Fragment>
      <header style={{
        padding: '16px 26px 14px', display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        borderBottom: `1px solid ${theme.border}`, flexShrink: 0,
      }}>
        <button type="button" data-testid="topic-back" onClick={back} style={adminTopicBtn(theme)}>
          <Icons.ArrowLeft size={14} /> 토픽 목록
        </button>
        <h1 style={{ margin: 0, fontSize: 22, fontWeight: 800, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {isNew ? '새 토픽' : (topic?.label_ko || '토픽 구성')}
        </h1>
        {topic && <AdminTopicEligibleBadge theme={theme} topic={topic} />}
        <span style={{ marginLeft: 'auto', fontSize: 12, color: theme.textDim, textAlign: 'right', lineHeight: 1.6 }}>
          순서까지 <b style={{ color: theme.textMuted }}>일괄 저장</b>(트랜잭션)<br />
          학습자 화면의 진행률 분모가 이 구성을 그대로 쓴다
        </span>
      </header>

      {body}

      <div style={{
        padding: '14px 26px 20px', display: 'flex', alignItems: 'center', gap: 14, flexShrink: 0,
        borderTop: `1px solid ${theme.border}`,
      }}>
        <div style={{ flex: 1, fontSize: 11.5, color: theme.textDim, lineHeight: 1.6 }}>
          <b style={{ color: theme.textMuted }}>스피킹 탭이 없는 이유</b> — 스피킹 세트(Phase C)는 플랜 10 발음 점수 백엔드가 확정된 뒤에 붙는다.
          검토·초안 콘텐츠가 섞여 있어도 저장은 막히지 않는다 — 공개는 각 콘텐츠의 전이로.
        </div>
        {dirty && <span style={{ fontSize: 12, color: theme.warning, fontWeight: 700 }}>저장되지 않은 변경</span>}
        <button
          type="button"
          data-testid="topic-save"
          disabled={isNew || locked || !dirty || state.loading || Boolean(state.error) || state.forbidden}
          title={isNew ? '토픽을 먼저 만들어야 구성을 저장할 수 있습니다' : !dirty ? '바뀐 것이 없습니다' : 'PUT /api/admin/topics/:id/contents'}
          onClick={saveContents}
          style={adminTopicBtn(theme, 'primary', isNew || locked || !dirty || state.loading || Boolean(state.error) || state.forbidden)}
        >{busy === 'contents' ? '저장 중…' : '구성 저장'}</button>
      </div>
    </React.Fragment>
  );
}

// 진입점. topicId 없으면 목록(+새 토픽), 'new' 면 만들기, 숫자면 구성 화면.
function AdminTopicComposer({ theme, me, topicId }) {
  const hashId = adminTopicUseHashId();
  const { notice, show, dismiss } = adminTopicUseNotice();
  const id = topicId != null ? adminTopicNormalizeId(topicId) : hashId;

  // 화면이 바뀔 때(마운트 · id 변경) 맡겨진 토스트를 집어 간다 — 라우터가 새로 마운트하든 이 컴포넌트가 살아서
  // id 만 바뀌든 둘 다 이 effect 를 지난다.
  React.useEffect(() => {
    const p = adminTopicTakeNotice();
    if (p) show(p.msg, p.tone);
  }, [id, show]);

  if (!me?.can_author) {
    // 서버가 어차피 403 을 준다(11 결정 4 — 가드는 서버). 빈 화면 대신 왜 비었는지만 말한다.
    return (
      <AdminTopicMessage theme={theme} testid="topic-need-author">
        토픽 관리는 <b style={{ color: theme.accent }}>author</b> 이상만 열 수 있습니다.
        <div style={{ fontSize: 12.5, color: theme.textDim, marginTop: 6 }}>현재 역할: {me?.role || '—'} — 관리자에게 권한을 요청하세요.</div>
      </AdminTopicMessage>
    );
  }

  return (
    <React.Fragment>
      <AdminTopicStyle theme={theme} />
      {id == null ? (
        <AdminTopicList theme={theme} me={me} onOpen={(t) => adminTopicGoto(t.id)} onNew={() => adminTopicGoto('new')} />
      ) : (
        // key 로 토픽이 바뀔 때마다 새로 마운트한다 — 이전 토픽의 폼·구성·오류가 다음 토픽에 남으면 안 된다.
        <AdminTopicEditor
          key={String(id)}
          theme={theme}
          me={me}
          topicId={id}
          notify={show}
          onBack={() => adminTopicGoto(null)}
          onCreated={(newId) => adminTopicGoto(adminTopicNormalizeId(newId))}
        />
      )}
      <AdminTopicNotice theme={theme} notice={notice} onDismiss={dismiss} />
    </React.Fragment>
  );
}

window.AdminTopicComposer = AdminTopicComposer;
