import assert from 'node:assert/strict';
import test from 'node:test';
import { finishWork, prepareWork, stableSortWork } from '../../../dist/foundation/cooperative-work.js';

test('cooperative stable merge sort keeps equivalent ordering and bounded checkpoints', async () => {
  const values = Array.from({ length: 2049 }, (_, index) => ({ key: index % 7, index }));
  const compare = (left, right) => left.key - right.key;
  let yields = 0;
  const result = await prepareWork(stableSortWork(values, compare), {
    signal: new globalThis.AbortController().signal,
    yield: async () => { yields += 1; },
  });
  assert.deepEqual(result, values.toSorted(compare));
  assert.ok(yields > values.length / 256);
  assert.deepEqual(finishWork(stableSortWork([], compare)), []);
  assert.deepEqual(finishWork(stableSortWork([3, 2, 1], (a, b) => a - b)), [1, 2, 3]);
});

test('cooperative work observes pre-abort and closes an interrupted generator', async () => {
  let entered = false;
  let closed = false;
  function* work() {
    entered = true;
    try { yield 1; return 42; } finally { closed = true; }
  }
  const controller = new globalThis.AbortController();
  controller.abort(new Error('already cancelled'));
  await assert.rejects(prepareWork(work(), { signal: controller.signal, yield: async () => {} }), /already cancelled/u);
  assert.equal(entered, false);
  const other = new globalThis.AbortController();
  await assert.rejects(prepareWork(work(), {
    signal: other.signal, operationLimit: 1, yield: async () => { other.abort(new Error('interrupted')); },
  }), /interrupted/u);
  assert.equal(closed, true);
});
