import assert from 'node:assert/strict';
import test from 'node:test';
import { diagnostic } from '../diagnostics.ts';
import { text } from '../components/index.ts';
import { createMemoryTerminalHost } from '../host/memory.ts';
import { createTuiChild } from './child.ts';
import type { TuiChildMessage, TuiChildState } from './child.ts';
import { defineTui } from './definition.ts';
import { createTuiRuntime } from './runtime.ts';
import { createTuiPreparedQuery } from './prepared-query.ts';
import type { TuiPreparedQueryMessage, TuiPreparedQueryState } from './prepared-query.ts';
import type { TuiContext, TuiEffectContext } from './types.ts';

async function context(signal = new AbortController().signal): Promise<TuiEffectContext> {
  const host = createMemoryTerminalHost();
  return {
    terminalSize: host.getTerminalSize(), capabilities: await host.getCapabilities(), diagnostics: [], clock: host.clock, signal,
    withTerminalSuspended: async <T>(operation: () => Promise<T>) => operation(),
    copySelectedText: async () => { throw new Error('unused'); },
  };
}
const failure = diagnostic('TUI_EFFECT_FAILED', 'Query failed');
const query = createTuiPreparedQuery({
  id: 'prepare', prepare: async (input: { readonly source: string; readonly query: string }) => `${input.source}:${input.query}`,
  toMessage: (message) => message,
});

void test('prepared queries fence repeated requests, replaced sources and duplicate completions', async () => {
  const first = query.request(query.init(), { source: 'old', query: 'same' });
  const repeated = query.request(first.state, { source: 'old', query: 'same' });
  const replaced = query.request(repeated.state, { source: 'new', query: 'same' });
  const ctx = await context();
  for (const obsolete of [first, repeated]) {
    const effect = obsolete.effects?.[0];
    assert.ok(effect);
    const output = await effect.run(ctx);
    assert.equal(output.kind, 'message');
    assert.equal(query.update(replaced.state, output.message).state, replaced.state);
  }
  const effect = replaced.effects?.[0];
  assert.ok(effect);
  const output = await effect.run(ctx);
  assert.equal(output.kind, 'message');
  const done = query.update(replaced.state, output.message).state;
  assert.equal(done.result, 'new:same');
  assert.equal(done.pending, false);
  assert.equal(query.update(done, output.message).state, done);
  assert.equal(query.update(done, { kind: 'failed', revision: done.revision, diagnostic: failure }).state, done);
});

void test('failure and cancellation keep display policy explicit, and reopen rejects late work', () => {
  const displayed = { ...query.init(), result: 'shown' };
  const pending = query.request(displayed, { source: 'one', query: 'next' });
  assert.equal(pending.state.result, 'shown');
  const failedOutput = pending.effects?.[0]?.onError?.({ id: 'prepare', diagnostic: failure });
  assert.equal(failedOutput?.kind, 'message');
  const failed = query.update(pending.state, failedOutput.message).state;
  assert.equal(failed.error, failure);
  assert.equal(failed.result, 'shown');
  assert.equal(failed.pending, false);
  const cancelled = query.cancel(pending.state);
  assert.deepEqual(cancelled.cancelEffects, ['prepare']);
  assert.equal(query.update(cancelled.state, failedOutput.message).state, cancelled.state);
  const reopened = query.request(cancelled.state, { source: 'two', query: 'next' });
  assert.equal(query.update(reopened.state, failedOutput.message).state, reopened.state);
  assert.equal(reopened.state.error, null);
  assert.equal(query.request({ ...failed, result: null }, { source: 'one', query: 'empty' }).state.result, null);
});

void test('preparation observes interruption before and after an uncancellable operation', async () => {
  let calls = 0;
  const released = Promise.withResolvers<string>();
  const interruptible = createTuiPreparedQuery({ id: 'work', prepare: async (input: string) => { assert.equal(input, 'work'); calls++; return released.promise; }, toMessage: (message) => message });
  const requested = interruptible.request(interruptible.init(), 'work');
  const effect = requested.effects?.[0];
  assert.ok(effect);
  const before = new AbortController();
  before.abort();
  await assert.rejects(effect.run(await context(before.signal)), /abort/iu);
  assert.equal(calls, 0);
  const during = new AbortController();
  const running = effect.run(await context(during.signal));
  during.abort();
  released.resolve('obsolete');
  await assert.rejects(running, /abort/iu);
  assert.equal(calls, 1);
});

