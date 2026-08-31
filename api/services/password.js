// scrypt 비밀번호 해시 — 해시 문자열에 파라미터를 내장해 나중에 파라미터를
// 올려도 기존 해시를 계속 검증할 수 있다.
// 형식: scrypt$N=16384,r=8,p=1,len=64$<salt_b64url>$<hash_b64url>
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

const PARAMS = { N: 16384, r: 8, p: 1, len: 64 };

function scryptAsync(password, salt, { N, r, p, len }) {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, len, { N, r, p, maxmem: 128 * N * r * 2 }, (err, key) =>
      err ? reject(err) : resolve(key));
  });
}

export async function hashPassword(password) {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, PARAMS);
  const { N, r, p, len } = PARAMS;
  return `scrypt$N=${N},r=${r},p=${p},len=${len}$${salt.toString('base64url')}$${key.toString('base64url')}`;
}

export async function verifyPassword(password, stored) {
  try {
    const [scheme, paramStr, saltB64, hashB64] = stored.split('$');
    if (scheme !== 'scrypt') return false;
    const params = Object.fromEntries(paramStr.split(',').map((kv) => {
      const [k, v] = kv.split('=');
      return [k, Number(v)];
    }));
    const salt = Buffer.from(saltB64, 'base64url');
    const expected = Buffer.from(hashB64, 'base64url');
    const actual = await scryptAsync(password, salt, {
      N: params.N, r: params.r, p: params.p, len: params.len,
    });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

// 존재하지 않는 이메일에도 동일한 시간 프로파일로 응답하기 위한 더미 검증용 해시
export const DUMMY_HASH =
  'scrypt$N=16384,r=8,p=1,len=64$AAAAAAAAAAAAAAAAAAAAAA$' + 'A'.repeat(86);
