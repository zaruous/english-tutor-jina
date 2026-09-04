// 학습 서비스 — 채점·멱등·정답 비노출. 서버·AI 없이 db/content/lessons.json 시드로 돈다.
import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { randomUUID } from 'node:crypto';
import { getLesson, submitAttempt } from '../api/services/lesson.service.js';
import { closeDb, createUser, dropUser, pool, setupDb } from './helpers/db.mjs';

let user;
let lessonId;
let answerKey;    // { '1': 'a', ... } 전부 정답
let firstWrong;   // 1번 문항을 틀리게 바꾼 답안

before(async () => {
  await setupDb();
  user = await createUser();
  const { rows: [lesson] } = await pool.query(
    `SELECT c.id FROM content_items c JOIN lesson_details d ON d.content_id = c.id
      WHERE c.type = 'lesson' AND c.status = 'published' AND d.kind = 'toeic_part7'
      ORDER BY d.position, c.id LIMIT 1`,
  );
  assert.ok(lesson, '시드 레슨이 없다 — db/content/lessons.json 확인');
  lessonId = lesson.id;
  const { rows: items } = await pool.query(
    `SELECT position, answer, options FROM lesson_items WHERE content_id = $1 ORDER BY position`,
    [lessonId],
  );
  answerKey = Object.fromEntries(items.map((i) => [String(i.position), i.answer]));
  const wrong = items[0].options.find((o) => o.id !== items[0].answer);
  firstWrong = { ...answerKey, [String(items[0].position)]: wrong.id };
});

after(async () => {
  if (user) await dropUser(user.id);
  await closeDb();
});

describe('getLesson', () => {
  it('DTO 어디에도 정답·해설이 없다', async () => {
    const { lesson } = await getLesson(user, lessonId);
    const dump = JSON.stringify(lesson);
    for (const key of ['"answer"', '"explanation"']) {
      assert.equal(dump.includes(key), false, `${key} 가 DTO 에 실렸다`);
    }
    assert.ok(lesson.questions.length > 0);
  });

  it('없는 레슨은 404 로 던진다', async () => {
    await assert.rejects(getLesson(user, 999999999), (err) => err.status === 404);
  });
});

describe('submitAttempt', () => {
  it('전부 맞히면 100점, 틀린 문항의 해설은 채점 응답에만 실린다', async () => {
    const res = await submitAttempt(user, lessonId, { answers: answerKey });
    assert.equal(res.attempt.score, 100);
    assert.equal(res.attempt.correct_count, res.attempt.total_count);
    assert.equal(typeof res.attempt.correct_count, 'number', 'BIGINT 파서');
    const first = res.results[Object.keys(answerKey)[0]];
    assert.equal(first.correct, true);
    assert.ok('answer' in first, '채점 응답에는 정답이 있어야 한다');
  });

  it('한 문항을 틀리면 score 가 내려가고 skill_code 가 붙는다', async () => {
    const res = await submitAttempt(user, lessonId, { answers: firstWrong });
    assert.ok(res.attempt.score < 100);
    assert.equal(res.attempt.correct_count, res.attempt.total_count - 1);
    const wrongKey = Object.keys(answerKey)[0];
    assert.equal(res.results[wrongKey].correct, false);
  });

  it('같은 client_request_id 는 replay 로 되돌려주고 attempt 를 늘리지 않는다', async () => {
    const before = await pool.query(
      `SELECT count(*)::int AS n FROM user_lesson_attempts WHERE user_id = $1`, [user.id],
    );
    const rid = randomUUID();
    const first = await submitAttempt(user, lessonId, { answers: answerKey, clientRequestId: rid });
    const second = await submitAttempt(user, lessonId, { answers: firstWrong, clientRequestId: rid });
    assert.notEqual(first.replay, true);
    assert.equal(second.replay, true);
    assert.equal(second.attempt.id, first.attempt.id);
    assert.equal(second.attempt.correct_count, first.attempt.correct_count, '재전송 본문이 채점을 덮어썼다');
    const after_ = await pool.query(
      `SELECT count(*)::int AS n FROM user_lesson_attempts WHERE user_id = $1`, [user.id],
    );
    assert.equal(after_.rows[0].n, before.rows[0].n + 1, 'attempt 가 두 번 쌓였다');
  });

  it('답안이 모자라면 400 으로 던진다', async () => {
    const partial = { ...answerKey };
    delete partial[Object.keys(partial)[0]];
    await assert.rejects(
      submitAttempt(user, lessonId, { answers: partial }),
      (err) => err.status === 400,
    );
  });

  it('선택지에 없는 값은 400 으로 던진다', async () => {
    const bogus = { ...answerKey, [Object.keys(answerKey)[0]]: 'zzz' };
    await assert.rejects(
      submitAttempt(user, lessonId, { answers: bogus }),
      (err) => err.status === 400,
    );
  });

  it('진도는 저장값이 아니라 매번 집계된다', async () => {
    const { progress } = await submitAttempt(user, lessonId, { answers: answerKey });
    assert.ok(progress.total >= 1);
    assert.equal(progress.done, 1, '한 레슨만 풀었는데 done 이 1 이 아니다');
    assert.equal(typeof progress.total, 'number');
  });
});
