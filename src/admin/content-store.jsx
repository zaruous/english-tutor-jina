// content-store.jsx — 관리자 · 콘텐츠 카탈로그 목록 + 상태/가시성 전이 스토어 (플랜 11 Phase 2)
//
// admin.html 전용이다. 학습 앱(index.html)은 이 파일을 로드하지 않는다 — 결정 4(별도 엔트리)의
// 요점이 "일반 사용자 브라우저에 admin 코드를 내려보내지 않는다" 이기 때문이다.
//
// **최상위 이름은 전부 전역에 들어간다.** admin.html 에는 빌드 단계가 없고 Babel standalone 이
// 파일마다 classic script 를 하나씩 만들어 붙인다. 그래서 users.jsx · shared/*.jsx 와 이름이 겹치면
// const 는 SyntaxError 로 스크립트가 통째로 죽고, function 은 **조용히 덮어써서** 남의 화면을 깨뜨린다
// (users.jsx 의 menuRect·useDismissMenu·fmtDate 를 여기서 다시 선언하면 그쪽 드롭다운이 망가진다).
// 그래서 이 파일의 모든 이름에 admin/Admin 접두사를 붙였다. 새 이름을 더할 때도 지켜라.

// 한 번에 받아 오는 행 수. 서버 기본 limit 과 같은 값이어야 '더 보기' 가
// offset = 지금까지 받은 행 수로 정확히 이어진다(users.jsx 와 같은 규약).
const ADMIN_CONTENT_PAGE_SIZE = 50;
// 서버가 limit 을 200 에서 자른다. 더 크게 요청하면 조용히 잘리므로 조작 후 새로고침에서 이 값을 넘기지 않는다.
const ADMIN_CONTENT_MAX_LIMIT = 200;
// 검색어 디바운스. 목록은 사용자 목록보다 크고(콘텐츠 4종 + 토픽) 한 글자마다 왕복하면
// 마지막 응답이 먼저 도착한 응답에 덮이는 경합이 눈에 보인다.
const ADMIN_CONTENT_SEARCH_DELAY = 250;

// 유형 탭 — key 는 `GET /api/admin/contents?type=` 에 그대로 실린다(content_items.type + topic).
//
// 와이어프레임의 [리스닝] 을 [레슨] 으로 바꿨다. `리스닝`(kind='toeic_lc')과 `Part 7`(toeic_part7)은
// 둘 다 type='lesson' 이고 목록 DTO 에는 kind 가 없다 — 탭을 '리스닝' 이라 쓰면 Part 7 레슨이
// 리스닝 탭에 들어앉아 거짓말이 된다. 세분류는 행의 '유형' 칸이 kind 를 받으면 그때 보여 준다
// (adminTypeLabel 이 kind 를 이미 받아들인다). 목업의 탭 카운트(3+8+0+6+20=37)도 Part 7 레슨을
// 빠뜨리고 있어 같은 문제를 안고 있었다.
const ADMIN_CONTENT_TYPES = [
  { key: '', label: '전체' },
  { key: 'topic', label: '토픽' },
  { key: 'lesson', label: '레슨' },
  { key: 'speaking_set', label: '스피킹' },
  { key: 'scenario', label: '회화' },
  { key: 'vocab_set', label: '단어' },
];

const ADMIN_TYPE_LABELS = {
  topic: '토픽',
  lesson: '레슨',
  scenario: '회화',
  vocab_set: '단어',
  speaking_set: '스피킹',
};

// 서버가 lesson 행에 kind 를 실어 주면 그 값으로 더 좁게 적는다. 없으면 '레슨' 으로 떨어진다.
const ADMIN_KIND_LABELS = {
  toeic_lc: '리스닝',
  toeic_part7: 'Part 7',
  toeic_part5: 'Part 5',
};

// 상태 4단계의 표시 규약 — 플랜 11 "목업 규칙": 공개 success · 검토 warning · 초안 textDim · 내림 error.
// dot 는 목업(mockups/11-admin-contents.html `.st i`)을 theme.* 로 옮긴 것이다:
// 공개·검토는 채운 원, 초안은 빈 원(테두리만), 내림은 반투명 채움 + 테두리.
// 상태는 필터가 아니라 배지로 구분한다 — 4단계가 한 목록에 섞이는 것이 이 화면의 요점이다.
const ADMIN_STATUS_META = {
  published: { label: '공개', tone: 'success', dot: 'solid' },
  review: { label: '검토', tone: 'warning', dot: 'solid' },
  draft: { label: '초안', tone: 'textDim', dot: 'ring' },
  archived: { label: '내림', tone: 'error', dot: 'faded' },
};

