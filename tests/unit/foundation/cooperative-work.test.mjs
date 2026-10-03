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

test('aligned stable sorting preserves companion identity, ties and plain work charges', async () => {
  const { stableSortAlignedWork } = await import('../../../dist/foundation/cooperative-work.js');
  function drain(work) {
    const charges = [];
    let step = work.next();
    while (!step.done) { charges.push(step.value); step = work.next(); }
    return { result: step.value, charges };
  }
  assert.deepEqual(drain(stableSortWork([3, 1, 2], (left, right) => left - right)), { result: [1, 2, 3], charges: [6, 9] });
  const owners = [{ id: 'first' }, { id: 'second' }, { id: 'third' }, { id: 'fourth' }];
  const sorted = drain(stableSortAlignedWork([3, 1, 3, 2], [...owners], (left, right) => left - right));
  assert.deepEqual(sorted.result.values, [1, 2, 3, 3]);
  assert.deepEqual(sorted.result.companions, [owners[1], owners[3], owners[0], owners[2]]);
  assert.throws(() => finishWork(stableSortAlignedWork([1], [], (left, right) => left - right)), /equal lengths/u);
});
