import assert from 'node:assert/strict';
import test from 'node:test';
import {
  column, combineTuiResults, createTuiChild, createSearchPickerKeymap,
  liftTuiResult, text, updateTuiNavigation,
} from '../../dist/index.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTreeSource, createSearchPickerIndex } from '../../dist/behavior/index.js';
import { textDocumentText } from '../../dist/text/index.js';
import { explorerDefinition } from '../../examples/tui/features/explorer.ts';
import { pickerDefinition } from '../../examples/tui/features/picker.ts';
import { editorPanelDefinition } from '../../examples/tui/features/editor-panel.ts';
import { openProfile, updateProfile, profileView, profileSubscriptions } from '../../examples/tui/features/profile-navigation.ts';
import { flushAsync } from '../support/async.ts';

async function settle(predicate, description = 'feature work to settle') {
  for (let attempt = 0; attempt < 200; attempt++) {
    if (predicate()) return;
    await flushAsync();
  }
  assert.fail(`Timed out waiting for ${description}`);
}

// Tests own scheduling through the public host clock, never by running or
// reconstructing a child's opaque contribution. Advancing the injected clock
// ensures even a small immutable delta encounters a cooperative time slice.
function pauseNextPreparation(host) {
  const entered = Promise.withResolvers();
  const released = Promise.withResolvers();
  const sleep = host.clock.sleep.bind(host.clock);
  const now = host.clock.monotonicNow.bind(host.clock);
  let armed = true;
  let signal;
  host.clock.monotonicNow = () => { if (armed) host.clock.advance(5); return now(); };
  host.clock.sleep = async (ms, currentSignal) => {
    if (ms !== 0 || !armed) return sleep(ms, currentSignal);
    armed = false;
    signal = currentSignal;
    entered.resolve();
    await released.promise;
    return signal?.aborted === true ? 'aborted' : 'elapsed';
  };
  return {
    entered: entered.promise,
    signal: () => signal,
    release() { armed = false; released.resolve(); host.clock.sleep = sleep; host.clock.monotonicNow = now; },
  };
}

function featureRuntime(definition, ids = ['picker'], host = createMemoryTerminalHost()) {
  const messages = [];
  const feature = createTuiChild(definition, child => ({ kind: 'child', child }));
  const runtime = createTuiRuntime({ host, app: defineTui({
    init(context) {
      const initialized = ids.map(id => feature.init({ id, generation: 1 }, context));
      return combineTuiResults({ children: Object.fromEntries(initialized.map(result => [result.state.id, result.state])), outputs: [] }, ...initialized);
    },
    update(state, message, context) {
      if (message.kind === 'remount') {
        const previous = state.children[message.id];
        const mounted = feature.init({ id: message.id, generation: previous.generation + 1 }, context);
        return combineTuiResults({ ...state, children: { ...state.children, [message.id]: mounted.state } }, feature.remove(previous), mounted);
      }
      messages.push(message.child);
      const current = state.children[message.child.id];
      if (current === undefined) return { state };
      const updated = feature.update(current, message.child, context);
      const lifted = liftTuiResult(state, 'children', liftTuiResult(state.children, current.id, updated));
      return updated.outputs === undefined ? lifted : {
        ...lifted, state: { ...lifted.state, outputs: [...state.outputs, ...updated.outputs] },
      };
    },
    view: (state, context) => column(Object.values(state.children).map(child => feature.view(child, context))),
    subscriptions: (state, context) => Object.values(state.children).flatMap(child => feature.subscriptions(child, context)),
  }) });
  return {
    runtime, host, messages,
    child: (id = ids[0]) => runtime.state().children[id],
    send: (message, id = ids[0]) => runtime.dispatch({ kind: 'child', child: { id, generation: runtime.state().children[id].generation, message } }),
  };
}

