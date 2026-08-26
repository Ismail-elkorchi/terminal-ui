import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeSearchPickerEntry,
  autocompleteComboboxView,
  autocompleteComboboxReducer,
  commandInputView,
  commandInputReducer,
  createAutocompleteComboboxState,
  createCommandInputState,
  createSearchPickerState,
  createScrollState,
  createSearchPickerIndex,
  createCommandSuggestions,
  searchPickerView,
  searchPickerReducer,
  searchPickerWindow,
} from '../../dist/behavior/index.js';
import { createCollectionInteractionIndex } from '../../dist/interaction/index.js';

const entries = [
  { id: 'open', label: 'Open file', value: 'open', keywords: ['file'] },
  { id: 'close', label: 'Close file', value: 'close', keywords: ['file'] },
  { id: 'theme', label: 'Change theme', value: 'theme', keywords: ['view'] },
];
const index = createSearchPickerIndex(entries);
const emptyQuery = { text: '', mode: 'fuzzy' } as const;

void test('search picker owns query and active position but acceptance stays an event', () => {
  const initial = createSearchPickerState({ query: emptyQuery }, index);
  const queried = searchPickerReducer(initial, {
    kind: 'setQuery',
    query: { text: 'file', mode: 'contains' },
  }, { searchPickerIndex: index });
  const moved = searchPickerReducer(queried, { kind: 'moveActive', delta: 1 }, {
    searchPickerIndex: index,
  });

  assert.deepEqual(searchPickerView(queried), {
    input: { text: 'file', cursor: 4 },
    query: { mode: 'contains' },
    activeId: 'open',
  });
  assert.equal(searchPickerView(moved).activeId, 'close');
  assert.equal('selectedId' in moved, false);
});

void test('search picker query editing is Unicode-safe and reselects the first enabled match', () => {
  const initial = createSearchPickerState({ query: emptyQuery }, index);
  const typed = searchPickerReducer(initial, { kind: 'edit', operation: { kind: 'insert', text: 'file🙂' } }, {
    searchPickerIndex: index,
  });
  const shortened = searchPickerReducer(typed, { kind: 'edit', operation: { kind: 'deleteBackward' } }, {
    searchPickerIndex: index,
  });

  assert.equal(searchPickerView(typed).input.text, 'file🙂');
  assert.equal(searchPickerView(typed).activeId, undefined);
  assert.equal(searchPickerView(shortened).input.text, 'file');
  assert.equal(searchPickerView(shortened).activeId, 'open');
});

void test('disabled matches never become active', () => {
  const disabledIndex = createSearchPickerIndex([
    { id: 'disabled', label: 'Disabled', value: 1, disabled: true },
  ]);
  const result = searchPickerReducer(
    createSearchPickerState({ query: emptyQuery }, disabledIndex),
    { kind: 'setQuery', query: { text: 'disabled', mode: 'contains' } },
    { searchPickerIndex: disabledIndex },
  );
  assert.equal(searchPickerView(result).activeId, undefined);
});

void test('activeSearchPickerEntry returns stable-id activation rather than array position', () => {
  const view = {
    input: { text: 'file', cursor: 4 },
    query: { mode: 'contains' } as const,
    activeId: 'close',
  };
  assert.equal(activeSearchPickerEntry({ searchPickerIndex: index, view })?.id, 'close');
});

void test('windowing preserves explicit scroll with an offscreen active id', () => {
  const manyIndex = createSearchPickerIndex(Array.from({ length: 5 }, (_, entryIndex) => ({
    id: String(entryIndex),
    label: `Entry ${String(entryIndex)}`,
    value: entryIndex,
  })));
  const window = searchPickerWindow({
    searchPickerIndex: manyIndex,
    query: emptyQuery,
    activeId: '4',
    scroll: createScrollState(),
    limit: 3,
  });
  assert.deepEqual(window.entries.map((entry) => entry.id), ['0', '1', '2']);
  assert.equal(window.activeIndex, undefined);
  assert.equal(window.activeEntry?.id, '4');
  assert.equal(window.totalCount, 5);
});

void test('default picker navigation clamps and optional wrap is explicit', () => {
  const last = searchPickerReducer(
    createSearchPickerState({ query: emptyQuery }, index),
    { kind: 'setActive', id: 'theme' },
    { searchPickerIndex: index },
  );
  const clamped = searchPickerReducer(last, { kind: 'moveActive', delta: 1 }, {
    searchPickerIndex: index,
  });
  const wrapped = searchPickerReducer(last, { kind: 'moveActive', delta: 1 }, {
    searchPickerIndex: index,
    navigation: { boundary: 'wrap', initial: 'directional-edge' },
  });
  assert.equal(searchPickerView(clamped).activeId, 'theme');
  assert.equal(searchPickerView(wrapped).activeId, 'open');
});

void test('scroll transitions consume semantic renderer state', () => {
  const rendered = createScrollState({ offsetRow: 2 });
  const moved = searchPickerReducer(createSearchPickerState({
    query: emptyQuery,
    scroll: createScrollState(),
  }, index), {
    kind: 'scroll',
    request: {
      nextState: rendered,
      source: 'wheel',
      target: 'content',
    },
  }, { searchPickerIndex: index });
  assert.equal(searchPickerView(moved).scroll, rendered);
});

void test('editable popup adapters share text editing and active-result transitions', () => {
  const commandSuggestions = createCommandSuggestions(entries.map((entry) => ({
    id: entry.id,
    label: entry.label,
    completion: { range: { startOffset: 0, endOffsetExclusive: 0 }, text: entry.label },
  })));
  const command = commandInputReducer(
    createCommandInputState({ suggestions: commandSuggestions }),
    { kind: 'edit', operation: { kind: 'insert', text: 'f' } },
  );
  const search = searchPickerReducer(
    createSearchPickerState({ query: emptyQuery }, index),
    { kind: 'edit', operation: { kind: 'insert', text: 'f' } },
    { searchPickerIndex: index },
  );
  const autocompleteIndex = createCollectionInteractionIndex(['open', 'close']);
  const autocomplete = autocompleteComboboxReducer(
    createAutocompleteComboboxState({ open: false }, autocompleteIndex),
    { kind: 'edit', operation: { kind: 'insert', text: 'f' } },
    {
      indexForText: () => autocompleteIndex,
    },
  );

  assert.equal(commandInputView(command).input.text, 'f');
  assert.equal(searchPickerView(search).input.text, 'f');
  assert.equal(autocompleteComboboxView(autocomplete).input.text, 'f');
  assert.equal(commandInputView(command).open, true);
  assert.equal(autocomplete.editor.open, true);
});
