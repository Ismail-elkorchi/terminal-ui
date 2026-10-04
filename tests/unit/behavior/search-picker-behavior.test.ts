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
  querySearchPickerIndex,
  searchPickerView,
  searchPickerReducer,
  searchPickerWindow,
} from '../../../dist/behavior/index.js';
import { searchPickerIndexStatistics } from '../../../dist/behavior/search-picker-index.js';
import { createCollectionInteractionIndex } from '../../../dist/interaction/index.js';

const entries = [
  { id: 'open', label: 'Open file', value: 'open', keywords: ['file'] },
  { id: 'close', label: 'Close file', value: 'close', keywords: ['file'] },
  { id: 'theme', label: 'Change theme', value: 'theme', keywords: ['view'] },
];
const index = createSearchPickerIndex(entries);
const emptyQuery = { text: '', mode: 'fuzzy' } as const;
const emptyQueryResult = querySearchPickerIndex(index, emptyQuery);

void test('search picker owns query and active position but acceptance stays an event', () => {
  const initial = createSearchPickerState({ query: emptyQuery, queryResult: emptyQueryResult }, index);
  const query = { text: 'file', mode: 'contains' } as const;
  const queryResult = querySearchPickerIndex(index, query);
  const queried = searchPickerReducer(initial, {
    kind: 'setQuery',
    query,
  }, { searchPickerIndex: index, queryResult });
  const moved = searchPickerReducer(queried, { kind: 'moveActive', delta: 1 }, {
    searchPickerIndex: index,
    queryResult,
  });

  assert.deepEqual(searchPickerView(queried), {
    input: { text: 'file', cursor: 4, affinity: 'upstream' as const },
    query: { mode: 'contains' },
    activeId: 'open',
  });
  assert.equal(searchPickerView(moved).activeId, 'close');
  assert.equal('selectedId' in moved, false);
});

