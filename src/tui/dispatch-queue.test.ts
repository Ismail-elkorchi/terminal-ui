import assert from 'node:assert/strict';
import test from 'node:test';
import { TerminalUiError } from '../errors.ts';
import { createSerializedDispatchQueue } from './dispatch-queue.ts';

void test('bounded queue settles cancelled pending callers while draining the physical active transaction', async () => {
  const queue = createSerializedDispatchQueue(2);
  const active = Promise.withResolvers<undefined>();
  const started = Promise.withResolvers<undefined>();
  const first = queue.run(async () => { started.resolve(undefined); await active.promise; return 1; });
  await started.promise;
  const second = queue.run(() => 2);
  await assert.rejects(queue.run(() => 3), (cause: unknown) => cause instanceof TerminalUiError && cause.code === 'TUI_OVERLOAD');
  let drained = false;
  const drain = queue.drain().then(() => { drained = true; });
  const cause = new Error('closed');
  queue.close(cause);
  await assert.rejects(second, (error: unknown) => error === cause);
  assert.equal(drained, false);
  active.resolve(undefined);
  assert.equal(await first, 1);
  await drain;
  assert.equal(drained, true);
});

void test('drain observes prior arrivals only', async () => {
  const queue = createSerializedDispatchQueue(2);
  const secondGate = Promise.withResolvers<undefined>();
  const first = queue.run(() => 1);
  const drain = queue.drain();
  const second = queue.run(async () => { await secondGate.promise; return 2; });
  await drain;
  assert.equal(await first, 1);
  secondGate.resolve(undefined);
  assert.equal(await second, 2);
});
