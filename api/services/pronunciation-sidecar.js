// 발음 평가 사이드카(lib/pronounce) 수명주기 — 설정 화면의 [설치]·[시작]·[중지] 버튼이 부른다.
// Ollama 처럼 "따로 띄우는 로컬 프로세스"지만, 이 앱은 개발자 1인 PC 에서 돌기 때문에
// 설치·기동을 화면에서 시킬 수 있게 한다. 규칙:
//  - production 에서는 아무것도 실행하지 않는다(canManage=false) — 서버에서 패키지를 까는 버튼은 개발 편의다.
//  - 설치는 동시에 하나만. 진행 로그는 마지막 N줄만 메모리에 두고 상태 조회에 실어준다.
//  - 사이드카는 detached 로 띄우고 pid 파일을 남긴다 — Node 를 재시작해도 살아 있고, [중지]가 pid 로 끝낸다.
//  - 오디오·모델은 여기서 다루지 않는다. 평가 호출은 pronunciation.service.js 의 몫.
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, openSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';

const IS_WIN = process.platform === 'win32';
export const SIDECAR_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../lib/pronounce');
const VENV_PY = IS_WIN ? path.join(SIDECAR_DIR, '.venv', 'Scripts', 'python.exe') : path.join(SIDECAR_DIR, '.venv', 'bin', 'python');
const PID_FILE = path.join(SIDECAR_DIR, '.sidecar.pid');
const LOG_FILE = path.join(SIDECAR_DIR, 'sidecar.log');
const LOG_TAIL = 60;

export const canManage = !config.isProduction;

export function isInstalled() {
  return existsSync(VENV_PY);
}

// Windows 의 phonemizer 는 DLL 경로를 환경변수로 받아야 espeak 를 찾는다(install-python.ps1 과 같은 후보).
// Linux 는 배포판 라이브러리 경로를 시도한다 — 없으면 phonemizer 가 시스템 탐색에 맡긴다.
export function findEspeakLibrary(env = process.env, exists = existsSync) {
  const candidates = IS_WIN
    ? [env.ProgramFiles, env['ProgramFiles(x86)']].filter(Boolean).map((p) => path.join(p, 'eSpeak NG', 'libespeak-ng.dll'))
    : ['/usr/lib/x86_64-linux-gnu/libespeak-ng.so.1', '/usr/lib/aarch64-linux-gnu/libespeak-ng.so.1', '/usr/lib/libespeak-ng.so.1',
      '/opt/homebrew/lib/libespeak-ng.dylib', '/usr/local/lib/libespeak-ng.dylib'];
  return candidates.find((p) => exists(p)) || null;
}

// ── 설치 작업 (동시에 하나) ────────────────────────────────────
const install = { state: 'idle', startedAt: null, finishedAt: null, exitCode: null, error: null, lines: [] };

function pushLine(s) {
  for (const line of String(s).split(/\r?\n/)) {
    if (!line.trim()) continue;
    install.lines.push(line.slice(0, 300));
    if (install.lines.length > LOG_TAIL) install.lines.shift();
  }
}

function assertManageable() {
  if (!canManage) throw new HttpError(403, 'READONLY', 'production 에서는 서버가 사이드카를 설치·기동하지 않습니다. 관리자에게 요청하세요.');
}

