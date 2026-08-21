import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeSearchPickerEntry,
  autocompleteComboboxPresentation,
  autocompleteComboboxReducer,
  commandInputPresentation,
  commandInputReducer,
  createAutocompleteComboboxState,
  createCommandInputState,
  createSearchPickerState,
  createScrollState,
  prepareSearchPickerIndex,
  prepareCommandSuggestions,
  searchPickerPresentation,
  searchPickerReducer,
  searchPickerWindow,
} from '../../dist/behavior/index.js';
import { prepareCollectionInteractionIndex } from '../../dist/interaction/index.js';

const entries = [
  { id: 'open', label: 'Open file', value: 'open', keywords: ['file'] },
  { id: 'close', label: 'Close file', value: 'close', keywords: ['file'] },
  { id: 'theme', label: 'Change theme', value: 'theme', keywords: ['view'] },
];
const index = prepareSearchPickerIndex(entries);
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

  assert.deepEqual(searchPickerPresentation(queried), {
    query: { text: 'file', mode: 'contains' },
    activeId: 'open',
  });
  assert.equal(searchPickerPresentation(moved).activeId, 'close');
  assert.equal('selectedId' in moved, false);
});

void test('search picker query editing is Unicode-safe and reselects the first enabled match', () => {
  const initial = createSearchPickerState({ query: emptyQuery }, index);
  const typed = searchPickerReducer(initial, { kind: 'insertQuery', text: 'file🙂' }, {
    searchPickerIndex: index,
  });
  const shortened = searchPickerReducer(typed, { kind: 'deleteQueryBackward' }, {
    searchPickerIndex: index,
  });

  assert.equal(searchPickerPresentation(typed).query.text, 'file🙂');
  assert.equal(searchPickerPresentation(typed).activeId, undefined);
  assert.equal(searchPickerPresentation(shortened).query.text, 'file');
  assert.equal(searchPickerPresentation(shortened).activeId, 'open');
});

void test('disabled matches never become active', () => {
  const disabledIndex = prepareSearchPickerIndex([
    { id: 'disabled', label: 'Disabled', value: 1, disabled: true },
  ]);
  const result = searchPickerReducer(
    createSearchPickerState({ query: emptyQuery }, disabledIndex),
    { kind: 'setQuery', query: { text: 'disabled', mode: 'contains' } },
    { searchPickerIndex: disabledIndex },
  );
  assert.equal(searchPickerPresentation(result).activeId, undefined);
});

void test('activeSearchPickerEntry returns stable-id activation rather than array position', () => {
  const presentation = {
    query: { text: 'file', mode: 'contains' } as const,
    activeId: 'close',
  };
  assert.equal(activeSearchPickerEntry({ searchPickerIndex: index, presentation })?.id, 'close');
});

void test('windowing preserves explicit scroll with an offscreen active id', () => {
  const manyIndex = prepareSearchPickerIndex(Array.from({ length: 5 }, (_, entryIndex) => ({
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
  assert.equal(searchPickerPresentation(clamped).activeId, 'theme');
  assert.equal(searchPickerPresentation(wrapped).activeId, 'open');
});

void test('scroll transitions consume semantic renderer state', () => {
  const rendered = createScrollState({ offsetRow: 2 });
  const moved = searchPickerReducer(createSearchPickerState({
    query: emptyQuery,
    scroll: createScrollState(),
  }, index), {
    kind: 'scroll',
    event: {
      nextState: rendered,
      source: 'wheel',
      target: 'content',
    },
  }, { searchPickerIndex: index });
  assert.equal(searchPickerPresentation(moved).scroll, rendered);
});

void test('editable popup adapters share text editing and active-result transitions', () => {
  const commandSuggestions = prepareCommandSuggestions(entries.map((entry) => ({
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
    { kind: 'insertQuery', text: 'f' },
    { searchPickerIndex: index },
  );
  const autocompleteIndex = prepareCollectionInteractionIndex(['open', 'close']);
  const autocomplete = autocompleteComboboxReducer(
    createAutocompleteComboboxState({ open: false }, autocompleteIndex),
    { kind: 'edit', operation: { kind: 'insert', text: 'f' } },
    {
      indexForText: () => autocompleteIndex,
    },
  );

  assert.equal(commandInputPresentation(command).value, 'f');
  assert.equal(searchPickerPresentation(search).query.text, 'f');
  assert.equal(autocompleteComboboxPresentation(autocomplete).input.text, 'f');
  assert.equal(commandInputPresentation(command).open, true);
  assert.equal(autocomplete.editor.open, true);
});
