import { HttpError } from './errors.js';

export function str(value, name, { min = 0, max = Infinity, pattern, optional = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined;
    throw new HttpError(400, 'BAD_REQUEST', `${name} 이(가) 필요합니다.`);
  }
  if (typeof value !== 'string') throw new HttpError(400, 'BAD_REQUEST', `${name} 은 문자열이어야 합니다.`);
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) {
    throw new HttpError(400, 'BAD_REQUEST', `${name} 길이는 ${min}~${max}자여야 합니다.`);
  }
  if (pattern && !pattern.test(trimmed)) {
    throw new HttpError(400, 'BAD_REQUEST', `${name} 형식이 올바르지 않습니다.`);
  }
  return trimmed;
}

export function oneOf(value, name, allowed, { optional = false } = {}) {
  if (value === undefined || value === null) {
    if (optional) return undefined;
    throw new HttpError(400, 'BAD_REQUEST', `${name} 이(가) 필요합니다.`);
  }
  if (!allowed.includes(value)) {
    throw new HttpError(400, 'BAD_REQUEST', `${name} 은 ${allowed.join('/')} 중 하나여야 합니다.`);
  }
  return value;
}

export function posInt(value, name, { optional = false, max = Number.MAX_SAFE_INTEGER } = {}) {
  if (value === undefined || value === null || value === '') {
    if (optional) return undefined;
    throw new HttpError(400, 'BAD_REQUEST', `${name} 이(가) 필요합니다.`);
  }
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > max) {
    throw new HttpError(400, 'BAD_REQUEST', `${name} 은 양의 정수여야 합니다.`);
  }
  return n;
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const WORD_RE = /^[a-zA-Z][a-zA-Z\-' ]{0,63}$/;
export const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