function pickerRuntime(source, host) {
  return featureRuntime(pickerDefinition(source, createSearchPickerKeymap()), ['picker'], host);
}
const readyPicker = harness => settle(() => harness.child().state.result !== null && !harness.child().state.pending && !harness.child().state.construction.pending, 'an accepted picker query');
const ids = result => result.window(0, result.count).map(entry => entry.id);
const values = result => result.window(0, result.count).map(entry => [entry.id, entry.value]);
const edit = text => ({ kind: 'transition', transition: { kind: 'edit', operation: { kind: 'insert', text } } });
const updateSource = changes => ({ kind: 'updateSource', changes: function* () { yield changes; } });

function records(count = 3000) {
  return Object.freeze(Array.from({ length: count }, (_, i) => Object.freeze({ id: String(i), label: `record ${String(i)}`, value: String(i) })));
}
function batches(source, started = () => undefined) {
  return function* () {
    started();
    for (let position = 0; position < source.length; position += 256) yield source.slice(position, position + 256);
  };
}

test('two explorer copies execute scoped preparation and reject an earlier mount through their runtime', async () => {
  const harness = featureRuntime(explorerDefinition(createTreeSource([{ id: 'file', label: 'File', kind: 'leaf' }])), ['left', 'right']);
  const { runtime } = harness;
  try {
    await runtime.start();
    await settle(() => ['left', 'right'].every(id => !harness.child(id).state.projection.pending));
    const completions = harness.messages.filter(message => message.message.kind === 'projection');
    assert.deepEqual(completions.map(message => message.id).sort(), ['left', 'right']);
    assert.ok(harness.child('left').state.projection.result);
    assert.ok(harness.child('right').state.projection.result);
    const right = harness.child('right');
    await runtime.dispatch({ kind: 'remount', id: 'left' });
    await settle(() => !harness.child('left').state.projection.pending);
    assert.equal(harness.child('left').generation, 2);
    assert.equal(harness.child('right'), right, 'remounting a sibling retains accepted state');
    const current = runtime.state();
    await runtime.dispatch({ kind: 'child', child: completions.find(message => message.id === 'left') });
    assert.equal(runtime.state(), current, 'old generation completion is an identity-preserving no-op');
    const explorer = harness.child('left');
    await harness.send({ kind: 'activate', id: 'file' }, 'left');
    assert.equal(harness.child('left'), explorer, 'a domain output does not force child state replacement');
    assert.equal(harness.child('right'), right);
    assert.deepEqual(runtime.state().outputs, ['file']);
    assert.deepEqual(runtime.diagnostics(), []);
  } finally { await runtime.dispose(); }
});

test('picker accepts only enabled domain values and ignores an obsolete query after reopening', async () => {
  const harness = pickerRuntime(createSearchPickerIndex([
    { id: 'disabled', label: 'Unavailable', value: 'bad', disabled: true },
    { id: 'yes', label: 'Allowed', value: 'accepted' },
  ]));
  const { runtime } = harness;
  try {
    await runtime.start();
    await harness.send({ kind: 'open' });
    await readyPicker(harness);
    assert.equal(harness.child().state.control.editor.activeId, 'yes');
    const ready = runtime.state();
    const completion = harness.messages.find(message => message.message.kind === 'prepared');
    await harness.send({ kind: 'accept', id: 'disabled' });
    assert.equal(runtime.state(), ready);
    assert.deepEqual(runtime.state().outputs, []);
    await harness.send({ kind: 'accept', id: 'yes' });
    assert.deepEqual(runtime.state().outputs, ['accepted']);
    assert.equal(harness.child().state.open, false);
    await settle(() => runtime.metrics().effects.active === 0);
    await harness.send({ kind: 'open' });
    await readyPicker(harness);
    const reopened = runtime.state();
    await runtime.dispatch({ kind: 'child', child: completion });
    assert.equal(runtime.state(), reopened);
    assert.deepEqual(runtime.state().outputs, ['accepted']);
  } finally { await runtime.dispose(); }
});

