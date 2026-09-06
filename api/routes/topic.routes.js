import { sendJson } from '../lib/respond.js';
import { posInt } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';
import * as topics from '../services/topic.service.js';

export function registerTopicRoutes(router) {
  // 노출은 status(published)가 결정한다 — eligible 임계치는 DTO 필드로만 내려간다(플랜 11 결정 3).
  // 구 all=1 파라미터는 필터가 사라져 의미가 없어졌다(받아도 무시).
  router.get('/api/topics', async (req, res) => {
    const { user } = await requireUser(req, res);
    sendJson(res, 200, { ok: true, topics: await topics.listTopics(user) });
  });

  router.get('/api/topics/:id', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    sendJson(res, 200, { ok: true, ...(await topics.getTopic(user, posInt(params.id, 'id'))) });
  });

  router.get('/api/scenarios', async (req, res, { query }) => {
    const { user } = await requireUser(req, res);
    const topicId = posInt(query.get('topic_id'), 'topic_id', { optional: true });
    sendJson(res, 200, { ok: true, scenarios: await topics.listScenarios(user, { topicId }) });
  });

  router.post('/api/vocab-sets/:id/add', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    sendJson(res, 200, {
      ok: true,
      ...(await topics.addVocabSetToCards(user, posInt(params.id, 'id'))),
    });
  });
}