export function startInstall() {
  assertManageable();
  if (install.state === 'installing') throw new HttpError(409, 'CONFLICT', '설치가 이미 진행 중입니다.');
  const cmd = IS_WIN
    ? { bin: 'pwsh', args: ['-NoProfile', '-File', path.join(SIDECAR_DIR, 'install-python.ps1')], fallback: 'powershell' }
    : { bin: 'bash', args: [path.join(SIDECAR_DIR, 'install-python.sh')], fallback: null };
  Object.assign(install, { state: 'installing', startedAt: Date.now(), finishedAt: null, exitCode: null, error: null, lines: [] });
  pushLine(`$ ${cmd.bin} ${cmd.args.join(' ')}`);
  const run = (bin) => {
    const child = spawn(bin, cmd.args, { cwd: SIDECAR_DIR, env: { ...process.env, PYTHONUNBUFFERED: '1' }, windowsHide: true });
    child.stdout.on('data', pushLine);
    child.stderr.on('data', pushLine);
    child.on('error', (err) => {
      if (err.code === 'ENOENT' && cmd.fallback && bin !== cmd.fallback) { pushLine(`${bin} 없음 → ${cmd.fallback} 로 재시도`); run(cmd.fallback); return; }
      Object.assign(install, { state: 'failed', finishedAt: Date.now(), error: `${bin}: ${err.message}` });
    });
    child.on('exit', (code) => {
      if (install.state !== 'installing') return;
      Object.assign(install, { state: code === 0 ? 'done' : 'failed', finishedAt: Date.now(), exitCode: code, error: code === 0 ? null : `설치 스크립트 종료 코드 ${code}` });
    });
  };
  run(cmd.bin);
  return installStatus();
}

export function installStatus() {
  return { state: install.state, started_at: install.startedAt, finished_at: install.finishedAt, exit_code: install.exitCode, error: install.error, log_tail: install.lines.slice(-LOG_TAIL) };
}

// ── 사이드카 프로세스 ──────────────────────────────────────────
function readPid() {
  try { const n = Number(readFileSync(PID_FILE, 'utf8').trim()); return Number.isInteger(n) && n > 0 ? n : null; } catch { return null; }
}

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (err) { return err.code === 'EPERM'; }
}

export function sidecarPid() {
  const pid = readPid();
  if (pid && pidAlive(pid)) return pid;
  if (pid) { try { unlinkSync(PID_FILE); } catch { /* 무해 */ } } // 죽은 pid 파일 정리
  return null;
}

export function startSidecar({ port = 8000 } = {}) {
  assertManageable();
  if (!isInstalled()) throw new HttpError(409, 'CONFLICT', '사이드카가 설치되지 않았습니다. 먼저 설치하세요.');
  const existing = sidecarPid();
  if (existing) return { started: false, pid: existing };
  const env = { ...process.env, OPENPRONOUNCE_TTS: process.env.OPENPRONOUNCE_TTS || 'piper', OPENPRONOUNCE_DEVICE: process.env.OPENPRONOUNCE_DEVICE || 'cpu', PYTHONUNBUFFERED: '1' };
  const espeak = findEspeakLibrary();
  if (espeak && !env.PHONEMIZER_ESPEAK_LIBRARY) env.PHONEMIZER_ESPEAK_LIBRARY = espeak;
  mkdirSync(SIDECAR_DIR, { recursive: true });
  const log = openSync(LOG_FILE, 'a');
  const child = spawn(VENV_PY, ['-m', 'uvicorn', 'server:app', '--host', '127.0.0.1', '--port', String(port), '--app-dir', SIDECAR_DIR], {
    cwd: SIDECAR_DIR, env, detached: true, stdio: ['ignore', log, log], windowsHide: true,
  });
  child.unref();
  writeFileSync(PID_FILE, String(child.pid));
  return { started: true, pid: child.pid };
}

export function stopSidecar() {
  assertManageable();
  const pid = sidecarPid();
  if (!pid) return { stopped: false };
  try {
    if (IS_WIN) spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { windowsHide: true }).unref();
    else process.kill(pid, 'SIGTERM');
  } catch { /* 이미 죽었으면 무해 */ }
  try { unlinkSync(PID_FILE); } catch { /* 무해 */ }
  return { stopped: true, pid };
}

// 설정 화면 한 덩어리 — 설치됨 / 프로세스 살아 있음 / 설치 작업 상태 / 관리 가능 여부.
export function sidecarStatus() {
  return {
    can_manage: canManage,
    platform: process.platform,
    installed: isInstalled(),
    pid: sidecarPid(),
    espeak_library: findEspeakLibrary(),
    install: installStatus(),
    log_file: LOG_FILE,
  };
}
