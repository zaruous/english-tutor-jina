// 관리자 콘텐츠 — 상태 축·전이·저작 (플랜 11 Phase 1·2 + 플랜 13 Phase A).
// 플랜 11 Phase 1 검증 3묶음의 단위 테스트판:
//   1) 0018 CHECK — archived+public 이 저장되고(확정안), review+public 은 거부된다.
//   2) 음성 픽스처 — draft 는 학습 API 0건, archived 는 오답 노트에 남고 목록·분모에서 빠진다.
//   3) 역할 × 전이 매트릭스 — author/reviewer 별 허용·403·409 구분, 자가 승인 표시와 차단.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { setupDb, closeDb, createUser, pool } from './helpers/db.mjs';

after(() => closeDb());

async function userWithRole(role) {
  const user = await createUser();
  await pool.query(`UPDATE users SET role = $2 WHERE id = $1`, [user.id, role]);
  return { ...user, role };
}

// 픽스처 레슨 — 검증을 통과하는 최소 페이로드
function lessonPayload(overrides = {}) {
  return {
    kind: 'toeic_part5',
    title: '테스트 Part 5 세트',
    subtitle: '단위 테스트',
    difficulty: 3,
    passage: { type: 'PART 5', subject: 'Incomplete Sentences', body: ['Choose the best answer.'] },
    items: [{
      stem: 'The report ___ by Friday.',
      options: [
        { id: 'A', text: 'submit' }, { id: 'B', text: 'must be submitted' },
        { id: 'C', text: 'submitting' }, { id: 'D', text: 'submits' },
      ],
      answer: 'B',
      explanation: '정답은 (B) — 수동태가 필요합니다.',
      skill_code: 'grammar',
    }],
    ...overrides,
  };
}

test('0018 — archived+public 은 저장되고 review+public 은 거부된다, status 생략은 draft', async () => {
  await setupDb();
  await pool.query(
    `INSERT INTO content_items (type, slug, title, status, visibility)
     VALUES ('lesson', 'ck-archived-public', '내린 공개 레슨', 'archived', 'public')`);
  const { rows: [row] } = await pool.query(
    `SELECT status, visibility FROM content_items WHERE slug = 'ck-archived-public'`);
  assert.deepEqual(row, { status: 'archived', visibility: 'public' });

  await assert.rejects(
    pool.query(
      `INSERT INTO content_items (type, slug, title, status, visibility)
       VALUES ('lesson', 'ck-review-public', 'x', 'review', 'public')`),
    (e) => e.code === '23514' || /허용 범위|check/i.test(e.message),
  );

  await pool.query(
    `INSERT INTO content_items (type, slug, title) VALUES ('lesson', 'ck-default', '기본값 확인')`);
  const { rows: [d] } = await pool.query(
    `SELECT status, visibility FROM content_items WHERE slug = 'ck-default'`);
  assert.deepEqual(d, { status: 'draft', visibility: 'private' });
});

test('scope — draft 는 학습 목록·분모 0건, archived 는 오답 노트에 남고 목록에서 빠진다', async () => {
  await setupDb();
  const learner = await createUser();
  const author = await userWithRole('author');
  const lessons = await import('../api/services/lesson.service.js');

  // 다른 사용자 소유의 draft(private 강제) 레슨 — 어떤 학습 API 에도 나오면 안 된다
  const { rows: [draft] } = await pool.query(
    `INSERT INTO content_items (type, slug, title, status, visibility, created_by)
     VALUES ('lesson', 'scope-draft', '초안 레슨', 'draft', 'private', $1) RETURNING id`,
    [author.id]);
  await pool.query(
    `INSERT INTO lesson_details (content_id, passage) VALUES ($1, '{"type":"PART 5"}'::jsonb)`,
    [draft.id]);

  const before = await lessons.listLessons(learner, {});
  assert.ok(!before.lessons.some((l) => l.id === draft.id), 'draft 가 목록에 노출됨');

  // 시드 published 레슨 하나를 풀고 → archived+public 으로 내린다
  const { rows: [seed] } = await pool.query(
    `SELECT c.id FROM content_items c JOIN lesson_details d ON d.content_id = c.id
      WHERE c.type = 'lesson' AND c.status = 'published' AND c.visibility = 'public'
      ORDER BY c.id LIMIT 1`);
  const { rows: items } = await pool.query(
    `SELECT position, options, answer FROM lesson_items WHERE content_id = $1 ORDER BY position`,
    [seed.id]);
  // 전부 오답으로 제출 — 오답 노트에 남는 근거를 만든다
  const wrongAnswers = Object.fromEntries(items.map((i) => {
    const wrong = i.options.find((o) => o.id !== i.answer)?.id ?? i.answer;
    return [String(i.position), wrong];
  }));
  await lessons.submitAttempt(learner, seed.id, { answers: wrongAnswers });

  const withSeed = await lessons.listLessons(learner, {});
  const totalBefore = withSeed.progress.total;

  await pool.query(`UPDATE content_items SET status = 'archived' WHERE id = $1`, [seed.id]);

  const afterArchive = await lessons.listLessons(learner, {});
  assert.ok(!afterArchive.lessons.some((l) => l.id === seed.id), 'archived 가 목록에 남아 있음');
  assert.equal(afterArchive.progress.total, totalBefore - 1, 'archived 가 진행률 분모에 남아 있음');

  // 오답 노트(resolvable 성질)에는 남는다 — 이 한 줄이 결정 2 의 검증이다
  const mistakes = await lessons.listMistakes(learner, {});
  assert.ok(mistakes.mistakes.some((m) => m.lesson_id === seed.id), 'archived 레슨의 오답이 사라짐');

  await pool.query(`UPDATE content_items SET status = 'published' WHERE id = $1`, [seed.id]); // 원복
});

