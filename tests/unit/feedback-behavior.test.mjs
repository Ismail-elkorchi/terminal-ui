import assert from 'node:assert/strict';
import test from 'node:test';

import {
  indeterminateProgressFrame,
  progressStatus
} from '../../dist/widgets/index.js';

test('progressStatus classifies bounded values deterministically', () => {
  assert.equal(progressStatus(0, 10), 'empty');
  assert.equal(progressStatus(-1, 10), 'empty');
  assert.equal(progressStatus(5, 10), 'partial');
  assert.equal(progressStatus(10, 10), 'complete');
  assert.equal(progressStatus(11, 10), 'overflow');
});

test('progressStatus normalizes invalid maxima without hidden state', () => {
  assert.equal(progressStatus(50, 0), 'partial');
  assert.equal(progressStatus(100, Number.NaN), 'complete');
  assert.equal(progressStatus(101, Number.NaN), 'overflow');
});

test('indeterminateProgressFrame derives a bounded active window from frame and width', () => {
  assert.deepEqual(indeterminateProgressFrame(1, 6), {
    width: 6,
    frame: 1,
    activeStart: 1,
    activeWidth: 2,
    cells: [
      { index: 0, active: false },
      { index: 1, active: true },
      { index: 2, active: true },
      { index: 3, active: false },
      { index: 4, active: false },
      { index: 5, active: false }
    ]
  });
});

test('indeterminateProgressFrame wraps frames and normalizes widths', () => {
  assert.deepEqual(
    indeterminateProgressFrame(-1, 4).cells.map((cell) => cell.active),
    [true, false, false, true]
  );
  assert.equal(indeterminateProgressFrame(12, 0).width, 1);
});