// 상태 필터 칩 순서. '' = 전체.
const ADMIN_STATUS_FILTERS = ['', 'published', 'review', 'draft', 'archived'];

// 전이표 — `api/lib/content-status.js` 의 TRANSITIONS 를 화면 문구와 함께 옮긴 것이다.
// **판정의 단일 소스는 서버다.** 여기 표는 메뉴에 무엇을 그릴지와 어느 항목을 흐리게 둘지만 정한다.
// 표에 없는 조합(published → draft 등)은 메뉴에 아예 나타나지 않고, 그래도 요청이 가면 서버가 409 로 막는다.
// 서버 표를 고치면 이 표도 같이 고쳐야 한다 — 어긋나면 "눌리는데 409" 또는 "되는데 안 보임" 이 된다.
const ADMIN_TRANSITIONS = {
  draft: [
    { to: 'review', label: '검수 요청', minRole: 'author', icon: 'Send' },
    { to: 'published', label: '바로 공개', minRole: 'reviewer', icon: 'Check' },
  ],
  review: [
    { to: 'published', label: '공개', minRole: 'reviewer', icon: 'Check' },
    { to: 'draft', label: '반려 — 초안으로', minRole: 'reviewer', icon: 'ArrowLeft' },
  ],
  published: [
    { to: 'archived', label: '내림', minRole: 'reviewer', icon: 'X' },
  ],
  archived: [
    { to: 'published', label: '다시 공개', minRole: 'reviewer', icon: 'Check' },
  ],
};

// visibility = 'public' 이 허용되는 상태. DB 의 content_items_public_ck · 서버의 canSetVisibility 와
// 같은 집합이어야 한다(열린 질문 7 후보 A). 어긋나면 눌리는 버튼이 400/409 로 떨어진다.
const ADMIN_PUBLIC_STATUSES = ['published', 'archived'];

// content_items.id 는 타입마다 따로 세는 값이 아니지만 topic 은 아예 다른 테이블이다 —
// topic#3 과 lesson#3 이 한 목록에 같이 오면 id 만으로는 React key 도 rowBusy 도 겹친다.
function adminContentKey(item) {
  return `${item?.type ?? '?'}:${item?.id ?? '?'}`;
}

// 누적 목록에 다음 페이지를 붙이되 같은 행은 한 번만 남긴다.
// 두 요청 사이에 상태가 바뀌면 offset 이 밀려 같은 행이 두 번 올 수 있다.
function adminMergeContents(prev, next) {
  const seen = new Set(prev.map(adminContentKey));
  return prev.concat(next.filter((c) => !seen.has(adminContentKey(c))));
}

// 역할 판정은 /api/auth/me DTO 의 편의 불린을 쓴다. 서열 계산(rank 비교)을 클라이언트가 다시 하면
// 규칙이 두 곳이 된다 — 플랜 §3 이 can_author·can_review·can_admin 를 DTO 에 넣은 이유가 그것이다.
function adminHasRole(me, minRole) {
  if (!me) return false;
  if (minRole === 'author') return Boolean(me.can_author);
  if (minRole === 'reviewer') return Boolean(me.can_review);
  if (minRole === 'admin') return Boolean(me.can_admin);
  return false;
}

// 이 행에서 지금 시도할 수 있는 전이 + 각 항목의 허용 여부.
// 역할이 모자란 항목도 **지우지 않고 흐리게 남긴다** — 사라지면 "이 콘텐츠는 공개할 수 없다" 로 읽히지만
// 실제로는 "당신이 못 한다" 이고, 둘은 다른 이야기다(409 와 403 을 서버가 구분하는 이유와 같다).
function adminTransitionsFor(item, me) {
  const rows = ADMIN_TRANSITIONS[item?.status] || [];
  return rows.map((t) => ({ ...t, allowed: adminHasRole(me, t.minRole) }));
}

// 가시성 여닫기 가능 여부 — 서버 canSetVisibility 와 같은 순서로 본다: 상태 먼저, 역할 나중.
// draft·review 를 public 으로 올리려는 것은 권한 문제가 아니라 CHECK 위반이라 역할을 올려도 안 된다.
function adminCanSetVisibility(item, to, me) {
  if (to === 'public' && !ADMIN_PUBLIC_STATUSES.includes(item?.status)) return false;
  return adminHasRole(me, 'reviewer');
}

// 못 누르는 이유를 title 로 남긴다. 흐린 버튼만 있고 이유가 없으면 사용자는 버그로 읽는다.
function adminVisibilityBlockReason(item, to, me) {
  if (to === 'public' && !ADMIN_PUBLIC_STATUSES.includes(item?.status)) {
    return `${ADMIN_STATUS_META[item?.status]?.label || item?.status} 상태는 공개할 수 없습니다 — published·archived 만 가능합니다.`;
  }
  if (!adminHasRole(me, 'reviewer')) return '공개 범위 변경은 reviewer 이상만 할 수 있습니다.';
  return '';
}

