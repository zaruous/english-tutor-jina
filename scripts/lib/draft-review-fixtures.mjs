// 플랜 12 검증 픽스처. HTTP·브라우저·메모리 DB 테스트가 같은 생성 결과를 저장 함수에 넣는다.
// job 은 처음부터 종결 상태로 심는다 — 실행 중인 워커가 가짜 작업을 AI 에 보내는 경합을 막는다.
import { randomUUID } from 'node:crypto';
import { pool } from '../../api/lib/pool.js';
import {
  normalizeJobInput, requestHash, markJobSucceeded,
  saveGeneratedLesson, saveGeneratedScenario, saveGeneratedVocabSet,
} from '../../api/services/ai-job.service.js';

export async function createReviewUser(tag, role, passwordHash = 'scrypt$test$test$test') {
  const { rows: [user] } = await pool.query(
    `INSERT INTO users (email, display_name, password_hash, role, is_admin)
     VALUES ($1, $2, $3, $4, $5) RETURNING id, email, role`,
    [`${tag}-${role}@test.dev`, `검수 검증 ${role}`, passwordHash, role, role === 'admin'],
  );
  return user;
}

export function reviewLessonPayload(tag, name = '레슨') {
  return {
    title: `${tag} ${name}`, subtitle: '검수 파이프라인 검증',
    script: [
      { speaker: 'M', text: 'Could I reserve the conference room for tomorrow morning?' },
      { speaker: 'W', text: 'The large room is available after ten in the morning.' },
      { speaker: 'M', text: 'Please reserve it for the weekly planning meeting.' },
      { speaker: 'W', text: 'I will send you a confirmation email right away.' },
    ],
    items: Array.from({ length: 3 }, (_, i) => ({
      stem: `Question ${i + 1}: The manager requested a _____ review.`,
      options: [{ id: 'A', text: 'careful' }, { id: 'B', text: 'carefully' }, { id: 'C', text: 'care' }, { id: 'D', text: 'caringly' }],
      answer: 'A', explanation: '(A) careful이 명사를 수식하는 형용사라 정답입니다.', skill_code: 'grammar',
    })),
  };
}

export async function createReviewContent(tag, user, {
  task = 'lesson_gen', target = 'catalog', name = task, topicId, input: suppliedInput,
} = {}) {
  const input = normalizeJobInput(task, suppliedInput || {
    part: 'lc', count: 3, difficulty: 3, topic: `${tag} ${name}`, publish_target: target,
    ...(topicId ? { topic_id: topicId } : {}),
  });
  const { rows: [job] } = await pool.query(
    `INSERT INTO ai_jobs (user_id, task, input, request_hash, client_request_id, provider, status)
     VALUES ($1, $2, $3::jsonb, $4, $5, 'ollama', 'succeeded') RETURNING *`,
    [user.id, task, JSON.stringify(input), requestHash(task, input), randomUUID()],
  );
  let saved;
  if (task === 'lesson_gen') {
    saved = await saveGeneratedLesson(job, reviewLessonPayload(tag, name), { model: '검증 픽스처' });
  } else if (task === 'scenario_gen') {
    saved = await saveGeneratedScenario(job, {
      title: `${tag} ${name}`, description: '회의 일정 협의', tag: '업무',
      system_prompt: '회의실 예약을 도와주는 담당자로 대화하세요.',
      opening_message: 'How can I help you reserve a meeting room today?',
      objectives: ['날짜와 시간을 요청한다', '예약을 확인한다'],
    });
  } else {
    saved = await saveGeneratedVocabSet(job, {
      title: `${tag} ${name}`, description: '검수용 단어 20개',
      words: Array.from({ length: 20 }, (_, i) => ({
        // 다른 테스트·실사용 단어와 겹치지 않아 공용 풀 누출과 정리를 정확히 검증할 수 있다.
        word: `${tag}-${name}-${i}`, meaning_ko: `검증 단어 ${i}`, pos: 'n.', ipa: '',
        example_en: 'We have a meeting scheduled for tomorrow.', example_ko: '내일 회의가 예정되어 있습니다.', difficulty: 3,
      })),
    });
  }
  const contentId = saved.lesson_id || saved.scenario_id || saved.vocab_set_id;
  const type = task === 'lesson_gen' ? 'lesson' : task === 'scenario_gen' ? 'scenario' : 'vocab_set';
  await markJobSucceeded(job.id, { type, ...saved });
  return { id: contentId, type, job, saved, input };
}

export async function createReviewTopic(tag, user) {
  const { rows: [topic] } = await pool.query(
    `INSERT INTO topics (slug, label_ko, status, visibility, created_by)
     VALUES ($1, $2, 'published', 'public', $3) RETURNING id`,
    [tag, `${tag} 검수 토픽`, user.id],
  );
  return topic.id;
}

export async function reviewState(id) {
  const { rows: [row] } = await pool.query(
    `SELECT c.status, c.visibility, c.updated_by, ld.review_status
       FROM content_items c LEFT JOIN lesson_drafts ld ON ld.published_content_id = c.id WHERE c.id = $1`, [id],
  );
  return row;
}

export async function reviewAudit(id) {
  const { rows } = await pool.query(`SELECT * FROM content_audit_log WHERE content_id = $1 ORDER BY id`, [id]);
  return rows;
}

export async function cleanupReviewFixtures(tag) {
  // 계정 삭제는 created_by 를 NULL 로 바꾸므로 콘텐츠·단어를 먼저 지운다. 생성 slug 는 job 키이므로
  // 태그 계정의 소유 id 로 좁힌다. 개별 단계 실패로 남은 정리까지 건너뛰지 않되 오류는 호출자에게 알린다.
  const failures = [];
  for (const [sql, params] of [
    [`DELETE FROM content_items WHERE created_by IN (SELECT id FROM users WHERE email LIKE $1)`, [`${tag}-%@test.dev`]],
    [`DELETE FROM topics WHERE slug = $1`, [tag]],
    [`DELETE FROM vocab_words WHERE word LIKE $1`, [`${tag}-%`]],
    [`DELETE FROM users WHERE email LIKE $1`, [`${tag}-%@test.dev`]],
  ]) {
    try { await pool.query(sql, params); } catch (error) { failures.push(error); }
  }
  if (failures.length) throw failures[0];
}