test('editor panels preserve independent histories and reject removed-lifetime edits in the runtime', async () => {
  const harness = featureRuntime(editorPanelDefinition, ['one', 'two']);
  const { runtime } = harness;
  const editorReady = () => settle(() => runtime.metrics().effects.active === 0
    && ['one', 'two'].every(id => harness.child(id).state.editor.queue.length === 0), 'controlled editor reductions and layouts');
  const content = id => textDocumentText(harness.child(id).state.editor.editing.document);
  try {
    await runtime.start(); await editorReady();
    const initial = harness.child('one').state.editor.editing;
    await harness.send({ kind: 'transition', transition: { kind: 'undo' } }, 'one'); await editorReady();
    assert.equal(harness.child('one').state.editor.editing, initial, 'undo without history retains editing state');
    const message = { kind: 'child', child: { id: 'one', generation: 1, message: edit('hello') } };
    await runtime.dispatch(message);
    await harness.send(edit('other'), 'two'); await editorReady();
    assert.equal(content('one'), 'hello');
    assert.equal(content('two'), 'other');
    const other = harness.child('two');
    await runtime.dispatch({ ...message, child: { ...message.child, id: 'missing' } });
    assert.equal(harness.child('two'), other);
    await harness.send({ kind: 'transition', transition: { kind: 'undo' } }, 'one'); await editorReady();
    assert.equal(content('one'), '');
    assert.equal(harness.child('two'), other);
    await harness.send({ kind: 'transition', transition: { kind: 'redo' } }, 'one'); await editorReady();
    assert.equal(content('one'), 'hello');
    await runtime.dispatch({ kind: 'remount', id: 'one' }); await editorReady();
    const remounted = runtime.state();
    await runtime.dispatch(message);
    assert.equal(runtime.state(), remounted);
    assert.equal(content('one'), '');
    await harness.send({ kind: 'transition', transition: { kind: 'undo' } }, 'two'); await editorReady();
    assert.equal(content('two'), '');
    assert.deepEqual(runtime.diagnostics(), []);
  } finally { await runtime.dispose(); }
});

test('picker typing during runtime construction uses the latest text and reuses its accepted index', async () => {
  let constructions = 0;
  const harness = pickerRuntime(batches(records(), () => { constructions++; }));
  const { runtime, host } = harness;
  const paused = pauseNextPreparation(host);
  try {
    await runtime.start();
    await harness.send({ kind: 'open' });
    await paused.entered;
    assert.equal(harness.child().state.construction.pending, true);
    const revision = harness.child().state.construction.revision;
    for (const character of 'record 2999') await harness.send(edit(character));
    assert.equal(harness.child().state.control.editor.input.text, 'record 2999');
    assert.equal(harness.child().state.construction.revision, revision);
    assert.equal(constructions, 1, 'typing must not restart construction');
    paused.release();
    await readyPicker(harness);
    const index = harness.child().state.construction.result;
    assert.equal(index.size, 3000);
    assert.equal(harness.child().state.result.count, 1);
    assert.equal(harness.child().state.result.entryAt(0).id, '2999');
    assert.equal(harness.child().state.source, index);
    await harness.send({ kind: 'close' });
    await harness.send({ kind: 'open' });
    await readyPicker(harness);
    assert.equal(harness.child().state.construction.result, index);
    assert.equal(harness.child().state.construction.pending, false);
    assert.equal(constructions, 1, 'reopening queries the accepted index without reconstructing it');
  } finally { paused.release(); await runtime.dispose(); }
});

