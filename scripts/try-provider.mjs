// scripts/try-provider.mjs — CLI provider 정찰 도구 (Phase 0)
//
//   node scripts/try-provider.mjs claude "I go to school yesterday." --task tutor
//   node scripts/try-provider.mjs cursor "hello" --raw
//   node scripts/try-provider.mjs --all "I go to school yesterday." --repeat 3
//
// 출력: 해석된 invocation → 경과 ms → 파싱 객체 → 스키마 검증 결과.
// --all 은 provider × 레이턴시 × 스키마 준수율 비교표.
import { PROVIDERS } from '../api/ai/registry.js';
import { renderChatMessages, renderCliPrompt } from '../api/ai/prompts.js';
import { TASK_SCHEMAS, validateAgainst } from '../api/ai/schemas.js';
import { extractJson } from '../api/lib/cli/json.js';

const args = process.argv.slice(2);
const flags = {};
const positional = [];
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--task' || args[i] === '--repeat' || args[i] === '--model') flags[args[i].slice(2)] = args[++i];
  else if (args[i].startsWith('--')) flags[args[i].slice(2)] = true;
  else positional.push(args[i]);
}
const task = flags.task === 'vocab' ? 'vocab_entry' : (flags.task || 'tutor');
const repeat = Number(flags.repeat || 1);

const targetIds = flags.all ? [...PROVIDERS.keys()] : [positional[0]];
const userMessage = flags.all ? positional[0] : positional[1];
if (!userMessage || (!flags.all && !PROVIDERS.has(targetIds[0]))) {
  console.error('사용법: node scripts/try-provider.mjs <provider|--all> "<메시지>" [--task tutor|vocab] [--model m] [--repeat n] [--raw]');
  console.error(`provider: ${[...PROVIDERS.keys()].join(' | ')}`);
  process.exit(1);
}

const schema = TASK_SCHEMAS[task];
const rows = [];

for (const id of targetIds) {
  const provider = PROVIDERS.get(id);
  const includeSchemaContract = !provider.supportsJsonSchema;
  let okCount = 0;
  const latencies = [];
  let lastError = null;

  for (let i = 0; i < repeat; i++) {
    const started = Date.now();
    try {
      const result = await provider.run({
        prompt: renderCliPrompt({ task, history: [], userMessage, includeSchemaContract }),
        messages: renderChatMessages({ task, history: [], userMessage }),
        jsonSchema: provider.supportsJsonSchema ? schema : null,
        model: flags.model || null,
        sessionRef: null,
        timeoutMs: 120_000,
      });
      const ms = Date.now() - started;
      latencies.push(ms);
      const parsed = result.structured ?? extractJson(result.text);
      const violations = parsed ? validateAgainst(schema, parsed) : ['JSON 파싱 실패'];
      const valid = violations.length === 0;
      if (valid) okCount++;
      if (!flags.all || repeat === 1) {
        console.log(`\n═══ ${id} — ${ms}ms · exit ${result.meta?.exitCode ?? '-'} · sessionRef ${result.sessionRef ?? '-'} ═══`);
        if (flags.raw) console.log('--- raw text ---\n' + String(result.text).slice(0, 1200));
        console.log('--- parsed ---\n' + JSON.stringify(parsed, null, 2)?.slice(0, 1200));
        console.log(`--- schema: ${valid ? '✔ 유효' : '✖ ' + violations.slice(0, 3).join('; ')}`);
      }
    } catch (err) {
      latencies.push(Date.now() - started);
      lastError = `${err.code || 'ERR'}: ${err.message}`;
      if (!flags.all) console.log(`\n═══ ${id} — 실패: ${lastError}`);
    }
  }
  rows.push({
    provider: id,
    tries: repeat,
    schemaOk: `${okCount}/${repeat}`,
    'ms(min/avg/max)': latencies.length
      ? `${Math.min(...latencies)}/${Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length)}/${Math.max(...latencies)}`
      : '-',
    error: lastError ? lastError.slice(0, 60) : '',
  });
}

if (flags.all || repeat > 1) {
  console.log('\n── 비교표 ──');
  console.table(rows);
}