void test('search picker query editing is Unicode-safe and reselects the first enabled match', () => {
  const initial = createSearchPickerState({ query: emptyQuery, queryResult: emptyQueryResult }, index);
  const typedQueryResult = querySearchPickerIndex(index, { text: 'file🙂', mode: 'fuzzy' });
  const typed = searchPickerReducer(initial, { kind: 'edit', operation: { kind: 'insert', text: 'file🙂' } }, {
    searchPickerIndex: index,
    queryResult: typedQueryResult,
  });
  const shortenedQueryResult = querySearchPickerIndex(index, { text: 'file', mode: 'fuzzy' });
  const shortened = searchPickerReducer(typed, { kind: 'edit', operation: { kind: 'deleteBackward' } }, {
    searchPickerIndex: index,
    queryResult: shortenedQueryResult,
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
  const initialResult = querySearchPickerIndex(disabledIndex, emptyQuery);
  const disabledQuery = { text: 'disabled', mode: 'contains' } as const;
  const queryResult = querySearchPickerIndex(disabledIndex, disabledQuery);
  const result = searchPickerReducer(
    createSearchPickerState({ query: emptyQuery, queryResult: initialResult }, disabledIndex),
    { kind: 'setQuery', query: disabledQuery },
    { searchPickerIndex: disabledIndex, queryResult },
  );
  assert.equal(searchPickerView(result).activeId, undefined);
});

void test('activeSearchPickerEntry returns stable-id activation rather than array position', () => {
  const view = {
    input: { text: 'file', cursor: 4, affinity: 'upstream' as const },
    query: { mode: 'contains' } as const,
    activeId: 'close',
  };
  const queryResult = querySearchPickerIndex(index, { text: view.input.text, ...view.query });
  assert.equal(activeSearchPickerEntry({ searchPickerIndex: index, queryResult, view })?.id, 'close');
});

void test('windowing preserves explicit scroll with an offscreen active id', () => {
  const manyIndex = createSearchPickerIndex(Array.from({ length: 5 }, (_, entryIndex) => ({
    id: String(entryIndex),
    label: `Entry ${String(entryIndex)}`,
    value: entryIndex,
  })));
  const window = searchPickerWindow({
    searchPickerIndex: manyIndex,
    queryResult: querySearchPickerIndex(manyIndex, emptyQuery),
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
    createSearchPickerState({ query: emptyQuery, queryResult: emptyQueryResult }, index),
    { kind: 'setActive', id: 'theme' },
    { searchPickerIndex: index, queryResult: emptyQueryResult },
  );
  const clamped = searchPickerReducer(last, { kind: 'moveActive', delta: 1 }, {
    searchPickerIndex: index,
    queryResult: emptyQueryResult,
  });
  const wrapped = searchPickerReducer(last, { kind: 'moveActive', delta: 1 }, {
    searchPickerIndex: index,
    queryResult: emptyQueryResult,
    navigation: { boundary: 'wrap', initial: 'directional-edge' },
  });
  assert.equal(searchPickerView(clamped).activeId, 'theme');
  assert.equal(searchPickerView(wrapped).activeId, 'open');
});

void test('scroll transitions consume semantic renderer state', () => {
  const rendered = createScrollState({ offsetRow: 2 });
  const moved = searchPickerReducer(createSearchPickerState({
    query: emptyQuery,
    queryResult: emptyQueryResult,
    scroll: createScrollState(),
  }, index), {
    kind: 'scroll',
    request: {
      nextState: rendered,
      source: 'wheel',
      target: 'content',
    },
  }, { searchPickerIndex: index, queryResult: emptyQueryResult });
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
    createSearchPickerState({ query: emptyQuery, queryResult: emptyQueryResult }, index),
    { kind: 'edit', operation: { kind: 'insert', text: 'f' } },
    { searchPickerIndex: index, queryResult: querySearchPickerIndex(index, { text: 'f', mode: 'fuzzy' }) },
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

void test('pending picker edits wait for a current result without scanning entries', () => {
  const pendingIndex = createSearchPickerIndex([...entries]);
  const initial = createSearchPickerState({ query: emptyQuery, queryResult: null }, pendingIndex);
  const typed = searchPickerReducer(initial, {
    kind: 'edit', operation: { kind: 'insert', text: 'file' },
  }, { searchPickerIndex: pendingIndex, queryResult: null });
  const pendingView = searchPickerView(typed);
  assert.equal(pendingView.input.text, 'file');
  assert.equal(pendingView.activeId, undefined);
  assert.deepEqual(searchPickerWindow({
    searchPickerIndex: pendingIndex,
    queryResult: null,
    query: { text: pendingView.input.text, ...pendingView.query },
  }).entries, []);
  assert.equal(activeSearchPickerEntry({
    searchPickerIndex: pendingIndex, queryResult: null, view: pendingView,
  }), undefined);
  assert.equal(searchPickerIndexStatistics(pendingIndex).queryEvaluations, 0);
  assert.equal(searchPickerIndexStatistics(pendingIndex).candidateEvaluations, 0);

  const queryResult = querySearchPickerIndex(pendingIndex, { text: 'file', mode: 'fuzzy' });
  const ready = searchPickerReducer(typed, { kind: 'firstActive' }, {
    searchPickerIndex: pendingIndex, queryResult,
  });
  assert.equal(searchPickerView(ready).activeId, 'open');
  assert.equal(activeSearchPickerEntry({
    searchPickerIndex: pendingIndex, queryResult, view: searchPickerView(ready),
  })?.id, 'open');
});

void test('stale picker results are ignored after query or index changes', () => {
  const pendingIndex = createSearchPickerIndex([...entries]);
  const initialResult = querySearchPickerIndex(pendingIndex, emptyQuery);
  const initial = createSearchPickerState({ query: emptyQuery, queryResult: initialResult }, pendingIndex);
  const query = { text: 'file', mode: 'contains' } as const;
  const changed = searchPickerReducer(initial, { kind: 'setQuery', query }, {
    searchPickerIndex: pendingIndex, queryResult: initialResult,
  });
  const view = searchPickerView(changed);
  assert.equal(view.input.text, query.text);
  assert.equal(view.activeId, undefined);

  const foreignResult = querySearchPickerIndex(index, query);
  const before = searchPickerIndexStatistics(pendingIndex);
  for (const queryResult of [initialResult, foreignResult]) {
    assert.equal(searchPickerView(createSearchPickerState({ query, queryResult }, pendingIndex)).activeId, undefined);
    assert.deepEqual(searchPickerWindow({ searchPickerIndex: pendingIndex, queryResult, query }).entries, []);
    assert.equal(activeSearchPickerEntry({ searchPickerIndex: pendingIndex, queryResult, view }), undefined);
    const moved = searchPickerReducer(changed, { kind: 'moveActive', delta: 1 }, {
      searchPickerIndex: pendingIndex, queryResult,
    });
    assert.equal(searchPickerView(moved).activeId, undefined);
  }
  assert.deepEqual(searchPickerIndexStatistics(pendingIndex), before);
});
