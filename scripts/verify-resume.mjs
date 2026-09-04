// CLI 세션 resume 하이브리드 검증 — 턴1(새 세션) → 턴2(resume, 히스토리 생략, 맥락 기억) → 핸들 훼손 후 턴3(히스토리 폴백)
// 사용: `npm run dev` 상태에서 `node scripts/verify-resume.mjs [claude|codex|agy|cursor]` (기본 claude). E2E_API 로 대상 API 지정 가능.
import 'dotenv/config';
import pg from 'pg';
const API = process.env.E2E_API || 'http://localhost:3104';
const H = { 'Content-Type': 'application/json', 'X-Requested-With': 'jina', Origin: 'http://localhost:3103' };
const post = async (p, body) => (await fetch(API + p, { method: 'POST', headers: H, body: JSON.stringify(body) })).json();
const db = new pg.Client({ host: process.env.PGHOST, port: +process.env.PGPORT, database: process.env.PGDATABASE, user: process.env.PGUSER, password: process.env.PGPASSWORD });
await db.connect();
const ref = async (id) => (await db.query('select provider_ref, provider_ref_provider from conversation_sessions where id=$1', [id])).rows[0];
const t = (label, ok, detail = '') => console.log(`${ok ? '✔' : '✖'} ${label}${detail ? ' — ' + detail : ''}`);
const provider = process.argv[2] || 'claude';

const s = await post('/api/conversations', { title: `resume 검증 (${provider})` });
if (!s.ok) { console.error('세션 생성 실패', s); process.exit(1); }
const sid = s.session.id; console.log(`세션 #${sid} (provider=${provider})`);
t('생성 직후 provider_ref NULL', (await ref(sid)).provider_ref === null);

let r1 = await post(`/api/conversations/${sid}/messages`, { text: 'My name is Kim and my favorite sport is tennis. I play every Saturday.', provider });
t('턴1 응답 ok', r1.ok === true, r1.error || `${r1.meta?.durationMs}ms`);
t('턴1 resumed=false (첫 턴은 히스토리/새 세션)', r1.meta?.resumed === false);
const ref1 = await ref(sid);
t('턴1 후 provider_ref 저장', Boolean(ref1.provider_ref) && ref1.provider_ref_provider === provider, `${ref1.provider_ref_provider}:${String(ref1.provider_ref).slice(0, 12)}…`);

let r2 = await post(`/api/conversations/${sid}/messages`, { text: 'What is my favorite sport and when do I play it? Answer in one short sentence.', provider });
t('턴2 응답 ok', r2.ok === true, r2.error || `${r2.meta?.durationMs}ms`);
t('턴2 resumed=true (히스토리 생략, CLI 세션 이어붙임)', r2.meta?.resumed === true && r2.meta?.resume_fallback === false);
const reply2 = (r2.assistant_message?.content || '').toLowerCase();
t('턴2 답변이 세션 맥락(tennis/Saturday) 기억', /tennis/.test(reply2) && /saturday/.test(reply2), r2.assistant_message?.content?.slice(0, 120));
const ref2 = await ref(sid);
t('턴2 후 핸들 유지(같은 세션)', ref2.provider_ref === ref1.provider_ref);

// 폴백: 핸들을 존재하지 않는 세션 id 로 훼손
await db.query('update conversation_sessions set provider_ref=$2 where id=$1', [sid, '00000000-0000-4000-8000-000000000000']);
let r3 = await post(`/api/conversations/${sid}/messages`, { text: 'Remind me: which day do I play? One short sentence.', provider });
t('턴3(핸들 훼손) 응답 ok', r3.ok === true, r3.error || `${r3.meta?.durationMs}ms`);
t('턴3 resume_fallback=true (히스토리 재전송으로 처리)', r3.meta?.resume_fallback === true && r3.meta?.resumed === false);
t('턴3 답변이 히스토리 맥락(Saturday) 기억', /saturday/i.test(r3.assistant_message?.content || ''), r3.assistant_message?.content?.slice(0, 120));
const ref3 = await ref(sid);
t('턴3 후 새 핸들로 교체', Boolean(ref3.provider_ref) && ref3.provider_ref !== '00000000-0000-4000-8000-000000000000');

await db.end();
// 검증용 세션은 기본으로 삭제한다 (사이드바에 남지 않게). KEEP=1 이면 보존.
if (process.env.KEEP === '1') console.log(`세션 #${sid} 보존 (KEEP=1)`);
else {
  const del = await fetch(`${API}/api/conversations/${sid}`, { method: 'DELETE', headers: H });
  console.log(`세션 #${sid} 삭제 → HTTP ${del.status}`);
}
