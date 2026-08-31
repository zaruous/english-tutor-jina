export function parseCookies(req) {
  const header = req.headers.cookie;
  if (!header) return {};
  const out = {};
  for (const part of header.split(';')) {
    const idx = part.indexOf('=');
    if (idx === -1) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) out[name] = decodeURIComponent(value);
  }
  return out;
}

// localhost:3003 → :3004 는 cross-origin이지만 same-site(SameSite 판정에 포트 미포함)
// 이므로 SameSite=Lax로 충분하다. None은 Secure를 강제해 http 로컬에서 쿠키가 버려진다.
export function serializeCookie(name, value, { maxAgeSec, secure } = {}) {
  const parts = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (maxAgeSec !== undefined) parts.push(`Max-Age=${maxAgeSec}`);
  if (secure) parts.push('Secure');
  return parts.join('; ');
}
