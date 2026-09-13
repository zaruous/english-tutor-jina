// 콘텐츠 가시성 조건의 단일 소스 — discoverable / resolvable (플랜 11 §2 결정 2 · Phase 1).
//
// 이 파일이 돌려주는 것은 SQL WHERE 조각 두 줄뿐이다. 그런데 값어치는 그 두 줄이 아니라
// **어느 쿼리가 어느 쪽을 써야 하는가** 를 한 곳에 못박는 데 있다. 지금까지 가시성 조건은
// 서비스마다 손으로 적혀 있었다(topic 13곳 · lesson 10곳 · speaking 3곳 · ai-job 1곳 = 27곳,
// `status`/`published` 판정까지 세면 47곳). 같은 규칙을 그만큼 복사해 두면 규칙이 바뀌는 순간
// 몇 곳은 반드시 남는다 — "관리자가 내렸는데 어떤 화면에는 계속 보인다" 는 버그가 그렇게 생긴다.
//
// ── 왜 헬퍼가 하나가 아니라 둘인가 ────────────────────────────────────────────
// 관리자가 콘텐츠를 내리면(`status = 'archived'`) 요구가 둘 생기는데, 방향이 서로 반대다.
//
//   (1) **새로 학습할 수 있는 것에서는 빠져야 한다.**
//       목록에 남으면 이미 내린 레슨을 사용자가 다시 시작하고, 추천이 계속 그것을 권한다.
//       진행률 분모에 남으면 남은 콘텐츠를 다 풀어도 100% 가 되지 않는다.
//   (2) **이미 한 것의 근거로는 남아야 한다.**
//       그 레슨을 이미 푼 사용자의 오답 노트·통계·Q&A 는 콘텐츠 조인을 타고 화면을 만든다.
//       조인 조건에서 archived 를 떨어뜨리면 **사용자의 오답이 통째로 사라진다**.
//
// 하나로 합치면 둘 중 하나가 반드시 깨진다. (1)만 만들면 사용자 기록이 증발하고,
// (2)만 만들면 내린 콘텐츠가 계속 추천된다. 그래서 이름을 둘로 나눠, 호출부가 쿼리를 쓸 때마다
// "이 쿼리는 새로 할 것을 고르는가, 이미 한 것을 설명하는가" 를 스스로 고르게 만든다.
//
//   discoverable — "지금 학습할 수 있는 것".  `status = 'published'` 만.
//   resolvable   — "이미 한 것의 근거".        `status IN ('published','archived')`.
//
// 규범 한 줄: **archived 는 이력에는 남고, 새 시도만 막는다.**
// (플랜 11 §2 결정 2 — 원문 열린 질문 2 가 여기로 확정됐다.)
//
// ── 어느 쿼리가 어느 쪽인가 (플랜 11 §3 표의 "헬퍼" 열 그대로) ─────────────────
//
//   discoverable                                  resolvable
//   ───────────────────────────────────────────   ───────────────────────────────────────────
//   콘텐츠 목록 (GET /api/lessons · /api/topics)   오답 노트 (GET /api/mistakes)
//   추천 (GET /api/lessons/recommended)            통계 · 대시보드 집계 (progress · dashboard)
//   토픽 상세 (getTopic 의 4개 쿼리)                Q&A (레슨 문항 질문/답변)
//   진행률 CTE 의 **분모**                          이미 있는 attempt · session 의 상세
//   새 attempt 시작 (POST /api/lessons/:id/attempts)
//   스피킹 문장 파생 (speaking.service)
//   AI 잡의 토픽 접근 검사 (assertTopicAccess)
//
// 표에 없는 쿼리를 만나면 **먼저 §3 표에 행을 채우고** 오라. 판단 기준은 한 문장이다 —
// 사용자가 *지금 새로 무엇을 할지 고르는* 자리면 discoverable,
// *이미 한 것을 설명하는* 자리면 resolvable.
//
// ── 공통 컬럼(is_deleted · is_active)은 걸지 않는다 ──────────────────────────
// 플랜 11 §2 결정 2 는 두 헬퍼가 10.7 §3.4 공통 컬럼의 `NOT is_deleted AND is_active` 도
// 함께 걸어야 한다고 적었지만, **그 규약은 baseline 에 채택되지 않았다**(플랜 11 열린 질문 8 정정).
// 실제 `content_items` · `topics` 에는 두 컬럼이 없다 — 넣으면 42703(undefined column)으로
// 모든 조회가 죽는다. 컬럼이 생기는 날 조건을 더할 자리는 아래 `ownerOrPublic` 하나뿐이고,
// 그래서 두 헬퍼가 그것을 공유한다.
//
// ── 쓰는 법 ──────────────────────────────────────────────────────────────────
//   const { rows } = await pool.query(
//     `SELECT ... FROM content_items c WHERE c.type = 'lesson' AND ${discoverable('c', '$1')}`,
//     [user.id],
//   );
// 돌려주는 조각은 `A AND (B OR C)` 형태다. SQL 에서 AND 가 OR 보다 강하게 묶이므로
// `WHERE x AND <조각>` 도 `WHERE x OR <조각>` 도 뜻이 어긋나지 않는다.
// 다만 `NOT <조각>` 은 의도대로 동작하지 않는다 — 부정이 필요하면 괄호를 직접 씌워라.

