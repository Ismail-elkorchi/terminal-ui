import assert from 'node:assert/strict';
import test from 'node:test';

import {
  indeterminateProgressFrame,
  progressValueStatus
} from '../../dist/behavior/index.js';

void test('progressValueStatus classifies bounded values deterministically', () => {
  assert.equal(progressValueStatus(0, 10), 'empty');
  assert.equal(progressValueStatus(-1, 10), 'empty');
  assert.equal(progressValueStatus(5, 10), 'partial');
  assert.equal(progressValueStatus(10, 10), 'complete');
  assert.equal(progressValueStatus(11, 10), 'overflow');
});

void test('progressValueStatus normalizes invalid maxima without hidden state', () => {
  assert.equal(progressValueStatus(50, 0), 'partial');
  assert.equal(progressValueStatus(100, Number.NaN), 'complete');
  assert.equal(progressValueStatus(101, Number.NaN), 'overflow');
});

void test('indeterminateProgressFrame derives a bounded active window from frame and width', () => {
  assert.deepEqual(indeterminateProgressFrame(1, 6), {
    width: 6,
    frame: 1,
    activeStart: 1,
    activeWidth: 2,
    cells: [
      { cellIndex: 0, active: false },
      { cellIndex: 1, active: true },
      { cellIndex: 2, active: true },
      { cellIndex: 3, active: false },
      { cellIndex: 4, active: false },
      { cellIndex: 5, active: false }
    ]
  });
});

void test('indeterminateProgressFrame wraps frames and normalizes widths', () => {
  assert.deepEqual(
    indeterminateProgressFrame(-1, 4).cells.map((cell) => cell.active),
    [true, false, false, true]
  );
  assert.equal(indeterminateProgressFrame(12, 0).width, 1);
});
