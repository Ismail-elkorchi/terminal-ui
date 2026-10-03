import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnostic } from '../diagnostics.ts';
import { TerminalUiError } from '../errors.ts';
import { text } from '../components/index.ts';
import { createMemoryTerminalHost } from '../host/memory.ts';
import { committedTerminalWrite } from '../host/write-receipt.ts';
import { defineTui } from './definition.ts';
import { createTuiRuntime } from './runtime.ts';
import type { TuiEffect, TuiEffectPolicy } from './types.ts';

const boundedPolicy: TuiEffectPolicy = { maxOwned: 1, maxActive: 1, maxActivePerId: 1, maxQueued: 1, maxQueuedPerId: 1, replacementGracePeriodMs: 100 };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((complete) => { resolve = complete; });
  return { promise, resolve };
}
async function until(predicate: () => boolean): Promise<void> {
  for (let index = 0; index < 100; index += 1) {
    if (predicate()) return;
    await new Promise((resolve) => setImmediate(resolve));
  }
  assert.fail('Condition was not reached.');
}

void test('one transaction resolves start/cancel and replacement intent before any launch', async () => {
  const runs: string[] = [];
  const effect = (value: string): TuiEffect<string> => ({ id: 'x', concurrency: 'replace', async run() { runs.push(value); return { kind: 'none' }; } });
  const app = defineTui({ init: () => ({ state: 0 }), update: (state: number, message: string) => message === 'cancel'
    ? { state, cancel: [{ kind: 'effect' as const, id: 'x' }] } : { state, effects: [effect(message)] }, view: () => text({ content: 'unchanged' }) });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost(), effectPolicy: boundedPolicy });
  await runtime.start();
  await runtime.dispatchMany(['a', 'cancel']);
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(runs, []);
  await runtime.dispatchMany(['cancel', 'a', 'b']);
  await until(() => runs.length === 1);
  assert.deepEqual(runs, ['b']);
  await runtime.dispose();
});

for (const framed of [false, true]) void test(`owned effect admission precedes ${framed ? 'framed' : 'no-frame'} publication`, async () => {
  const blocked = deferred();
  let launches = 0;
  const effect: TuiEffect<string> = { id: 'busy', concurrency: 'parallel', async run() { launches += 1; await blocked.promise; return { kind: 'none' }; } };
  const app = defineTui({ init: () => ({ state: 0, effects: [effect] }), update: (state: number, message: string) => { void message; return { state: framed ? state + 1 : state, effects: [effect] }; }, view: (state) => text({ content: String(state) }) });
  const host = createMemoryTerminalHost();
  const runtime = createTuiRuntime({ app, host, effectPolicy: boundedPolicy });
  await runtime.start();
  await until(() => launches === 1);
  const writes = host.output().length;
  await assert.rejects(runtime.dispatch('start'), (cause: unknown) => cause instanceof TerminalUiError && cause.reason === 'owned_effects');
  assert.equal(runtime.state(), 0);
  assert.equal(host.output().length, writes);
  assert.equal(runtime.metrics().effects.owned, 1);
  blocked.resolve();
  await runtime.dispose();
});

void test('capacity-one terminal effect settlement transfers its obligation to a successor', async () => {
  const effect = (value: number): TuiEffect<number> => ({ id: 'fifo', concurrency: 'enqueue', async run() { return { kind: 'message', message: value }; } });
  const app = defineTui({ init: () => ({ state: 0, effects: [effect(1)] }), update: (state: number, message: number) => ({ state: Math.max(state, message), ...(message < 8 ? { effects: [effect(message + 1)] } : {}) }), view: (state) => text({ content: String(state) }) });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost(), effectPolicy: boundedPolicy });
  await runtime.start();
  await until(() => runtime.state() === 8);
  assert.equal(runtime.exit(), undefined);
  await until(() => runtime.metrics().effects.owned === 0);
  await runtime.dispose();
});

void test('effect rejection recovery consumes reserved ownership and excess initiation is rejected', async () => {
  const running = deferred();
  const app = defineTui({
    init: () => ({ state: 0, effects: [{ id: 'busy', concurrency: 'parallel' as const, async run() { await running.promise; return { kind: 'none' as const }; } }] }),
    update: (state: number, message: string) => message === 'recovered' ? { state: state - 1 } : {
      state: state + 1, effects: [{ id: message, concurrency: 'parallel' as const,
        async run() { assert.fail('Rejected effect cannot run.'); }, onError: () => ({ kind: 'message' as const, message: 'recovered' }) }],
    }, view: (state) => text({ content: String(state) }),
  });
  const host = createMemoryTerminalHost();
  const runtime = createTuiRuntime({ app, host, effectPolicy: { ...boundedPolicy, maxOwned: 2 } });
  await runtime.start();
  const started = deferred(); const write = deferred();
  host.write = async () => { started.resolve(); await write.promise; return committedTerminalWrite(); };
  const first = runtime.dispatch('one');
  await started.promise;
  const second = runtime.dispatch('two');
  write.resolve();
  await first;
  await assert.rejects(second, (cause: unknown) => cause instanceof TerminalUiError && cause.reason === 'owned_effects');
  await until(() => runtime.state() === 0);
  running.resolve();
  await runtime.dispose();
});

