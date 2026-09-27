import assert from 'node:assert/strict';
import test from 'node:test';

import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { autocomplete, input, progress, runPrompt, select } from '../../../dist/prompts/index.js';
import { flushAsync, waitUntil } from '../../support/async.ts';

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

function observedSession(host, overrides = {}) {
  const restores = [];
  return {
    restores,
    host: {
      ...host,
      async beginSession(options) {
        const session = await host.beginSession(options);
        return {
          enableRawInput: (...args) => session.enableRawInput(...args),
          enableBracketedPaste: (...args) => overrides.enableBracketedPaste?.(...args)
            ?? session.enableBracketedPaste(...args),
          async restore(reason) {
            restores.push(reason);
            if (overrides.restore !== undefined) return overrides.restore(reason);
            return session.restore(reason);
          }
        };
      }
    }
  };
}

test('partial prompt setup restores the session once', async () => {
  const base = createMemoryTerminalHost();
  const { host, restores } = observedSession(base, {
    enableBracketedPaste: () => { throw new Error('paste setup failed'); }
  });
  const result = await runPrompt(input({ label: 'Name' }), host);

  assert.equal(result.reason, 'host_error');
  assert.deepEqual(restores, ['error']);
  assert.equal(base.stdin.isRawModeEnabled(), false);
  assert.equal(result.diagnostics[0]?.cause?.message, 'paste setup failed');
});

test('late validation cannot write after a failed initial render and restoration', async () => {
  const base = createMemoryTerminalHost();
  const pending = deferred();
  let writes = 0;
  const { host, restores } = observedSession({
    ...base,
    async write() { writes += 1; throw new Error('initial output failed'); }
  });
  const result = await runPrompt(input({
    label: 'Name',
    validate: () => pending.promise
  }), host);
  assert.equal(result.reason, 'host_error');
  assert.deepEqual(restores, ['error']);
  const settledWrites = writes;
  pending.resolve({ status: 'invalid', message: 'late result' });
  await flushAsync();
  assert.equal(writes, settledWrites);
  assert.equal(base.stdin.isRawModeEnabled(), false);
});

test('validation render failure wakes a pending input read', async () => {
  const base = createMemoryTerminalHost();
  const pending = deferred();
  const { host, restores } = observedSession({
    ...base,
    async write(output) {
      if (output.text.includes('rejected')) throw new Error('feedback output failed');
      return base.write(output);
    }
  });
  const running = runPrompt(input({ label: 'Name', validate: () => pending.promise }), host);
  await waitUntil(() => base.output().includes('Name'));
  pending.resolve({ status: 'invalid', message: 'rejected' });
  const result = await running;
  assert.equal(result.reason, 'host_error');
  assert.deepEqual(restores, ['error']);
  assert.equal(result.diagnostics[0]?.cause?.message, 'feedback output failed');
});

test('input failure aborts pending validation and ignores its late completion', async () => {
  const base = createMemoryTerminalHost();
  const pending = deferred();
  let validationSignal;
  const host = {
    ...base,
    stdin: {
      isTty: () => true,
      read() {
        return { async *[Symbol.asyncIterator]() { throw new Error('input failed'); } };
      }
    }
  };
  const result = await runPrompt(input({
    label: 'Name',
    validate: (_value, context) => {
      validationSignal = context.signal;
      return pending.promise;
    }
  }), host);
  assert.equal(result.reason, 'host_error');
  assert.equal(validationSignal.aborted, true);
  const output = base.output();
  pending.resolve({ status: 'invalid', message: 'late' });
  await flushAsync();
  assert.equal(base.output(), output);
});