for (const interruption of ['close', 'replace', 'remount']) {
  test(`${interruption} retires blocked picker construction and rejects its late completion`, async () => {
    const harness = pickerRuntime(batches(records()));
    const { runtime, host } = harness;
    const paused = pauseNextPreparation(host);
    try {
      await runtime.start();
      await harness.send({ kind: 'open' });
      await paused.entered;
      const old = harness.child();
      const stale = { kind: 'child', child: { id: old.id, generation: old.generation, message: {
        kind: 'constructed', message: { kind: 'ready', revision: old.state.construction.revision,
          result: createSearchPickerIndex([{ id: 'obsolete', label: 'Obsolete', value: 'obsolete' }]) },
      } } };
      if (interruption === 'remount') await runtime.dispatch({ kind: 'remount', id: 'picker' });
      else await harness.send(interruption === 'close' ? { kind: 'close' } : {
        kind: 'replace', source: createSearchPickerIndex([{ id: 'new', label: 'New', value: 'new' }]),
      });
      assert.equal(paused.signal().aborted, true, 'accepted lifecycle change cancels work in the runtime');
      if (interruption === 'replace') await readyPicker(harness);
      else {
        assert.equal(harness.child().state.open, false);
        assert.equal(harness.child().state.construction.pending, false);
      }
      const current = runtime.state();
      await runtime.dispatch(stale);
      assert.equal(runtime.state(), current);
      paused.release();
      await settle(() => runtime.metrics().effects.active === 0);
      assert.equal(runtime.state(), current, 'the blocked producer cannot commit after retirement');
      assert.equal(harness.messages.some(message => message.message.kind === 'constructed' && message !== stale.child), false);
      if (interruption === 'replace') assert.equal(harness.child().state.result.entryAt(0).id, 'new');
    } finally { paused.release(); await runtime.dispose(); }
  });
}

test('immutable picker deltas build an accepted version and cannot activate obsolete entries', async () => {
  const source = createSearchPickerIndex([{ id: 'one', label: 'one', value: 1 }, { id: 'two', label: 'two', value: 2 }]);
  const harness = pickerRuntime(source);
  const { runtime, host } = harness;
  let paused;
  try {
    await runtime.start(); await harness.send({ kind: 'open' }); await readyPicker(harness);
    const completion = harness.messages.find(message => message.message.kind === 'prepared');
    paused = pauseNextPreparation(host);
    await harness.send(updateSource([{ kind: 'remove', id: 'one' }, { kind: 'append', entry: { id: 'three', label: 'three', value: 3 } }]));
    await paused.entered;
    assert.equal(harness.child().state.construction.pending, true);
    assert.equal(harness.child().state.result, null);
    await harness.send({ kind: 'accept', id: 'one' });
    assert.deepEqual(runtime.state().outputs, []);
    paused.release(); await readyPicker(harness);
    const version = harness.child().state.construction.result;
    assert.notEqual(version, source);
    assert.deepEqual(ids(harness.child().state.result), ['two', 'three']);
    assert.equal(harness.child().state.source, version, 'accepted version releases its update descriptor');
    const accepted = runtime.state();
    await runtime.dispatch({ kind: 'child', child: completion });
    assert.equal(runtime.state(), accepted);
    await harness.send({ kind: 'close' }); await harness.send({ kind: 'open' }); await readyPicker(harness);
    assert.equal(harness.child().state.construction.result, version);
    assert.equal(harness.child().state.construction.pending, false);
  } finally { paused?.release(); await runtime.dispose(); }
});

