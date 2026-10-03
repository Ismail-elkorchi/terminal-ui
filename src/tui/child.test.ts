import assert from 'node:assert/strict';
import test from 'node:test';
import { button, text } from '../components/index.ts';
import { failedTerminalWrite } from '../host/write-receipt.ts';
import { createMemoryTerminalHost } from '../host/memory.ts';
import { column } from '../layout/index.ts';
import { renderElementFrame } from '../renderer/index.ts';
import { keyInput } from '../testing/input-events.ts';
import { combineTuiResults, liftTuiResult } from './result.ts';
import { decodeTuiUpdateResult } from './hook-results.ts';
import { createTuiChild } from './child.ts';
import type { TuiChildMessage, TuiChildState } from './child.ts';
import { defineTui } from './definition.ts';
import { createTuiRuntime } from './runtime.ts';
import type { TuiContext, TuiEffect, TuiSourceSink } from './types.ts';

async function context(): Promise<TuiContext> {
  const host = createMemoryTerminalHost();
  return { terminalSize: host.getTerminalSize(), capabilities: await host.getCapabilities(), diagnostics: [], clock: host.clock };
}

void test('child composition exposes opaque work and routes every effect output through the runtime', async () => {
  const localEffect: TuiEffect<number> = {
    id: 'read', concurrency: 'replace', run: async () => ({ kind: 'messages', messages: [1, 2] }),
  };
  const child = createTuiChild({
    init: () => ({ state: 0, effects: [localEffect], focus: { kind: 'element' as const, elementId: 'editor' } }),
    update: (state: number, message: number) => ({ state: state + message, cancel: [{ kind: 'effect' as const, id: 'read' }], outputs: ['changed'] }),
    view: () => button({ id: 'editor', label: 'Edit', onPress: () => 1 }),
  }, message => message);
  const ctx = await context();
  const first = child.init({ id: 'left', generation: 1 }, ctx);
  const second = child.init({ id: 'right', generation: 1 }, ctx);
  assert.deepEqual(Object.keys(first).sort(), ['contribution', 'state']);
  assert.deepEqual(Object.keys(first.contribution ?? {}), []);
  assert.throws(() => decodeTuiUpdateResult({ ...first, contribution: { ...first.contribution } }), /owned/u);
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), app: defineTui({
    init: () => combineTuiResults({ left: first.state, right: second.state }, first, second),
    update(state, message: TuiChildMessage<number>, context) {
      const field = message.id === 'left' ? 'left' : 'right';
      return liftTuiResult(state, field, child.update(state[field], message, context));
    },
    view: (state, context) => column([child.view(state.left, context), child.view(state.right, context)]),
  }) });
  try {
    await runtime.start();
    await settleUntil(() => runtime.state().left.state === 3 && runtime.state().right.state === 3);
    await runtime.dispatch({ id: 'left', generation: 1, message: 4 });
    assert.equal(runtime.state().left.state, 7);
    assert.equal(runtime.state().right.state, 3);
    const update = child.update(first.state, { id: 'left', generation: 1, message: 4 }, ctx);
    assert.deepEqual(update.outputs, ['changed']);
    assert.equal(child.remove(first.state).state, undefined);
    assert.equal(child.update(first.state, { id: 'left', generation: 0, message: 99 }, ctx).state, first.state);
    assert.equal(child.update(first.state, { id: 'right', generation: 1, message: 99 }, ctx).state, first.state);
    assert.doesNotThrow(() => renderElementFrame(column([child.view(first.state, ctx), child.view(second.state, ctx)]), { columns: 30, rows: 4 }));
    assert.throws(() => child.init({ id: '', generation: 1 }, ctx), /id/u);
    assert.throws(() => child.init({ id: 'left', generation: Number.NaN }, ctx), /generation/u);
  } finally { await runtime.dispose(); }
});

