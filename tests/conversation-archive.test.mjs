// 회화 세션 보관 — listSessions 필터 · patchSession archived_at
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { createSession, listSessions, patchSession } from '../api/services/conversation.service.js';
import { closeDb, createUser, dropUser, setupDb } from './helpers/db.mjs';

let user;

before(async () => {
  await setupDb();
  user = await createUser();
});

after(async () => {
  if (user) await dropUser(user.id);
  await closeDb();
});

describe('conversation archive', () => {
  it('보관하면 active 목록에서 빠지고 archived 목록에만 보인다', async () => {
    const { session } = await createSession(user, { title: '보관 테스트' });
    assert.equal(session.archived, false);
    assert.equal(session.archived_at, null);

    const { session: archived } = await patchSession(user, session.id, { archived: true });
    assert.equal(archived.archived, true);
    assert.ok(archived.archived_at);

    const active = (await listSessions(user)).sessions;
    assert.ok(!active.some((s) => s.id === session.id));

    const stored = (await listSessions(user, { archived: true })).sessions;
    assert.ok(stored.some((s) => s.id === session.id));
  });
});