for (const interruption of ['reopen', 'replace']) {
  test(`typing and ${interruption} fence a pending immutable picker delta`, async () => {
    const harness = pickerRuntime(createSearchPickerIndex([{ id: 'old', label: 'old', value: 'old' }]));
    const { runtime, host } = harness;
    let paused;
    try {
      await runtime.start(); await harness.send({ kind: 'open' }); await readyPicker(harness);
      paused = pauseNextPreparation(host);
      await harness.send(updateSource([{ kind: 'replace', entry: { id: 'old', label: 'new content', value: 'updated' } }]));
      await paused.entered;
      const revision = harness.child().state.construction.revision;
      await harness.send(edit('content'));
      assert.equal(harness.child().state.construction.revision, revision, 'typing does not restart version construction');
      assert.equal(harness.child().state.control.editor.input.text, 'content');
      if (interruption === 'reopen') {
        await harness.send({ kind: 'close' });
        assert.equal(harness.child().state.construction.pending, false);
        await harness.send({ kind: 'open' });
        assert.equal(harness.child().state.construction.pending, true);
      } else await harness.send({ kind: 'replace', source: createSearchPickerIndex([{ id: 'other', label: 'content', value: 'replacement' }]) });
      assert.equal(paused.signal().aborted, true);
      paused.release(); await readyPicker(harness);
      assert.equal(harness.child().state.result.entryAt(0).value, interruption === 'reopen' ? 'updated' : 'replacement');
      const accepted = runtime.state();
      await runtime.dispatch({ kind: 'child', child: { id: 'picker', generation: 1, message: {
        kind: 'constructed', message: { kind: 'ready', revision, result: createSearchPickerIndex([{ id: 'stale', label: 'content', value: 'stale' }]) },
      } } });
      assert.equal(runtime.state(), accepted);
      await settle(() => runtime.metrics().effects.active === 0);
      assert.equal(runtime.state(), accepted);
    } finally { paused?.release(); await runtime.dispose(); }
  });
}

for (const interruption of ['reopen', 'replace']) {
  test(`successive picker deltas retain reliable order across blocked work and ${interruption}`, async () => {
    const harness = pickerRuntime(createSearchPickerIndex([{ id: 'a', label: 'A', value: 'a' }]));
    const { runtime, host } = harness;
    let paused;
    try {
      await runtime.start(); await harness.send({ kind: 'open' }); await readyPicker(harness);
      paused = pauseNextPreparation(host);
      await harness.send(updateSource([{ kind: 'append', entry: { id: 'b', label: 'B', value: 'b' } }]));
      await paused.entered;
      await runtime.dispatchMany([
        [{ kind: 'append', entry: { id: 'c', label: 'C', value: 'c' } }],
        [{ kind: 'replace', entry: { id: 'b', label: 'B changed', value: 'b1' } }],
        [{ kind: 'remove', id: 'b' }],
        [{ kind: 'append', entry: { id: 'b', label: 'B appended again', value: 'b2' } }],
        [{ kind: 'remove', id: 'a' }],
      ].map(changes => ({ kind: 'child', child: { id: 'picker', generation: 1, message: updateSource(changes) } })));
      if (interruption === 'reopen') {
        await harness.send({ kind: 'close' }); await harness.send({ kind: 'open' });
      } else await harness.send({ kind: 'replace', source: createSearchPickerIndex([{ id: 'fresh', label: 'Fresh', value: 'fresh' }]) });
      assert.equal(paused.signal().aborted, true);
      paused.release(); await readyPicker(harness);
      assert.deepEqual(values(harness.child().state.result), interruption === 'reopen' ? [['c', 'c'], ['b', 'b2']] : [['fresh', 'fresh']]);
      assert.equal(harness.child().state.source, harness.child().state.construction.result, 'accepted ownership releases the producer chain');
      const accepted = runtime.state();
      await settle(() => runtime.metrics().effects.active === 0);
      assert.equal(runtime.state(), accepted);
    } finally { paused?.release(); await runtime.dispose(); }
  });
}

test('picker deltas received while closed and during initial construction survive cancellation', async () => {
  const harness = pickerRuntime(batches([{ id: 'a', label: 'A', value: 'a' }]));
  const { runtime, host } = harness;
  const paused = pauseNextPreparation(host);
  try {
    await runtime.start();
    await harness.send(updateSource([{ kind: 'append', entry: { id: 'b', label: 'B', value: 'b' } }]));
    assert.equal(harness.child().state.construction.pending, false);
    assert.equal(runtime.metrics().effects.active, 0);
    await harness.send({ kind: 'open' }); await paused.entered;
    await harness.send(updateSource([{ kind: 'replace', entry: { id: 'b', label: 'Changed B', value: 'b2' } }]));
    assert.equal(paused.signal().aborted, true);
    paused.release(); await readyPicker(harness);
    assert.deepEqual(values(harness.child().state.result), [['a', 'a'], ['b', 'b2']]);
  } finally { paused.release(); await runtime.dispose(); }
});

