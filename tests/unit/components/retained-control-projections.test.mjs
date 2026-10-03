import assert from 'node:assert/strict';
import test from 'node:test';

import {
  autocompleteComboboxView,
  commandInputReducer,
  commandInputView,
  createAutocompleteComboboxState,
  createCommandInputState,
  createCommandSuggestions,
  createListboxCollection,
  createListboxView,
  updateListboxCollection,
} from '../../../dist/behavior/index.js';
import { combobox, commandInput } from '../../../dist/components/index.js';
import { createMemoryTerminalHost } from '../../../dist/host/index.js';
import { createTuiRuntime, defineTui } from '../../../dist/tui/index.js';
import { renderElementFrame, renderFramePlain } from '../../../dist/renderer/index.js';
import { renderElementInternal } from '../../../dist/renderer/internal/render-element.js';

const key = value => ({ kind: 'key', key: value, modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
const suggestion = (id, disabled = false) => ({ id, label: `Suggestion ${id}`, disabled, completion: { range: { startOffset: 0, endOffsetExclusive: 1 }, text: id } });
const choices = [{ id: 'a', label: 'Alpha' }, { id: 'b', label: 'Blocked', disabled: true }, { id: 'c', label: 'Charlie' }];

function selectState(activeId = 'a') {
  return { kind: 'select', open: true, interaction: { activeId, selection: { mode: 'single', selectedId: 'a' } } };
}

test('command state retains the accepted suggestion reader across edits and history', () => {
  const suggestions = createCommandSuggestions([suggestion('blocked', true), suggestion('first'), suggestion('last')]);
  let state = createCommandInputState({ value: 'x', submissions: ['prior'], suggestions });
  const retained = state.suggestionView;
  for (const transition of [
    { kind: 'edit', operation: { kind: 'insert', text: 'x' } },
    { kind: 'undo' }, { kind: 'redo' }, { kind: 'historyPrevious' }, { kind: 'historyNext' },
    { kind: 'moveSuggestion', delta: 1 },
  ]) {
    state = commandInputReducer(state, transition);
    assert.strictEqual(state.suggestionView, retained);
    assert.strictEqual(commandInputView(state).suggestionView, retained);
  }
  assert.equal(state.editor.activeId, 'first');
  state = commandInputReducer(state, { kind: 'moveSuggestion', delta: 1 });
  assert.equal(state.editor.activeId, 'last');
  assert.strictEqual(state.suggestionView, retained);
  state = commandInputReducer(state, { kind: 'setValue', value: 'x' });
  state = commandInputReducer(state, { kind: 'setActiveSuggestion', id: 'last' });
  state = commandInputReducer(state, { kind: 'acceptSuggestion' });
  assert.equal(state.editor.input.text, 'last');
  const replacement = createCommandSuggestions([suggestion('replacement')]);
  state = commandInputReducer(state, { kind: 'setSuggestions', suggestions: replacement });
  assert.strictEqual(state.suggestionView.source, replacement);
  assert.notStrictEqual(state.suggestionView, retained);
  assert.equal(state.editor.activeId, 'replacement');
});

test('command rendering consumes a bounded active window from its retained reader', () => {
  const suggestions = createCommandSuggestions(Array.from({ length: 1024 }, (_, index) => suggestion(`item-${index}`)));
  const state = commandInputReducer(createCommandInputState({ value: 'x', suggestions }), { kind: 'setActiveSuggestion', id: 'item-800' });
  const view = commandInputView(state);
  const frame = renderElementFrame(commandInput({ id: 'command', view, display: 'expanded', maxVisibleSuggestions: 5, onTransition: transition => transition }), { columns: 40, rows: 8 });
  assert.match(renderFramePlain(frame), /item-800/u);
  const popup = frame.accessibility.root.children.find(child => child.role === 'listbox');
  assert.equal(popup.children.length, 5);
  assert.equal(popup.window.totalCount, 1024);
  assert.equal(popup.window.startIndex, 798);
  assert.equal(popup.children[2].id, 'command:popup:item:item-800');
  assert.throws(() => commandInput({ id: 'forged', view: { ...view, suggestions: { ...suggestions } }, onTransition: transition => transition }), /retained listbox collection/u);
  const other = createCommandSuggestions([suggestion('other')]);
  assert.throws(() => commandInput({ id: 'mismatch', view: { ...view, suggestions: other }, onTransition: transition => transition }), /suggestionView must match/u);
});

test('combobox accepts canonical prepared source and filtered reader without rereading caller options', () => {
  let reads = 0;
  const raw = [...choices, { id: 'excluded', label: 'Echo' }].map(choice => ({ ...choice, get label() { reads += 1; return choice.label; } }));
  const collection = createListboxCollection(raw, item => item);
  const query = { text: 'l' };
  const optionsView = createListboxView(collection, { query });
  const before = reads;
  assert.equal(collection.count, 4);
  assert.equal(optionsView.count, 3);
  const element = combobox({ id: 'choice', label: 'Choice', collection, optionsView, query, state: selectState('c'), onTransition: transition => transition });
  const frame = renderElementFrame(element, { columns: 32, rows: 8 });
  assert.equal(reads, before);
  assert.match(renderFramePlain(frame), /Choice: Alpha/u);
  assert.equal(frame.accessibility.root.children[0].children[1].disabled, true);
  assert.throws(() => combobox({ id: 'forged', label: 'Choice', collection: { ...collection }, optionsView, state: selectState(), onTransition: transition => transition }), /must be created/u);
});

test('pending or stale combobox projections do not commit or navigate obsolete results', async () => {
  const collection = createListboxCollection(choices, choice => choice);
  const oldView = createListboxView(collection);
  const replacement = updateListboxCollection(collection, [{ kind: 'remove', id: 'a' }]);
  for (const optionsView of [null, oldView]) {
    const app = defineTui({ id: 'pending-choice', init: () => ({ state: { messages: [] } }),
      update: (state, message) => ({ state: { messages: [...state.messages, message] } }),
      view: () => combobox({ id: 'choice', label: 'Choice', collection: replacement, optionsView,
        view: { kind: 'autocomplete', open: true, input: { text: '', cursor: 0 }, activeId: 'a', selection: { mode: 'single' } },
        onTransition: transition => ({ kind: 'transition', transition }), onCommit: event => ({ kind: 'commit', event }),
      }),
    });
    const runtime = createTuiRuntime({ app, host: createMemoryTerminalHost(), initialFocus: { kind: 'path', path: ['choice'] } });
    try {
      await runtime.start();
      await runtime.handleInput(key('enter'));
      await runtime.handleInput(key('arrowDown'));
      assert.deepEqual(runtime.state().messages, []);
      await runtime.handleInput({ kind: 'text', text: 'x', paste: false });
      assert.deepEqual(runtime.state().messages, [{ kind: 'transition', transition: { kind: 'edit', operation: { kind: 'insert', text: 'x' } } }]);
    } finally { await runtime.dispose(); }
  }
});

test('combobox retained renders rebind callbacks while preserving the prepared reader', () => {
  const collection = createListboxCollection(choices, choice => choice);
  const optionsView = createListboxView(collection);
  const view = revision => combobox({ id: 'choice', label: 'Choice', collection, optionsView, state: selectState(), onTransition: transition => ({ revision, transition }) });
  const previous = renderElementInternal(view(1), { columns: 32, rows: 8 });
  const next = renderElementInternal(view(2), { columns: 32, rows: 8 }, { previous });
  const trigger = next.regions.flatMap(region => region.hitTargets).find(target => target.id === 'choice:trigger');
  assert.deepEqual(trigger.message({ kind: 'click' }), { revision: 2, transition: { kind: 'toggle' } });
  assert.deepEqual(next.frame, renderElementInternal(view(2), { columns: 32, rows: 8 }).frame);
});

test('autocomplete shares its prepared interaction index and skips disabled results', () => {
  const collection = createListboxCollection(choices, choice => choice);
  const optionsView = createListboxView(collection);
  const editor = createAutocompleteComboboxState({ open: true, activeId: 'c', selectedId: 'a' }, optionsView.interactionIndex);
  const frame = renderElementFrame(combobox({ id: 'completion', label: 'Complete', collection, optionsView, view: autocompleteComboboxView(editor), onTransition: transition => transition }), { columns: 32, rows: 8 });
  assert.equal(frame.accessibility.root.activeDescendant, 'completion:popup:item:c');
  assert.equal(frame.accessibility.root.children[0].children[1].disabled, true);
});


test('command retained renders rebind suggestion callbacks without reconstructing suggestions', () => {
  const state = createCommandInputState({ value: 'x', suggestions: createCommandSuggestions([suggestion('one'), suggestion('two')]) });
  const view = commandInputView(state);
  const element = revision => commandInput({ id: 'command', view, display: 'expanded', onTransition: transition => ({ revision, transition }) });
  const previous = renderElementInternal(element(1), { columns: 32, rows: 8 });
  const next = renderElementInternal(element(2), { columns: 32, rows: 8 }, { previous });
  const target = next.regions.flatMap(region => region.hitTargets).find(item => item.id === 'command:suggestion:two');
  assert.deepEqual(target.message({ kind: 'click' }), { revision: 2, transition: { kind: 'setActiveSuggestion', id: 'two' } });
  assert.deepEqual(next.frame, renderElementInternal(element(2), { columns: 32, rows: 8 }).frame);
});

test('combobox accessibility bounds large prepared sources around the active result', () => {
  const collection = createListboxCollection(Array.from({ length: 1024 }, (_, index) => ({ id: `item-${index}`, label: `Item ${index}` })), item => item);
  const optionsView = createListboxView(collection);
  const frame = renderElementFrame(combobox({ id: 'choice', label: 'Choice', collection, optionsView, maxVisibleOptions: 5,
    state: { kind: 'select', open: true, interaction: { activeId: 'item-800', selection: { mode: 'single' } } },
    onTransition: transition => transition,
  }), { columns: 32, rows: 8 });
  const popup = frame.accessibility.root.children[0];
  assert.equal(popup.children.length, 5);
  assert.equal(popup.window.startIndex, 798);
  assert.equal(popup.window.totalCount, 1024);
  assert.equal(popup.children[2].position.positionInSet, 801);
  assert.equal(popup.children[2].position.setSize, 1024);
});