void test('blocked ingress rejects before copying arrays and settles pending calls on disposal', async () => {
  const app = defineTui({ init: () => ({ state: 0 }), update: (state: number, message: number) => ({ state: state + message }), view: (state) => text({ content: String(state) }) });
  const host = createMemoryTerminalHost();
  const runtime = createTuiRuntime({ app, host, runtimePolicy: { maxPendingOperations: 1, maxMessagesPerTransaction: 2 } });
  await runtime.start();
  const started = deferred(); const release = deferred();
  host.write = async () => { started.resolve(); await release.promise; return committedTerminalWrite(); };
  const pending = runtime.dispatch(1);
  await started.promise;
  let copied = false;
  const messages = [2];
  messages[Symbol.iterator] = () => { copied = true; return [2].values(); };
  await assert.rejects(runtime.dispatchMany(messages), (cause: unknown) => cause instanceof TerminalUiError && cause.code === 'TUI_OVERLOAD');
  assert.equal(copied, false);
  const disposing = runtime.dispose();
  release.resolve();
  assert.equal(await pending, 1);
  await disposing;
});

void test('broken effect recovery produces an explicit terminal fault', async () => {
  const app = defineTui({ init: () => ({ state: 'pending', effects: [{ id: 'broken', concurrency: 'parallel' as const,
    async run() { throw new Error('run'); }, onError() { throw new Error('recovery'); } }] }),
  update: (state: string, message: never) => { void message; return { state }; }, view: (state) => text({ content: state }) });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });
  await runtime.start();
  await until(() => runtime.exit()?.status === 'error');
  assert.equal(runtime.state(), 'pending');
  await assert.rejects(runtime.dispose(), /cleanup|disposal/u);
});

void test('startup reserves all owned effects before its first write', async () => {
  let launched = 0;
  const effect: TuiEffect<never> = { id: 'busy', concurrency: 'parallel', async run() { launched += 1; return { kind: 'none' }; } };
  const host = createMemoryTerminalHost();
  const app = defineTui({ init: () => ({ state: 0, effects: [effect, effect] }), update: (state: number, message: never) => { void message; return { state }; }, view: () => text({ content: 'initial' }) });
  const runtime = createTuiRuntime({ app, host, effectPolicy: boundedPolicy });
  await assert.rejects(runtime.start(), (cause: unknown) => cause instanceof TerminalUiError && cause.reason === 'owned_effects');
  assert.equal(host.output(), '');
  assert.equal(runtime.frame(), undefined);
  assert.equal(launched, 0);
  assert.equal(runtime.metrics().effects.owned, 0);
  await runtime.dispose();
});

void test('uncooperative retired source generations remain charged until physically finished', async () => {
  const held = deferred();
  const signals: AbortSignal[] = [];
  const app = defineTui({ init: () => ({ state: 0 }), update: (_state: number, message: number) => ({ state: message }),
    subscriptions: (state) => [{ id: 'source', generation: state, channel: { capacity: 2 }, async run(context) { signals.push(context.signal); await held.promise; } }],
    view: (state) => text({ content: String(state) }),
  });
  const host = createMemoryTerminalHost();
  const runtime = createTuiRuntime({ app, host, runtimePolicy: { maxOwnedSources: 2, maxSourceCapacity: 4 } });
  await runtime.start();
  await runtime.dispatch(1);
  assert.equal(runtime.metrics().sources.owned, 2);
  assert.equal(runtime.metrics().sources.capacity, 4);
  assert.equal(runtime.metrics().sources.retiring, 1);
  const output = host.output();
  await assert.rejects(runtime.dispatch(2), (cause: unknown) => cause instanceof TerminalUiError && cause.reason === 'owned_sources');
  assert.equal(runtime.state(), 1);
  assert.equal(host.output(), output);
  assert.equal(signals[0]?.aborted, true);
  assert.equal(signals[1]?.aborted, false);
  held.resolve();
  await runtime.dispose();
  assert.equal(runtime.metrics().sources.owned, 0);
});