function adminTypeLabel(item) {
  if (item?.type === 'lesson' && item?.kind) return ADMIN_KIND_LABELS[item.kind] || '레슨';
  return ADMIN_TYPE_LABELS[item?.type] || item?.type || '—';
}

// 만든이 칸. 서버가 created_by 를 id 로 줄지 객체로 줄지 문자열로 줄지 아직 고정돼 있지 않아
// 셋 다 받아 낸다 — 목록 한 칸 때문에 화면이 비거나 [object Object] 가 뜨면 안 된다.
function adminActorLabel(item) {
  const v = item?.created_by;
  if (v && typeof v === 'object') return v.display_name || v.email || (v.id != null ? `#${v.id}` : '—');
  if (typeof v === 'string' && v) return v;
  if (typeof v === 'number' && Number.isFinite(v)) return `#${v}`;
  return item?.source === 'seed' ? 'seed' : '—';
}

function adminFmtDate(iso) {
  if (!iso) return '—';
  return String(iso).slice(5, 10); // MM-DD — 목업과 같은 폭
}

const AdminContentContext = React.createContext(null);

function AdminContentProvider({ children }) {
  // 필터는 사용자가 만지는 값, applied 는 실제로 서버에 나간 값이다.
  // 검색어만 디바운스되므로 둘을 분리해 둔다.
  const [filters, setFilters] = React.useState({ type: '', status: '', q: '' });
  const [appliedQ, setAppliedQ] = React.useState('');

  const [state, setState] = React.useState({
    // loading 은 목록 전체 교체(스켈레톤), loadingMore 는 '더 보기'(기존 행 유지)를 구분한다.
    loading: true, loadingMore: false, forbidden: false, error: null,
    items: [], total: 0, counts: null,
  });
  // 조작 중인 행 하나. 같은 행의 버튼을 두 번 누르는 것만 막으면 되고,
  // 목록 전체를 잠그면 다른 행을 못 만지게 되어 관리가 느려진다.
  const [rowBusy, setRowBusy] = React.useState(null);
  const [notice, setNotice] = React.useState(null);
  const noticeTimer = React.useRef(null);

  React.useEffect(() => () => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
  }, []);

  // 성공 안내는 짧게, 실패(특히 409)는 길게 — 금지 전이·마지막 관리자 같은 상태 메시지는
  // 사용자가 읽고 다음 행동을 정해야 하는 정보라 4초면 사라지기 전에 못 읽는다.
  const showNotice = React.useCallback((msg, tone = 'ok') => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice({ msg, tone });
    noticeTimer.current = setTimeout(() => setNotice(null), tone === 'ok' ? 3500 : 7000);
  }, []);

  const dismissNotice = React.useCallback(() => {
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    setNotice(null);
  }, []);

  React.useEffect(() => {
    const t = setTimeout(() => setAppliedQ(filters.q.trim()), ADMIN_CONTENT_SEARCH_DELAY);
    return () => clearTimeout(t);
  }, [filters.q]);

  // append=true 면 받은 행을 뒤에 이어 붙이고, 아니면 목록을 통째로 갈아끼운다.
  // 유형·상태·검색이 바뀔 때는 아래 useEffect 가 append 없이 부르므로 누적이 저절로 초기화된다.
  // quiet=true 면 스켈레톤으로 갈아엎지 않고 조용히 다시 받는다 — 한 행을 내렸는데 목록 전체가
  // 깜빡이면 방금 무엇이 바뀌었는지를 눈으로 못 쫓는다(조작 뒤 새로고침이 그 경우다).
  const load = React.useCallback(async (
    { type, status, q },
    { offset = 0, limit = ADMIN_CONTENT_PAGE_SIZE, append = false, quiet = false } = {},
  ) => {
    setState((p) => ({
      ...p, error: null, forbidden: false,
      loading: (append || quiet) ? p.loading : true,
      loadingMore: append,
    }));
    const qs = new URLSearchParams();
    if (type) qs.set('type', type);
    if (status) qs.set('status', status);
    if (q) qs.set('q', q);
    qs.set('limit', String(limit));
    if (offset) qs.set('offset', String(offset));
    const res = await window.JINA_API.get(`/api/admin/contents?${qs}`);
    if (res.ok) {
      const rows = Array.isArray(res.contents) ? res.contents : [];
      setState((p) => ({
        ...p, loading: false, loadingMore: false,
        items: append ? adminMergeContents(p.items, rows) : rows,
        // total 이 없는 응답(Phase 1 의 스텁이 그랬다)에서는 받은 행 수로 대신한다.
        // 0 으로 두면 '더 보기' 가 영영 안 뜨거나, 반대로 총계가 목록보다 작아 보인다.
        total: Number.isFinite(res.total)
          ? res.total
          : (append ? p.items.length + rows.length : rows.length),
        counts: res.counts && typeof res.counts === 'object' ? res.counts : null,
      }));
    } else if (res.code === 'FORBIDDEN' || res.code === 'UNAUTHORIZED') {
      setState((p) => ({ ...p, loading: false, loadingMore: false, forbidden: true }));
    } else {
      setState((p) => ({
        ...p, loading: false, loadingMore: false,
        error: res.hint ? `${res.error} — ${res.hint}` : (res.error || '목록을 불러오지 못했습니다.'),
      }));
    }
    return res;
  }, []);

  const applied = React.useMemo(
    () => ({ type: filters.type, status: filters.status, q: appliedQ }),
    [filters.type, filters.status, appliedQ],
  );

  React.useEffect(() => { load(applied); }, [load, applied]);

  // 조작 뒤 새로고침. '더 보기' 로 펼쳐 둔 만큼을 한 번에 다시 받는다 —
  // 기본 크기로 되돌리면 한 행 내렸다고 화면이 접혀 버린다.
  const reload = React.useCallback(({ quiet = false } = {}) => load(applied, {
    limit: Math.min(ADMIN_CONTENT_MAX_LIMIT, Math.max(ADMIN_CONTENT_PAGE_SIZE, state.items.length)),
    quiet,
  }), [load, applied, state.items.length]);

  const loadMore = React.useCallback(() => load(applied, {
    offset: state.items.length, append: true,
  }), [load, applied, state.items.length]);

  // 전이·가시성 공통 경로. 실패 코드별 문구가 다르다:
  //   403 = 역할 부족 → 서버 메시지가 "reviewer 이상만" 처럼 무엇이 부족한지 말해 준다.
  //   409 = 금지 전이·상태 충돌 → 서버 메시지를 **그대로** 보여준다. 사용자가 알아야 하는 상태 정보다.
  //   그 밖 = 일반 오류.
  const mutate = React.useCallback(async (item, path, body, okMsg) => {
    const key = adminContentKey(item);
    setRowBusy(key);
    const res = await window.JINA_API.post(
      `/api/admin/contents/${encodeURIComponent(item.type)}/${encodeURIComponent(item.id)}/${path}`,
      body,
    );
    setRowBusy(null);
    if (res.ok) {
      // 서버가 갱신된 행을 주면 먼저 갈아끼워 화면이 즉시 반응하게 하고, 그 다음 목록을 다시 받는다
      // (상태 필터가 걸려 있으면 그 행이 목록에서 빠져야 하므로 낙관적 갱신만으로는 부족하다).
      if (res.content) {
        setState((p) => ({
          ...p,
          items: p.items.map((c) => (adminContentKey(c) === key ? res.content : c)),
        }));
      }
      showNotice(okMsg, 'ok');
      reload({ quiet: true });
    } else if (res.code === 'FORBIDDEN' || res.code === 'UNAUTHORIZED') {
      showNotice(res.error || '권한이 없습니다.', 'error');
    } else {
      showNotice(res.error || '요청을 처리하지 못했습니다.', 'error');
    }
    return res;
  }, [reload, showNotice]);

  const transition = React.useCallback((item, to, note) => {
    const label = ADMIN_STATUS_META[to]?.label || to;
    return mutate(item, 'status', note ? { to, note } : { to }, `'${item.title}' → ${label}`);
  }, [mutate]);

  const setVisibility = React.useCallback((item, to) => mutate(
    item, 'visibility', { to },
    `'${item.title}' 공개 범위 → ${to === 'public' ? '공개' : '비공개'}`,
  ), [mutate]);

  const setFilter = React.useCallback((patch) => {
    setFilters((p) => ({ ...p, ...patch }));
  }, []);

  const value = React.useMemo(() => ({
    ...state, filters, appliedQ, rowBusy, notice,
    setFilter, reload, loadMore, transition, setVisibility, showNotice, dismissNotice,
  }), [state, filters, appliedQ, rowBusy, notice,
    setFilter, reload, loadMore, transition, setVisibility, showNotice, dismissNotice]);

  return <AdminContentContext.Provider value={value}>{children}</AdminContentContext.Provider>;
}

function useAdminContents() {
  const ctx = React.useContext(AdminContentContext);
  if (!ctx) throw new Error('useAdminContents 는 AdminContentProvider 안에서만 쓸 수 있습니다.');
  return ctx;
}

window.AdminContentProvider = AdminContentProvider;
window.useAdminContents = useAdminContents;
