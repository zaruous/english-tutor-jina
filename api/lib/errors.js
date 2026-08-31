// HttpError + 에러코드 → HTTP 상태 매핑 + provider별 한국어 hint
export class HttpError extends Error {
  constructor(status, code, message, extra = {}) {
    super(message || code);
    this.status = status;
    this.code = code;
    this.extra = extra;
  }
}

export const CODE_STATUS = {
  BAD_REQUEST: 400, UNKNOWN_PROVIDER: 400,
  UNAUTHORIZED: 401, INVALID_CREDENTIALS: 401,
  READONLY: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  PROMPT_TOO_LONG: 413,
  RATE_LIMITED: 429,
  SCHEMA_VIOLATION: 502, CLI_FAILED: 502,
  CLI_NOT_FOUND: 503, NOT_LOGGED_IN: 503, BUSY: 503,
  TIMEOUT: 504,
  INTERNAL: 500,
};

const LOGIN_HINTS = {
  claude: '터미널에서 `claude` 를 실행해 로그인한 뒤 다시 시도하세요.',
  agy: '터미널에서 `agy` 를 실행해 로그인한 뒤 다시 시도하세요.',
  codex: '터미널에서 `codex login` 실행 후 재확인하세요.',
  cursor: '터미널에서 `cursor-agent login` 실행 후 재확인하세요.',
  ollama: '`ollama serve` 가 실행 중인지, OLLAMA_URL이 맞는지 확인하세요.',
};

export function hintFor(code, provider) {
  switch (code) {
    case 'CLI_NOT_FOUND':
      return provider === 'ollama'
        ? LOGIN_HINTS.ollama
        : `${provider} CLI가 설치되어 있지 않습니다. 설치 후 다시 시도하세요.`;
    case 'NOT_LOGGED_IN':
      return LOGIN_HINTS[provider] || '해당 CLI에 로그인한 뒤 다시 시도하세요.';
    case 'BUSY':
      return 'AI 요청이 몰려 있습니다. 잠시 후 다시 시도하세요.';
    case 'TIMEOUT':
      return '응답이 제한 시간을 넘겼습니다. 다시 시도하거나 더 빠른 provider/모델로 바꿔 보세요.';
    case 'SCHEMA_VIOLATION':
      return '모델이 형식에 맞는 응답을 주지 않았습니다. 다시 시도하거나 다른 provider를 써 보세요.';
    case 'PROMPT_TOO_LONG':
      return '입력이 너무 깁니다. 문장을 줄여서 다시 보내세요.';
    case 'READONLY':
      return '캔버스에서는 저장이 비활성화되어 있습니다. 앱(index.html)에서 사용하세요.';
    default:
      return undefined;
  }
}

// pg 에러 코드 → HttpError (원본 pg 에러는 절대 클라이언트로 내보내지 않는다)
export function fromPgError(err) {
  if (err.code === '23505') return new HttpError(409, 'CONFLICT', '이미 존재합니다.');
  if (err.code === '23503') return new HttpError(404, 'NOT_FOUND', '참조 대상이 없습니다.');
  if (err.code === '23514') return new HttpError(400, 'BAD_REQUEST', '값이 허용 범위를 벗어났습니다.');
  if (err.code === '57014') return new HttpError(504, 'TIMEOUT', '쿼리가 제한 시간을 넘겼습니다.');
  return null;
}
