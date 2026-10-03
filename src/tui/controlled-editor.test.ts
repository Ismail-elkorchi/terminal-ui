import assert from 'node:assert/strict';
import test from 'node:test';
import { createTextAreaState } from '../behavior/text-editing.ts';
import { diagnostic } from '../diagnostics.ts';
import { createMemoryTerminalHost } from '../host/memory.ts';
import { textDocumentText } from '../text/document.ts';
import { createTuiControlledEditor } from './controlled-editor.ts';
import type { TuiControlledEditorMessage, TuiControlledEditorOutput, TuiControlledEditorResult, TuiControlledEditorState } from './controlled-editor.ts';
import type { TuiEffect, TuiEffectContext } from './types.ts';

async function context(): Promise<TuiEffectContext> {
  const host = createMemoryTerminalHost();
  return { terminalSize: host.getTerminalSize(), capabilities: await host.getCapabilities(), diagnostics: [],
    clock: { monotonicNow: () => host.clock.monotonicNow(), sleep: () => Promise.resolve('elapsed' as const) }, signal: new AbortController().signal,
    withTerminalSuspended: <T>(operation: () => Promise<T>) => operation(), copySelectedText: async () => { throw new Error('unused'); } };
}

function driver(options: { readonly maxPendingIntents?: number; readonly maxPendingBytes?: number; readonly maxDocumentBytes?: number } = {}) {
  const editor = createTuiControlledEditor<TuiControlledEditorMessage>({ id: 'editor', toMessage: (message) => message, ...options });
  let state = editor.init(createTextAreaState({ value: '' }), 'first');
  let effect: TuiEffect<TuiControlledEditorMessage> | undefined;
  const outputs: TuiControlledEditorOutput[] = [];
  function accept(result: TuiControlledEditorResult<TuiControlledEditorMessage>) {
    state = result.state; outputs.push(...result.outputs ?? []); effect = result.effects?.[0] ?? effect;
    return result;
  }
  return { editor, get state() { return state; }, get effect() { return effect; }, outputs, accept,
    async step() {
      assert.ok(effect);
      const running = effect; effect = undefined;
      const result = await running.run(await context());
      assert.equal(result.kind, 'message');
      return accept(editor.update(state, result.message));
    },
  };
}

void test('reliable FIFO orders typing, navigation, undo and redo; only the accepted head prepares', async () => {
  const run = driver();
  run.accept(run.editor.requestIntent(run.state, { kind: 'edit', operation: { kind: 'insert', text: 'abc' } }));
  const head = run.effect;
  for (const transition of [
    { kind: 'edit', operation: { kind: 'moveLeft' } },
    { kind: 'edit', operation: { kind: 'insert', text: 'X' } }, { kind: 'undo' }, { kind: 'redo' },
  ] as const) {
    const result = run.accept(run.editor.requestIntent(run.state, transition));
    assert.equal(result.effects, undefined);
    assert.equal(run.effect, head);
  }
  assert.equal(run.editor.isDirty(run.state), true);
  assert.equal(textDocumentText(run.state.editing.document), '');
  while (run.state.queue.length !== 0) await run.step();
  assert.equal(textDocumentText(run.state.editing.document), 'abXc');
  assert.equal(run.state.editing.caret.position.offset, 3);
  assert.equal(run.state.semanticRevision, 5);
});

void test('count and payload overflow reject before acceptance; stale absolute coordinates are explicit', () => {
  const run = driver({ maxPendingIntents: 1, maxPendingBytes: 1024 });
  run.accept(run.editor.requestIntent(run.state, { kind: 'edit', operation: { kind: 'insert', text: 'x' } }));
  const state = run.state;
  assert.equal(run.editor.requestIntent(state, { kind: 'undo' }).outputs?.[0]?.kind, 'rejected');
  assert.equal(run.editor.requestIntent(state, { kind: 'undo' }).state, state);
  const absolute = run.editor.requestIntent(state, { kind: 'pointer', transition: { kind: 'placeCaret', offset: 0 } }, state);
  assert.deepEqual(absolute.outputs, [{ kind: 'rejected', reason: 'stale-coordinates' }]);
  const empty = run.editor.init(createTextAreaState({ value: '' }));
  assert.deepEqual(run.editor.requestIntent(empty, { kind: 'unavailable', reason: 'layout-pending' }).outputs, [{ kind: 'rejected', reason: 'layout-pending' }]);
  assert.deepEqual(run.editor.requestIntent(empty, { kind: 'edit', operation: { kind: 'insert', text: 'a'.repeat(1000) } }).outputs,
    [{ kind: 'rejected', reason: 'payload-byte-limit' }]);
});

