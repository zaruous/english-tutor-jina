// AI 생성 작업 상태/게시 서비스 — docs/plan/07 Phase 2~3.
// 요청은 짧은 HTTP 안에서 queued로 저장하고, 느린 CLI 호출은 ai-job-worker.js가 처리한다.
import { createHash } from 'node:crypto';
import { HttpError } from '../lib/errors.js';
import { pool } from '../lib/pool.js';
import { withTx } from '../lib/tx.js';
import { registerPoolEntries } from './vocab.service.js';

export const AI_JOB_TASKS = ['lesson_gen', 'scenario_gen', 'vocab_set'];
const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed'];

const intIn = (value, name, lo, hi, fallback) => {
  const raw = value === undefined || value === null ? fallback : value;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < lo || n > hi) {
    throw new HttpError(400, 'BAD_REQUEST', `${name} 은 ${lo}~${hi} 정수여야 합니다.`);
  }
  return n;
};

const shortText = (value, name, { min = 1, max = 80, fallback } = {}) => {
  const raw = value === undefined || value === null ? fallback : value;
  if (typeof raw !== 'string') throw new HttpError(400, 'BAD_REQUEST', `${name} 은 문자열이어야 합니다.`);
  const out = raw.trim();
  if (out.length < min || out.length > max) {
    throw new HttpError(400, 'BAD_REQUEST', `${name} 길이는 ${min}~${max}자여야 합니다.`);
  }
  return out;
};

export function normalizeJobInput(task, input) {
  if (!AI_JOB_TASKS.includes(task)) throw new HttpError(400, 'BAD_REQUEST', `알 수 없는 생성 task: ${task}`);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpError(400, 'BAD_REQUEST', 'input 은 객체여야 합니다.');
  }
  const topicId = input.topic_id === undefined || input.topic_id === null
    ? null : intIn(input.topic_id, 'input.topic_id', 1, Number.MAX_SAFE_INTEGER);
  if (task === 'lesson_gen') {
    // part: 5(Part 5 문법·어휘) | 'lc'(짧은 대화·설명문). 요청 해시가 part 를 포함하므로
    // 같은 주제라도 유형이 다르면 다른 작업으로 큐잉된다.
    const part = input.part === 'lc' ? 'lc' : intIn(input.part, 'input.part', 5, 5, 5);
    // LC 는 스크립트 하나에 문항 2~4개가 실전 규격이다(Part 5 는 3~10).
    const count = part === 'lc'
      ? intIn(input.count, 'input.count', 2, 4, 3)
      : intIn(input.count, 'input.count', 3, 10, 5);
    return {
      part,
      difficulty: intIn(input.difficulty, 'input.difficulty', 1, 5, 3),
      topic: shortText(input.topic, 'input.topic', { min: 1, max: 80, fallback: '일반 비즈니스 및 사무 환경' }),
      count,
      ...(topicId ? { topic_id: topicId } : {}),
    };
  }
  if (task === 'scenario_gen') {
    return {
      difficulty: intIn(input.difficulty, 'input.difficulty', 1, 5, 3),
      topic: shortText(input.topic, 'input.topic', { min: 1, max: 80 }),
      ...(topicId ? { topic_id: topicId } : {}),
    };
  }
  return {
    topic: shortText(input.topic, 'input.topic', { min: 1, max: 80 }),
    count: 20,
    ...(topicId ? { topic_id: topicId } : {}),
  };
}

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

export function requestHash(task, input) {
  return createHash('sha256').update(`${task}:${stable(input)}`, 'utf8').digest('hex');
}

export function jobDto(row) {
  return {
    id: row.id,
    task: row.task,
    input: row.input,
    request_hash: row.request_hash,
    client_request_id: row.client_request_id,
    provider: row.provider,
    model: row.model,
    status: row.status,
    result: row.result,
    error: row.error_code ? { code: row.error_code, message: row.error_message } : null,
    attempts: row.attempts,
    created_at: row.created_at,
    started_at: row.started_at,
    finished_at: row.finished_at,
    updated_at: row.updated_at,
  };
}

async function assertTopicAccess(client, userId, topicId) {
  if (!topicId) return;
  const { rowCount } = await client.query(
    `SELECT 1 FROM topics
      WHERE id = $1 AND (visibility = 'public' OR created_by = $2)`,
    [topicId, userId],
  );
  if (rowCount === 0) throw new HttpError(404, 'NOT_FOUND', '토픽을 찾을 수 없습니다.');
}

