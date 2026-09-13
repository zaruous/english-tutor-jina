import { HttpError } from './errors.js';

// FIFO 세마포어. 큐 상한 초과나 대기 시간 초과는 503 BUSY.
// onFull(선택): 큐 상한 초과일 때 던질 에러를 만드는 함수. 기본은 503 BUSY 다.
//   "잠시 후 다시 오라"(BUSY)와 "네 몫은 이미 쓰고 있다"(429)는 클라이언트가 달리 다뤄야 하는데,
//   사용자당 세마포어(KeyedSemaphore)는 후자다. 대기 시간 초과는 여전히 BUSY — queueMax=0 이면 그 경로가 없다.
export class Semaphore {
  constructor(limit, { queueMax = 8, waitTimeoutMs = 20_000, onFull = null } = {}) {
    this.limit = limit;
    this.queueMax = queueMax;
    this.waitTimeoutMs = waitTimeoutMs;
    this.onFull = onFull;
    this.active = 0;
    this.queue = [];
  }

  // 아무도 슬롯을 쥐지 않았고 대기자도 없는 상태. KeyedSemaphore 가 항목을 버릴지 판단할 때 쓴다.
  get idle() {
    return this.active === 0 && this.queue.length === 0;
  }

  // 반환값: { release, queuedMs }. release는 finally에서 반드시 호출할 것.
  async acquire(signal) {
    if (this.active < this.limit) {
      this.active += 1;
      return { release: this.#releaseOnce(), queuedMs: 0 };
    }
    if (this.queue.length >= this.queueMax) {
      throw this.onFull ? this.onFull() : new HttpError(503, 'BUSY', '대기열이 가득 찼습니다.');
    }
    const started = Date.now();
    return new Promise((resolve, reject) => {
      const entry = {
        grant: () => {
          cleanup();
          this.active += 1;
          resolve({ release: this.#releaseOnce(), queuedMs: Date.now() - started });
        },
        fail: (err) => { cleanup(); reject(err); },
      };
      const timer = setTimeout(() => {
        this.#drop(entry);
        entry.fail(new HttpError(503, 'BUSY', '대기 시간이 초과되었습니다.'));
      }, this.waitTimeoutMs);
      const onAbort = () => {
        this.#drop(entry);
        entry.fail(new HttpError(499, 'BAD_REQUEST', '요청이 취소되었습니다.'));
      };
      const cleanup = () => {
        clearTimeout(timer);
        signal?.removeEventListener('abort', onAbort);
      };
      signal?.addEventListener('abort', onAbort, { once: true });
      this.queue.push(entry);
    });
  }

  #drop(entry) {
    const idx = this.queue.indexOf(entry);
    if (idx !== -1) this.queue.splice(idx, 1);
  }

  #releaseOnce() {
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.active -= 1;
      const next = this.queue.shift();
      if (next) next.grant();
    };
  }
}

// 키(사용자 등)마다 Semaphore 를 하나씩 두는 레지스트리 — 플랜 10.5 S7.
// 기본값 queueMax:0 은 "기다리지 않는다" 는 뜻이다. 한도를 넘은 요청은 큐에 서는 대신 즉시 거절된다 —
// 동기 askAI 는 CLI 를 최대 30분 잡으므로 20초 대기 후 잘리는 것은 대기 시간만 버리는 짓이다.
export class KeyedSemaphore {
  constructor(limit, { queueMax = 0, waitTimeoutMs = 20_000, onFull = null } = {}) {
    this.limit = limit;
    this.options = { queueMax, waitTimeoutMs, onFull };
    this.map = new Map();
  }

  // 반환값은 Semaphore.acquire 와 같다 — { release, queuedMs }.
  async acquire(key, signal) {
    let sem = this.map.get(key);
    if (!sem) {
      sem = new Semaphore(this.limit, this.options);
      this.map.set(key, sem);
    }
    let slot;
    try {
      slot = await sem.acquire(signal);
    } catch (err) {
      // 거절된 요청이 방금 만든 빈 세마포어를 남기고 가면 그것도 누수다.
      this.#sweep(key, sem);
      throw err;
    }
    return {
      queuedMs: slot.queuedMs,
      release: () => { slot.release(); this.#sweep(key, sem); },
    };
  }

  // 진단·테스트용 — 살아 있는 키 개수.
  get size() {
    return this.map.size;
  }

  // 누수 방지: 슬롯이 비고 대기자도 없으면 Map 에서 지운다.
  // 지우지 않으면 서버 수명 내내 "한 번이라도 AI 를 부른 사용자" 수만큼 세마포어가 쌓인다.
  // 사용자당 1건은 지속되는 상태가 아니라 그 순간의 점유일 뿐이므로 비면 버려도 잃는 것이 없다.
  // map.get(key) === sem 검사는 이미 다른 세마포어로 교체된 자리를 지우지 않기 위한 것이다.
  #sweep(key, sem) {
    if (sem.idle && this.map.get(key) === sem) this.map.delete(key);
  }
}
