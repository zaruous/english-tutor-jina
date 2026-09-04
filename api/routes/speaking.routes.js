import { readMultipart } from '../lib/body.js';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { posInt, str } from '../lib/validate.js';
import { sendJson } from '../lib/respond.js';
import { requireAdmin, requireUser } from '../middleware/auth.js';
import * as speaking from '../services/speaking.service.js';
import * as pronunciation from '../services/pronunciation.service.js';
import * as sidecar from '../services/pronunciation-sidecar.js';

// 문장 은행(speaking.service usableSentence)과 같은 기준 — 마크업 문자·제어문자만 막는다. 곡선 따옴표 등 비 ASCII 는 허용.
const REFERENCE_TEXT_RE = /^[^<>{}\x00-\x1f]+$/;

// assess/status 응답의 sidecar 블록에서 서버 내부 정보만 걷어낸다(플랜 10.5 S1).
// sidecarStatus() 는 관리 화면용이라 서버 절대경로(log_file·espeak_library)와 설치 스크립트
// stdout 60줄(install.log_tail)을 통째로 싣는다 — 학습자에게 나가면 서버 파일 구조가 그대로 노출된다.
// can_manage·installed·pid·install.state 는 남긴다: 설정 화면이 상태 배지를 그리는 데 필요하고
// 그 자체로는 서버 내부를 드러내지 않는다.
function redactSidecar(status) {
  if (!status?.sidecar) return status;
  const { log_file, espeak_library, install, ...safe } = status.sidecar;
  return { ...status, sidecar: { ...safe, install: install ? { ...install, log_tail: [] } : install } };
}

export function registerSpeakingRoutes(router) {
  // 읽기 연습 문장 은행 — 기존 콘텐츠 파생(플랜 08 Phase C). 비면 화면이 고정 시드로 폴백한다.
  router.get('/api/speaking/sentences', async (req, res, { query }) => {
    const { user } = await requireUser(req, res);
    const limit = posInt(query.get('limit') || undefined, 'limit', { optional: true, max: 40 }) ?? 20;
    sendJson(res, 200, { ok: true, ...(await speaking.listSpeakingSentences(user, { limit })) });
  });

  // 발음 평가 모드 — 화면이 녹음 전에 배지("발음 평가" / "받아쓰기 연습")를 그릴 때 본다(플랜 10 §5-3).
  // 라우트는 requireUser 로 둔다 — 설정 화면이 사이드카 상태를 표시해야 하므로 학습자도 읽어야 한다.
  // 대신 관리자가 아니면 서버 내부 정보를 뺀다(redactSidecar). can_admin 은 toAuthUser 가 넣어준다.
  router.get('/api/speaking/assess/status', async (req, res, { query }) => {
    const { user } = await requireUser(req, res);
    const status = await pronunciation.assessStatus({ force: query.get('force') === '1' });
    sendJson(res, 200, { ok: true, ...(user.can_admin ? status : redactSidecar(status)) });
  });

  // 사이드카 관리 — 설정 화면의 [설치]·[시작]·[중지].
  // 이 셋은 서버에서 프로세스를 띄우고 디스크를 채운다(install 은 pip 2.4GB, start 는 uvicorn detached spawn).
  // 그래서 관문이 둘이고, 둘은 서로 다른 것을 막는다 — 없애면 안 된다(플랜 10.5 §2 결정 2):
  //  - requireAdmin: **누가** — 학습자 계정이 서버에서 프로세스를 띄우지 못하게 한다(403 FORBIDDEN).
  //  - sidecar.canManage(= !isProduction): **어디서** — 운영 서버에서는 관리자여도 실행하지 않는다(403 READONLY).
  // 개발 시드는 jina@dev.local 에 role='admin' 을 주므로(db/seeds/dev.mjs) DEV_AUTOLOGIN 세션은 그대로 쓸 수 있다.
  // 10.5 열린 질문 2 의 답이 이것이다 — `is_dev OR is_admin` 같은 세 번째 권한 등급을 만들지 않는다(10.7 §3.3).
  // 설치는 백그라운드 작업이라 202 로 받고, 진행은 status 의 sidecar.install 로 본다.
  router.post('/api/speaking/sidecar/install', async (req, res) => {
    await requireAdmin(req, res);
    sendJson(res, 202, { ok: true, install: sidecar.startInstall() });
  });
  router.post('/api/speaking/sidecar/start', async (req, res) => {
    await requireAdmin(req, res);
    sendJson(res, 200, { ok: true, ...sidecar.startSidecar() });
  });
  router.post('/api/speaking/sidecar/stop', async (req, res) => {
    await requireAdmin(req, res);
    sendJson(res, 200, { ok: true, ...sidecar.stopSidecar() });
  });

  // 발음 평가 — multipart: audio(파일) + reference_text. 오디오는 메모리에서만 다루고 저장하지 않는다.
  // 백엔드 미설정·사이드카 다운·한도 초과는 200 { available:false, reason } — 화면이 v1 폴백으로 내려가는 신호다.
  router.post('/api/speaking/assess', async (req, res) => {
    const { user } = await requireUser(req, res);
    const form = await readMultipart(req, { limit: config.pronunciation.maxAudioBytes + 64 * 1024 });
    const referenceText = str(form.get('reference_text'), 'reference_text', { min: 2, max: 300, pattern: REFERENCE_TEXT_RE });
    const file = form.get('audio');
    if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
      throw new HttpError(400, 'BAD_REQUEST', 'audio 파일이 필요합니다.');
    }
    const audio = Buffer.from(await file.arrayBuffer());
    if (!audio.length) throw new HttpError(400, 'BAD_REQUEST', 'audio 가 비어 있습니다.');
    if (audio.length > config.pronunciation.maxAudioBytes) {
      throw new HttpError(413, 'PROMPT_TOO_LONG', `audio 가 너무 큽니다 (${audio.length} bytes).`);
    }
    const result = await pronunciation.assess({
      audio,
      mime: file.type || 'audio/webm',
      filename: file.name || 'clip.webm',
      referenceText,
      userId: user.id,
    });
    sendJson(res, 200, { ok: true, reference_text: referenceText, ...result });
  });
}
