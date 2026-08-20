// CORS — credentials 모드에서는 Allow-Origin: * 이 무효라 정확한 오리진을 에코한다.
// 변경 요청에는 X-Requested-With: jina 커스텀 헤더를 요구(CSRF 방어) —
// 커스텀 헤더는 프리플라이트를 유발하고, 프리플라이트는 오리진 허용목록에서 걸린다.
import { config } from '../config.js';
import { HttpError } from './errors.js';

export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader('Vary', 'Origin');

  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-Requested-With, X-Jina-Mode, X-Jina-No-Autologin',
      'Access-Control-Max-Age': '600',
    });
    res.end();
    return true; // 처리 끝
  }
  return false;
}

export function requireCsrfHeader(req) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return;
  if (req.headers['x-requested-with'] !== 'jina') {
    throw new HttpError(403, 'BAD_REQUEST', 'X-Requested-With 헤더가 필요합니다.');
  }
}
