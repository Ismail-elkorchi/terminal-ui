import assert from 'node:assert/strict';
import test from 'node:test';

import { text } from '../components/index.ts';
import { createMemoryTerminalHost } from '../host/memory.ts';
import { committedTerminalWrite } from '../host/write-receipt.ts';
import { renderElementFrame } from '../renderer/index.ts';
import { defineTheme } from '../theme/index.ts';
import { commitFrame } from './runtime-frame.ts';
import type { TerminalOperationContext } from '../host/types.ts';

void test('frame commits use an independent bounded context for synchronized-output cleanup', async () => {
  const host = createMemoryTerminalHost({
    capabilities: { overrides: { synchronizedOutput: true } }
  });
  const frame = renderElementFrame(text('pending frame'), { columns: 20, rows: 1 });
  const controller = new AbortController();
  const started = deferred<boolean>();
  const observedCalls: { readonly text: string; readonly signal: AbortSignal | undefined; readonly aborted: boolean }[] = [];

  host.write = async (output, context: TerminalOperationContext = {}) => {
    observedCalls.push({ text: output.text ?? '', signal: context.signal, aborted: context.signal?.aborted ?? false });
    if (context.signal?.aborted === true) throw abortReason(context.signal);
    if (observedCalls.length === 1) {
      started.resolve(true);
      await waitForAbort(context.signal);
    }
    return committedTerminalWrite();
  };

  const committing = commitFrame(host, undefined, frame, defineTheme(), { signal: controller.signal });
  await started.promise;
  controller.abort(new Error('runtime disposed'));

  await assert.rejects(committing, /runtime disposed/u);
  assert.equal(observedCalls.length, 2);
  const [frameCall, cleanupCall] = observedCalls;
  assert.ok(frameCall);
  assert.ok(cleanupCall);
  assert.equal(frameCall.signal, controller.signal);
  assert.equal(cleanupCall.text, '\u001B[?2026l');
  assert.notEqual(cleanupCall.signal, controller.signal);
  assert.equal(cleanupCall.aborted, false);
});

void test('unchanged frame commits record the diff without entering the host write queue', async () => {
  const host = createMemoryTerminalHost();
  const frame = renderElementFrame(text('stable frame'), { columns: 20, rows: 1 });
  let writes = 0;
  const originalWrite = host.write.bind(host);
  host.write = async (output, context) => {
    writes += 1;
    return originalWrite(output, context);
  };

  const diff = await commitFrame(host, frame, frame, defineTheme());

  assert.equal(diff.operations.length, 0);
  assert.equal(writes, 0);
  assert.equal(host.frames().length, 1);
  assert.equal(host.diffs().length, 1);
});

function waitForAbort(signal: AbortSignal | undefined): Promise<never> {
  if (signal === undefined) return new Promise(() => {});
  if (signal.aborted) return Promise.reject(abortReason(signal));
  return new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => {
      reject(abortReason(signal));
    }, { once: true });
  });
}

function abortReason(signal: AbortSignal): Error {
  return signal.reason instanceof Error
    ? signal.reason
    : new Error('Terminal operation aborted.', { cause: signal.reason });
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
