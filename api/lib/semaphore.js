import { HttpError } from './errors.js';

// FIFO 세마포어. 큐 상한 초과나 대기 시간 초과는 503 BUSY.
export class Semaphore {
  constructor(limit, { queueMax = 8, waitTimeoutMs = 20_000 } = {}) {
    this.limit = limit;
    this.queueMax = queueMax;
    this.waitTimeoutMs = waitTimeoutMs;
    this.active = 0;
    this.queue = [];
  }

  // 반환값: { release, queuedMs }. release는 finally에서 반드시 호출할 것.
  async acquire(signal) {
    if (this.active < this.limit) {
      this.active += 1;
      return { release: this.#releaseOnce(), queuedMs: 0 };
    }
    if (this.queue.length >= this.queueMax) {
      throw new HttpError(503, 'BUSY', '대기열이 가득 찼습니다.');
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
