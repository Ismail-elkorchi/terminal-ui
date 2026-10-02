import assert from 'node:assert/strict';
import test from 'node:test';

import { createTuiChild, createTuiPreparedQuery, createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { text } from '../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { flushAsync, waitUntil } from '../support/async.ts';

const policy = {
  maxActive: 1, maxActivePerId: 1, maxQueued: 1, maxQueuedPerId: 1,
  replacementGracePeriodMs: 10,
};

function queryRuntime(prepare, effects = []) {
  const host = createMemoryTerminalHost();
  const query = createTuiPreparedQuery({
    id: 'query', prepare, toMessage: message => ({ kind: 'completion', message }),
  });
  const runtime = createTuiRuntime({ host, effectPolicy: policy, app: defineTui({
    init: () => ({ state: { ...query.init(), result: 'displayed' }, effects }),
    update: (state, message) => {
      if (message.kind === 'request') return query.request(state, message.input);
      if (message.kind === 'cancel') return query.cancel(state);
      return query.update(state, message.message);
    },
    view: state => text({ content: state.pending ? 'pending' : state.error?.code ?? state.result }),
  }) });
  return { runtime, host };
}

test('a prepared query rejected by queue capacity settles through its ordinary failure message and can retry', async () => {
  const blocked = Promise.withResolvers();
  const prepared = [];
  const { runtime } = queryRuntime(async input => { prepared.push(input); return input; }, [
    { id: 'busy', concurrency: 'parallel', run: async () => { await blocked.promise; return { kind: 'none' }; } },
    { id: 'queued', concurrency: 'enqueue', run: async () => ({ kind: 'none' }) },
  ]);
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'request', input: 'rejected' });
    await waitUntil(() => !runtime.state().pending);
    assert.deepEqual(prepared, []);
    assert.equal(runtime.state().error?.code, 'TUI_EFFECT_REJECTED');
    assert.equal(runtime.state().error?.data?.reason, 'queue_limit');
    assert.equal(runtime.state().result, 'displayed');
    assert.equal(runtime.metrics().effects.rejected, 1);
    blocked.resolve();
    await waitUntil(() => runtime.metrics().effects.active === 0);
    await runtime.dispatch({ kind: 'request', input: 'retry' });
    await waitUntil(() => !runtime.state().pending);
    assert.equal(runtime.state().result, 'retry');
    assert.equal(runtime.state().error, null);
    assert.deepEqual(prepared, ['retry']);
  } finally { blocked.resolve(); await runtime.dispose(); }
});

test('a prepared query replacement timeout settles and late prior work cannot overwrite it', async () => {
  const blocked = Promise.withResolvers();
  const prepared = [];
  let previousSignal;
  const { runtime, host } = queryRuntime(async (input, context) => {
    prepared.push(input);
    if (input !== 'old') return input;
    previousSignal = context.signal;
    return blocked.promise;
  });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'request', input: 'old' });
    await waitUntil(() => previousSignal !== undefined);
    await runtime.dispatch({ kind: 'request', input: 'replacement' });
    assert.equal(previousSignal.aborted, true);
    assert.equal(runtime.state().pending, true);
    host.clock.advance(policy.replacementGracePeriodMs);
    await waitUntil(() => !runtime.state().pending);
    assert.equal(runtime.state().error?.code, 'TUI_EFFECT_REJECTED');
    assert.equal(runtime.state().error?.data?.reason, 'replacement_timeout');
    assert.equal(runtime.state().result, 'displayed');
    assert.deepEqual(prepared, ['old']);
    blocked.resolve('obsolete');
    await waitUntil(() => runtime.metrics().effects.active === 0);
    assert.equal(runtime.state().result, 'displayed');
    await runtime.dispatch({ kind: 'request', input: 'retry' });
    await waitUntil(() => !runtime.state().pending);
    assert.equal(runtime.state().result, 'retry');
    assert.equal(runtime.state().error, null);
  } finally { blocked.resolve('cleanup'); await runtime.dispose(); }
});

test('rejected older requests and explicit cancellation cannot settle a newer query revision', async () => {
  const blocked = Promise.withResolvers();
  const { runtime } = queryRuntime(async input => input, [
    { id: 'busy', concurrency: 'parallel', run: async () => { await blocked.promise; return { kind: 'none' }; } },
    { id: 'queued', concurrency: 'enqueue', run: async () => ({ kind: 'none' }) },
  ]);
  try {
    await runtime.start();
    await runtime.dispatchMany([{ kind: 'request', input: 'old' }, { kind: 'request', input: 'new' }]);
    await waitUntil(() => !runtime.state().pending);
    assert.equal(runtime.state().revision, 2);
    assert.equal(runtime.state().error?.data?.reason, 'queue_limit');
    await runtime.dispatchMany([{ kind: 'request', input: 'cancelled' }, { kind: 'cancel' }]);
    await flushAsync();
    assert.equal(runtime.state().revision, 4);
    assert.equal(runtime.state().pending, false);
    assert.equal(runtime.state().error, null);
  } finally { blocked.resolve(); await runtime.dispose(); }
});

