import assert from 'node:assert/strict';
import test from 'node:test';

import { text } from '../components/index.ts';
import { createMemoryTerminalHost } from '../host/memory.ts';
import { committedTerminalWrite, failedTerminalWrite } from '../host/write-receipt.ts';
import { renderElementFrame } from '../renderer/index.ts';
import { defineTheme } from '../theme/index.ts';
import { commitFrame } from './runtime-frame.ts';
import type { TerminalOperationContext } from '../host/types.ts';

void test('a committed write remains successful when cancellation arrives during host publication', async () => {
  const host = createMemoryTerminalHost({
    capabilities: { overrides: { synchronizedOutput: true } }
  });
  const frame = renderElementFrame(text({ content: 'pending frame' }), { columns: 20, rows: 1 });
  const controller = new AbortController();
  const started = deferred<boolean>();
  const observedCalls: { readonly text: string; readonly signal: AbortSignal | undefined; readonly aborted: boolean }[] = [];

  host.write = async (output, context: TerminalOperationContext = {}) => {
    observedCalls.push({ text: output.text ?? '', signal: context.signal, aborted: context.signal?.aborted ?? false });
    if (context.signal?.aborted === true) throw new Error('runtime disposed');
    if (observedCalls.length === 1) {
      started.resolve(true);
      await waitUntilAborted(context.signal);
    }
    return committedTerminalWrite();
  };
  host.writeRecovery = async (output, context: TerminalOperationContext = {}) => {
    observedCalls.push({ text: output.text ?? '', signal: context.signal, aborted: context.signal?.aborted ?? false });
    return committedTerminalWrite();
  };

  const committing = commitFrame(
    host,
    undefined,
    frame,
    defineTheme(),
    await host.getCapabilities(),
    { signal: controller.signal }
  );
  await started.promise;
  controller.abort(new Error('runtime disposed'));

  await committing;
  assert.equal(observedCalls.length, 1);
  const [frameCall] = observedCalls;
  assert.ok(frameCall);
  assert.equal(frameCall.signal, controller.signal);
  assert.equal(frameCall.aborted, false);
});

void test('frame commits do not mutate terminal state after a failed-before-write receipt', async () => {
  const host = createMemoryTerminalHost({
    capabilities: { overrides: { synchronizedOutput: true } }
  });
  const frame = renderElementFrame(text({ content: 'rejected frame' }), { columns: 20, rows: 1 });
  let recoveryWrites = 0;
  host.write = async () => failedTerminalWrite('rejected-frame', new Error('closed'));
  host.writeRecovery = async () => {
    recoveryWrites += 1;
    return committedTerminalWrite();
  };

  await assert.rejects(
    commitFrame(host, undefined, frame, defineTheme(), await host.getCapabilities()),
    /failed before the write started/u
  );
  assert.equal(recoveryWrites, 0);
});

void test('unchanged frame commits return an empty diff without entering the host write queue', async () => {
  const host = createMemoryTerminalHost();
  const frame = renderElementFrame(text({ content: 'stable frame' }), { columns: 20, rows: 1 });
  let writes = 0;
  const originalWrite = host.write.bind(host);
  host.write = async (output, context) => {
    writes += 1;
    return originalWrite(output, context);
  };

  const diff = await commitFrame(host, frame, frame, defineTheme(), await host.getCapabilities());

  assert.equal(diff.operations.length, 0);
  assert.equal(writes, 0);
  assert.equal(host.frames().length, 0);
  assert.equal(host.diffs().length, 0);
});

void test('managed frame commits attempt synchronized output when support is unknown', async () => {
  const host = createMemoryTerminalHost();
  const capabilities = await host.getCapabilities();
  const frame = renderElementFrame(text({ content: 'atomic frame' }), { columns: 20, rows: 1 });

  assert.equal(capabilities.synchronizedOutput.support, 'unknown');
  assert.equal(capabilities.synchronizedOutput.availability, 'available');
  await commitFrame(host, undefined, frame, defineTheme(), capabilities);

  assert.match(host.output(), /^\u001B\[\?2026h/u);
  assert.match(host.output(), /\u001B\[\?2026l$/u);
});

function waitUntilAborted(signal: AbortSignal | undefined): Promise<void> {
  if (signal === undefined) return new Promise(() => undefined);
  if (signal.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    signal.addEventListener('abort', () => {
      resolve();
    }, { once: true });
  });
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
