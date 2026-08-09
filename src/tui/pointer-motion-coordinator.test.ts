import assert from 'node:assert/strict';
import test from 'node:test';

import { createPointerMotionCoordinator } from './pointer-motion-coordinator.ts';
import type { PointerMotionEvent, PointerMotionSample } from './pointer-motion-coordinator.ts';

void test('pointer motion retains only the latest queued sample while a dispatch is active', async () => {
  const firstStarted = deferred<boolean>();
  const firstRelease = deferred<boolean>();
  const executed: number[] = [];
  const coordinator = createPointerMotionCoordinator<number>({
    async execute(sample) {
      executed.push(sample.event.column);
      if (executed.length === 1) {
        firstStarted.resolve(true);
        await firstRelease.promise;
      }
      return sample.event.column;
    },
    reportFailure(cause) {
      throw cause;
    },
    stop: () => false
  });

  coordinator.enqueue(sample(1));
  await firstStarted.promise;
  coordinator.enqueue(sample(2));
  coordinator.enqueue(sample(3));
  firstRelease.resolve(true);

  assert.deepEqual(await coordinator.flush(), [1, 3]);
  assert.deepEqual(executed, [1, 3]);
});

void test('pointer motion stops before dispatching a stale queued sample', async () => {
  const firstStarted = deferred<boolean>();
  const firstRelease = deferred<boolean>();
  const coordinator = createPointerMotionCoordinator<number>({
    async execute(sample) {
      firstStarted.resolve(true);
      await firstRelease.promise;
      return sample.event.column;
    },
    reportFailure(cause) {
      throw cause;
    },
    stop: (result) => result === 1
  });

  coordinator.enqueue(sample(1));
  await firstStarted.promise;
  coordinator.enqueue(sample(2));
  firstRelease.resolve(true);

  assert.deepEqual(await coordinator.flush(), [1]);
});

function motion(column: number): PointerMotionEvent {
  return {
    kind: 'mouse',
    sequence: '',
    encoding: 'sgr',
    action: 'drag',
    button: 'left',
    row: 1,
    column,
    rawCode: 32,
    modifiers: { ctrl: false, alt: false, shift: false }
  };
}

function sample(column: number): PointerMotionSample {
  return { event: motion(column), occurredAt: column };
}

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
