// PATH에서 실행 파일 탐색 (크로스 플랫폼).
// win32에서는 PATHEXT(.exe/.cmd/.bat)까지 시도하고, 확장자를 그대로 반환해
// 호출측이 .cmd shim(직접 spawn 불가)을 감지할 수 있게 한다.
import { accessSync, constants } from 'node:fs';
import { delimiter, join } from 'node:path';

const WIN = process.platform === 'win32';

export function which(name) {
  const paths = (process.env.PATH || '').split(delimiter).filter(Boolean);
  const exts = WIN
    ? (process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';').map((e) => e.toLowerCase())
    : [''];
  for (const dir of paths) {
    for (const ext of exts) {
      const full = join(dir, name + ext);
      try {
        accessSync(full, WIN ? constants.F_OK : constants.X_OK);
        return full;
      } catch { /* 다음 후보 */ }
    }
  }
  return null;
}
