import assert from 'node:assert/strict';
import test from 'node:test';

import { createPointerMotionCoordinator } from './input/pointer-motion-coordinator.ts';
import type {
  PointerMotionEvent,
  PointerMotionSample,
} from './input/pointer-motion-coordinator.ts';

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

  assert.deepEqual(await coordinator.flush(), [3]);
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

void test('a continuously replenished pointer cycle retains only its final result', async () => {
  let completed = 0;
  const coordinator = createPointerMotionCoordinator<number>({
    async execute(current) {
      completed += 1;
      if (completed < 1_000) coordinator.enqueue(sample(completed + 1));
      return current.event.column;
    },
    reportFailure(cause) { throw cause; },
    stop: () => false
  });

  coordinator.enqueue(sample(1));
  const pending = coordinator.pending();
  assert.deepEqual(await pending, [1_000]);
  assert.equal(completed, 1_000);
  assert.equal(coordinator.pending(), undefined);
});

void test('pointer failure, reset, and disposal settle without retaining queued samples', async () => {
  const entered = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  const failures: unknown[] = [];
  const failure = new Error('pointer failed');
  const coordinator = createPointerMotionCoordinator<number>({
    async execute() {
      entered.resolve(undefined);
      await release.promise;
      throw failure;
    },
    reportFailure: (cause) => { failures.push(cause); },
    stop: () => false
  });
  coordinator.enqueue(sample(1));
  await entered.promise;
  coordinator.enqueue(sample(2));
  coordinator.reset();
  const pending = coordinator.flush();
  const disposed = new Error('disposed');
  coordinator.dispose(disposed);
  coordinator.dispose(new Error('again'));
  assert.throws(() => { coordinator.enqueue(sample(3)); }, (cause) => cause === disposed);
  release.resolve(undefined);
  assert.deepEqual(await pending, []);
  await coordinator.settle();
  assert.deepEqual(failures, [failure]);
  assert.deepEqual(await coordinator.flush(), []);
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