test('input cleanup failure preserves the original read failure', async () => {
  const base = createMemoryTerminalHost();
  const host = {
    ...base,
    stdin: {
      isTty: () => true,
      read() {
        return {
          async next() { throw new Error('read failed'); },
          async return() { throw new Error('reader cleanup failed'); },
          [Symbol.asyncIterator]() { return this; }
        };
      }
    }
  };
  const result = await runPrompt(input({ label: 'Name' }), host);
  assert.equal(result.reason, 'host_error');
  assert.equal(result.diagnostics[0]?.cause?.message, 'read failed');
  assert.equal(result.diagnostics[1]?.cause?.message, 'reader cleanup failed');
  assert.equal(base.stdin.isRawModeEnabled(), false);
});

test('autocomplete completion after cancellation cannot publish', async () => {
  const base = createMemoryTerminalHost();
  const pending = deferred();
  let calls = 0;
  const running = runPrompt(autocomplete({
    label: 'Find',
    choices: () => ++calls === 1
      ? { choices: [], hasMore: false }
      : pending.promise
  }), base);
  await waitUntil(() => base.output().includes('Find'));
  base.input('x');
  await waitUntil(() => calls === 2);
  base.input('\u001b');
  base.endInput();
  const result = await running;
  assert.equal(result.reason, 'cancelled');
  const output = base.output();
  pending.resolve({ choices: [{ label: 'Late', value: 'late' }] });
  await flushAsync();
  assert.equal(base.output(), output);
});

test('autocomplete render failure reaches the prompt result', async () => {
  const base = createMemoryTerminalHost();
  let calls = 0;
  const { host, restores } = observedSession({
    ...base,
    async write(output) {
      if (output.text.includes('Match')) throw new Error('choice output failed');
      return base.write(output);
    }
  });
  const running = runPrompt(autocomplete({
    label: 'Find',
    choices: () => ++calls === 1
      ? { choices: [] }
      : { choices: [{ label: 'Match', value: 1 }] }
  }), host);
  await waitUntil(() => base.output().includes('Find'));
  base.input('m');
  const result = await running;
  assert.equal(result.reason, 'host_error');
  assert.deepEqual(restores, ['error']);
  assert.equal(result.diagnostics[0]?.cause?.message, 'choice output failed');
});

test('autocomplete debounce clock failure wakes the input wait', async () => {
  const base = createMemoryTerminalHost();
  const { host, restores } = observedSession({
    ...base,
    clock: {
      monotonicNow: () => base.clock.monotonicNow(),
      sleep: async () => { throw new Error('clock failed'); }
    }
  });
  const running = runPrompt(autocomplete({
    label: 'Find', debounceMs: 10, choices: []
  }), host);
  await waitUntil(() => base.output().includes('Find'));
  base.input('m');
  const result = await running;
  assert.equal(result.reason, 'host_error');
  assert.deepEqual(restores, ['error']);
  assert.equal(result.diagnostics[0]?.cause?.message, 'clock failed');
});

test('cancellation during initial choice loading aborts the source and restores', async () => {
  const base = createMemoryTerminalHost();
  const pending = deferred();
  let sourceSignal;
  const { host, restores } = observedSession(base);
  const running = runPrompt(select({
    label: 'Pick',
    choices: ({ signal }) => { sourceSignal = signal; return pending.promise; }
  }), host);
  await waitUntil(() => sourceSignal !== undefined);
  base.input('\u001b');
  base.endInput();
  const result = await running;
  assert.equal(result.reason, 'cancelled');
  assert.equal(sourceSignal.aborted, true);
  assert.deepEqual(restores, ['cancelled']);
  const output = base.output();
  pending.resolve({ choices: [{ label: 'Late', value: 1 }] });
  await flushAsync();
  assert.equal(base.output(), output);
});

test('timeout during initial choice loading restores without waiting for the source', async () => {
  const base = createMemoryTerminalHost();
  const pending = deferred();
  let sourceSignal;
  const { host, restores } = observedSession(base);
  const running = runPrompt(select({
    label: 'Pick', timeoutMs: 10,
    choices: ({ signal }) => { sourceSignal = signal; return pending.promise; }
  }), host);
  await waitUntil(() => sourceSignal !== undefined);
  base.clock.advance(10);
  const result = await running;
  assert.equal(result.reason, 'timeout');
  assert.equal(sourceSignal.aborted, true);
  assert.deepEqual(restores, ['timeout']);
  pending.resolve({ choices: [] });
});

