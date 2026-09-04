// 사용자당 동기 AI 요청 1건 (플랜 10.5 S7). DB·서버·AI provider 가 필요 없다 —
// askAI 를 그대로 부르면 실제 CLI 를 스폰하고 최대 30분을 무는 경로라, 그 앞단의 세마포어 계층만
// 떼어(acquireUserSlot / userSlotCount) 단정한다. 라우트가 이 계층에 실제로 userId 를 넘기는지는
// 같은 파일 아래쪽에서 소스 단정으로 함께 확인한다.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { describe, it } from 'node:test';
import { acquireUserSlot, userSlotCount } from '../api/ai/ask.js';

// 던져진 HttpError 를 꺼내 온다 — assert.rejects 는 필드 단정에 쓰기 번거롭다.
async function caught(fn) {
  try {
    await fn();
    return null;
  } catch (err) {
    return err;
  }
}

describe('사용자당 동기 AI 요청 1건', () => {
  it('같은 사용자의 두 번째 동시 요청은 기다리지 않고 429 로 거절된다', async () => {
    const first = await acquireUserSlot(101);
    try {
      const started = Date.now();
      const err = await caught(() => acquireUserSlot(101));
      assert.ok(err, '두 번째 획득이 성공해서는 안 된다');
      assert.equal(err.status, 429);
      assert.equal(err.code, 'RATE_LIMITED');
      // 대기열 없이 즉시 거절 — 20초(세마포어 기본 waitTimeoutMs)를 기다리면 안 된다.
      assert.ok(Date.now() - started < 1000, `즉시 거절되어야 한다 (${Date.now() - started}ms)`);
    } finally {
      first.release();
    }
  });

  it('슬롯을 놓으면 같은 사용자가 다시 잡을 수 있다', async () => {
    const first = await acquireUserSlot(102);
    first.release();
    const second = await acquireUserSlot(102);
    assert.ok(second);
    second.release();
  });

  it('다른 사용자는 영향을 받지 않는다', async () => {
    const a = await acquireUserSlot(201);
    const b = await acquireUserSlot(202); // 서로 다른 키 — 동시에 잡힌다
    assert.ok(b);
    assert.equal(userSlotCount(), 2);
    a.release();
    b.release();
  });

  it('userId 가 없으면(ai_jobs 워커 경로) 게이트를 건너뛴다', async () => {
    const one = await acquireUserSlot(null);
    const two = await acquireUserSlot(undefined);
    assert.equal(one, null);
    assert.equal(two, null);
    assert.equal(userSlotCount(), 0, '워커 경로는 Map 에 항목을 만들지 않는다');
    // release 는 호출부(askAI 의 finally)가 optional chaining 으로 건너뛴다 — 여기서는 null 이면 그만이다.
  });

  it('Map 이 자라지 않는다 — 해제·거절 어느 쪽이어도 항목이 남지 않는다', async () => {
    assert.equal(userSlotCount(), 0, '앞선 테스트가 슬롯을 남기지 않았다');

    // (1) 정상 획득 → 해제
    for (let i = 0; i < 50; i += 1) {
      const slot = await acquireUserSlot(1000 + i);
      slot.release();
    }
    assert.equal(userSlotCount(), 0);

    // (2) 거절된 요청이 빈 세마포어를 남기지 않는다
    const held = await acquireUserSlot(999);
    for (let i = 0; i < 10; i += 1) {
      assert.ok(await caught(() => acquireUserSlot(999)));
    }
    assert.equal(userSlotCount(), 1, '점유 중인 사용자 1명만 남아 있어야 한다');
    held.release();
    assert.equal(userSlotCount(), 0);

    // (3) release 두 번 호출해도 카운트가 음수로 새지 않는다
    const slot = await acquireUserSlot(998);
    slot.release();
    slot.release();
    assert.equal(userSlotCount(), 0);
    const again = await acquireUserSlot(998);
    assert.ok(again);
    again.release();
  });
});

describe('동기 askAI 호출부는 userId 를 넘긴다', () => {
  // 라우트 5곳 중 하나라도 userId 를 빠뜨리면 그 경로만 조용히 무제한이 된다 —
  // 단위 테스트로는 잡히지 않으므로 소스에서 직접 단정한다.
  const SYNC_ROUTES = [
    ['api/routes/ai.routes.js', 1],
    ['api/routes/conversation.routes.js', 1],
    ['api/routes/lesson.routes.js', 1],
    ['api/routes/vocab.routes.js', 2], // /vocab/add · /vocab/quiz
  ];

  for (const [file, expected] of SYNC_ROUTES) {
    it(`${file} — askAI ${expected}곳이 userId 를 넘긴다`, async () => {
      const src = await readFile(new URL(`../${file}`, import.meta.url), 'utf8');
      const calls = src.match(/askAI\(\{/g)?.length ?? 0;
      const withUser = src.match(/askAI\(\{\s*userId: user\.id,/g)?.length ?? 0;
      assert.equal(calls, expected, 'askAI 호출 개수가 바뀌었다 — 이 테스트를 함께 갱신하라');
      assert.equal(withUser, expected);
    });
  }

  it('ai-job-worker 는 userId 를 넘기지 않는다 (워커 경로 제외)', async () => {
    const src = await readFile(new URL('../api/services/ai-job-worker.js', import.meta.url), 'utf8');
    assert.ok(src.includes('askAI({'));
    assert.ok(!/userId/.test(src), '워커는 사용자당 게이트에 걸리면 안 된다');
  });
});
