import assert from 'node:assert/strict';
import test from 'node:test';
import { createTuiChild, createSearchPickerKeymap, liftTuiResult } from '../../dist/index.js';
import { createMemoryTerminalHost } from '../../dist/host/index.js';
import { createTreeSource, createSearchPickerIndex } from '../../dist/behavior/index.js';
import { textDocumentText } from '../../dist/text/index.js';
import { explorerDefinition } from '../../examples/tui/features/explorer.ts';
import { pickerDefinition } from '../../examples/tui/features/picker.ts';
import { editorPanelDefinition } from '../../examples/tui/features/editor-panel.ts';

async function context() {
  const host = createMemoryTerminalHost();
  return { terminalSize: host.getTerminalSize(), capabilities: await host.getCapabilities(), diagnostics: [], clock: host.clock };
}
function envelope(child, message) { return { id: child.id, generation: child.generation, message }; }
function effectContext(ctx) { return { ...ctx, signal: new globalThis.AbortController().signal }; }

test('two explorer copies scope their prepared work and reject an earlier mount', async () => {
  const ctx = await context();
  const feature = createTuiChild(explorerDefinition(createTreeSource([{ id: 'file', label: 'File', kind: 'leaf' }])), message => message);
  const left = feature.init({ id: 'left', generation: 1 }, ctx);
  const right = feature.init({ id: 'right', generation: 1 }, ctx);
  assert.notEqual(left.effects[0].id, right.effects[0].id);
  const ready = await left.effects[0].run(effectContext(ctx));
  assert.equal(ready.kind, 'message');
  const current = feature.update(left.state, ready.message, ctx).state;
  assert.equal(current.state.projection.pending, false);
  const remounted = feature.init({ id: 'left', generation: 2 }, ctx).state;
  assert.equal(feature.update(remounted, ready.message, ctx).state, remounted);
  const activated = feature.update(current, envelope(current, { kind: 'activate', id: 'file' }), ctx);
  const parent = { explorer: current, unrelated: right.state };
  const lifted = liftTuiResult(parent, 'explorer', activated);
  assert.equal(lifted.state, parent);
  assert.deepEqual(lifted.outputs, ['file']);
  assert.equal(lifted.state.unrelated, right.state);
});

test('picker owns preparation and selection while returning only a domain value', async () => {
  const ctx = await context();
  const feature = createTuiChild(pickerDefinition(createSearchPickerIndex([
    { id: 'disabled', label: 'Unavailable', value: 'bad', disabled: true },
    { id: 'yes', label: 'Allowed', value: 'accepted' },
  ]), createSearchPickerKeymap()), message => message);
  const initial = feature.init({ id: 'picker', generation: 1 }, ctx).state;
  const requested = feature.update(initial, envelope(initial, { kind: 'open' }), ctx);
  const completed = await requested.effects[0].run(effectContext(ctx));
  const ready = feature.update(requested.state, completed.message, ctx).state;
  assert.equal(ready.state.control.editor.activeId, 'yes');
  assert.equal(feature.update(ready, envelope(ready, { kind: 'accept', id: 'disabled' }), ctx).state, ready);
  const accepted = feature.update(ready, envelope(ready, { kind: 'accept', id: 'yes' }), ctx);
  assert.deepEqual(accepted.outputs, ['accepted']);
  assert.equal(accepted.state.state.open, false);
  assert.equal(accepted.cancel.length, 1);
  const reopened = feature.update(accepted.state, envelope(accepted.state, { kind: 'open' }), ctx).state;
  assert.equal(feature.update(reopened, completed.message, ctx).state, reopened);
});

test('editor panels preserve independent histories and reject removed-lifetime edits', async () => {
  const ctx = await context();
  const feature = createTuiChild(editorPanelDefinition, message => message);
  const one = feature.init({ id: 'one', generation: 1 }, ctx).state;
  const two = feature.init({ id: 'two', generation: 1 }, ctx).state;
  assert.equal(feature.update(one, envelope(one, { kind: 'transition', transition: { kind: 'undo' } }), ctx).state, one);
  const message = envelope(one, { kind: 'transition', transition: { kind: 'edit', operation: { kind: 'insert', text: 'hello' } } });
  const edited = feature.update(one, message, ctx).state;
  assert.equal(textDocumentText(edited.state.editor.document), 'hello');
  assert.equal(feature.update(two, message, ctx).state, two);
  const remounted = feature.init({ id: 'one', generation: 2 }, ctx).state;
  assert.equal(feature.update(remounted, message, ctx).state, remounted);
  const undone = feature.update(edited, envelope(edited, { kind: 'transition', transition: { kind: 'undo' } }), ctx).state;
  assert.equal(textDocumentText(undone.state.editor.document), '');
});