void test('failed accepted head remains dirty and queued; retry and explicit discard are observable', async () => {
  const run = driver();
  run.accept(run.editor.requestIntent(run.state, { kind: 'edit', operation: { kind: 'insert', text: 'kept' } }));
  assert.ok(run.state.active);
  const oldFailure: TuiControlledEditorMessage = { kind: 'failed', operation: run.state.active, diagnostic: diagnostic('TUI_EFFECT_FAILED', 'transient') };
  const failed = run.accept(run.editor.update(run.state, oldFailure));
  assert.equal(failed.state.queue.length, 1);
  assert.equal(failed.state.active, null);
  assert.equal(run.editor.isDirty(failed.state), true);
  run.accept(run.editor.retry(run.state));
  assert.equal(run.editor.update(run.state, oldFailure).state, run.state);
  await run.step();
  assert.equal(textDocumentText(run.state.editing.document), 'kept');
  run.accept(run.editor.requestIntent(run.state, { kind: 'edit', operation: { kind: 'insert', text: 'discarded' } }));
  const obsolete = run.effect;
  const discarded = run.accept(run.editor.discardPending(run.state));
  assert.equal(discarded.outputs?.[0]?.kind, 'discarded');
  assert.ok(obsolete);
  const late = await obsolete.run(await context()); assert.equal(late.kind, 'message');
  assert.equal(run.editor.update(run.state, late.message).state, run.state);
});

void test('document byte rejection retains the accepted head and blocks its save barrier', async () => {
  const run = driver({ maxDocumentBytes: 4 });
  run.accept(run.editor.requestIntent(run.state, { kind: 'edit', operation: { kind: 'insert', text: '界界' } }));
  run.accept(run.editor.requestSettlement(run.state, 'save'));
  await run.step();
  assert.equal(run.state.queue.length, 2);
  assert.equal(run.state.active, null);
  assert.equal(run.state.error?.code, 'TUI_EFFECT_REJECTED');
  assert.equal(run.outputs.some((output) => output.kind === 'settled'), false);
  assert.equal(textDocumentText(run.state.editing.document), '');
});

void test('save barrier snapshots preceding intents, late saves mark only that snapshot, and replacement fences old work', async () => {
  const run = driver();
  run.accept(run.editor.requestIntent(run.state, { kind: 'edit', operation: { kind: 'insert', text: 'before' } }));
  run.accept(run.editor.requestSettlement(run.state, 'save'));
  run.accept(run.editor.requestIntent(run.state, { kind: 'edit', operation: { kind: 'insert', text: 'after' } }));
  await run.step();
  const settled = run.outputs.find((output) => output.kind === 'settled'); assert.ok(settled);
  assert.equal(textDocumentText(settled.snapshot.document), 'before');
  await run.step();
  const saved = run.editor.markSaved(run.state, settled.snapshot);
  assert.equal(run.editor.isDirty(saved), true);
  const replacement = createTextAreaState({ value: 'new source' });
  run.accept(run.editor.requestIntent(run.state, { kind: 'undo' }));
  const refused = run.editor.replaceSource(run.state, replacement, { pending: 'reject' });
  assert.equal(refused.accepted, false); assert.equal(refused.state, run.state);
  const oldEffect = run.effect;
  run.accept(run.editor.replaceSource(run.state, replacement, { pending: 'discard' }));
  assert.equal(run.editor.markSaved(run.state, settled.snapshot), run.state);
  assert.ok(oldEffect);
  const late = await oldEffect.run(await context()); assert.equal(late.kind, 'message');
  assert.equal(run.editor.update(run.state, late.message).state, run.state);
});

void test('operation, source, semantic and child lifetime fences reject mismatched completions', async () => {
  const run = driver();
  run.accept(run.editor.requestIntent(run.state, { kind: 'edit', operation: { kind: 'insert', text: 'x' } }));
  assert.ok(run.effect);
  const output = await run.effect.run(await context()); assert.equal(output.kind, 'message');
  assert.equal(output.message.kind, 'reduced');
  for (const change of [{ operationId: 999 }, { sourceEpoch: 999 }, { semanticRevision: 999 }, { generation: 'remounted' }]) {
    assert.equal(run.editor.update(run.state, { ...output.message, operation: { ...output.message.operation, ...change } }).state, run.state);
  }
  const remounted: TuiControlledEditorState = run.editor.init(createTextAreaState({ value: '' }), 'remounted');
  assert.equal(run.editor.update(remounted, output.message).state, remounted);
});

