import { sendJson } from '../lib/respond.js';
import { posInt } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';
import * as topics from '../services/topic.service.js';

export function registerTopicRoutes(router) {
  // 기본은 임계치(레슨3·시나리오1·단어20)를 충족한 토픽만. all=1은 생성 UI/검증용.
  router.get('/api/topics', async (req, res, { query }) => {
    const { user } = await requireUser(req, res);
    sendJson(res, 200, {
      ok: true,
      topics: await topics.listTopics(user, { includeIneligible: query.get('all') === '1' }),
    });
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