export async function createJob(user, { task, input, clientRequestId, provider, model }) {
  const normalized = normalizeJobInput(task, input);
  const hash = requestHash(task, normalized);
  return withTx(async (client) => {
    // 같은 사용자의 동일한 논리 요청은 한 트랜잭션씩만 판정한다.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`${user.id}:${task}:${hash}`]);
    await assertTopicAccess(client, user.id, normalized.topic_id);

    const { rows: [byRequest] } = await client.query(
      `SELECT * FROM ai_jobs WHERE user_id = $1 AND client_request_id = $2`,
      [user.id, clientRequestId],
    );
    if (byRequest) {
      if (byRequest.task !== task || byRequest.request_hash !== hash) {
        throw new HttpError(409, 'CONFLICT', '같은 client_request_id가 다른 생성 요청에 이미 사용되었습니다.');
      }
      return { job: jobDto(byRequest), reused: true };
    }

    // 성공 결과뿐 아니라 현재 처리 중인 같은 요청도 재사용해 중복 CLI 비용을 막는다.
    const { rows: [same] } = await client.query(
      `SELECT * FROM ai_jobs
        WHERE user_id = $1 AND task = $2 AND request_hash = $3
          AND status IN ('queued', 'running', 'succeeded')
        ORDER BY CASE status WHEN 'succeeded' THEN 0 WHEN 'running' THEN 1 ELSE 2 END, id DESC
        LIMIT 1`,
      [user.id, task, hash],
    );
    if (same) return { job: jobDto(same), reused: true };

    const { rows: [pending] } = await client.query(
      `SELECT count(*)::int AS count FROM ai_jobs WHERE user_id = $1 AND status = 'queued'`,
      [user.id],
    );
    if (pending.count >= 3) {
      throw new HttpError(429, 'RATE_LIMITED', '대기 중인 AI 생성 작업은 사용자당 최대 3건입니다.');
    }

    const { rows: [row] } = await client.query(
      `INSERT INTO ai_jobs
         (user_id, task, input, request_hash, client_request_id, provider, model)
       VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7)
       RETURNING *`,
      [user.id, task, JSON.stringify(normalized), hash, clientRequestId, provider, model ?? null],
    );
    return { job: jobDto(row), reused: false };
  });
}

export async function getJob(user, jobId) {
  const { rows: [row] } = await pool.query(
    `SELECT * FROM ai_jobs WHERE id = $1 AND user_id = $2`,
    [jobId, user.id],
  );
  if (!row) throw new HttpError(404, 'NOT_FOUND', 'AI 생성 작업을 찾을 수 없습니다.');
  return jobDto(row);
}

export async function listJobs(user, { status, limit = 20 } = {}) {
  if (status && !JOB_STATUSES.includes(status)) {
    throw new HttpError(400, 'BAD_REQUEST', `status 는 ${JOB_STATUSES.join('/')} 중 하나여야 합니다.`);
  }
  const params = [user.id];
  let filter = '';
  if (status) { params.push(status); filter = ` AND status = $${params.length}`; }
  params.push(limit);
  const { rows } = await pool.query(
    `SELECT * FROM ai_jobs WHERE user_id = $1${filter}
      ORDER BY created_at DESC, id DESC LIMIT $${params.length}`,
    params,
  );
  return rows.map(jobDto);
}

export async function recoverRunningJobs() {
  const { rowCount } = await pool.query(
    `UPDATE ai_jobs
        SET status = 'queued', started_at = NULL, updated_at = now(),
            error_code = NULL, error_message = NULL
      WHERE status = 'running'`,
  );
  return rowCount;
}

export async function claimNextJob() {
  return withTx(async (client) => {
    const { rows: [row] } = await client.query(
      `SELECT * FROM ai_jobs
        WHERE status = 'queued'
        ORDER BY created_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1`,
    );
    if (!row) return null;
    const { rows: [claimed] } = await client.query(
      `UPDATE ai_jobs
          SET status = 'running', started_at = now(), finished_at = NULL,
              attempts = attempts + 1, updated_at = now(),
              error_code = NULL, error_message = NULL
        WHERE id = $1 RETURNING *`,
      [row.id],
    );
    return claimed;
  });
}

export async function markJobSucceeded(jobId, result) {
  await pool.query(
    `UPDATE ai_jobs
        SET status = 'succeeded', result = $2::jsonb, finished_at = now(), updated_at = now(),
            error_code = NULL, error_message = NULL
      WHERE id = $1`,
    [jobId, JSON.stringify(result)],
  );
}

export async function markJobFailed(jobId, error, result = null) {
  const code = String(error?.code || 'GENERATION_FAILED').slice(0, 80);
  const message = String(error?.message || 'AI 생성 작업에 실패했습니다.').slice(0, 1000);
  await pool.query(
    `UPDATE ai_jobs
        SET status = 'failed', result = $2::jsonb, error_code = $3, error_message = $4,
            finished_at = now(), updated_at = now()
      WHERE id = $1`,
    [jobId, result ? JSON.stringify(result) : null, code, message],
  );
}

