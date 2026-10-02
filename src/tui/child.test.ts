import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnostic } from '../diagnostics.ts';
import { button, text } from '../components/index.ts';
import { failedTerminalWrite } from '../host/write-receipt.ts';
import { createMemoryTerminalHost } from '../host/memory.ts';
import { column } from '../layout/index.ts';
import { renderElementFrame } from '../renderer/index.ts';
import { keyInput } from '../testing/input-events.ts';
import { createTuiChild } from './child.ts';
import type { TuiChildMessage, TuiChildState } from './child.ts';
import { defineTui } from './definition.ts';
import { createTuiRuntime } from './runtime.ts';
import type { TuiContext, TuiEffect, TuiSourceSink } from './types.ts';

async function context(): Promise<TuiContext> {
  const host = createMemoryTerminalHost();
  return { terminalSize: host.getTerminalSize(), capabilities: await host.getCapabilities(), diagnostics: [], clock: host.clock };
}

void test('child composition scopes work, local cancellations, focus and every effect output', async () => {
  const localEffect: TuiEffect<number> = {
    id: 'read', concurrency: 'replace',
    run: async () => ({ kind: 'messages', messages: [1, 2] }),
    onError: (failure) => ({ kind: 'message', message: failure.id === 'read' ? 3 : -1 }),
  };
  const child = createTuiChild({
    init: () => ({ state: 0, effects: [localEffect], focus: { kind: 'element' as const, elementId: 'editor' } }),
    update: (state: number, message: number) => ({ state: state + message, cancel: [{ kind: 'effect' as const, id: 'read' }], outputs: ['changed'] }),
    view: () => button({ id: 'editor', label: 'Edit', onPress: () => 1 }),
  }, (message) => message);
  const ctx = await context();
  const first = child.init({ id: 'left', generation: 1 }, ctx);
  const second = child.init({ id: 'right', generation: 1 }, ctx);
  assert.notEqual(first.effects?.[0]?.id, second.effects?.[0]?.id);
  assert.equal(first.focus?.kind, 'element');
  const effect = first.effects?.[0];
  assert.ok(effect);
  const effectContext = { ...ctx, signal: new AbortController().signal, withTerminalSuspended: async <T>(operation: () => Promise<T>) => operation(), copySelectedText: async () => { throw new Error('unused'); } };
  // Test the mapper independently of terminal suspension and clipboard facilities.
  const output = await effect.run(effectContext);
  assert.deepEqual(output, { kind: 'messages', messages: [1, 2].map((message) => ({ id: 'left', generation: 1, message })) });
  const update = child.update(first.state, { id: 'left', generation: 1, message: 4 }, ctx);
  assert.equal(update.state.state, 4);
  assert.deepEqual(update.cancel, [{ kind: 'effect', id: effect.id }]);
  assert.deepEqual(child.remove(first.state), { kind: 'child', id: 'left', generation: 1 });
  assert.deepEqual(update.outputs, ['changed']);
  assert.equal(child.update(first.state, { id: 'left', generation: 0, message: 99 }, ctx).state, first.state);
  assert.equal(child.update(first.state, { id: 'right', generation: 1, message: 99 }, ctx).state, first.state);
  assert.doesNotThrow(() => renderElementFrame(column([child.view(first.state, ctx), child.view(second.state, ctx)]), { columns: 30, rows: 4 }));
  assert.throws(() => child.init({ id: '', generation: 1 }, ctx), /id/u);
  assert.throws(() => child.init({ id: 'left', generation: Number.NaN }, ctx), /generation/u);
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
    init(ctx) { const initial = child.init({ id: 'notes', generation: 1 }, ctx); return { state: { child: initial.state, hidden: false }, effects: initial.effects ?? [] }; },
    update(state, message, ctx) {
      if (message.kind === 'hide') return { state: { ...state, hidden: true } };
      if (message.kind === 'remove') return { state: { hidden: false }, cancel: state.child === undefined ? [] : [child.remove(state.child)] };
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

void test('child maps errors and source lifecycle locally while preserving source ownership', async () => {
  const ctx = await context();
  let disposed = 0;
  const child = createTuiChild({
    init: () => ({ state: 0, effects: [{
      id: 'work', concurrency: 'enqueue' as const,
      run: async () => ({ kind: 'none' as const }),
      onError(failure) { return { kind: 'message' as const, message: failure.id.length }; },
    }] }),
    update: (state: number, message: number) => ({ state: state + message }),
    view: () => text({ content: 'child' }),
    subscriptions: () => [{
      id: 'feed', generation: 'revision', source: 'timer' as const, channel: { capacity: 2 },
      async run(_ctx, sink) { await sink.emit({ kind: 'replaceable', key: 'latest', message: 2 }); },
      onLifecycle(event) { return event.id.length; },
      dispose() { disposed += 1; },
    }],
  }, (message) => message);
  const initialized = child.init({ id: 'scope', generation: 'mount' }, ctx);
  const effect = initialized.effects?.[0];
  assert.ok(effect);
  const failure = { id: 'scoped work', diagnostic: diagnostic('TUI_EFFECT_FAILED', 'failure') };
  assert.deepEqual(effect.onError?.(failure), { kind: 'message', message: { id: 'scope', generation: 'mount', message: 4 } });
  assert.deepEqual(await effect.run({ ...ctx, signal: new AbortController().signal, withTerminalSuspended: async (operation) => operation(), copySelectedText: async () => { throw new Error('unused'); } }), { kind: 'none' });
  const source = child.subscriptions(initialized.state, ctx)[0];
  assert.ok(source);
  assert.equal(source.source, 'timer');
  assert.deepEqual(source.channel, { capacity: 2 });
  const emissions: unknown[] = [];
  await source.run({ ...ctx, signal: new AbortController().signal }, { emit: async (emission) => { emissions.push(emission); } });
  assert.deepEqual(emissions, [{ kind: 'replaceable', key: 'latest', message: { id: 'scope', generation: 'mount', message: 2 } }]);
  assert.deepEqual(source.onLifecycle?.({ kind: 'completed', id: source.id, generation: source.generation }), { id: 'scope', generation: 'mount', message: 4 });
  await source.dispose?.();
  assert.equal(disposed, 1);
  assert.deepEqual(child.subscriptions(child.init({ id: 'another', generation: 1 }, ctx).state, ctx)[0]?.generation, 'revision');
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
    assert.equal(result.effects?.length, 1);
    assert.equal(result.cancel?.length, 1);
    assert.equal(result.focus?.kind, 'element');
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
      return { ...replacement, cancel: [child.remove(state)] };
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
      if (message.kind === 'remove') return { state: undefined, cancel: state === undefined ? [] : [child.remove(state)] };
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
      return { state: undefined, cancel: state === undefined ? [] : [child.remove(state)] };
    },
    view: () => text({ content: 'application' }),
  }) });
  await runtime.start();
  await runtime.dispatchMany(['mount', 'remove']);
  assert.equal(launches, 0);
  await runtime.dispose();
});
