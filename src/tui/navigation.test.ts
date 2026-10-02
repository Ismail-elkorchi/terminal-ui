import assert from 'node:assert/strict';
import test from 'node:test';
import { updateTuiNavigation } from './navigation.ts';
import { createTuiChild } from './child.ts';
import { button, text } from '../components/index.ts';
import { column } from '../layout/index.ts';
import { createMemoryTerminalHost } from '../host/memory.ts';
import { failedTerminalWrite } from '../host/write-receipt.ts';
import { keyInput } from '../testing/input-events.ts';
import { defineTui } from './definition.ts';
import { createTuiRuntime } from './runtime.ts';
import type { TuiNavigationScreen } from './navigation.ts';
import type { NavigationStack } from '../behavior/navigation-stack.ts';
import type { TuiChildMessage, TuiChildState } from './child.ts';
import type { TuiCancellation } from './types.ts';
const entry = (id: string, generation = 1) => ({ id, state: { child: { id, generation, state: id }, focus: { kind: 'element' as const, elementId: `${id}-field` } } });
const removed: TuiChildState<string>[] = [];
const remove = (child: TuiChildState<string>): TuiCancellation => { removed.push(child); return { kind: 'effect', id: child.id }; };

void test('navigation keeps hidden screens mounted and restores focus with typed modal output', () => {
  removed.length = 0;
  const first = entry('editor');
  const stack: NavigationStack<TuiNavigationScreen<string>> = { entries: [first] };
  const modal = updateTuiNavigation(stack, { kind: 'push', entry: entry('dialog') }, remove);
  assert.equal(modal.cancel, undefined);
  const nested = updateTuiNavigation(modal.state, { kind: 'push', entry: entry('confirmation') }, remove);
  const pop = updateTuiNavigation(nested.state, { kind: 'pop' }, remove, [{ accepted: true }]);
  assert.deepEqual(pop.outputs, [{ accepted: true }]);
  assert.deepEqual(pop.focus, { kind: 'element', elementId: 'dialog-field' });
  assert.deepEqual(removed.map((child) => child.id), ['confirmation']);
  assert.equal(pop.state.entries[0], first);
});

void test('replacement retires an old generation, resets retain matching lifetimes, no-op preserves stack', () => {
  removed.length = 0;
  const first = entry('screen');
  const stack = { entries: [first] };
  assert.equal(updateTuiNavigation(stack, { kind: 'reset', entries: [first] }, remove).state, stack);
  const changed = updateTuiNavigation(stack, { kind: 'replace', entry: entry('screen', 2) }, remove);
  assert.equal(changed.cancel?.length, 1);
  assert.equal(removed[0]?.generation, 1);
  const current = changed.state.entries[0];
  assert.ok(current);
  const cloned = { ...current, state: { ...current.state } };
  assert.equal(updateTuiNavigation(changed.state, { kind: 'reset', entries: [cloned] }, remove).cancel, undefined);
});

void test('navigation removal forwards the real typed child-lifetime request', () => {
  const child = createTuiChild<string, never, never>({ init: () => ({ state: 'screen' }),
    update: state => ({ state }), view: state => text({ content: state }) }, message => message.message);
  const result = updateTuiNavigation({ entries: [entry('screen', 7)] }, { kind: 'pop' }, instance => child.remove(instance));
  assert.deepEqual(result.cancel, [{ kind: 'child', id: 'screen', generation: 7 }]);
});

