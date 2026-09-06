// content-scope.js — 콘텐츠 가시성 조건의 단일 소스 (플랜 11 결정 2).
// 서비스마다 같은 문자열을 다시 쓰지 않는다 — 관리자가 내렸는데 어떤 화면엔 계속 보이는
// 종류의 버그는 조건이 두 곳 이상에 살 때 생긴다.
//
// userParam 은 user_id 가 바인딩된 플레이스홀더($1 등) — 소유자는 자기 비공개 콘텐츠도 본다.

// "지금 학습할 수 있는 것" — 목록·추천·토픽 구성·진행률 분모·새 시도 시작.
export const discoverable = (alias, userParam = '$1') =>
  `${alias}.status = 'published' AND (${alias}.visibility = 'public' OR ${alias}.created_by = ${userParam})`;

// "이미 한 것의 근거" — 오답 노트·통계·기존 attempt 상세. archived 는 이력에는 남고 새 시도만 막는다.
export const resolvable = (alias, userParam = '$1') =>
  `${alias}.status IN ('published', 'archived') AND (${alias}.visibility = 'public' OR ${alias}.created_by = ${userParam})`;
