// code-lookup.js — 드롭다운 등 UI 가 쓸 기준정보(code) 테이블 화이트리스트.
// GET /api/codes/:key 는 여기 등록된 key 만 허용한다 — 임의 SQL 경로를 열지 않는다.

import { HttpError } from './errors.js';

export const CODE_LOOKUPS = Object.freeze({
  roles: {
    requireRole: 'admin',
    listSql: `SELECT code, rank, name, description FROM roles ORDER BY rank`,
  },
});

export function assertCodeLookupKey(key) {
  const meta = CODE_LOOKUPS[key];
  if (!meta) throw new HttpError(400, 'BAD_REQUEST', '유효하지 않은 코드 테이블입니다.');
  return meta;
}