// alias(식별자)와 userParam(자리표시자)은 SQL 에 문자열로 그대로 박힌다 — 둘 다 바인딩할 수 없다.
// 그래서 형태를 여기서 강제한다. 호출부가 언젠가 사용자 입력을 실수로 흘려도 SQL 이 되지 않는다.
// (db.js 가 DB_SCHEMA 를 같은 이유로 같은 정규식으로 막는다.)
const ALIAS_RE = /^[a-z_][a-z0-9_]*$/;
const PARAM_RE = /^\$\d+$/;

function assertShape(alias, userParam) {
  if (typeof alias !== 'string' || !ALIAS_RE.test(alias)) {
    throw new Error(`content-scope: alias=${JSON.stringify(alias)} 는 SQL 별칭 형태가 아닙니다.`);
  }
  if (typeof userParam !== 'string' || !PARAM_RE.test(userParam)) {
    throw new Error(`content-scope: userParam=${JSON.stringify(userParam)} 는 $n 형태가 아닙니다.`);
  }
}

// 소유자 예외 — 두 헬퍼가 공유하는 유일한 조각이다.
// 자기가 만든 콘텐츠는 public 이 아니어도 자기에게는 보인다(AI 생성물이 전부 private 이라
// 이 조각이 없으면 사용자가 자기 생성물을 못 본다). created_by 가 NULL 인 시드 콘텐츠는
// `= $n` 이 NULL 이라 걸리지 않고 visibility 쪽으로만 판정된다 — 의도한 동작이다.
function ownerOrPublic(alias, userParam) {
  return `(${alias}.visibility = 'public' OR ${alias}.created_by = ${userParam})`;
}

// "지금 학습할 수 있는 것" — 목록·추천·토픽 상세·진행률 분모·새 시도 시작.
// archived 를 제외하는 것이 이 헬퍼의 존재 이유다.
export function discoverable(alias, userParam) {
  assertShape(alias, userParam);
  return `${alias}.status = 'published' AND ${ownerOrPublic(alias, userParam)}`;
}

// "이미 한 것의 근거" — 오답 노트·통계·Q&A·이미 있는 attempt 의 상세.
// discoverable 의 **상위집합**이다(같은 가시성 조건에 archived 만 더 받는다).
// 이 관계가 깨지면 "목록에는 보이는데 오답 노트에서는 사라지는" 콘텐츠가 생긴다.
export function resolvable(alias, userParam) {
  assertShape(alias, userParam);
  return `${alias}.status IN ('published', 'archived') AND ${ownerOrPublic(alias, userParam)}`;
}
