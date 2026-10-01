import assert from 'node:assert/strict';
import test from 'node:test';
import { abortableSleep } from './abortable-sleep.ts';

void test('zero native sleep yields asynchronously without allocating a clamped timer', async () => {
  const original = globalThis.setTimeout;
  let timers = 0;
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
    timers += 1;
    return original(...args);
  }) as typeof setTimeout;
  let pending: Promise<'elapsed' | 'aborted'>;
  try { pending = abortableSleep(0); }
  finally { globalThis.setTimeout = original; }
  let settled = false;
  void pending.then(() => { settled = true; });
  await Promise.resolve();
  assert.equal(settled, false, 'zero sleep must leave the current microtask turn');
  assert.equal(await pending, 'elapsed');
  assert.equal(timers, 0, 'cooperative yield must not pay the timer minimum per work batch');
});

void test('positive native sleep retains timer scheduling and both paths report cancellation', async () => {
  const original = globalThis.setTimeout;
  const durations: number[] = [];
  globalThis.setTimeout = ((...args: Parameters<typeof setTimeout>) => {
    durations.push(args[1] ?? 0);
    return original(...args);
  }) as typeof setTimeout;
  let pending: Promise<'elapsed' | 'aborted'>;
  try { pending = abortableSleep(2); }
  finally { globalThis.setTimeout = original; }
  assert.equal(await pending, 'elapsed');
  assert.deepEqual(durations, [2]);
  for (const ms of [0, 1000]) {
    const controller = new AbortController();
    const sleep = abortableSleep(ms, controller.signal);
    controller.abort();
    assert.equal(await sleep, 'aborted');
    assert.equal(await abortableSleep(ms, controller.signal), 'aborted');
  }
  for (const ms of [-1, NaN, Infinity]) assert.throws(() => abortableSleep(ms), RangeError);
});