// 자동 검증: 문항 수/보기 중복/정답 범위/해설의 정답 지시를 모두 통과해야 카탈로그에 들어간다.
// LC 스크립트 규칙 — 4~8줄, 각 줄 화자 라벨("M: "/"W: ")로 시작, 실제 대사가 있어야 한다.
// 화면이 jinaSpeak 으로 읽으므로 괄호 지시문·빈 줄이 섞이면 그대로 읽혀 버린다.
const LC_SPEAKERS = ['M', 'W'];
function validateLcScript(script) {
  const errors = [];
  if (!Array.isArray(script) || script.length < 4 || script.length > 8) {
    errors.push('script는 4~8줄 배열이어야 합니다.');
    return errors;
  }
  // 화자와 대사가 분리된 객체다 (플랜 10.7 §3.2) — 문자열 파싱이 사라졌다.
  script.forEach((line, i) => {
    const text = String(line?.text || '').trim();
    if (!LC_SPEAKERS.includes(line?.speaker)) errors.push(`script[${i}].speaker 는 "M" 또는 "W" 여야 합니다.`);
    if (text.length < 12) errors.push(`script[${i}].text 의 대사가 너무 짧습니다.`);
    if (/^[MW]\s*:/.test(text)) errors.push(`script[${i}].text 에 화자 라벨이 남아 있습니다.`);
    if (/[([]/.test(text)) errors.push(`script[${i}].text 에 괄호 지시문이 있습니다.`);
  });
  return errors;
}

export function validateGeneratedLesson(data, expectedCount, { part } = {}) {
  const errors = [];
  if (!data?.title) errors.push('title이 비어 있습니다.');
  if (part === 'lc') errors.push(...validateLcScript(data?.script));
  if (!Array.isArray(data?.items) || data.items.length !== expectedCount) {
    errors.push(`문항 수가 ${expectedCount}개여야 합니다.`);
    return errors;
  }
  const stems = new Set();
  data.items.forEach((item, index) => {
    const path = `items[${index}]`;
    const stemKey = String(item.stem || '').trim().toLowerCase();
    if (!stemKey) errors.push(`${path}.stem이 비어 있습니다.`);
    else if (stems.has(stemKey)) errors.push(`${path}.stem이 다른 문항과 중복됩니다.`);
    stems.add(stemKey);
    const options = Array.isArray(item.options) ? item.options : [];
    const ids = options.map((o) => o.id);
    const texts = options.map((o) => String(o.text || '').trim().toLowerCase());
    if (options.length !== 4 || new Set(ids).size !== 4 || !['A', 'B', 'C', 'D'].every((id) => ids.includes(id))) {
      errors.push(`${path}.options는 A-D 보기 4개여야 합니다.`);
    }
    if (texts.some((x) => !x) || new Set(texts).size !== texts.length) {
      errors.push(`${path}.options 보기 텍스트가 비었거나 중복됩니다.`);
    }
    const correct = options.find((o) => o.id === item.answer);
    if (!correct) errors.push(`${path}.answer가 보기 id에 없습니다.`);
    const explanation = String(item.explanation || '');
    if (!explanation.includes(`(${item.answer})`)) {
      errors.push(`${path}.explanation이 정답 (${item.answer})을 가리키지 않습니다.`);
    }
  });
  return errors;
}

export async function saveGeneratedLesson(job, data, aiMeta) {
  const isLc = job.input.part === 'lc';
  const errors = validateGeneratedLesson(data, job.input.count, { part: job.input.part });
  return withTx(async (client) => {
    const { rows: [draft] } = await client.query(
      `INSERT INTO lesson_drafts
         (user_id, job_id, payload, validation_errors, provider, model)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, $5, $6)
       RETURNING id`,
      [job.user_id, job.id, JSON.stringify(data), JSON.stringify(errors),
       job.provider, aiMeta?.model ?? job.model ?? null],
    );
    if (errors.length) return { draft_id: draft.id, validation_errors: errors, lesson_id: null };

    const { rows: [pos] } = await client.query(
      `SELECT COALESCE(max(position), 0)::int + 1 AS next FROM lesson_details`);
    const slug = `ai-toeic-${isLc ? 'lc' : 'part5'}-${job.user_id}-${job.id}`;
    // LC 는 시드와 같은 모양으로 저장한다 — 스크립트는 passage.body 의 [{speaker,text}] 배열.
    const passage = isLc
      ? { type: 'LISTENING', subject: 'Short Conversation', body: data.script }
      : {
        type: 'PART 5', subject: 'Incomplete Sentences',
        body: ['Choose the word or phrase that best completes each sentence.'],
      };
    const faq = isLc
      ? ['이 대화의 핵심 표현을 정리해 주세요', '놓치기 쉬운 발음·연음을 짚어 주세요']
      : ['틀린 보기의 문법적 차이를 설명해 주세요', '이 문항과 비슷한 예문을 만들어 주세요'];
    // 카탈로그 상위 + 타입별 detail 1:1 (플랜 10.7 Phase 2). 생성물은 공개 상태이되 본인에게만 보인다.
    const { rows: [lesson] } = await client.query(
      `INSERT INTO content_items (type, slug, title, difficulty, status, visibility, source, created_by)
       VALUES ('lesson', $1, $2, $3, 'published', 'private', 'ai', $4)
       RETURNING id`,
      [slug, data.title, job.input.difficulty, job.user_id],
    );
    await client.query(
      `INSERT INTO lesson_details
         (content_id, kind, subtitle, est_minutes, passage, vocab, faq, position)
       VALUES ($1, $2, $3, $4, $5::jsonb, '[]'::jsonb, $6::jsonb, $7)`,
      [lesson.id, isLc ? 'toeic_lc' : 'toeic_part5', data.subtitle,
       Math.max(3, Math.ceil(data.items.length * 1.2)), JSON.stringify(passage),
       JSON.stringify(faq), pos.next],
    );
    for (let i = 0; i < data.items.length; i += 1) {
      const item = data.items[i];
      await client.query(
        `INSERT INTO lesson_items
           (content_id, position, stem, options, answer, explanation, skill_code)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7)`,
        [lesson.id, i + 1, item.stem, JSON.stringify(item.options), item.answer,
         item.explanation, item.skill_code],
      );
    }
    if (job.input.topic_id) {
      await client.query(
        `INSERT INTO topic_contents (topic_id, content_id, position)
         VALUES ($1, $2, 0) ON CONFLICT DO NOTHING`,
        [job.input.topic_id, lesson.id],
      );
    }
    await client.query(
      `UPDATE lesson_drafts SET published_content_id = $2, updated_at = now() WHERE id = $1`,
      [draft.id, lesson.id],
    );
    return { draft_id: draft.id, validation_errors: [], lesson_id: lesson.id };
  });
}

export async function saveGeneratedScenario(job, data) {
  if (!data.title || !data.system_prompt || !data.opening_message || data.objectives.length < 2) {
    throw new HttpError(502, 'VALIDATION_FAILED', '생성된 회화 시나리오의 필수 내용이 부족합니다.');
  }
  return withTx(async (client) => {
    const slug = `ai-scenario-${job.user_id}-${job.id}`;
    const { rows: [row] } = await client.query(
      `INSERT INTO content_items (type, slug, title, description, difficulty, status, visibility, source, created_by)
       VALUES ('scenario', $1, $2, $3, $4, 'published', 'private', 'ai', $5)
       RETURNING id`,
      [slug, data.title, data.description, job.input.difficulty, job.user_id],
    );
    await client.query(
      `INSERT INTO scenario_details
         (content_id, tag, level, system_prompt, opening_message, objectives)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb)`,
      [row.id, data.tag, job.input.difficulty, data.system_prompt,
       data.opening_message, JSON.stringify(data.objectives)],
    );
    if (job.input.topic_id) {
      await client.query(
        `INSERT INTO topic_contents (topic_id, content_id, position)
         VALUES ($1, $2, 0) ON CONFLICT DO NOTHING`,
        [job.input.topic_id, row.id],
      );
    }
    return { scenario_id: row.id };
  });
}

export async function saveGeneratedVocabSet(job, data) {
  if (!data.title || !Array.isArray(data.words) || data.words.length !== 20) {
    throw new HttpError(502, 'VALIDATION_FAILED', '생성된 단어 세트는 중복 없는 단어 20개여야 합니다.');
  }
  const result = await withTx(async (client) => {
    const slug = `ai-vocab-set-${job.user_id}-${job.id}`;
    const { rows: [row] } = await client.query(
      `INSERT INTO content_items (type, slug, title, description, status, visibility, source, created_by)
       VALUES ('vocab_set', $1, $2, $3, 'published', 'private', 'ai', $4)
       RETURNING id`,
      [slug, data.title, data.description, job.user_id],
    );
    await client.query(
      `INSERT INTO vocab_set_details (content_id, words) VALUES ($1, $2::jsonb)`,
      [row.id, JSON.stringify(data.words)],
    );
    if (job.input.topic_id) {
      await client.query(
        `INSERT INTO topic_contents (topic_id, content_id, position)
         VALUES ($1, $2, 0) ON CONFLICT DO NOTHING`,
        [job.input.topic_id, row.id],
      );
    }
    return { vocab_set_id: row.id };
  });
  // 플랜 09 Phase 1 — 세트 단어를 풀(vocab_words)에 자동 등록. 카드 미생성, 실패해도 세트 저장은 유지(로그만).
  try {
    await registerPoolEntries(data.words, { source: 'ai', createdBy: job.user_id });
  } catch (e) {
    console.error('[ai-job] 세트 단어 풀 자동 등록 실패:', e.message);
  }
  return result;
}

