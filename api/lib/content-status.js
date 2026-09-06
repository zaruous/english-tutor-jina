// content-status.js — 콘텐츠 상태 전이의 단일 소스 (플랜 11 결정 7).
// 어떤 from 에서 어디로 갈 수 있고 누가 누를 수 있는지를 이 표 하나가 정한다.
// 금지 전이는 409 CONFLICT(상태 문제), 역할 부족은 403 FORBIDDEN(권한 문제)으로 구분한다.
import { HttpError } from './errors.js';
import { atLeast } from './roles.js';

export const CONTENT_STATUSES = ['draft', 'review', 'published', 'archived'];

// from → to → 최소 역할. 표에 없는 조합은 금지 전이다(published → draft 는 archived 를 거친다).
const TRANSITIONS = {
  draft: { review: 'author', published: 'reviewer' },
  review: { published: 'reviewer', draft: 'reviewer' },
  published: { archived: 'reviewer' },
  archived: { published: 'reviewer' },
};

export function requiredRoleFor(from, to) {
  return TRANSITIONS[from]?.[to] ?? null;
}

export function canTransition(from, to, role) {
  const required = requiredRoleFor(from, to);
  return required !== null && atLeast(role, required);
}

// 검사 순서가 곧 응답 의미다: 상태 문제(409)를 권한 문제(403)보다 먼저 판정한다 —
// learner 가 published → draft 를 눌러도 "권한 없음"이 아니라 "금지 전이"가 맞다.
// 호출 전 loadRoles() 필요(atLeast 가 rank 캐시를 쓴다).
export function assertTransition(from, to, role) {
  if (!CONTENT_STATUSES.includes(to)) {
    throw new HttpError(400, 'BAD_REQUEST', `to 는 ${CONTENT_STATUSES.join('/')} 중 하나여야 합니다.`);
  }
  if (from === to) {
    throw new HttpError(409, 'CONFLICT', `이미 ${to} 상태입니다.`);
  }
  const required = requiredRoleFor(from, to);
  if (required === null) {
    throw new HttpError(409, 'CONFLICT', `${from} → ${to} 는 허용되지 않는 전이입니다.`);
  }
  if (!atLeast(role, required)) {
    throw new HttpError(403, 'FORBIDDEN', `${from} → ${to} 전이는 ${required} 이상만 가능합니다.`);
  }
}
