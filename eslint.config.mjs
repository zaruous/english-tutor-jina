// 최소 린트 (플랜 10.7 Phase 3) — 미사용 변수와 no-undef 수준만 본다.
// 전면 스타일 규칙은 범위 밖이다: 6.6k LOC 에 스타일 규칙을 한꺼번에 켜면 진짜 결함이
// 수백 개의 서식 경고에 묻힌다. 잡으려는 것은 오타·죽은 코드·전역 오용뿐이다.
//
// src/**/*.jsx 는 대상이 아니다. 브라우저에서 Babel 이 JSX 를 변환하는 구조라
// 린트에 JSX 파서를 새로 들여야 하고, 그것은 이 Phase 의 범위(자동 게이트 도입)를 넘는다.
// Playwright 스크립트는 page.evaluate 안에서 브라우저 전역을 쓴다 — Node 파일이지만 두 세계를 오간다.
const BROWSER_GLOBALS = {
  window: 'readonly',
  document: 'readonly',
  navigator: 'readonly',
  localStorage: 'readonly',
  sessionStorage: 'readonly',
  structuredClone: 'readonly',
  getComputedStyle: 'readonly',
};

export default [
  {
    files: ['api/**/*.js', 'db/**/*.mjs', 'scripts/**/*.mjs', 'tests/**/*.mjs', 'server.js', 'eslint.config.mjs'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        process: 'readonly',
        console: 'readonly',
        Buffer: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        TextEncoder: 'readonly',
        TextDecoder: 'readonly',
        AbortController: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        FormData: 'readonly',
        Blob: 'readonly',
        Response: 'readonly',
        AbortSignal: 'readonly',
        setImmediate: 'readonly',
        __dirname: 'readonly',
      },
    },
    linterOptions: { reportUnusedDisableDirectives: true },
    rules: {
      'no-undef': 'error',
      // ignoreRestSiblings — `const { password_hash, ...dto } = row` 는 이 코드베이스가
      // DTO 에서 필드를 떼어내는 관용구다. 그 이름을 "미사용"으로 잡으면 규칙이 노이즈가 된다.
      'no-unused-vars': ['error', {
        args: 'after-used', argsIgnorePattern: '^_', caughtErrors: 'none', ignoreRestSiblings: true,
      }],
      'no-dupe-keys': 'error',
      'no-dupe-args': 'error',
      'no-duplicate-case': 'error',
      'no-unreachable': 'error',
      'no-const-assign': 'error',
      'no-self-compare': 'error',
      'require-atomic-updates': 'off',
    },
  },
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: { globals: BROWSER_GLOBALS },
  },
];
