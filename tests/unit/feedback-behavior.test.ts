import assert from 'node:assert/strict';
import test from 'node:test';

import {
  indeterminateProgressFrame,
  progressCompletionState
} from '../../dist/behavior/index.js';

void test('progressCompletionState classifies bounded values deterministically', () => {
  assert.equal(progressCompletionState(0, 10), 'empty');
  assert.equal(progressCompletionState(-1, 10), 'empty');
  assert.equal(progressCompletionState(5, 10), 'partial');
  assert.equal(progressCompletionState(10, 10), 'complete');
  assert.equal(progressCompletionState(11, 10), 'overflow');
});

void test('progressCompletionState normalizes invalid maxima without hidden state', () => {
  assert.equal(progressCompletionState(50, 0), 'partial');
  assert.equal(progressCompletionState(100, Number.NaN), 'complete');
  assert.equal(progressCompletionState(101, Number.NaN), 'overflow');
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
