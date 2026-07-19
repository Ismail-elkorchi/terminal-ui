import assert from 'node:assert/strict';
import test from 'node:test';

import { OrderedOutputQueue } from './ordered-output.ts';

void test('queued output observes cancellation without violating queue order', async () => {
  const queue = new OrderedOutputQueue();
  const blocker = deferred<boolean>();
  const first = queue.run(async () => {
    await blocker.promise;
  });
  const controller = new AbortController();
  let secondStarted = false;
  let rejection: Error | undefined;
  const second = queue.run(async () => {
    secondStarted = true;
  }, { signal: controller.signal });
  void second.catch((cause: unknown) => {
    rejection = cause instanceof Error ? cause : new Error(String(cause));
  });

  controller.abort(new Error('queued write cancelled'));
  await Promise.resolve();
  await Promise.resolve();

  assert.match(rejection?.message ?? '', /queued write cancelled/u);
  assert.equal(secondStarted, false);

  blocker.resolve(true);
  await first;
  await assert.rejects(second, /queued write cancelled/u);
});

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T | PromiseLike<T>) => void;
} {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}
