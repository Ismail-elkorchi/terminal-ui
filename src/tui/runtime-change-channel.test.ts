import assert from 'node:assert/strict';
import test from 'node:test';

import type { AccessibleSnapshot } from '../accessibility/types.ts';
import { TerminalUiError } from '../errors.ts';
import type { Frame } from '../renderer/contracts.ts';
import { createRuntimeChangeChannel } from './runtime-change-channel.ts';
import type { TuiRuntimeChange } from './types.ts';

void test('runtime changes allow only one pending observer and release its slot on abort', async () => {
  const channel = createRuntimeChangeChannel<number>();
  const controller = new AbortController();
  const waiting = channel.next(controller.signal);
  for (let index = 0; index < 1_000; index += 1) {
    await assert.rejects(channel.next(), (cause) => cause instanceof TerminalUiError
      && cause.code === 'TUI_OVERLOAD' && cause.reason === 'change_waiter'
      && cause.limit === 1 && cause.observed === 2);
  }
  const cancelled = assert.rejects(waiting, /cancelled/u);
  controller.abort();
  await cancelled;
  const next = channel.next();
  const frame = frameChange(1);
  channel.publish(frame);
  assert.equal(await next, frame);
  const controller2 = new AbortController();
  const latest = channel.next(controller2.signal);
  channel.publish(frameChange(2));
  controller2.abort();
  assert.equal((await latest).kind, 'frame');
});

void test('runtime changes coalesce frames while retaining exit and close the observer', async () => {
  const channel = createRuntimeChangeChannel<number>();
  const exit: TuiRuntimeChange<number> = {
    kind: 'exit', exit: { status: 'completed', state: 1, diagnostics: [], snapshot: {} as AccessibleSnapshot }
  };
  channel.publish(frameChange(1));
  channel.publish(exit);
  const latest = frameChange(2);
  channel.publish(latest);
  await assert.rejects(channel.next(AbortSignal.abort()), /cancelled/u);
  assert.equal(await channel.next(), latest);
  assert.equal(await channel.next(), exit);
  const waiting = channel.next();
  const failure = new Error('closed');
  channel.close(failure);
  channel.close(new Error('second close'));
  await assert.rejects(waiting, (cause) => cause === failure);
  channel.publish(frameChange(3));
  await assert.rejects(channel.next(), (cause) => cause === failure);
});

function frameChange(version: number): TuiRuntimeChange<number> {
  return { kind: 'frame', commitId: String(version), stateVersion: version, frame: {} as Frame };
}
