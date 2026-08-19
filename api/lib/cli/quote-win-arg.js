// Windows CreateProcess 인용 규칙에 맞춘 argv 인용.
// 빈 문자열 인자(예: claude --allowed-tools "")를 보존해야 하므로 필요하다.
// POSIX spawn은 배열 인자를 그대로 전달하므로 이 함수를 쓰지 않는다.
export function quoteWinArg(arg) {
  if (arg === '') return '""';
  if (!/[\s"]/.test(arg)) return arg;
  return '"' + arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\+)$/, '$1$1') + '"';
}