void test('two child instances route input independently through their parent runtime', async () => {
  const child = createTuiChild({
    init: () => ({ state: 0 }),
    update: (state: number, message: number) => ({ state: state + message }),
    view: (state: number) => button({ id: 'increment', label: String(state), onPress: () => 1 }),
  }, (message) => message);
  const host = createMemoryTerminalHost();
  const runtime = createTuiRuntime({ host, app: defineTui({
    init: (ctx) => ({ state: { left: child.init({ id: 'left', generation: 1 }, ctx).state, right: child.init({ id: 'right', generation: 1 }, ctx).state } }),
    update: (state, message: TuiChildMessage<number>, ctx) => ({ state: { ...state, [message.id]: child.update(message.id === 'left' ? state.left : state.right, message, ctx).state } }),
    view: (state, ctx) => column([child.view(state.left, ctx), child.view(state.right, ctx)]),
  }) });
  await runtime.start();
  await runtime.handleInput(keyInput('enter'));
  assert.equal(runtime.state().left.state, 1);
  assert.equal(runtime.state().right.state, 0);
  await runtime.handleInput(keyInput('tab'));
  await runtime.handleInput(keyInput('enter'));
  assert.equal(runtime.state().left.state, 1);
  assert.equal(runtime.state().right.state, 1);
  await runtime.dispose();
});

void test('hiding preserves owned work; removal cancels effects and sources and fences reopened children', async () => {
  const started = Promise.withResolvers<undefined>();
  const release = Promise.withResolvers<undefined>();
  let effectSignal: AbortSignal | undefined;
  let sourceSignal: AbortSignal | undefined;
  let sourceSink: TuiSourceSink<number> | undefined;
  let disposals = 0;
  const child = createTuiChild({
    init: () => ({ state: 0, effects: [{ id: 'read', concurrency: 'replace' as const, async run(ctx) { effectSignal = ctx.signal; started.resolve(undefined); await release.promise; return { kind: 'message' as const, message: 50 }; } }] }),
    update: (state: number, message: number) => ({ state: state + message }),
    view: (state: number) => text({ content: String(state) }),
    subscriptions: () => [{ id: 'events', generation: 0, run(ctx, sink) { sourceSignal = ctx.signal; sourceSink = sink; return new Promise<void>((resolve) => { ctx.signal.addEventListener('abort', () => { resolve(); }, { once: true }); }); }, dispose() { disposals += 1; } }],
  }, (message) => ({ kind: 'child' as const, child: message }));
  interface State { readonly child?: TuiChildState<number>; readonly hidden: boolean; }
  type Message = { readonly kind: 'child'; readonly child: TuiChildMessage<number> } | { readonly kind: 'hide' } | { readonly kind: 'remove' } | { readonly kind: 'reopen' };
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), app: defineTui<State, Message>({
    init(ctx) { const initial = child.init({ id: 'notes', generation: 1 }, ctx); return { ...initial, state: { child: initial.state, hidden: false } }; },
    update(state, message, ctx) {
      if (message.kind === 'hide') return { state: { ...state, hidden: true } };
      if (message.kind === 'remove') return state.child === undefined ? { state } : { ...child.remove(state.child), state: { hidden: false } };
      if (message.kind === 'reopen') return { state: { hidden: false, child: child.init({ id: 'notes', generation: 2 }, ctx).state } };
      if (state.child === undefined) return { state };
      const updated = child.update(state.child, message.child, ctx);
      return { ...updated, state: { ...state, child: updated.state } };
    },
    view: (state, ctx) => state.hidden || state.child === undefined ? text({ content: 'hidden' }) : child.view(state.child, ctx),
    subscriptions: (state, ctx) => state.child === undefined ? [] : child.subscriptions(state.child, ctx),
  }) });
  await runtime.start();
  await started.promise;
  await runtime.dispatch({ kind: 'hide' });
  assert.equal(effectSignal?.aborted, false);
  assert.equal(sourceSignal?.aborted, false);
  await sourceSink?.emit({ kind: 'reliable', message: 1 });
  while (runtime.state().child?.state === 0) await runtime.nextChange();
  assert.equal(runtime.state().child?.state, 1);
  const oldSink = sourceSink;
  await runtime.dispatch({ kind: 'remove' });
  assert.equal(effectSignal.aborted, true);
  assert.equal(sourceSignal.aborted, true);
  assert.equal(disposals, 1);
  await runtime.dispatch({ kind: 'reopen' });
  release.resolve(undefined);
  await oldSink?.emit({ kind: 'reliable', message: 99 });
  await runtime.dispatch({ kind: 'child', child: { id: 'notes', generation: 1, message: 99 } });
  assert.equal(runtime.state().child?.state, 0);
  await runtime.dispose();
  assert.equal(disposals, 2);
});