test('picker construction permits typing, uses latest text, and reuses the accepted index', async () => {
  const ctx = await context();
  const source = Object.freeze(Array.from({ length: 3000 }, (_, i) => Object.freeze({ id: String(i), label: `record ${String(i)}`, value: String(i) })));
  const feature = createTuiChild(pickerDefinition(function* () { for (let i = 0; i < source.length; i += 256) yield source.slice(i, i + 256); }, createSearchPickerKeymap()), message => message);
  let entered;
  const firstYield = new Promise(resolve => { entered = resolve; });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let yields = 0;
  const blocked = { ...effectContext(ctx), clock: { ...ctx.clock, sleep: async () => { if (yields++ === 0) { entered(); await gate; } return 'completed'; } } };
  const initial = feature.init({ id: 'picker', generation: 1 }, ctx).state;
  const opening = feature.update(initial, envelope(initial, { kind: 'open' }), ctx);
  assert.equal(opening.state.state.construction.pending, true);
  const building = opening.effects[0].run(blocked);
  await firstYield;
  let typed = opening.state;
  for (const text of 'record 2999') {
    const updated = feature.update(typed, envelope(typed, { kind: 'transition', transition: { kind: 'edit', operation: { kind: 'insert', text } } }), ctx);
    assert.equal(updated.effects, undefined, 'Typing must not restart source construction');
    typed = updated.state;
  }
  assert.equal(typed.state.control.editor.input.text, 'record 2999');
  release();
  const built = await building;
  const querying = feature.update(typed, built.message, ctx);
  assert.equal(querying.state.state.construction.pending, false);
  const index = querying.state.state.construction.result;
  assert.equal(index.size, 3000);
  const completed = await querying.effects[0].run(effectContext(ctx));
  const ready = feature.update(querying.state, completed.message, ctx).state;
  assert.equal(ready.state.result.entries[0].id, '2999');
  const closed = feature.update(ready, envelope(ready, { kind: 'close' }), ctx).state;
  const reopened = feature.update(closed, envelope(closed, { kind: 'open' }), ctx);
  assert.equal(reopened.state.state.construction.result, index);
  assert.equal(reopened.state.state.construction.pending, false);
  assert.equal(reopened.effects.length, 1, 'Reopening only queries the accepted index');
});

test('close, source replacement and remount reject blocked construction completions', async () => {
  const ctx = await context();
  const source = Object.freeze(Array.from({ length: 3000 }, (_, i) => Object.freeze({ id: String(i), label: `old ${String(i)}`, value: String(i) })));
  const feature = createTuiChild(pickerDefinition(function* () { for (let i = 0; i < source.length; i += 256) yield source.slice(i, i + 256); }, createSearchPickerKeymap()), message => message);
  let entered;
  const firstYield = new Promise(resolve => { entered = resolve; });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let yields = 0;
  const blocked = { ...effectContext(ctx), clock: { ...ctx.clock, sleep: async () => { if (yields++ === 0) { entered(); await gate; } return 'completed'; } } };
  const initial = feature.init({ id: 'picker', generation: 1 }, ctx).state;
  const opening = feature.update(initial, envelope(initial, { kind: 'open' }), ctx);
  const building = opening.effects[0].run(blocked);
  await firstYield;
  const closed = feature.update(opening.state, envelope(opening.state, { kind: 'close' }), ctx);
  assert.equal(closed.state.state.open, false);
  assert.equal(closed.state.state.construction.pending, false);
  assert.equal(closed.cancel.length, 2);
  const replaced = feature.update(opening.state, envelope(opening.state, { kind: 'replace', source: function* () { yield [{ id: 'new', label: 'new', value: 'new' }]; } }), ctx);
  const freshBuild = await replaced.effects[0].run(effectContext(ctx));
  const freshQuery = feature.update(replaced.state, freshBuild.message, ctx);
  const freshResult = await freshQuery.effects[0].run(effectContext(ctx));
  const ready = feature.update(freshQuery.state, freshResult.message, ctx).state;
  assert.equal(ready.state.result.entries[0].id, 'new');
  release();
  const obsolete = await building;
  assert.equal(feature.update(closed.state, obsolete.message, ctx).state, closed.state);
  assert.equal(feature.update(ready, obsolete.message, ctx).state, ready);
  const remounted = feature.init({ id: 'picker', generation: 2 }, ctx).state;
  assert.equal(feature.update(remounted, obsolete.message, ctx).state, remounted);
});

