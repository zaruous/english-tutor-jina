// 인프로세스 AI job 워커. DB가 큐 상태의 단일 소스이고 이 프로세스는 최대 2건만 실행한다.
// 재시작 시 running을 queued로 되돌리므로 중간 종료된 작업도 다시 잡힌다.
import { askAI } from '../ai/ask.js';
import {
  renderLessonGenRequest,
  renderScenarioGenRequest,
  renderVocabSetRequest,
} from '../ai/prompts.js';
import {
  claimNextJob,
  markJobFailed,
  markJobSucceeded,
  recoverRunningJobs,
  saveGeneratedLesson,
  saveGeneratedScenario,
  saveGeneratedVocabSet,
} from './ai-job.service.js';

const WORKER_LIMIT = 2;
let started = false;
let active = 0;
let pumping = false;
let scheduled = false;

function requestFor(job) {
  if (job.task === 'lesson_gen') return renderLessonGenRequest(job.input);
  if (job.task === 'scenario_gen') return renderScenarioGenRequest(job.input);
  return renderVocabSetRequest(job.input);
}

async function execute(job) {
  try {
    const ai = await askAI({
      task: job.task,
      providerId: job.provider,
      model: job.model,
      history: [],
      userMessage: requestFor(job),
      // LC 는 같은 lesson_gen task 지만 시스템 프롬프트가 다르다(스크립트 + 문항)
      promptVariant: job.task === 'lesson_gen' ? job.input.part : null,
    });
    let saved;
    if (job.task === 'lesson_gen') saved = await saveGeneratedLesson(job, ai.data, ai.meta);
    else if (job.task === 'scenario_gen') saved = await saveGeneratedScenario(job, ai.data);
    else saved = await saveGeneratedVocabSet(job, ai.data);

    if (saved.validation_errors?.length) {
      const err = new Error(`자동 검증 실패: ${saved.validation_errors.slice(0, 3).join('; ')}`);
      err.code = 'VALIDATION_FAILED';
      await markJobFailed(job.id, err, { draft_id: saved.draft_id, validation_errors: saved.validation_errors });
      return;
    }
    await markJobSucceeded(job.id, {
      type: job.task === 'lesson_gen' ? 'lesson' : job.task === 'scenario_gen' ? 'scenario' : 'vocab_set',
      ...saved,
    });
  } catch (err) {
    console.error(`[ai-job] #${job.id} ${job.task} 실패:`, err.code || err.message);
    try { await markJobFailed(job.id, err); } catch (saveErr) {
      console.error(`[ai-job] #${job.id} 실패 상태 저장 오류:`, saveErr.message);
    }
  }
}

function schedulePump() {
  if (!started || scheduled) return;
  scheduled = true;
  setImmediate(() => {
    scheduled = false;
    pump().catch((err) => console.error('[ai-job] pump 오류:', err.message));
  });
}

async function pump() {
  if (!started || pumping) return;
  pumping = true;
  try {
    while (active < WORKER_LIMIT) {
      const job = await claimNextJob();
      if (!job) break;
      active += 1;
      execute(job).finally(() => {
        active -= 1;
        schedulePump();
      });
    }
  } finally {
    pumping = false;
  }
}

export async function startAiJobWorker() {
  if (started) return;
  started = true;
  const recovered = await recoverRunningJobs();
  if (recovered) console.log(`[ai-job] 중단된 작업 ${recovered}건을 queued로 복구`);
  schedulePump();
}

export function kickAiJobWorker() {
  schedulePump();
}

export function aiJobWorkerState() {
  return { started, active, limit: WORKER_LIMIT };
}