void test('child maps effect failures and source lifecycle through ordinary completion messages', async () => {
  let disposed = 0;
  const failures: string[] = [];
  const completed: string[] = [];
  const child = createTuiChild({
    init: () => ({ state: 0, effects: [{ id: 'work', concurrency: 'enqueue' as const,
      run: async () => { throw new Error('expected'); },
      onError(failure) { failures.push(failure.id); return { kind: 'message' as const, message: failure.id.length }; },
    }] }),
    update: (state: number, message: number) => ({ state: state + message }),
    view: () => text({ content: 'child' }),
    subscriptions: () => [{ id: 'feed', generation: 'revision', source: 'timer' as const, channel: { capacity: 2 },
      async run(_ctx, sink) { await sink.emit({ kind: 'replaceable', key: 'latest', message: 2 }); },
      onLifecycle(event) { completed.push(event.id); return event.id.length; },
      dispose() { disposed += 1; },
    }],
  }, message => message);
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), app: defineTui({
    init: context => child.init({ id: 'scope', generation: 'mount' }, context),
    update: (state, message: TuiChildMessage<number>, context) => child.update(state, message, context),
    view: (state, context) => child.view(state, context),
    subscriptions: (state, context) => child.subscriptions(state, context),
  }) });
  try {
    await runtime.start();
    await settleUntil(() => runtime.state().state === 10);
    assert.deepEqual(failures, ['work']);
    assert.deepEqual(completed, ['feed']);
    const subscriptions = child.subscriptions(runtime.state(), await context());
    assert.deepEqual(Object.keys(subscriptions[0] ?? {}), []);
    assert.deepEqual(child.subscriptions(undefined, await context()), []);
  } finally { await runtime.dispose(); }
  assert.equal(disposed, 1);
});

void test('child no-op preserves its state identity while forwarding work, focus, cancellation and outputs', async () => {
  const ctx = await context();
  const child = createTuiChild({
    init: () => ({ state: Object.freeze({ value: 1 }) }),
    update: (state: { readonly value: number }, message: number) => ({
      state,
      effects: [{ id: `read-${String(message)}`, concurrency: 'parallel' as const, run: async () => ({ kind: 'none' as const }) }],
      cancel: [{ kind: 'effect' as const, id: 'previous' }],
      focus: { kind: 'element' as const, elementId: 'editor' },
      outputs: [message],
    }),
    view: () => text({ content: 'unchanged' }),
  }, (message) => message);
  const initial = child.init({ id: 'panel', generation: 1 }, ctx).state;
  for (let index = 0; index < 2_000; index += 1) {
    const result = child.update(initial, { id: 'panel', generation: 1, message: index }, ctx);
    assert.equal(result.state, initial);
    assert.ok(result.contribution);
    assert.deepEqual(Object.keys(result.contribution), []);
    assert.deepEqual(Object.keys(result).sort(), ['contribution', 'outputs', 'state']);
    assert.deepEqual(result.outputs, [index]);
  }
  assert.deepEqual(Object.keys(initial).sort(), ['generation', 'id', 'state']);
});

void test('a rejected candidate does not retire the committed lifetime or start its replacement', async () => {
  const release = Promise.withResolvers<undefined>();
  const started = Promise.withResolvers<undefined>();
  let oldSignal: AbortSignal | undefined;
  let launches = 0;
  const child = createTuiChild({
    init: () => ({ state: 0, effects: [{ id: 'read', concurrency: 'parallel' as const, async run(ctx) {
      launches += 1;
      if (launches === 1) { oldSignal = ctx.signal; started.resolve(undefined); }
      await release.promise;
      return { kind: 'none' as const };
    } }] }),
    update: (state: number, message: number) => ({ state: state + message }),
    view: (state: number) => text({ content: String(state) }),
  }, (message) => message);
  const host = createMemoryTerminalHost();
  const write = host.write.bind(host);
  const runtime = createTuiRuntime({ host, app: defineTui({
    init(ctx) { return child.init({ id: 'panel', generation: 1 }, ctx); },
    update(state: TuiChildState<number>, _message: TuiChildMessage<number>, ctx) {
      void _message;
      const replacement = child.init({ id: 'panel', generation: 2 }, ctx);
      return combineTuiResults(replacement.state, child.remove(state), replacement);
    },
    view: (state: TuiChildState<number>) => text({ content: `generation ${String(state.generation)}` }),
  }) });
  await runtime.start();
  await started.promise;
  const committed = runtime.state();
  host.write = async () => failedTerminalWrite('rejected', new Error('rejected'));
  await assert.rejects(runtime.dispatch({ id: 'panel', generation: 1, message: 0 }));
  assert.equal(runtime.state(), committed);
  assert.equal(oldSignal?.aborted, false);
  assert.equal(launches, 1);
  host.write = write;
  await runtime.dispatch({ id: 'panel', generation: 1, message: 0 });
  assert.equal(runtime.state().generation, 2);
  assert.equal(oldSignal.aborted, true);
  release.resolve(undefined);
  await runtime.dispose();
});

