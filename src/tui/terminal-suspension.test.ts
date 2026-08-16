import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../host/memory.ts';
import { TuiInputSuspensionController } from './input-suspension.ts';
import { defaultSessionProtocolPolicy } from './session-policy.ts';
import { createTerminalSuspension } from './terminal-suspension.ts';
import type { TuiRuntime } from './types.ts';

void test('cancellation while input pause is queued rolls back without releasing terminal ownership', async () => {
  const fixture = suspensionFixture();
  const controller = new AbortController();
  const suspended = fixture.suspend(async () => {
    fixture.operationRuns += 1;
  }, controller.signal);
  await Promise.resolve();
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

function suspensionFixture() {
  const host = createMemoryTerminalHost();
  const input = new TuiInputSuspensionController();
  let outputResumes = 0;
  let redraws = 0;
  let sessionRestores = 0;
  const runtime = {
    async suspendOutput() {},
    resumeOutput() { outputResumes += 1; },
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
      host,
      input,
      policy: defaultSessionProtocolPolicy,
      graphics: 'none',
      recoveryTimeoutMs: 100,
      runtime: () => runtime,
      session: () => session as never,
      replaceSession: () => undefined,
      canReacquire: () => true
    })
  };
  return fixture;
}
