// 콘텐츠 상태 전이 규칙의 단일 소스 (플랜 11 §2 결정 7 · Phase 1).
//
// 전이표를 **데이터**(`TRANSITIONS`)로 두고 판정 함수는 그것만 읽는다. 같은 표를 라우트·서비스에
// if 로 흩어 놓으면 12(검수 큐)와 13(저작 에디터)이 각자 규칙을 다시 쓰게 되고, 그 순간
// "어디서는 되고 어디서는 안 되는" 전이가 생긴다. 전이를 늘리는 방법은 이 표에 줄을 더하는 것뿐이다.
//
// ── 409 와 403 을 섞지 않는다 ────────────────────────────────────────────────
// 금지 전이(`published → draft` 등)는 **409 CONFLICT** 다 — 누가 눌렀든 존재하지 않는 전이다.
// 역할 부족(`author` 가 `review → published`)은 **403 FORBIDDEN** 이다 — 전이는 존재하고 권한만 없다.
// 둘을 한 코드로 뭉개면 클라이언트가 "역할을 올리면 되는 일인가" 를 구분하지 못하고,
// 관리 UI 는 버튼을 숨길지(권한 없음) 비활성으로 둘지(지금 상태에서 불가) 정하지 못한다.
// 플랜 §4 Phase 1 검증 3번이 이 구분을 그대로 단정한다.
//
// 검사 **순서도 그래서 고정**이다: 상태를 먼저 보고 역할을 나중에 본다.
// `learner` 가 `published → draft` 를 눌러도 403 이 아니라 409 다 — 역할을 admin 으로 올려도
// 여전히 안 되는 일이라 "권한 문제" 라고 답하면 거짓말이 된다.
//
// ── from === to 는 멱등 no-op 이 아니라 409 다 ──────────────────────────────
// 같은 상태를 다시 보내는 것은 호출자의 실수다(목록이 낡아 이미 바뀐 행을 눌렀거나 더블클릭).
// 통과시키면 `content_audit_log` 에 "published → published" 같은 의미 없는 행이 쌓여
// 감사 로그가 읽히지 않게 된다. 표에 same-status 조합을 넣지 않았으므로 별도 분기 없이
// 자연히 CONFLICT 로 떨어진다 — 그것이 표를 데이터로 둔 덕이다.
//
// ── 역할 비교 전제 (호출자의 책임) ────────────────────────────────────────────
// 이 모듈의 함수는 전부 **동기**다. 역할 서열은 `roles` 테이블에서 오고 `atLeast()` 는
// `loadRoles()` 가 캐시를 채워 두지 않으면 throw 한다. 그 await 를 여기서 숨기면 판정 함수가
// async 가 되고 async 는 호출부로 전염된다. 그래서 **`loadRoles()` 를 먼저 부르는 책임은
// 호출자(라우트·서비스)에 둔다**:
//
//   await loadRoles();                                  // 라우트 진입에서 한 번
//   assertTransition(row.status, to, user.role);        // 그 뒤로는 동기
import { HttpError } from './errors.js';
import { atLeast } from './roles.js';

export const CONTENT_STATUSES = Object.freeze(['draft', 'review', 'published', 'archived']);
export const VISIBILITIES = Object.freeze(['public', 'private']);

// 전이표 — `from` → { `to`: 최소 역할 } (플랜 11 §2 결정 7).
// **여기에 없는 조합은 전부 금지(409)** 다.
export const TRANSITIONS = Object.freeze({
  draft: Object.freeze({
    review: 'author',       // 검수 요청
    published: 'reviewer',  // 검수 생략 발행 — 막지 않되 reviewer 로 묶는다.
                            // 1인(admin) 운영에서는 지금처럼 바로 발행되고, author 가 생기는 순간
                            // 그 사람은 자동으로 draft → review 까지만 하게 된다(상태를 늘리지 않고 역할로 게이트).
  }),
  review: Object.freeze({
    published: 'reviewer',  // 승인
    draft: 'reviewer',      // 반려 — 사유는 content_audit_log.note 에 남긴다
  }),
  published: Object.freeze({
    archived: 'reviewer',   // 내림. visibility 는 건드리지 않는다(열린 질문 7 후보 A) —
                            // 그래서 되올리면 원래 보이던 사람에게 그대로 돌아온다.
  }),
  archived: Object.freeze({
    published: 'reviewer',  // 다시 올림
  }),
  // published → draft 는 의도적으로 비어 있다. 공개된 것을 초안으로 되돌리려면 archived 를 거친다 —
  // 그래야 "내렸다" 는 사실이 감사 로그에 한 줄로 남는다.
});

// 가시성(공개 여닫기)의 최소 역할. 전이표와 달리 상태별로 갈리지 않아 상수 하나로 충분하다.
const VISIBILITY_MIN_ROLE = 'reviewer';

