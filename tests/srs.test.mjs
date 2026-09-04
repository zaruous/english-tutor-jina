// SRS 예측 — DB·서버·AI 가 필요 없는 순수 계산. 복습 버튼 부제(predict)가
// 실제 적용(applyReview)과 어긋나지 않는다는 것이 이 파일의 단정이다.
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { SRS_RESULTS, applyReview, predict } from '../api/services/srs.js';

const card = { interval_days: 3, ease_factor: 2.5 };

describe('srs.applyReview', () => {
  it('again 은 간격을 0 으로 접고 10분 뒤로 잡는다', () => {
    const next = applyReview(card, 'again');
    assert.equal(next.interval_days, 0);
    assert.equal(next.againMinutes, 10);
    assert.equal(next.label, '10분');
    assert.equal(next.ease_factor, 2.3); // 2.5 - 0.2
  });

  it('ease_factor 는 1.3 아래로 내려가지 않는다', () => {
    const next = applyReview({ interval_days: 1, ease_factor: 1.35 }, 'again');
    assert.equal(next.ease_factor, 1.3);
  });

  it('ease_factor 는 3.0 위로 올라가지 않는다', () => {
    const next = applyReview({ interval_days: 4, ease_factor: 2.95 }, 'easy');
    assert.equal(next.ease_factor, 3.0);
  });

  it('good 은 interval × ease_factor, 최소 2일', () => {
    assert.equal(applyReview(card, 'good').interval_days, 8);        // round(3 × 2.5)
    assert.equal(applyReview({ interval_days: 0, ease_factor: 2.5 }, 'good').interval_days, 2);
  });

  it('hard 는 interval × 1.2, 최소 1일', () => {
    assert.equal(applyReview(card, 'hard').interval_days, 4);        // round(3 × 1.2)
    assert.equal(applyReview({ interval_days: 0, ease_factor: 2.5 }, 'hard').interval_days, 1);
  });

  it('모르는 result 는 던진다', () => {
    assert.throws(() => applyReview(card, 'maybe'), /알 수 없는 result/);
  });
});

describe('srs.predict', () => {
  it('4개 결과 전부를 applyReview 와 같은 값으로 미리 보여준다', () => {
    const preview = predict(card);
    assert.deepEqual(Object.keys(preview).sort(), [...SRS_RESULTS].sort());
    for (const result of SRS_RESULTS) {
      const actual = applyReview(card, result);
      assert.equal(preview[result].interval_days, actual.interval_days, result);
      assert.equal(preview[result].ease_factor, actual.ease_factor, result);
      assert.equal(preview[result].label, actual.label, result);
    }
  });

  it('again 만 in_days 가 0 이다 (오늘 안에 다시 나온다)', () => {
    const preview = predict(card);
    assert.equal(preview.again.in_days, 0);
    assert.equal(preview.good.in_days, preview.good.interval_days);
  });
});