void test('accepted removal revokes a completion already queued behind a delayed write', async () => {
  const finish = Promise.withResolvers<undefined>();
  const started = Promise.withResolvers<undefined>();
  const writing = Promise.withResolvers<undefined>();
  const publish = Promise.withResolvers<undefined>();
  let reductions = 0;
  const child = createTuiChild({
    init: () => ({ state: 0, effects: [{ id: 'read', concurrency: 'parallel' as const, async run() {
      started.resolve(undefined); await finish.promise; return { kind: 'message' as const, message: 1 };
    } }] }),
    update: (state: number, message: number) => ({ state: state + message }),
    view: () => text({ content: 'mounted' }),
  }, (message) => ({ kind: 'child' as const, message }));
  type State = TuiChildState<number> | undefined;
  type Message = { readonly kind: 'remove' } | { readonly kind: 'tick' } | { readonly kind: 'child'; readonly message: TuiChildMessage<number> };
  const host = createMemoryTerminalHost();
  const write = host.write.bind(host);
  const runtime = createTuiRuntime({ host, app: defineTui<State, Message>({
    init(ctx) { return child.init({ id: 'panel', generation: 1 }, ctx); },
    update(state, message, ctx) {
      if (message.kind === 'remove') return state === undefined ? { state } : child.remove(state);
      if (message.kind === 'tick') return { state };
      reductions += 1;
      return state === undefined ? { state } : child.update(state, message.message, ctx);
    },
    view: (state, ctx) => state === undefined ? text({ content: 'removed' }) : child.view(state, ctx),
  }) });
  await runtime.start(); await started.promise;
  host.write = async (output, context) => { writing.resolve(undefined); await publish.promise; return write(output, context); };
  const removal = runtime.dispatch({ kind: 'remove' });
  await writing.promise;
  finish.resolve(undefined);
  await new Promise<void>((resolve) => setImmediate(resolve));
  publish.resolve(undefined);
  await removal;
  await runtime.dispatch({ kind: 'tick' });
  assert.equal(runtime.state(), undefined);
  assert.equal(reductions, 0, 'revoked queued completion never enters the reducer');
  await runtime.dispose();
});

void test('mount and removal in one accepted batch never activate work from the removed lifetime', async () => {
  let launches = 0;
  const child = createTuiChild({
    init: () => ({ state: 0, effects: [{ id: 'read', concurrency: 'parallel' as const, async run() { launches += 1; return { kind: 'none' as const }; } }] }),
    update: (state: number, message: number) => ({ state: state + message }),
    view: () => text({ content: 'child' }),
  }, () => 'mount' as const);
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), app: defineTui<TuiChildState<number> | undefined, 'mount' | 'remove'>({
    init: () => ({ state: undefined }),
    update(state, message, ctx) {
      if (message === 'mount') {
        const mounted = child.init({ id: 'child', generation: 1 }, ctx);
        return mounted;
      }
      return state === undefined ? { state } : child.remove(state);
    },
    view: () => text({ content: 'application' }),
  }) });
  await runtime.start();
  await runtime.dispatchMany(['mount', 'remove']);
  assert.equal(launches, 0);
  await runtime.dispose();
});

async function settleUntil(done: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (done()) return;
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  assert.fail('Expected completion was not admitted.');
}