test('picker immutable source updates use construction lifecycle and cannot activate obsolete versions', async () => {
  const ctx = await context();
  const source = createSearchPickerIndex([
    { id: 'one', label: 'one', value: 1 },
    { id: 'two', label: 'two', value: 2 },
  ]);
  const feature = createTuiChild(pickerDefinition(source, createSearchPickerKeymap()), message => message);
  const initial = feature.init({ id: 'picker', generation: 1 }, ctx).state;
  const opening = feature.update(initial, envelope(initial, { kind: 'open' }), ctx);
  const queried = await opening.effects[0].run(effectContext(ctx));
  const ready = feature.update(opening.state, queried.message, ctx).state;
  const updating = feature.update(ready, envelope(ready, { kind: 'updateSource', changes: function* () {
    yield [{ kind: 'remove', id: 'one' }, { kind: 'append', entry: { id: 'three', label: 'three', value: 3 } }];
  } }), ctx);
  assert.equal(updating.state.state.construction.pending, true);
  assert.equal(updating.state.state.result, null);
  assert.equal(feature.update(updating.state, envelope(updating.state, { kind: 'accept', id: 'one' }), ctx).outputs, undefined);
  const built = await updating.effects[0].run(effectContext(ctx));
  const querying = feature.update(updating.state, built.message, ctx);
  const version = querying.state.state.construction.result;
  assert.notEqual(version, source);
  const answered = await querying.effects[0].run(effectContext(ctx));
  const updated = feature.update(querying.state, answered.message, ctx).state;
  assert.deepEqual(updated.state.result.entries.map(entry => entry.id), ['two', 'three']);
  assert.equal(updated.state.source, version, 'accepted version releases its temporary source update descriptor');
  assert.equal(feature.update(updated, queried.message, ctx).state, updated);
  const closed = feature.update(updated, envelope(updated, { kind: 'close' }), ctx).state;
  const reopened = feature.update(closed, envelope(closed, { kind: 'open' }), ctx);
  assert.equal(reopened.state.state.construction.result, version);
  assert.equal(reopened.state.state.construction.pending, false);
});

test('typing, close/reopen and replacement fence a pending immutable picker update', async () => {
  const ctx = await context();
  const initialIndex = createSearchPickerIndex([{ id: 'old', label: 'old', value: 'old' }]);
  const feature = createTuiChild(pickerDefinition(initialIndex, createSearchPickerKeymap()), message => message);
  const initial = feature.init({ id: 'picker', generation: 1 }, ctx).state;
  const opening = feature.update(initial, envelope(initial, { kind: 'open' }), ctx);
  const query = await opening.effects[0].run(effectContext(ctx));
  const ready = feature.update(opening.state, query.message, ctx).state;
  let entered;
  const firstYield = new Promise(resolve => { entered = resolve; });
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  let yields = 0;
  const blocked = { ...effectContext(ctx), clock: { ...ctx.clock, sleep: async () => { if (yields++ === 0) { entered(); await gate; } return 'completed'; } } };
  const updating = feature.update(ready, envelope(ready, { kind: 'updateSource', changes: function* () {
    yield [{ kind: 'replace', entry: { id: 'old', label: 'new content', value: 'updated' } }];
  } }), ctx);
  const pending = updating.effects[0].run(blocked);
  await firstYield;
  const typed = feature.update(updating.state, envelope(updating.state, { kind: 'transition', transition: { kind: 'edit', operation: { kind: 'insert', text: 'content' } } }), ctx);
  assert.equal(typed.effects, undefined, 'typing does not restart version construction');
  assert.equal(typed.state.state.control.editor.input.text, 'content');
  const closed = feature.update(typed.state, envelope(typed.state, { kind: 'close' }), ctx);
  assert.equal(closed.cancel.length, 2);
  const reopened = feature.update(closed.state, envelope(closed.state, { kind: 'open' }), ctx);
  assert.equal(reopened.state.state.construction.pending, true);
  const rebuilt = await reopened.effects[0].run(effectContext(ctx));
  const querying = feature.update(reopened.state, rebuilt.message, ctx);
  const queried = await querying.effects[0].run(effectContext(ctx));
  const accepted = feature.update(querying.state, queried.message, ctx).state;
  assert.equal(accepted.state.result.entries[0].value, 'updated');
  const replacement = createSearchPickerIndex([{ id: 'other', label: 'content', value: 'replacement' }]);
  const replaced = feature.update(typed.state, envelope(typed.state, { kind: 'replace', source: replacement }), ctx);
  const replacementQuery = await replaced.effects[0].run(effectContext(ctx));
  const newest = feature.update(replaced.state, replacementQuery.message, ctx).state;
  release();
  const obsolete = await pending;
  assert.equal(feature.update(closed.state, obsolete.message, ctx).state, closed.state);
  assert.equal(feature.update(accepted, obsolete.message, ctx).state, accepted);
  assert.equal(feature.update(newest, obsolete.message, ctx).state, newest);
  assert.equal(newest.state.result.entries[0].value, 'replacement');
  const removed = feature.init({ id: 'picker', generation: 2 }, ctx).state;
  assert.equal(feature.update(removed, obsolete.message, ctx).state, removed);
});

