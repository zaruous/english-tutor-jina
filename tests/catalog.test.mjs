// 콘텐츠 카탈로그 — lessons·conversation_scenarios·vocab_sets 3테이블이 content_items 하나로
// 합쳐진 뒤에도 DTO 가 같은가(플랜 10.7 Phase 2 의 유일한 성공 기준), 그리고 스키마가 새로 든
// 불변식(공개 상태 CHECK · 단일 FK)을 실제로 강제하는가.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { listLessons } from '../api/services/lesson.service.js';
import { getTopic, listScenarios, listTopics } from '../api/services/topic.service.js';
import { listSpeakingSentences } from '../api/services/speaking.service.js';
import { closeDb, createUser, dropUser, pool, setupDb } from './helpers/db.mjs';

let user;

before(async () => {
  await setupDb();
  user = await createUser();
});
after(async () => {
  if (user) await dropUser(user.id);
  await closeDb();
});

describe('카탈로그 스키마 불변식', () => {
  it('공개 상태가 아닌데 public 은 저장되지 않는다', async () => {
    await assert.rejects(
      pool.query(
        `INSERT INTO content_items (type, slug, title, status, visibility)
         VALUES ('lesson', 'ck-draft-public', 't', 'draft', 'public')`),
      /content_items_public_ck/,
    );
  });

  it('같은 (토픽, 콘텐츠) 는 두 번 붙지 않는다', async () => {
    const { rows: [t] } = await pool.query(`SELECT id FROM topics LIMIT 1`);
    const { rows: [c] } = await pool.query(`SELECT id FROM content_items LIMIT 1`);
    await assert.rejects(
      pool.query(
        `INSERT INTO topic_contents (topic_id, content_id, position) VALUES ($1, $2, 9), ($1, $2, 10)`,
        [t.id, c.id]),
      /topic_contents_uq/,
    );
  });

  it('detail 은 상위 콘텐츠가 사라지면 함께 사라진다', async () => {
    const { rows: [c] } = await pool.query(
      `INSERT INTO content_items (type, slug, title, status, visibility)
       VALUES ('lesson', 'cascade-probe', 't', 'published', 'private') RETURNING id`);
    await pool.query(
      `INSERT INTO lesson_details (content_id, passage) VALUES ($1, '{}'::jsonb)`, [c.id]);
    await pool.query(`DELETE FROM content_items WHERE id = $1`, [c.id]);
    const { rows } = await pool.query(`SELECT 1 FROM lesson_details WHERE content_id = $1`, [c.id]);
    assert.equal(rows.length, 0);
  });
});

describe('카탈로그 DTO — 통합 전과 같은 모양', () => {
  it('레슨 목록은 타입별 detail 을 합쳐 이전 필드를 그대로 낸다', async () => {
    const { lessons, progress } = await listLessons(user);
    assert.ok(lessons.length >= 7, `시드 레슨 ${lessons.length}건`);
    for (const key of ['id', 'slug', 'kind', 'title', 'subtitle', 'difficulty', 'est_minutes',
      'position', 'source', 'visibility', 'question_count', 'attempt_count']) {
      assert.ok(key in lessons[0], `${key} 가 LessonSummary 에서 사라졌다`);
    }
    assert.equal(typeof lessons[0].question_count, 'number');
    assert.equal(progress.done, 0);
    assert.equal(progress.total, lessons.length);
  });

  it('kind 는 lesson_details 에서 오고 필터가 그대로 동작한다', async () => {
    const lc = await listLessons(user, { kind: 'toeic_lc' });
    assert.ok(lc.lessons.length >= 1);
    assert.equal(lc.lessons.every((l) => l.kind === 'toeic_lc'), true);
  });

  it('토픽 카운트는 타입별로 갈라 세고 진행률 분모가 된다', async () => {
    const [topic] = await listTopics(user, { includeIneligible: true });
    assert.ok(topic, '시드 토픽이 없다');
    const detail = await getTopic(user, topic.id);
    assert.equal(detail.lessons.length, topic.lesson_count);
    assert.equal(detail.scenarios.length, topic.scenario_count);
    assert.ok(detail.vocab_sets.length >= 1);
    assert.equal(
      detail.progress.lesson.total + detail.progress.conversation.total + detail.progress.vocabulary.total,
      topic.lesson_count + topic.scenario_count + topic.vocab_count,
    );
  });

  it('시나리오 DTO 는 상위(title/description)와 detail(tag/level)을 합친다', async () => {
    const [scenario] = await listScenarios(user);
    assert.ok(scenario, '시드 시나리오가 없다');
    for (const key of ['id', 'slug', 'title', 'tag', 'level', 'description',
      'opening_message', 'objectives', 'source', 'visibility']) {
      assert.ok(key in scenario, `${key} 가 시나리오 DTO 에서 사라졌다`);
    }
  });
});

describe('LC 스크립트 구조화', () => {
  it('passage.body 는 [{speaker,text}] 이고 text 에 화자 라벨이 없다', async () => {
    const { rows: [lc] } = await pool.query(
      `SELECT d.passage FROM lesson_details d WHERE d.kind = 'toeic_lc' LIMIT 1`);
    assert.ok(lc, '시드 LC 레슨이 없다');
    const body = lc.passage.body;
    assert.ok(Array.isArray(body) && body.length > 0);
    for (const line of body) {
      assert.ok(['M', 'W'].includes(line.speaker), `speaker=${line.speaker}`);
      assert.equal(typeof line.text, 'string');
      assert.equal(/^[MW]\s*:/.test(line.text), false, `text 에 라벨이 남았다: ${line.text}`);
    }
  });

  it('문장 은행은 구조에서 text 만 읽는다 (문자열 파싱 없음)', async () => {
    const { sentences } = await listSpeakingSentences(user, { limit: 20 });
    assert.ok(sentences.length > 0);
    assert.equal(sentences.some((s) => /^[MW]\s*:/.test(s.text)), false, '화자 라벨이 문장에 섞였다');
    assert.ok(sentences.some((s) => s.source === 'listening'), 'LC 출처 문장이 없다');
  });
});
