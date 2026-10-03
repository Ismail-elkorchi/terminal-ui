import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareWork } from '../foundation/cooperative-work.ts';
import { createTuiCooperativeWorkContext } from './cooperative-work.ts';

void test('runtime preparation adapter uses injected monotonic time and scheduler cancellation', async () => {
  const controller = new AbortController();
  let now = 0;
  const sleeps: number[] = [];
  const context = createTuiCooperativeWorkContext({ signal: controller.signal, clock: {
    monotonicNow: () => now,
    sleep: (milliseconds, signal) => {
      assert.equal(signal, controller.signal);
      sleeps.push(milliseconds);
      return Promise.resolve('elapsed');
    },
  } });
  function* work(): Generator<number, string> { now = 5; yield 1; return 'ready'; }
  assert.equal(await prepareWork(work(), context), 'ready');
  assert.deepEqual(sleeps, [0]);
  controller.abort(new Error('cancelled'));
  await assert.rejects(context.yield(), /cancelled/u);
  assert.deepEqual(sleeps, [0]);
});