// `visibility = 'public'` 이 허용되는 상태. DB 제약 `content_items_public_ck` 와 같은 집합이어야 한다
// (플랜 11 열린 질문 7 후보 A: `status IN ('published','archived') OR visibility = 'private'`).
const PUBLIC_ALLOWED_STATUSES = Object.freeze(['published', 'archived']);

function isStatus(value) {
  return CONTENT_STATUSES.includes(value);
}

// 판정 결과의 모양은 셋뿐이다:
//   { ok: true }
//   { ok: false, reason: 'CONFLICT' }                        상태 문제 → 409
//   { ok: false, reason: 'FORBIDDEN', minRole: '<역할>' }     권한 문제 → 403
const OK = Object.freeze({ ok: true });
const conflict = () => ({ ok: false, reason: 'CONFLICT' });
const forbidden = (minRole) => ({ ok: false, reason: 'FORBIDDEN', minRole });

// from/to 가 상태 4종이 아니면 CONFLICT 다. 라우트가 `to` 의 형태(400 BAD_REQUEST)를 먼저
// 검사하는 것이 정석이고, 여기 검사는 그 뒤의 안전망이다 — 없으면 TRANSITIONS['constructor']
// 같은 프로토타입 조회가 역할 이름 자리에 엉뚱한 값을 앉힌다.
export function canTransition(from, to, role) {
  if (!isStatus(from) || !isStatus(to)) return conflict();
  const required = Object.hasOwn(TRANSITIONS, from) ? TRANSITIONS[from][to] : undefined;
  if (!required) return conflict();          // 표에 없는 조합 = 금지 전이. from === to 도 여기로 온다.
  if (!atLeast(role, required)) return forbidden(required);
  return OK;
}

// 실패면 던진다. 성공이면 아무것도 돌려주지 않는다 — 호출부가 `if (!ok)` 를 잊는 경로를 없앤다.
// 선행 조건은 파일 머리말 참조: 호출 전에 `await loadRoles()`.
export function assertTransition(from, to, role) {
  const verdict = canTransition(from, to, role);
  if (verdict.ok) return;
  if (verdict.reason === 'FORBIDDEN') {
    throw new HttpError(403, 'FORBIDDEN',
      `${from} → ${to} 전이는 ${verdict.minRole} 이상만 할 수 있습니다.`,
      { from, to, min_role: verdict.minRole });
  }
  throw new HttpError(409, 'CONFLICT',
    `${from} → ${to} 는 허용되지 않는 상태 전이입니다.`, { from, to });
}

// 공개 여닫기 — `POST /api/admin/contents/:type/:id/visibility` 가 쓴다.
// `status` 는 **대상 콘텐츠의 현재 상태**이고 바뀌지 않는다(가시성만 바꾸는 조작이다).
//
// `to = 'public'` 을 published·archived 로 묶는 이유: DB 의 `content_items_public_ck` 가 같은 규칙을
// 들고 있어서 draft·review 를 public 으로 올리면 23514 로 거부된다. 그것을 그대로 흘리면
// `fromPgError` 가 400 "값이 허용 범위를 벗어났습니다." 로 바꿔 내보내는데, 사용자에게 아무 의미가 없다.
// 그래서 애플리케이션에서 먼저 막고 왜 안 되는지를 말한다.
//
// archived 를 public 으로 두는 것이 허용인 것이 핵심이다 — 내린 콘텐츠가 강제로 private 이 되면
// 작성자가 아닌 학습자의 오답 노트에서 그 레슨이 사라져 content-scope 의 `resolvable` 이 무력화된다.
export function canSetVisibility(status, to, role) {
  if (!isStatus(status) || !VISIBILITIES.includes(to)) return conflict();
  if (to === 'public' && !PUBLIC_ALLOWED_STATUSES.includes(status)) return conflict();
  // private 으로 내리는 것은 어느 상태에서든 제약에 걸리지 않는다(CHECK 의 OR 오른쪽을 만족).
  if (!atLeast(role, VISIBILITY_MIN_ROLE)) return forbidden(VISIBILITY_MIN_ROLE);
  return OK;
}

// canSetVisibility 의 던지는 판. 상태/역할 구분은 assertTransition 과 같은 규칙이다.
export function assertSetVisibility(status, to, role) {
  const verdict = canSetVisibility(status, to, role);
  if (verdict.ok) return;
  if (verdict.reason === 'FORBIDDEN') {
    throw new HttpError(403, 'FORBIDDEN',
      `공개 범위 변경은 ${verdict.minRole} 이상만 할 수 있습니다.`,
      { status, to, min_role: verdict.minRole });
  }
  throw new HttpError(409, 'CONFLICT',
    `${status} 상태의 콘텐츠는 ${to} 로 바꿀 수 없습니다.`, { status, to });
}