void test('runtime capacity-one successor transfer drains a hidden editor FIFO and save barrier', async () => {
  const { createTuiRuntime } = await import('./runtime.ts');
  const { defineTui } = await import('./definition.ts');
  const { text } = await import('../components/text-content/definition.ts');
  const memory = createMemoryTerminalHost();
  const started = Promise.withResolvers<undefined>();
  const released = Promise.withResolvers<undefined>();
  let firstYield = true;
  const host = { ...memory, clock: {
    monotonicNow: () => memory.clock.monotonicNow(),
    async sleep(ms: number, signal?: AbortSignal) {
      if (ms !== 0) return memory.clock.sleep(ms, signal);
      if (firstYield) { firstYield = false; started.resolve(undefined); await released.promise; }
      return signal?.aborted === true ? 'aborted' as const : 'elapsed' as const;
    },
  } };
  type Message = { kind: 'edit'; text: string } | { kind: 'left' } | { kind: 'hide' } | { kind: 'save' }
    | { kind: 'controller'; message: TuiControlledEditorMessage };
  interface State { readonly editor: TuiControlledEditorState; readonly visible: boolean; readonly saved: string | null; }
  const editor = createTuiControlledEditor<Message>({ id: 'editor', toMessage: (message) => ({ kind: 'controller', message }) });
  const runtime = createTuiRuntime({ host, effectPolicy: { maxOwned: 1, maxActive: 1, maxActivePerId: 1,
    maxQueued: 1, maxQueuedPerId: 1, replacementGracePeriodMs: 100 }, app: defineTui<State, Message>({
      init: () => ({ state: { editor: editor.init(createTextAreaState({ value: '' })), visible: true, saved: null } }),
      update(state, message) {
        if (message.kind === 'hide') return { state: { ...state, visible: false } };
        const result = message.kind === 'edit' ? editor.requestIntent(state.editor, { kind: 'edit', operation: { kind: 'insert', text: message.text } })
          : message.kind === 'left' ? editor.requestIntent(state.editor, { kind: 'edit', operation: { kind: 'moveLeft' } })
          : message.kind === 'save' ? editor.requestSettlement(state.editor, 'save')
          : editor.update(state.editor, message.message);
        const settled = result.outputs?.find((output) => output.kind === 'settled');
        return { ...result, state: { ...state, editor: result.state, saved: settled === undefined ? state.saved : textDocumentText(settled.snapshot.document) } };
      },
      view: (state) => text({ content: state.visible ? 'Editor' : 'Hidden' }),
    }) });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'edit', text: 'a'.repeat(5000) });
    await started.promise;
    await runtime.dispatch({ kind: 'left' });
    await runtime.dispatch({ kind: 'edit', text: 'X' });
    await runtime.dispatch({ kind: 'save' });
    await runtime.dispatch({ kind: 'hide' });
    assert.equal(editor.isDirty(runtime.state().editor), true);
    assert.equal(runtime.state().editor.queue.length, 4);
    released.resolve(undefined);
    while (runtime.state().saved === null) await runtime.nextChange();
    assert.equal(runtime.state().editor.queue.length, 0);
    assert.equal(runtime.state().saved, `${'a'.repeat(4999)}Xa`);
    assert.equal(runtime.state().visible, false);
    assert.equal(runtime.diagnostics().filter((entry) => entry.diagnostic.code === 'TUI_EFFECT_REJECTED').length, 0);
  } finally { released.resolve(undefined); await runtime.dispose(); }
});

