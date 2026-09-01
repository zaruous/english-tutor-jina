import { readMultipart } from '../lib/body.js';
import { config } from '../config.js';
import { HttpError } from '../lib/errors.js';
import { posInt, str } from '../lib/validate.js';
import { sendJson } from '../lib/respond.js';
import { requireUser } from '../middleware/auth.js';
import * as speaking from '../services/speaking.service.js';
import * as pronunciation from '../services/pronunciation.service.js';
import * as sidecar from '../services/pronunciation-sidecar.js';

// 문장 은행(speaking.service usableSentence)과 같은 기준 — 마크업 문자·제어문자만 막는다. 곡선 따옴표 등 비 ASCII 는 허용.
const REFERENCE_TEXT_RE = /^[^<>{}\x00-\x1f]+$/;

export function registerSpeakingRoutes(router) {
  // 읽기 연습 문장 은행 — 기존 콘텐츠 파생(플랜 08 Phase C). 비면 화면이 고정 시드로 폴백한다.
  router.get('/api/speaking/sentences', async (req, res, { query }) => {
    const { user } = await requireUser(req, res);
    const limit = posInt(query.get('limit') || undefined, 'limit', { optional: true, max: 40 }) ?? 20;
    sendJson(res, 200, { ok: true, ...(await speaking.listSpeakingSentences(user, { limit })) });
  });

  // 발음 평가 모드 — 화면이 녹음 전에 배지("발음 평가" / "받아쓰기 연습")를 그릴 때 본다(플랜 10 §5-3).
  router.get('/api/speaking/assess/status', async (req, res, { query }) => {
    await requireUser(req, res);
    sendJson(res, 200, { ok: true, ...(await pronunciation.assessStatus({ force: query.get('force') === '1' })) });
  });

  // 사이드카 관리 — 설정 화면의 [설치]·[시작]·[중지]. production 에서는 403(READONLY).
  // 설치는 백그라운드 작업이라 202 로 받고, 진행은 status 의 sidecar.install 로 본다.
  router.post('/api/speaking/sidecar/install', async (req, res) => {
    await requireUser(req, res);
    sendJson(res, 202, { ok: true, install: sidecar.startInstall() });
  });
  router.post('/api/speaking/sidecar/start', async (req, res) => {
    await requireUser(req, res);
    sendJson(res, 200, { ok: true, ...sidecar.startSidecar() });
  });
  router.post('/api/speaking/sidecar/stop', async (req, res) => {
    await requireUser(req, res);
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
