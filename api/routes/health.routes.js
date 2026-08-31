import { pool } from '../lib/pool.js';
import { sendJson } from '../lib/respond.js';

export function registerHealthRoutes(router) {
  router.get('/api/health', async (req, res) => {
    let db = false;
    try {
      await pool.query('SELECT 1');
      db = true;
    } catch { /* db=false */ }
    sendJson(res, db ? 200 : 503, { ok: db, db, uptime_s: Math.round(process.uptime()) });
  });
}