test('successive picker deltas preserve reliable order through blocked work and close/reopen', async () => {
  const ctx = await context();
  const source = createSearchPickerIndex([{ id: 'a', label: 'A', value: 'a' }]);
  const feature = createTuiChild(pickerDefinition(source, createSearchPickerKeymap()), message => message);
  const initial = feature.init({ id: 'picker', generation: 1 }, ctx).state;
  const opening = feature.update(initial, envelope(initial, { kind: 'open' }), ctx);
  const answer = await opening.effects[0].run(effectContext(ctx));
  const ready = feature.update(opening.state, answer.message, ctx).state;
  const change = (state, changes) => feature.update(state, envelope(state, {
    kind: 'updateSource', changes: function* () { yield changes; },
  }), ctx);
  const first = change(ready, [{ kind: 'append', entry: { id: 'b', label: 'B', value: 'b' } }]);
  const entered = Promise.withResolvers();
  const gate = Promise.withResolvers();
  let yields = 0;
  const pending = first.effects[0].run({ ...effectContext(ctx), clock: { ...ctx.clock,
    sleep: async () => { if (yields++ === 0) { entered.resolve(); await gate.promise; } return 'completed'; },
  } });
  await entered.promise;
  let queued = first;
  for (const changes of [
    [{ kind: 'append', entry: { id: 'c', label: 'C', value: 'c' } }],
    [{ kind: 'replace', entry: { id: 'b', label: 'B changed', value: 'b1' } }],
    [{ kind: 'remove', id: 'b' }],
    [{ kind: 'append', entry: { id: 'b', label: 'B appended again', value: 'b2' } }],
    [{ kind: 'remove', id: 'a' }],
  ]) queued = change(queued.state, changes);
  const closed = feature.update(queued.state, envelope(queued.state, { kind: 'close' }), ctx);
  const reopened = feature.update(closed.state, envelope(closed.state, { kind: 'open' }), ctx);
  const built = await reopened.effects[0].run(effectContext(ctx));
  const querying = feature.update(reopened.state, built.message, ctx);
  const queried = await querying.effects[0].run(effectContext(ctx));
  const accepted = feature.update(querying.state, queried.message, ctx).state;
  assert.deepEqual(accepted.state.result.entries.map(entry => [entry.id, entry.value]), [['c', 'c'], ['b', 'b2']]);
  assert.equal(accepted.state.source, accepted.state.construction.result, 'accepted ownership releases the producer chain');
  const replacement = createSearchPickerIndex([{ id: 'fresh', label: 'Fresh', value: 'fresh' }]);
  const replaced = feature.update(queued.state, envelope(queued.state, { kind: 'replace', source: replacement }), ctx);
  const replacementAnswer = await replaced.effects[0].run(effectContext(ctx));
  const latest = feature.update(replaced.state, replacementAnswer.message, ctx).state;
  assert.deepEqual(latest.state.result.entries.map(entry => entry.id), ['fresh']);
  gate.resolve();
  const obsolete = await pending;
  assert.equal(feature.update(accepted, obsolete.message, ctx).state, accepted);
  assert.equal(feature.update(latest, obsolete.message, ctx).state, latest);
});

test('picker deltas received during initial construction or while closed are preserved', async () => {
  const ctx = await context();
  const feature = createTuiChild(pickerDefinition(function* () {
    yield [{ id: 'a', label: 'A', value: 'a' }];
  }, createSearchPickerKeymap()), message => message);
  const initial = feature.init({ id: 'picker', generation: 1 }, ctx).state;
  const closedUpdate = feature.update(initial, envelope(initial, { kind: 'updateSource', changes: function* () {
    yield [{ kind: 'append', entry: { id: 'b', label: 'B', value: 'b' } }];
  } }), ctx);
  assert.equal(closedUpdate.effects, undefined);
  const opening = feature.update(closedUpdate.state, envelope(closedUpdate.state, { kind: 'open' }), ctx);
  const pendingUpdate = feature.update(opening.state, envelope(opening.state, { kind: 'updateSource', changes: function* () {
    yield [{ kind: 'replace', entry: { id: 'b', label: 'Changed B', value: 'b2' } }];
  } }), ctx);
  const built = await pendingUpdate.effects[0].run(effectContext(ctx));
  const querying = feature.update(pendingUpdate.state, built.message, ctx);
  const queried = await querying.effects[0].run(effectContext(ctx));
  const accepted = feature.update(querying.state, queried.message, ctx).state;
  assert.deepEqual(accepted.state.result.entries.map(entry => [entry.id, entry.value]), [['a', 'a'], ['b', 'b2']]);
});