void test('runtime restores scoped modal focus and retires work only after an accepted pop', async () => {
  type Local = 'first' | 'restore';
  type Message = { readonly kind: 'child'; readonly child: TuiChildMessage<Local> }
    | { readonly kind: 'push'; readonly id: string } | { readonly kind: 'pop' };
  interface State { readonly stack: NavigationStack<TuiNavigationScreen<number>>; readonly outputs: readonly string[]; }
  const signals: AbortSignal[] = [];
  const allStarted = Promise.withResolvers<undefined>();
  const child = createTuiChild<number, Local, Message, Local>({
    init: () => ({ state: 0, effects: [{ id: 'background', concurrency: 'parallel', run: async context => {
      signals.push(context.signal);
      if (signals.length === 3) allStarted.resolve(undefined);
      await new Promise<void>(resolve => { context.signal.addEventListener('abort', () => { resolve(); }, { once: true }); });
      return { kind: 'none' };
    } }] }),
    update: (state, message) => ({ state: state + 1, outputs: [message] }),
    view: state => column([
      button({ id: 'first', label: `First ${String(state)}`, onPress: () => 'first' as const }),
      button({ id: 'restore', label: `Restore ${String(state)}`, onPress: () => 'restore' as const }),
    ]),
  }, message => ({ kind: 'child', child: message }));
  const screen = (instance: TuiChildState<number>) => ({ id: instance.id, state: { child: instance,
    focus: { kind: 'element' as const, elementId: child.elementId(instance, 'restore') } } });
  const host = createMemoryTerminalHost();
  const write = host.write.bind(host);
  const runtime = createTuiRuntime({ host, app: defineTui<State, Message>({
    init(context) {
      const initial = child.init({ id: 'editor', generation: 1 }, context);
      const root = screen(initial.state);
      return { ...initial, state: { stack: { entries: [root] }, outputs: [] }, focus: root.state.focus };
    },
    update(state, message, context) {
      if (message.kind === 'push') {
        const initial = child.init({ id: message.id, generation: 1 }, context);
        const next = updateTuiNavigation<number, Message>(state.stack, { kind: 'push', entry: screen(initial.state) }, instance => child.remove(instance));
        return { ...initial, ...next, state: { ...state, stack: next.state } };
      }
      if (message.kind === 'pop') {
        const next = updateTuiNavigation<number, Message, string>(state.stack, { kind: 'pop' }, instance => child.remove(instance), ['confirmed']);
        return { ...next, state: { stack: next.state, outputs: [...state.outputs, ...(next.outputs ?? [])] } };
      }
      const index = state.stack.entries.findIndex(entry => entry.state.child.id === message.child.id);
      const current = state.stack.entries[index];
      if (current === undefined) return { state };
      const next = child.update(current.state.child, message.child, context);
      return { ...next, state: { stack: { entries: state.stack.entries.map((entry, position) => position === index
        ? { ...entry, state: { ...entry.state, child: next.state } } : entry) },
      outputs: [...state.outputs, ...(next.outputs ?? []).map(output => `${message.child.id}:${output}`)] } };
    },
    view: (state, context) => {
      const active = state.stack.entries.at(-1);
      assert.ok(active);
      return child.view(active.state.child, context);
    },
  }) });
  try {
    await runtime.start();
    await runtime.handleInput(keyInput('enter'));
    assert.equal(runtime.state().outputs.at(-1), 'editor:restore');
    await runtime.dispatch({ kind: 'push', id: 'dialog' });
    await runtime.dispatch({ kind: 'push', id: 'confirmation' });
    await allStarted.promise;
    // An ordinary completion for a hidden retained screen still reaches that child.
    await runtime.dispatch({ kind: 'child', child: { id: 'editor', generation: 1, message: 'first' } });
    assert.equal(runtime.state().stack.entries[0]?.state.child.state, 2);
    assert.equal(signals[0]?.aborted, false);
    await runtime.handleInput(keyInput('enter'));
    assert.equal(runtime.state().outputs.at(-1), 'confirmation:restore');
    const committed = runtime.state();
    host.write = async () => failedTerminalWrite('rejected', new Error('rejected'));
    await assert.rejects(runtime.dispatch({ kind: 'pop' }));
    assert.equal(runtime.state(), committed);
    assert.equal(signals[2]?.aborted, false);
    host.write = write;
    await runtime.dispatch({ kind: 'pop' });
    assert.equal(runtime.state().outputs.at(-1), 'confirmed');
    assert.equal(signals[2].aborted, true);
    assert.equal(signals[1]?.aborted, false);
    await runtime.handleInput(keyInput('enter'));
    assert.equal(runtime.state().outputs.at(-1), 'dialog:restore');
    await runtime.dispatch({ kind: 'pop' });
    await runtime.handleInput(keyInput('enter'));
    assert.equal(runtime.state().outputs.at(-1), 'editor:restore');
    assert.equal(signals[1].aborted, true);
    assert.equal(signals[0].aborted, false);
  } finally { host.write = write; await runtime.dispose(); }
});