test('profile navigation retains hidden state, validates, returns outputs, restores focus and fences removed screens', async () => {
  const host = createMemoryTerminalHost();
  const completions = [];
  const runtime = createTuiRuntime({ host, app: defineTui({
    init: () => ({ state: { stack: { entries: [] }, outputs: [] } }),
    update(state, message, context) {
      const updated = message.kind === 'open' ? openProfile(state.stack, message.generation, context)
        : message.kind === 'pop' ? updateTuiNavigation(state.stack, { kind: 'pop' })
          : updateProfile(state.stack, message, context);
      if (message.kind === 'profile' && message.child.message.kind === 'form') completions.push(message);
      const lifted = liftTuiResult(state, 'stack', updated);
      return updated.outputs === undefined ? lifted : { ...lifted, state: { ...lifted.state, outputs: [...state.outputs, ...updated.outputs] } };
    },
    view: (state, context) => profileView(state.stack, context) ?? text({ content: 'Profiles' }),
    subscriptions: (state, context) => profileSubscriptions(state.stack, context),
  }) });
  const active = () => runtime.state().stack.entries.at(-1).state.child;
  const send = message => runtime.dispatch({ kind: 'profile', child: { id: 'profile', generation: active().generation, message } });
  const type = value => runtime.handleInput({ kind: 'text', text: value, paste: false });
  try {
    await runtime.start();
    await runtime.dispatch({ kind: 'open', generation: 1 });
    await type('First');
    assert.equal(active().state.values.name, 'First', 'scoped navigation focus routes actual input');
    const first = active();
    await runtime.dispatch({ kind: 'open', generation: 2 });
    assert.equal(runtime.state().stack.entries[0].state.child, first);
    await send({ kind: 'submit' });
    assert.equal(active().state.errors.name, 'Enter a name');
    assert.equal(runtime.metrics().effects.active, 0, 'synchronous invalid form does not start work');
    await type('reserved');
    await send({ kind: 'submit' });
    await settle(() => runtime.metrics().effects.active > 0);
    host.clock.advance(10);
    await settle(() => !active().state.validation.pending);
    assert.equal(active().state.errors.name, 'Choose another name');
    assert.deepEqual(runtime.state().outputs, []);
    await runtime.dispatch({ kind: 'pop' });
    assert.equal(active(), first);
    await type(' profile');
    assert.equal(active().state.values.name, 'First profile', 'pop restores the retained scoped editor focus');
    await send({ kind: 'submit' });
    await settle(() => runtime.metrics().effects.active > 0);
    host.clock.advance(10);
    await settle(() => runtime.state().stack.entries.length === 0);
    assert.deepEqual(runtime.state().outputs, ['First profile']);
    const saved = completions.find(message => message.child.generation === 1 && message.child.message.message.kind === 'submission');
    assert.ok(saved);
    await runtime.dispatch({ kind: 'open', generation: 3 });
    const reopened = runtime.state();
    await runtime.dispatch(saved);
    assert.equal(runtime.state(), reopened, 'old output cannot dismiss a new profile lifetime');
    assert.equal(active().state.values.name, '');
    assert.deepEqual(runtime.state().outputs, ['First profile']);
    await type('Pending'); await send({ kind: 'submit' });
    await settle(() => runtime.metrics().effects.active > 0);
    await runtime.dispatch({ kind: 'pop' });
    const removed = runtime.state();
    host.clock.advance(10);
    await settle(() => runtime.metrics().effects.active === 0);
    assert.equal(runtime.state(), removed, 'removed validation cannot reopen or submit a screen');
    assert.deepEqual(runtime.diagnostics(), []);
  } finally { await runtime.dispose(); }
});
