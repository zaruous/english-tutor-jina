import { sendJson } from '../lib/respond.js';
import { str } from '../lib/validate.js';
import { requireUser } from '../middleware/auth.js';
import * as codeLookup from '../services/code-lookup.service.js';

export function registerCodeRoutes(router) {
  router.get('/api/codes/:key', async (req, res, { params }) => {
    const { user } = await requireUser(req, res);
    const key = str(params.key, 'key', { min: 1, max: 40 });
    sendJson(res, 200, { ok: true, ...(await codeLookup.listCodeItems(user, key)) });
  });
}