test('역할 × 전이 매트릭스 — author/reviewer 허용·403·409, 감사 로그 1행씩', async () => {
  await setupDb();
  const svc = await import('../api/services/admin-content.service.js');
  const author = await userWithRole('author');
  const reviewer = await userWithRole('reviewer');

  const { content } = await svc.createLesson(author, lessonPayload());
  assert.equal(content.status, 'draft');
  assert.equal(content.visibility, 'private');
  assert.equal(content.source, 'curated');
  assert.equal(content.items.length, 1);

  // author: draft → review 허용
  const { content: inReview } = await svc.transitionStatus(author, content.id, { to: 'review' });
  assert.equal(inReview.status, 'review');

  // author: review → published 는 403 (권한 문제)
  await assert.rejects(
    svc.transitionStatus(author, content.id, { to: 'published' }),
    (e) => e.status === 403,
  );

  // 금지 전이는 역할과 무관하게 409 (상태 문제): review 에서 archived 로는 못 간다
  await assert.rejects(
    svc.transitionStatus(reviewer, content.id, { to: 'archived' }),
    (e) => e.status === 409,
  );

  // reviewer: 승인 → published, 내리기 → archived, published → draft 는 409
  const { content: published } = await svc.transitionStatus(reviewer, content.id, { to: 'published' });
  assert.equal(published.status, 'published');
  await assert.rejects(
    svc.transitionStatus(reviewer, content.id, { to: 'draft' }),
    (e) => e.status === 409,
  );
  const { content: archived } = await svc.transitionStatus(reviewer, content.id, { to: 'archived' });
  assert.equal(archived.status, 'archived');

  // author: published ↔ archived 는 403
  await assert.rejects(
    svc.transitionStatus(author, content.id, { to: 'published' }),
    (e) => e.status === 403,
  );

  const { rows: audit } = await pool.query(
    `SELECT action, from_status, to_status FROM content_audit_log
      WHERE content_id = $1 ORDER BY id`, [content.id]);
  assert.deepEqual(audit, [
    { action: 'create', from_status: null, to_status: null },
    { action: 'status_change', from_status: 'draft', to_status: 'review' },
    { action: 'status_change', from_status: 'review', to_status: 'published' },
    { action: 'status_change', from_status: 'published', to_status: 'archived' },
  ]);
});

test('자가 승인 — self_review 표시가 남고, REQUIRE_SEPARATE_REVIEWER=1 이면 403', async () => {
  await setupDb();
  const svc = await import('../api/services/admin-content.service.js');
  const reviewer = await userWithRole('reviewer');

  const { content } = await svc.createLesson(reviewer, lessonPayload({ title: '자가 승인 검증' }));

  process.env.REQUIRE_SEPARATE_REVIEWER = '1';
  try {
    await assert.rejects(
      svc.transitionStatus(reviewer, content.id, { to: 'published' }),
      (e) => e.status === 403,
    );
  } finally {
    delete process.env.REQUIRE_SEPARATE_REVIEWER;
  }

  await svc.transitionStatus(reviewer, content.id, { to: 'published' });
  const { rows: [audit] } = await pool.query(
    `SELECT note FROM content_audit_log
      WHERE content_id = $1 AND action = 'status_change' AND to_status = 'published'`,
    [content.id]);
  assert.match(audit.note, /self_review=true/);
});

test('공개 여닫기 — draft 는 409, published 는 공개/비공개 왕복 + 감사 로그', async () => {
  await setupDb();
  const svc = await import('../api/services/admin-content.service.js');
  const reviewer = await userWithRole('reviewer');

  const { content } = await svc.createLesson(reviewer, lessonPayload({ title: '공개 여닫기 검증' }));
  await assert.rejects(
    svc.setVisibility(reviewer, content.id, { to: 'public' }),
    (e) => e.status === 409,
  );

  await svc.transitionStatus(reviewer, content.id, { to: 'published' });
  const { content: opened } = await svc.setVisibility(reviewer, content.id, { to: 'public' });
  assert.equal(opened.visibility, 'public');

  // 내려도(archived) 공개범위는 유지된다 — 0018 확정안의 존재 이유
  const { content: archived } = await svc.transitionStatus(reviewer, content.id, { to: 'archived' });
  assert.equal(archived.visibility, 'public');

  const { rows: [n] } = await pool.query(
    `SELECT count(*)::int AS cnt FROM content_audit_log
      WHERE content_id = $1 AND action = 'visibility_change'`, [content.id]);
  assert.equal(n.cnt, 1);
});

