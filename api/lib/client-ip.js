// 클라이언트 IP 판정 — 레이트리밋 키(`이메일|IP`)와 세션 기록이 같은 값을 보게 한곳에 모은다.
//
// 브라우저 요청은 정적 서버(server.js)의 `/api/*` 프록시를 거쳐 오므로, API 입장에서
// `req.socket.remoteAddress` 는 언제나 루프백이다. 그래서 로그인 레이트리밋의 IP 축이
// 사실상 죽어 있었다(플랜 10.5 S6 — 이메일 단위 제한만 남았다).
//
// 프록시가 `X-Forwarded-For` 를 **덮어써서** 붙여주고, 여기서는 소켓 상대가 루프백일 때만
// 그 헤더를 믿는다. 루프백이 아닌데도 믿으면 아무나 헤더 한 줄로 IP 축을 스푸핑한다
// (정적 서버를 거치지 않고 API 포트로 직접 때리는 경로가 열려 있다).
//
// 주의: 정적 서버 앞에 또 다른 리버스 프록시를 두는 배포는 이 신뢰 조건을 바꿔야 한다
// (플랜 10.5 §5 구현자 메모). 그런 배포는 이 플랜 범위 밖이다.

// `::ffff:127.0.0.1` 은 IPv6 소켓이 IPv4 연결을 받을 때(듀얼 스택) 나오는 형태다.
const LOOPBACK = new Set(['127.0.0.1', '::1', '::ffff:127.0.0.1']);

export function clientIp(req) {
  const remote = req.socket?.remoteAddress;
  if (!LOOPBACK.has(remote)) return remote;

  // Node 는 들어온 헤더 이름을 소문자로 정규화한다. 같은 이름이 여러 번 오면 ", " 로 합쳐진다.
  const raw = req.headers?.['x-forwarded-for'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') return remote;

  // 프록시를 여러 번 거치면 "client, proxy1, proxy2" 로 쌓인다 — 원 클라이언트는 첫 값이다.
  const first = value.split(',')[0].trim();
  return first || remote;
}
