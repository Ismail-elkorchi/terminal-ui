import assert from 'node:assert/strict';
import test from 'node:test';

import { TerminalUiError } from '../errors.ts';
import { createMemoryTerminalHost } from '../host/memory.ts';
import { TuiInputSuspensionController } from './input-suspension.ts';
import { defaultSessionProtocolPolicy } from './lifecycle/session-policy.ts';
import { createTerminalSuspension } from './lifecycle/terminal-suspension.ts';
import type { TuiRuntime } from './types.ts';

void test('cancellation while input pause is queued rolls back without releasing terminal ownership', async () => {
  const fixture = suspensionFixture();
  const controller = new AbortController();
  const suspended = fixture.suspend(async () => {
    fixture.operationRuns += 1;
  }, controller.signal);
  await Promise.resolve(undefined);
  controller.abort(new Error('producer cancelled before pause'));

  await assert.rejects(suspended, /producer cancelled before pause/u);
  assert.equal(fixture.operationRuns, 0);
  assert.equal(fixture.sessionRestores, 0);
  assert.equal(fixture.outputResumes, 1);
  assert.equal(fixture.redraws, 1);
});

void test('cancellation after input pauses but before terminal release performs a local rollback', async () => {
  const fixture = suspensionFixture();
  const controller = new AbortController();
  const request = fixture.input.next();
  const suspended = fixture.suspend(async () => {
    fixture.operationRuns += 1;
  }, controller.signal);
  const lease = await request;
  lease.paused();
  controller.abort(new Error('producer cancelled after pause'));
  await lease.resumeRequested;
  lease.resumed();

  await assert.rejects(suspended, /producer cancelled after pause/u);
  assert.equal(fixture.operationRuns, 0);
  assert.equal(fixture.sessionRestores, 0);
  assert.equal(fixture.outputResumes, 1);
  assert.equal(fixture.redraws, 1);
});


void test('terminal suspension bounds outstanding requests and removes queued cancellations immediately', async () => {
  const fixture = suspensionFixture(2);
  const firstController = new AbortController();
  const first = fixture.suspend(async () => { fixture.operationRuns += 1; }, firstController.signal);
  await Promise.resolve(undefined);
  const queuedController = new AbortController();
  const queued = fixture.suspend(async () => { fixture.operationRuns += 1; }, queuedController.signal);
  await assert.rejects(fixture.suspend(async () => undefined, new AbortController().signal), (cause) =>
    cause instanceof TerminalUiError && cause.code === 'TUI_OVERLOAD'
    && cause.reason === 'suspension_operations' && cause.limit === 2 && cause.observed === 3);
  const queuedCancelled = assert.rejects(queued, /queued cancellation/u);
  queuedController.abort(new Error('queued cancellation'));
  await queuedCancelled;

  // The cancelled queue record releases capacity even while the first request
  // cannot acquire the paused input stream.
  const replacementController = new AbortController();
  const replacement = fixture.suspend(async () => { fixture.operationRuns += 1; }, replacementController.signal);
  const replacementCancelled = assert.rejects(replacement, /replacement cancellation/u);
  replacementController.abort(new Error('replacement cancellation'));
  await replacementCancelled;
  const firstCancelled = assert.rejects(first, /first cancellation/u);
  firstController.abort(new Error('first cancellation'));
  await firstCancelled;
  assert.equal(fixture.operationRuns, 0);
  assert.equal(fixture.sessionRestores, 0);
});

void test('terminal suspension has a finite default cap and rejects already cancelled requests', async () => {
  const fixture = suspensionFixture();
  const requests = Array.from({ length: 64 }, () => {
    const controller = new AbortController();
    return { controller, completion: fixture.suspend(async () => undefined, controller.signal) };
  });
  await assert.rejects(fixture.suspend(async () => undefined, new AbortController().signal), (cause) =>
    cause instanceof TerminalUiError && cause.limit === 64 && cause.observed === 65);
  const rejected = requests.map(({ completion }) => assert.rejects(completion, /cancelled/u));
  for (const { controller } of requests) controller.abort(new Error('cancelled'));
  await Promise.all(rejected);
  await assert.rejects(fixture.suspend(async () => undefined, AbortSignal.abort('cancelled')), /cancelled/u);
  for (const maxPendingOperations of [0, -1, 1.5, NaN, Infinity]) {
    assert.throws(() => suspensionFixture(maxPendingOperations), RangeError);
  }
});

void test('terminal suspension executes accepted external operations in arrival order', async () => {
  const host = createMemoryTerminalHost();
  const session = await host.beginSession({ id: 'suspension-ordered' });
  const input = new TuiInputSuspensionController();
  const events: number[] = [];
  const release = Promise.withResolvers<undefined>();
  const suspend = createTerminalSuspension({
    appId: 'suspension-ordered', host, input, session: () => session,
    maxPendingOperations: 3, policy: defaultSessionProtocolPolicy, graphics: 'none',
    recoveryTimeoutMs: 100, replaceSession: () => undefined, canReacquire: () => false,
    runtime: () => ({}) as TuiRuntime<unknown, { readonly kind: string }>,
    runner: () => ({
      async suspendOutput() {}, async resumeOutput() {}, async resetInput() {}, async replaceTerminalProfile() {}
    })
  });
  const first = suspend(async () => { events.push(1); await release.promise; return 1; }, new AbortController().signal);
  const second = suspend(async () => { events.push(2); return 2; }, new AbortController().signal);
  const third = suspend(async () => { events.push(3); return 3; }, new AbortController().signal);
  (await input.next()).paused();
  // Wait until the first callback owns the terminal before releasing it.
  for (let attempt = 0; events.length === 0 && attempt < 50; attempt += 1) await Promise.resolve(undefined);
  assert.deepEqual(events, [1]);
  release.resolve(undefined);
  assert.equal(await first, 1);
  (await input.next()).paused();
  assert.equal(await second, 2);
  (await input.next()).paused();
  assert.equal(await third, 3);
  assert.deepEqual(events, [1, 2, 3]);
  await host.dispose();
});

function suspensionFixture(maxPendingOperations?: number) {
  const host = createMemoryTerminalHost();
  const input = new TuiInputSuspensionController();
  let outputResumes = 0;
  let redraws = 0;
  let sessionRestores = 0;
  const runtime = {
    async redraw() { redraws += 1; },
  } as unknown as TuiRuntime<unknown, { readonly kind: string }>;
  const session = {
    async restore() {
      sessionRestores += 1;
      throw new Error('terminal release was not expected');
    }
  };
  const fixture = {
    input,
    operationRuns: 0,
    get outputResumes() { return outputResumes; },
    get redraws() { return redraws; },
    get sessionRestores() { return sessionRestores; },
    suspend: createTerminalSuspension({
      appId: 'suspension-phase-test',
      ...(maxPendingOperations === undefined ? {} : { maxPendingOperations }),
      host,
      input,
      policy: defaultSessionProtocolPolicy,
      graphics: 'none',
      recoveryTimeoutMs: 100,
      runtime: () => runtime,
      runner: () => ({
        async suspendOutput() {},
        async resumeOutput() { outputResumes += 1; },
        async resetInput() {},
        async replaceTerminalProfile() {},
      }),
      session: () => session as never,
      replaceSession: () => undefined,
      canReacquire: () => true
    })
  };
  return fixture;
}
