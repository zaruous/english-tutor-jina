import { sendJson } from '../lib/respond.js';
import { posInt } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';
import * as topics from '../services/topic.service.js';

export function registerTopicRoutes(router) {
  // 임계치(레슨3·시나리오1·단어20)는 더 이상 목록을 거르지 않는다(플랜 11 결정 3) —
  // 관리자가 새 토픽을 만들면 콘텐츠를 다 채우기 전까지 화면에 안 보여 저작이 막혔다.
  // 계산은 유지해 DTO 의 eligible 로 나가고, 관리 화면이 경고 배지로 쓴다.
  router.get('/api/topics', async (req, res) => {
    const { user } = await requireUser(req, res);
    sendJson(res, 200, {
      ok: true,
      topics: await topics.listTopics(user),
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