void test('prepared query work uses child ownership for removal and fresh-generation reopening', async () => {
  const started = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<string>();
  let signal: AbortSignal | undefined;
  const localQuery = createTuiPreparedQuery({
    id: 'read', prepare: async (input: string, ctx) => { assert.equal(input, 'initial'); signal = ctx.signal; started.resolve(undefined); return released.promise; },
    toMessage: (message) => message,
  });
  const child = createTuiChild({
    init: () => localQuery.request(localQuery.init(), 'initial'),
    update: (state: TuiPreparedQueryState<string>, message: TuiPreparedQueryMessage<string>) => localQuery.update(state, message),
    view: (state: TuiPreparedQueryState<string>) => text({ content: state.result ?? 'pending' }),
  }, (message) => ({ kind: 'child' as const, message }));
  interface State { readonly generation: number; readonly child?: TuiChildState<TuiPreparedQueryState<string>>; }
  type Message = { readonly kind: 'child'; readonly message: TuiChildMessage<TuiPreparedQueryMessage<string>> }
    | { readonly kind: 'remove' } | { readonly kind: 'reopen' };
  const mount = (generation: number, ctx: TuiContext) => child.init({ id: 'query', generation }, ctx);
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), app: defineTui<State, Message>({
    init(ctx) { const initial = mount(1, ctx); return { ...initial, state: { generation: 1, child: initial.state } }; },
    update(state, message, ctx) {
      if (message.kind === 'remove') return { state: { generation: state.generation }, cancelEffects: state.child === undefined ? [] : child.remove(state.child) };
      if (message.kind === 'reopen') {
        const initial = mount(state.generation + 1, ctx);
        return { ...initial, state: { generation: state.generation + 1, child: initial.state } };
      }
      if (state.child === undefined) return { state };
      const next = child.update(state.child, message.message, ctx);
      return { ...next, state: { ...state, child: next.state } };
    },
    view: (state, ctx) => state.child === undefined ? text({ content: 'closed' }) : child.view(state.child, ctx),
  }) });
  try {
    await runtime.start();
    await started.promise;
    await runtime.dispatch({ kind: 'remove' });
    assert.equal(signal?.aborted, true);
    await runtime.dispatch({ kind: 'reopen' });
    const reopened = runtime.state();
    await runtime.dispatch({ kind: 'child', message: { id: 'query', generation: 1, message: { kind: 'ready', revision: 1, result: 'obsolete' } } });
    assert.equal(runtime.state().child?.state, reopened.child?.state);
    released.resolve('current');
    while (runtime.state().child?.state.pending === true) await runtime.nextChange();
    assert.equal(runtime.state().child?.state.result, 'current');
  } finally { released.resolve('disposed'); await runtime.dispose(); }
});

void test('runtime query failure can retry, replacement aborts old work, and disposal interrupts preparation', async () => {
  const requests: { input: string; signal: AbortSignal; release: (value: string) => void }[] = [];
  const oldStarted = Promise.withResolvers<undefined>();
  const newStarted = Promise.withResolvers<undefined>();
  const disposalStarted = Promise.withResolvers<undefined>();
  const interrupted = Promise.withResolvers<undefined>();
  const controlled = createTuiPreparedQuery({
    id: 'query',
    async prepare(input: string, ctx) {
      if (input === 'fail') throw new Error('expected failure');
      const pending = Promise.withResolvers<string>();
      requests.push({ input, signal: ctx.signal, release: pending.resolve });
      if (input === 'old-source') oldStarted.resolve(undefined);
      if (input === 'new-source') newStarted.resolve(undefined);
      if (input === 'disposed') {
        ctx.signal.addEventListener('abort', () => { interrupted.resolve(undefined); }, { once: true });
        disposalStarted.resolve(undefined);
      }
      return pending.promise;
    },
    toMessage: (message) => ({ kind: 'completion' as const, message }),
  });
  type Message = { readonly kind: 'request'; readonly input: string }
    | { readonly kind: 'completion'; readonly message: TuiPreparedQueryMessage<string> };
  const runtime = createTuiRuntime({ host: createMemoryTerminalHost(), app: defineTui<TuiPreparedQueryState<string>, Message>({
    init: () => ({ state: controlled.init() }),
    update: (state, message) => message.kind === 'request' ? controlled.request(state, message.input) : controlled.update(state, message.message),
    view: (state) => text({ content: state.pending ? 'pending' : state.error?.message ?? state.result ?? 'empty' }),
  }) });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'request', input: 'fail' });
    while (runtime.state().pending) await runtime.nextChange();
    assert.equal(runtime.state().error?.code, 'TUI_EFFECT_FAILED');
    await runtime.dispatch({ kind: 'request', input: 'old-source' });
    await oldStarted.promise;
    await runtime.dispatch({ kind: 'request', input: 'new-source' });
    assert.equal(requests[0]?.signal.aborted, true);
    requests[0].release('obsolete');
    await newStarted.promise;
    requests[1]?.release('current');
    while (runtime.state().pending) await runtime.nextChange();
    assert.equal(runtime.state().result, 'current');
    assert.equal(runtime.state().error, null);
    await runtime.dispatch({ kind: 'request', input: 'disposed' });
    await disposalStarted.promise;
    const disposal = runtime.dispose();
    await interrupted.promise;
    assert.equal(requests[2]?.signal.aborted, true);
    requests[2].release('late');
    await disposal;
    assert.equal(runtime.state().result, 'current');
  } finally { for (const request of requests) request.release('cleanup'); await runtime.dispose(); }
});
