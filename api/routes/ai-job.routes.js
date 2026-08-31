import { defaultProviderId, getProvider } from '../ai/registry.js';
import { readJson } from '../lib/body.js';
import { sendJson } from '../lib/respond.js';
import { oneOf, posInt, str, UUID_RE } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';
import * as jobs from '../services/ai-job.service.js';
import { kickAiJobWorker } from '../services/ai-job-worker.js';

export function registerAiJobRoutes(router) {
  router.get('/api/ai-jobs', async (req, res, { query }) => {
    const { user } = await requireUser(req, res);
    const status = oneOf(query.get('status') || undefined, 'status',
      ['queued', 'running', 'succeeded', 'failed'], { optional: true });
    const limit = posInt(query.get('limit'), 'limit', { optional: true, max: 100 }) ?? 20;
    sendJson(res, 200, { ok: true, jobs: await jobs.listJobs(user, { status, limit }) });
  });

  router.post('/api/ai-jobs', async (req, res) => {
    const { user } = await requireUser(req, res);
    const body = await readJson(req);
    const task = oneOf(body.task, 'task', jobs.AI_JOB_TASKS);
    const clientRequestId = str(body.client_request_id, 'client_request_id', { min: 36, max: 36, pattern: UUID_RE });
    const provider = str(body.provider, 'provider', { max: 40, optional: true }) || defaultProviderId();
    getProvider(provider); // 큐에 넣기 전에 오타/미지원 provider를 400으로 거절
    const model = str(body.model, 'model', { max: 100, optional: true }) ?? null;
    const created = await jobs.createJob(user, {
      task, input: body.input, clientRequestId, provider, model,
    });
    kickAiJobWorker();
    sendJson(res, 202, { ok: true, ...created });
  });

  router.get('/api/ai-jobs/:id', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    sendJson(res, 200, { ok: true, job: await jobs.getJob(user, posInt(params.id, 'id')) });
  });
}