test('timeout during choice pagination ignores a late page', async () => {
  const base = createMemoryTerminalHost();
  const pending = deferred();
  let calls = 0;
  const running = runPrompt(select({
    label: 'Pick', timeoutMs: 20,
    choices: () => ++calls === 1
      ? { choices: [{ label: 'One', value: 1 }], hasMore: true }
      : pending.promise
  }), base);
  await waitUntil(() => base.output().includes('One'));
  base.input('\u001b[6~');
  await waitUntil(() => calls === 2);
  base.clock.advance(20);
  const result = await running;
  assert.equal(result.reason, 'timeout');
  const output = base.output();
  pending.resolve({ choices: [{ label: 'Late', value: 2 }] });
  await flushAsync();
  assert.equal(base.output(), output);
});

test('progress publication failure reaches the result and restores once', async () => {
  const base = createMemoryTerminalHost();
  const { host, restores } = observedSession({
    ...base,
    async write(output) {
      if (output.text.includes('Running')) throw new Error('progress output failed');
      return base.write(output);
    }
  });
  const result = await runPrompt(progress({
    label: 'Build',
    progress: { kind: 'indeterminate' },
    task: async (controller) => {
      await controller.update({ kind: 'indeterminate', status: 'Running' });
      await new Promise(() => undefined);
    }
  }), host);
  assert.equal(result.reason, 'host_error');
  assert.deepEqual(restores, ['error']);
  assert.equal(result.diagnostics[0]?.cause?.message, 'progress output failed');
});

test('in-flight progress output settles before restoration and keeps its failure', async () => {
  const base = createMemoryTerminalHost();
  const pending = deferred();
  let publishing = false;
  const { host, restores } = observedSession({
    ...base,
    async write(output) {
      if (output.text.includes('Pending')) {
        publishing = true;
        await pending.promise;
        throw new Error('pending output failed');
      }
      return base.write(output);
    }
  });
  const running = runPrompt(progress({
    label: 'Build', progress: { kind: 'indeterminate' },
    task: (controller) => {
      void controller.update({ kind: 'indeterminate', status: 'Pending' });
      return { completed: true };
    }
  }), host);
  await waitUntil(() => publishing);
  assert.deepEqual(restores, []);
  pending.resolve();
  const result = await running;
  assert.equal(result.reason, 'host_error');
  assert.deepEqual(restores, ['error']);
  assert.equal(result.diagnostics[0]?.cause?.message, 'pending output failed');
});

test('late progress updates cannot write after cancellation', async () => {
  const base = createMemoryTerminalHost();
  const pending = deferred();
  let update;
  const running = runPrompt(progress({
    label: 'Build', progress: { kind: 'indeterminate' },
    task: async (controller) => {
      update = controller.update;
      await pending.promise;
      await controller.update({ kind: 'indeterminate', status: 'Late' });
    }
  }), base);
  await waitUntil(() => base.output().includes('Build'));
  base.input('\u001b');
  base.endInput();
  const result = await running;
  assert.equal(result.reason, 'cancelled');
  const output = base.output();
  pending.resolve();
  await update({ kind: 'indeterminate', status: 'Also late' });
  await flushAsync();
  assert.equal(base.output(), output);
});

test('restoration errors accompany the primary prompt failure', async () => {
  const base = createMemoryTerminalHost();
  const { host, restores } = observedSession({
    ...base,
    async write() { throw new Error('render failed'); }
  }, { restore: () => { throw new Error('restore failed'); } });
  const result = await runPrompt(input({ label: 'Name' }), host);
  assert.equal(result.reason, 'host_error');
  assert.deepEqual(restores, ['error']);
  assert.deepEqual(result.diagnostics.map((entry) => entry.code), ['HOST_STREAM_CLOSED', 'HOST_RESTORE_FAILED']);
});