void test('accepted nested layout requests are latest-wins and cannot overwrite newer caret or source state', async () => {
  const { createTuiRuntime } = await import('./runtime.ts');
  const { defineTui } = await import('./definition.ts');
  const { textArea } = await import('../components/text-area/definition.ts');
  const { column } = await import('../layout/index.ts');
  const memory = createMemoryTerminalHost({ terminalSize: { columns: 80, rows: 10 } });
  const gate = Promise.withResolvers<undefined>();
  let blocked = false;
  const waiting = Promise.withResolvers<undefined>();
  const host = { ...memory, clock: {
    monotonicNow: () => memory.clock.monotonicNow(),
    async sleep(ms: number, signal?: AbortSignal) {
      if (ms !== 0) return memory.clock.sleep(ms, signal);
      if (!blocked) { blocked = true; waiting.resolve(undefined); await gate.promise; }
      return signal?.aborted === true ? 'aborted' as const : 'elapsed' as const;
    },
  } };
  type Message = { readonly kind: 'layoutRequest'; readonly request: import('../components/text-area/contracts.ts').TextAreaLayoutRequest }
    | { readonly kind: 'controller'; readonly message: TuiControlledEditorMessage }
    | { readonly kind: 'transition'; readonly transition: import('../behavior/text-area.ts').TextAreaTransition }
    | { readonly kind: 'end' };
  const editor = createTuiControlledEditor<Message>({ id: 'editor', toMessage: (message) => ({ kind: 'controller', message }) });
  const rejected: TuiControlledEditorOutput[] = [];
  const requests: import('../components/text-area/contracts.ts').TextAreaLayoutRequest[] = [];
  const runtime = createTuiRuntime({ host, app: defineTui<TuiControlledEditorState, Message>({
    init: () => ({ state: editor.init(createTextAreaState({ value: 'abc '.repeat(5000) })) }),
    update(state, message) {
      if (message.kind === 'layoutRequest') { requests.push(message.request); return editor.requestLayout(state, message.request); }
      if (message.kind === 'transition') {
        const result = editor.requestIntent(state, message.transition, state);
        rejected.push(...result.outputs ?? []); return result;
      }
      if (message.kind === 'end') return editor.requestIntent(state, { kind: 'edit', operation: { kind: 'moveDocumentEnd' } });
      return editor.update(state, message.message);
    },
    view: (state) => column([column([textArea<Message>({ id: 'editing', meta: { accessibleName: 'Editor' }, state: state.editing, preparedLayout: state.preparedLayout,
      onLayoutRequest: (request): Message => ({ kind: 'layoutRequest', request }), onTransition: (transition: import('../behavior/text-area.ts').TextAreaTransition): Message => ({ kind: 'transition', transition }),
      wrap: true, scrollbar: { visible: 'auto' },
    })])]),
  }) });
  try {
    await runtime.start(); await waiting.promise;
    assert.equal(requests[0]?.width, 80);
    const { keyInput, pointerInput } = await import('../testing/input-events.ts');
    const pointerCaret = runtime.state().editing.caret;
    const beforePointer = rejected.length;
    await runtime.handleInput(pointerInput({ action: 'press', button: 'left', row: 1, column: 3 }));
    await runtime.handleInput(pointerInput({ action: 'release', button: 'none', row: 1, column: 3 }));
    assert.ok(rejected.slice(beforePointer).some(output => output.kind === 'rejected' && output.reason === 'layout-pending'), 'pending pointer input must be refused explicitly');
    assert.equal(runtime.state().editing.caret, pointerCaret, 'pending hit target never guesses source coordinates');
    await runtime.handleInput(keyInput('arrowUp'));
    assert.ok(rejected.some((output) => output.kind === 'rejected' && output.reason === 'layout-pending'));
    await runtime.dispatch({ kind: 'end' });
    await runtime.resize({ columns: 43, rows: 7 });
    gate.resolve(undefined);
    while (runtime.state().preparedLayout?.width !== 43 || runtime.state().active !== null) await runtime.nextChange();
    assert.equal(runtime.state().editing.caret.position.offset, 20_000);
    assert.equal(runtime.state().preparedLayout?.document, runtime.state().editing.document);
    assert.ok(requests.some((request) => request.width === 43 && request.height <= 7));
  } finally { gate.resolve(undefined); await runtime.dispose(); }
});

void test('fresh editor requests cannot accept another initialization with identical numeric counters', async () => {
  const editor = createTuiControlledEditor<TuiControlledEditorMessage>({ id: 'editor', toMessage: message => message });
  const editing = createTextAreaState({ value: 'base' });
  const old = editor.requestIntent(editor.init(editing), { kind: 'edit', operation: { kind: 'insert', text: 'old' } });
  const current = editor.requestIntent(editor.init(editing), { kind: 'edit', operation: { kind: 'insert', text: 'new' } });
  const oldEffect = old.effects?.[0];
  assert.ok(oldEffect);
  const completed = await oldEffect.run(await context());
  assert.equal(completed.kind, 'message');
  assert.equal(editor.update(current.state, completed.message).state, current.state);
  assert.equal(textDocumentText(current.state.editing.document), 'base');
  const effect = current.effects?.[0];
  assert.ok(effect);
  const accepted = await effect.run(await context());
  assert.equal(accepted.kind, 'message');
  assert.equal(textDocumentText(editor.update(current.state, accepted.message).state.editing.document), 'newbase');
});