test('저작 검증 — 규칙 위반은 422 + validation_errors, 저장 0건', async () => {
  await setupDb();
  const svc = await import('../api/services/admin-content.service.js');
  const author = await userWithRole('author');

  const { rows: [{ cnt: before }] } = await pool.query(
    `SELECT count(*)::int AS cnt FROM content_items`);

  // 해설이 정답 (B) 를 가리키지 않는다 + 보기 중복 — AI 생성과 같은 규칙으로 거부돼야 한다
  const bad = lessonPayload();
  bad.items[0].explanation = '수동태가 필요합니다.';
  bad.items[0].options[2].text = 'submit';
  await assert.rejects(
    svc.createLesson(author, bad),
    (e) => e.status === 422 && Array.isArray(e.extra?.validation_errors)
      && e.extra.validation_errors.length >= 2,
  );

  // LC — 화자 라벨 잔존·짧은 대사도 같은 경로로 거부된다
  const badLc = lessonPayload({
    kind: 'toeic_lc',
    passage: {
      type: 'LISTENING', subject: 'Short Conversation',
      body: [
        { speaker: 'M', text: 'M: short' }, { speaker: 'W', text: 'Sure, that works for me today.' },
        { speaker: 'M', text: 'Could you send the file by noon?' }, { speaker: 'W', text: 'Of course, right away sir.' },
      ],
    },
  });
  await assert.rejects(
    svc.createLesson(author, badLc),
    (e) => e.status === 422,
  );

  const { rows: [{ cnt: after }] } = await pool.query(
    `SELECT count(*)::int AS cnt FROM content_items`);
  assert.equal(after, before, '검증 실패인데 행이 저장됨');
});

test('수정 — 시드 레슨 편집이 curated 로 표시되고 재시드가 덮어쓰지 않는다', async () => {
  await setupDb();
  const svc = await import('../api/services/admin-content.service.js');
  const { seedContent } = await import('../db/seeds/content.mjs');
  const author = await userWithRole('author');

  const { rows: [seed] } = await pool.query(
    `SELECT c.id FROM content_items c JOIN lesson_details d ON d.content_id = c.id
      WHERE c.source = 'seed' AND c.type = 'lesson' ORDER BY c.id LIMIT 1`);
  const { content: loaded } = await svc.getContent(author, seed.id);
  assert.ok(loaded.items.length >= 1);
  assert.ok(loaded.items[0].answer, '에디터 상세에는 정답이 있어야 한다');

  const payload = {
    kind: loaded.detail.kind,
    title: '관리자가 고친 제목',
    subtitle: loaded.detail.subtitle,
    difficulty: loaded.difficulty,
    est_minutes: loaded.detail.est_minutes,
    passage: loaded.detail.passage,
    vocab: loaded.detail.vocab,
    faq: loaded.detail.faq,
    items: loaded.items.map((i) => ({
      stem: i.stem, options: i.options, answer: i.answer,
      explanation: i.explanation.includes(`(${i.answer})`)
        ? i.explanation : `정답은 (${i.answer}) — ${i.explanation}`,
      skill_code: i.skill_code,
    })),
  };
  const { content: updated } = await svc.updateLesson(author, seed.id, payload);
  assert.equal(updated.title, '관리자가 고친 제목');
  assert.equal(updated.source, 'curated');

  const client = await pool.connect();
  try { await seedContent(client); } finally { client.release(); }
  const { rows: [afterSeed] } = await pool.query(
    `SELECT title, source FROM content_items WHERE id = $1`, [seed.id]);
  assert.deepEqual(afterSeed, { title: '관리자가 고친 제목', source: 'curated' },
    '재시드가 curated 편집본을 덮어썼다');
});

test('목록 — type/status 필터와 상태 칩 카운트', async () => {
  await setupDb();
  const svc = await import('../api/services/admin-content.service.js');
  const author = await userWithRole('author');

  await svc.createLesson(author, lessonPayload({ title: '목록 필터 검증' }));
  const all = await svc.listContents(author, {});
  assert.ok(all.total >= 1);
  assert.ok(all.counts.draft >= 1);

  const drafts = await svc.listContents(author, { type: 'lesson', status: 'draft' });
  assert.ok(drafts.contents.every((c) => c.type === 'lesson' && c.status === 'draft'));
  // 카운트는 type 필터는 따르되 status 필터와는 무관한 전체다 — 칩이 자기 필터를 따라 줄면 안 된다
  const lessonsAll = await svc.listContents(author, { type: 'lesson' });
  assert.equal(drafts.counts.published, lessonsAll.counts.published);
  assert.ok(drafts.counts.published >= 1, '시드 published 레슨이 카운트에 없다');

  await assert.rejects(svc.listContents(author, { type: 'nope' }), (e) => e.status === 400);
});