test('a child replacement rejection queued behind removal never reaches the parent reducer after remount', async () => {
  const blocked = Promise.withResolvers();
  const writing = Promise.withResolvers();
  const releaseWrite = Promise.withResolvers();
  const host = createMemoryTerminalHost();
  const write = host.write.bind(host);
  let oldStarted = false;
  const completions = [];
  const query = createTuiPreparedQuery({ id: 'query',
    prepare: async input => {
      if (input !== 'old') return input;
      oldStarted = true;
      return blocked.promise;
    },
    toMessage: message => message,
  });
  const child = createTuiChild({
    init: () => ({ state: { ...query.init(), result: 'fresh' } }),
    update: (state, message) => message.kind === 'request'
      ? query.request(state, message.input) : query.update(state, message),
    view: state => text({ content: state.pending ? 'pending' : state.error?.code ?? state.result }),
  }, message => ({ kind: 'child', message }));
  const runtime = createTuiRuntime({ host, effectPolicy: policy, app: defineTui({
    init(context) {
      const initial = child.init({ id: 'panel', generation: 1 }, context);
      return { ...initial, state: { child: initial.state } };
    },
    update(state, message, context) {
      if (message.kind === 'remount') {
        const mounted = child.init({ id: 'panel', generation: state.child.generation + 1 }, context);
        return { ...mounted, state: { child: mounted.state }, cancel: [child.remove(state.child)] };
      }
      if (message.message.message.kind !== 'request') completions.push(message.message);
      const next = child.update(state.child, message.message, context);
      return { ...next, state: { child: next.state } };
    },
    view: (state, context) => child.view(state.child, context),
  }) });
  const request = input => runtime.dispatch({ kind: 'child',
    message: { id: 'panel', generation: runtime.state().child.generation, message: { kind: 'request', input } },
  });
  try {
    await runtime.start();
    await request('old');
    await waitUntil(() => oldStarted);
    await request('replacement');
    host.write = async (...args) => { writing.resolve(); await releaseWrite.promise; return write(...args); };
    const remount = runtime.dispatch({ kind: 'remount' });
    await writing.promise;
    host.clock.advance(policy.replacementGracePeriodMs);
    await waitUntil(() => runtime.metrics().effects.rejected === 1);
    releaseWrite.resolve();
    await remount;
    await flushAsync();
    assert.deepEqual(completions, [], 'the retired producer must be rejected before parent message admission');
    assert.equal(runtime.state().child.generation, 2);
    assert.equal(runtime.state().child.state.error, null);
    assert.equal(runtime.state().child.state.result, 'fresh');
    await request('current');
    blocked.resolve('obsolete');
    await waitUntil(() => !runtime.state().child.state.pending);
    assert.equal(runtime.state().child.state.result, 'current');
    assert.equal(completions.length, 1);
    assert.equal(completions[0].generation, 2);
  } finally {
    releaseWrite.resolve(); blocked.resolve('cleanup'); host.write = write;
    await runtime.dispose();
  }
});

for (const finish of ['settle', 'dispose']) {
  test(`a finite rejection burst behind blocked terminal output drains on ${finish}`, async () => {
    const blocked = Promise.withResolvers();
    const writing = Promise.withResolvers();
    const releaseWrite = Promise.withResolvers();
    const host = createMemoryTerminalHost();
    const write = host.write.bind(host);
    let writes = 0;
    let admitted = 0;
    host.write = async (...args) => {
      if (++writes === 2) { writing.resolve(); await releaseWrite.promise; }
      return write(...args);
    };
    const failures = Array.from({ length: 64 }, (_, index) => index);
    const runtime = createTuiRuntime({ host, effectPolicy: policy, app: defineTui({
      init: () => ({ state: [], effects: [
        { id: 'busy', concurrency: 'parallel', run: async () => { await blocked.promise; return { kind: 'none' }; } },
        ...failures.map(index => ({
          id: `rejected-${index}`, concurrency: 'parallel',
          run: async () => { assert.fail('policy-rejected work must never execute'); },
          onError: ({ diagnostic }) => ({ kind: 'message', message: { index, diagnostic } }),
        })),
      ] }),
      update: (state, message) => { admitted++; return { state: [...state, message] }; },
      view: state => text({ content: `settled: ${state.length}` }),
    }) });
    try {
      await runtime.start();
      await writing.promise;
      assert.deepEqual(runtime.metrics().effects, { active: 1, queued: 0, rejected: failures.length });
      assert.equal(admitted, 1, 'terminal output backpressures ordinary message admission');
      const disposal = finish === 'dispose' ? runtime.dispose() : undefined;
      releaseWrite.resolve();
      if (finish === 'settle') {
        await waitUntil(() => runtime.state().length === failures.length);
        assert.deepEqual(runtime.state().map(item => item.index), failures);
        assert.ok(runtime.state().every(item => item.diagnostic.data.reason === 'active_limit'));
      }
      blocked.resolve();
      await (disposal ?? runtime.dispose());
      assert.equal(admitted, finish === 'settle' ? failures.length : 1);
      assert.deepEqual(runtime.metrics().effects, { active: 0, queued: 0, rejected: failures.length });
    } finally {
      releaseWrite.resolve(); blocked.resolve(); host.write = write;
      await runtime.dispose();
    }
  });
}
