// 대시보드 — 신규 계정의 기본값과 스트릭 산식. 저장된 카운터가 없다는 것이 단정의 핵심이다.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { getDashboard } from '../api/services/dashboard.service.js';
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

describe('getDashboard — 신규 계정', () => {
  it('활동이 없으면 streak 0 · 정확도 null · 예상 점수 null', async () => {
    const dto = await getDashboard(user);
    assert.equal(dto.stats.streak_days, 0);
    assert.equal(dto.stats.accuracy_pct, null);
    assert.equal(dto.stats.predicted_score, null);
    assert.equal(typeof dto.stats.week_minutes, 'number');
  });

  it('주간 막대는 항상 7칸이다 (generate_series)', async () => {
    const dto = await getDashboard(user);
    assert.equal(dto.weekly.days.length, 7);
    assert.deepEqual([...new Set(dto.weekly.days.map((d) => d.minutes))], [0]);
    assert.equal(dto.weekly.total_minutes, 0);
  });

  it('skills 는 고정 4행이고 소스가 없으면 pct 가 null 이다', async () => {
    const dto = await getDashboard(user);
    assert.deepEqual(dto.skills.map((s) => s.key), ['listening', 'reading', 'speaking', 'vocab']);
    assert.equal(dto.skills.every((s) => s.pct === null), true);
  });

  it('목표는 기본값 + exam_date 로부터 d_day 를 파생한다', async () => {
    const dto = await getDashboard(user);
    assert.equal(dto.goal.exam_max, 990);
    assert.ok(dto.goal.target_score > 0);
  });
});

describe('getDashboard — 스트릭 산식', () => {
  it('어제와 오늘 복습하면 streak 가 2 가 된다 (저장된 카운터 없음)', async () => {
    const { rows: [card] } = await pool.query(
      `INSERT INTO user_vocab_cards (user_id, word_id)
       SELECT $1, id FROM vocab_words ORDER BY id LIMIT 1
       RETURNING id, word_id`,
      [user.id],
    );
    assert.ok(card, '시드 단어가 없다 — db/content/vocab-words.json 확인');
    for (const offset of ['1 day', '0 day']) {
      await pool.query(
        `INSERT INTO vocab_reviews
           (user_id, card_id, word_id, result, reviewed_at,
            prev_interval_days, prev_ease_factor, next_interval_days, next_ease_factor, next_review)
         SELECT $1, c.id, c.word_id, 'good', now() - $3::interval,
                1, 2.50, 2, 2.50, now() + interval '2 days'
           FROM user_vocab_cards c WHERE c.id = $2`,
        [user.id, card.id, offset],
      );
    }
    const dto = await getDashboard(user);
    assert.equal(dto.stats.streak_days, 2);
  });
});