void test('capacity-one source completion transfers only after source disposal settles', async () => {
  let disposals = 0;
  const app = defineTui({ init: () => ({ state: 0 }), update: (_state: number, message: number) => ({ state: message }),
    subscriptions: (state) => state < 5 ? [{ id: 'source', generation: state, channel: { capacity: 1 }, run() {},
      dispose() { disposals += 1; }, onLifecycle: () => state + 1 }] : [],
    view: (state) => text({ content: String(state) }),
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost(), runtimePolicy: { maxOwnedSources: 1, maxSourceCapacity: 1 } });
  await runtime.start();
  await until(() => runtime.state() === 5);
  assert.equal(disposals, 5);
  assert.equal(runtime.exit(), undefined);
  await runtime.dispose();
});

void test('oversized success uses one bounded recovery envelope', async () => {
  let recovered = 0;
  const app = defineTui({ init: () => ({ state: 'pending', effects: [{ id: 'output', concurrency: 'parallel' as const,
    async run() { return { kind: 'messages' as const, messages: ['a', 'b', 'c'] }; },
    onError() { recovered += 1; return { kind: 'message' as const, message: 'recovered' }; } }] }),
  update: (_state: string, message: string) => ({ state: message }), view: (state) => text({ content: state }) });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost(), effectPolicy: { ...boundedPolicy, maxOutputMessages: 2 } });
  await runtime.start();
  await until(() => runtime.state() === 'recovered');
  assert.equal(recovered, 1);
  await runtime.dispose();
});

void test('source lifecycle mapper failure faults once without recursively mapping recovery', async () => {
  let mappings = 0;
  const app = defineTui({ init: () => ({ state: 0 }), update: (state: number, message: never) => { void message; return { state }; },
    subscriptions: () => [{ id: 'source', generation: 1, run() { return undefined; }, onLifecycle(): never { mappings += 1; throw new Error('broken lifecycle'); } }],
    view: () => text({ content: 'source' }),
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost() });
  await runtime.start();
  await until(() => runtime.exit()?.status === 'error');
  assert.equal(mappings, 1);
  await runtime.dispose();
});

void test('an effect cannot release ownership while its unawaited clipboard operation is still running', async () => {
  const { createTuiEffectManager } = await import('./lifecycle/effects.ts');
  const host = createMemoryTerminalHost();
  const blocked = deferred();
  let started = false;
  const effects = createTuiEffectManager<never>({ clock: host.clock, policy: boundedPolicy,
    context: async () => ({ terminalSize: host.getTerminalSize(), capabilities: await host.getCapabilities(), clock: host.clock, diagnostics: [] }),
    dispatch: async () => undefined, reportDiagnostic: () => undefined,
    copySelectedText: async () => { started = true; await blocked.promise; return { status: 'unavailable', diagnostic: diagnostic('HOST_PROTOCOL_UNSUPPORTED', 'test') }; },
  });
  effects.start([{ id: 'clipboard', concurrency: 'parallel', async run(context) {
    void context.copySelectedText({ policy: { allowed: true } });
    return { kind: 'none' };
  } }]);
  await until(() => started);
  effects.cancelRequests([{ kind: 'effect', id: 'clipboard' }]);
  assert.equal(effects.metrics().owned, 1);
  assert.throws(() => { effects.start([{ id: 'next', concurrency: 'parallel', run: async () => ({ kind: 'none' }) }]); },
    (cause: unknown) => cause instanceof TerminalUiError && cause.reason === 'owned_effects');
  blocked.resolve();
  await effects.dispose();
});

void test('post-commit feedback is iterative and faults at its accepted continuation bound', async () => {
  const { textArea } = await import('../components/index.ts');
  const { createTextDocument } = await import('../text/document.ts');
  const host = createMemoryTerminalHost();
  const app = defineTui({ init: () => ({ state: 0 }), update: (state: number, message: number) => ({ state: state + message }),
    view: (state) => textArea({ id: 'loop', disabled: true, meta: { accessibleName: 'loop' },
      state: { document: createTextDocument(String(state)), caret: { position: { offset: 0, affinity: 'downstream' } } },
      onLayout: () => 1,
    }),
  });
  const runtime = createTuiRuntime({ app, host, runtimePolicy: { maxContinuationTurns: 3 } });
  await assert.rejects(runtime.start(), (cause: unknown) => cause instanceof TerminalUiError && cause.reason === 'continuation_turns');
  assert.equal(runtime.state(), 3);
  assert.equal(runtime.metrics().frameCommits, 4);
  assert.equal(runtime.exit()?.status, 'error');
  await runtime.dispose();
});

