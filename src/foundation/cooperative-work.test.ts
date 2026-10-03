import assert from 'node:assert/strict';
import test from 'node:test';
import { finishWork, prepareWork, stableSortWork } from './cooperative-work.ts';

void test('nested work shares one budget while cheap checkpoints do not schedule', async () => {
  let completed = 0;
  let turns = 0;
  function* child(): Generator<number, void> { for (let i = 0; i < 3; i += 1) { completed += 1; yield 1; } }
  function* parent(): Generator<number, number> { for (let i = 0; i < 5; i += 1) yield* child(); return completed; }
  const atYield: number[] = [];
  assert.equal(await prepareWork(parent(), {
    signal: new AbortController().signal, operationLimit: 5,
    yield: () => { turns += 1; atYield.push(completed); return Promise.resolve(); },
  }), 15);
  assert.equal(turns, 3);
  assert.deepEqual(atYield, [5, 10, 15]);
});

void test('operation ceiling works with a frozen clock and elapsed slicing is advisory', async () => {
  function* work(): Generator<number, number> { for (let i = 0; i < 20; i += 1) yield 1; return 20; }
  let frozenYields = 0;
  await prepareWork(work(), { signal: new AbortController().signal, monotonicNow: () => 0,
    operationLimit: 4, yield: () => { frozenYields += 1; return Promise.resolve(); } });
  assert.equal(frozenYields, 5);
  let time = 0;
  let timedYields = 0;
  await prepareWork(work(), { signal: new AbortController().signal, monotonicNow: () => time++,
    operationLimit: 100, timeSliceMs: 3, yield: () => { timedYields += 1; return Promise.resolve(); } });
  assert.equal(timedYields, 6);
});

void test('cancellation is checked without a scheduler turn and closes nested generators', async () => {
  const controller = new AbortController();
  let finalized = 0;
  let resumed = false;
  function* nested(): Generator<number, void> {
    try { controller.abort(new Error('cancel cheap checkpoint')); yield 0; resumed = true; }
    finally { finalized += 1; }
  }
  function* work(): Generator<number, void> { try { yield* nested(); } finally { finalized += 1; } }
  await assert.rejects(prepareWork(work(), {
    signal: controller.signal, operationLimit: 1_000_000,
    yield: () => { assert.fail('cheap checkpoint must not schedule'); },
  }), /cancel cheap checkpoint/u);
  assert.equal(resumed, false);
  assert.equal(finalized, 2);
});

void test('abort or scheduler failure never returns a candidate and finalizes work', async () => {
  for (const cancel of [true, false]) {
    const controller = new AbortController();
    let finalized = false;
    let published = false;
    function* work(): Generator<number, string> {
      try { yield 1; published = true; return 'accepted'; } finally { finalized = true; }
    }
    await assert.rejects(prepareWork(work(), { signal: controller.signal, operationLimit: 1,
      yield: () => {
        if (cancel) { controller.abort(new Error('stale')); return Promise.resolve(); }
        return Promise.reject(new Error('scheduler failed'));
      },
    }), cancel ? /stale/u : /scheduler failed/u);
    assert.equal(published, false);
    assert.equal(finalized, true);
  }
});

void test('invalid charges and budgets reject, and synchronous draining finalizes on failure', async () => {
  function* work(): Generator<number, void> { yield -1; }
  await assert.rejects(prepareWork(work(), { signal: new AbortController().signal, yield: () => Promise.resolve() }), /charges/u);
  for (const operationLimit of [0, -1, Number.NaN, Number.POSITIVE_INFINITY]) {
    await assert.rejects(prepareWork(work(), { signal: new AbortController().signal, operationLimit, yield: () => Promise.resolve() }), /operationLimit/u);
  }
  let finalized = false;
  function* failed(): Generator<number, void> { try { yield 1; throw new Error('failure'); } finally { finalized = true; } }
  assert.throws(() => { finishWork(failed()); }, /failure/u);
  assert.equal(finalized, true);
});

void test('stable sort reuses the shared computation and preserves equal-key order', async () => {
  const values = Array.from({ length: 513 }, (_, index) => ({ index, key: index % 7 }));
  const compare = (left: typeof values[number], right: typeof values[number]) => left.key - right.key;
  let yields = 0;
  const expected = values.toSorted(compare);
  assert.deepEqual(finishWork(stableSortWork(values, compare)), expected);
  assert.deepEqual(await prepareWork(stableSortWork(values, compare), {
    signal: new AbortController().signal, operationLimit: 256,
    yield: () => { yields += 1; return Promise.resolve(); },
  }), expected);
  assert.ok(yields > 10);
});