void test('raised effect output limits reach nested child mapping before array copies', async () => {
  const { createTuiChild } = await import('./child.ts');
  const inner = createTuiChild({ init: () => ({ state: 0, effects: [{ id: 'many', concurrency: 'parallel' as const,
    async run() { return { kind: 'messages' as const, messages: Array.from({ length: 1_500 }, () => 1) }; } }] }),
  update: (state: number, message: number) => ({ state: state + message }), view: () => text({ content: 'child' }) }, (message) => message.message);
  const outer = createTuiChild({ init: (context) => inner.init({ id: 'inner', generation: 1 }, context),
    update: (state, message: number) => { void message; return { state }; }, view: () => text({ content: 'outer' }),
  }, (message) => message.message);
  const app = defineTui({ init: (context) => ({ ...outer.init({ id: 'outer', generation: 1 }, context), state: 0 }),
    update: (state: number, message: number) => ({ state: state + message }), view: (state) => text({ content: String(state) }),
  });
  const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost(), runtimePolicy: { maxMessagesPerTransaction: 2_048 },
    effectPolicy: { ...boundedPolicy, maxOutputMessages: 2_048 },
  });
  await runtime.start();
  await until(() => runtime.state() === 1_500);
  assert.equal(runtime.exit(), undefined);
  await runtime.dispose();
});

void test('capacity-one settlement credit survives accepted layout continuations', async () => {
  const { textArea } = await import('../components/text-area/definition.ts');
  const { createTextDocument } = await import('../text/document.ts');
  const { ignoreMessage } = await import('../interaction/message.ts');
  let runs = 0;
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), effectPolicy: boundedPolicy, app: defineTui({
    init: () => ({ state: 'initial', effects: [{ id: 'task', concurrency: 'enqueue' as const, async run() {
      runs += 1; return { kind: 'message' as const, message: 'completed' };
    } }] }),
    update: (state: string, message: string) => message === 'completed' ? { state: 'feedback' }
      : message === 'layout' ? { state: 'done', effects: [{ id: 'task', concurrency: 'enqueue' as const, async run() {
        runs += 1; return { kind: 'none' as const };
      } }] } : { state },
    view: state => textArea({ id: 'editor', disabled: true, meta: { accessibleName: 'Editor' },
      state: { document: createTextDocument(state), caret: { position: { offset: 0, affinity: 'downstream' } } },
      onLayout: () => state === 'feedback' ? 'layout' : ignoreMessage(),
    }),
  }) });
  try {
    await runtime.start(); await until(() => runs === 2);
    assert.equal(runtime.state(), 'done');
    assert.equal(runtime.exit(), undefined);
    assert.deepEqual(runtime.diagnostics(), []);
  } finally { await runtime.dispose(); }
});

void test('bounded runtime arrays snapshot indexed membership without invoking caller iterators or methods', async () => {
  const { decodeTuiEffectOutput, decodeTuiUpdateResult } = await import('./hook-results.ts');
  let iterated = 0;
  const messages = [1];
  Object.defineProperty(messages, Symbol.iterator, { value: function* () {
    for (let index = 0; index < 10_000; index += 1) { iterated += 1; yield 1; }
  } });
  Object.defineProperty(messages, 'some', { value: () => { throw new Error('Caller some must not execute.'); } });
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), runtimePolicy: { maxMessagesPerTransaction: 2 }, app: defineTui({
    init: () => ({ state: 0 }), update: (state: number, message: number) => ({ state: state + message }), view: state => text({ content: String(state) }),
  }) });
  try {
    await runtime.start(); await runtime.dispatchMany(messages);
    assert.equal(runtime.state(), 1);
    assert.deepEqual(decodeTuiEffectOutput({ kind: 'messages', messages }, 'output', 2), { kind: 'messages', messages: [1] });
    assert.equal(iterated, 0);
    const effects = [{ id: 'effect', concurrency: 'parallel' as const, async run() { return { kind: 'none' as const }; } }];
    Object.defineProperty(effects, 'map', { value: () => { throw new Error('Caller map must not execute.'); } });
    assert.equal(decodeTuiUpdateResult({ state: 0, effects }, 1).contributions[0]?.effects?.length, 1);
    const growing = [1];
    Object.defineProperty(growing, '0', { get() { growing.push(100, 100); return 1; } });
    await runtime.dispatchMany(growing);
    assert.equal(runtime.state(), 2, 'adopt exactly the membership admitted before getters ran');
  } finally { await runtime.dispose(); }
});
