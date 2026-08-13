import assert from 'node:assert/strict';
import test from 'node:test';

import {
  activeSearchPickerEntry,
  createScrollState,
  prepareSearchPickerIndex,
  searchPickerReducer,
  searchPickerWindow,
} from '../../dist/behavior/index.js';

const entries = [
  { id: 'open', label: 'Open file', value: 'open', keywords: ['file'] },
  { id: 'close', label: 'Close file', value: 'close', keywords: ['file'] },
  { id: 'theme', label: 'Change theme', value: 'theme', keywords: ['view'] },
];
const index = prepareSearchPickerIndex(entries);
const emptyQuery = { text: '', mode: 'fuzzy' } as const;

void test('search picker owns query and active position but acceptance stays an event', () => {
  const initial = { query: emptyQuery, activeId: 'open' };
  const queried = searchPickerReducer(initial, {
    kind: 'setQuery',
    query: { text: 'file', mode: 'contains' },
  }, { searchPickerIndex: index });
  const moved = searchPickerReducer(queried, { kind: 'moveActive', delta: 1 }, {
    searchPickerIndex: index,
  });

  assert.deepEqual(queried, { query: { text: 'file', mode: 'contains', caseSensitive: false }, activeId: 'open' });
  assert.equal(moved.activeId, 'close');
  assert.equal('selectedId' in moved, false);
});

void test('search picker query editing is Unicode-safe and reselects the first enabled match', () => {
  const initial = { query: emptyQuery, activeId: 'open' };
  const typed = searchPickerReducer(initial, { kind: 'insertQuery', text: 'file🙂' }, {
    searchPickerIndex: index,
  });
  const shortened = searchPickerReducer(typed, { kind: 'deleteQueryBackward' }, {
    searchPickerIndex: index,
  });

  assert.equal(typed.query.text, 'file🙂');
  assert.equal(typed.activeId, undefined);
  assert.equal(shortened.query.text, 'file');
  assert.equal(shortened.activeId, 'open');
});

void test('disabled matches never become active', () => {
  const disabledIndex = prepareSearchPickerIndex([
    { id: 'disabled', label: 'Disabled', value: 1, disabled: true },
  ]);
  const result = searchPickerReducer(
    { query: emptyQuery, activeId: 'disabled' },
    { kind: 'setQuery', query: { text: 'disabled', mode: 'contains' } },
    { searchPickerIndex: disabledIndex },
  );
  assert.equal(result.activeId, undefined);
});

void test('activeSearchPickerEntry returns stable-id activation rather than array position', () => {
  const presentation = {
    query: { text: 'file', mode: 'contains' } as const,
    activeId: 'close',
  };
  assert.equal(activeSearchPickerEntry({ searchPickerIndex: index, presentation })?.id, 'close');
});

void test('windowing derives geometry and keeps an offscreen active id visible', () => {
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
  assert.deepEqual(window.entries.map((entry) => entry.id), ['2', '3', '4']);
  assert.equal(window.activeIndex, 2);
  assert.equal(window.totalCount, 5);
});

void test('default picker navigation clamps and optional wrap is explicit', () => {
  const last = { query: emptyQuery, activeId: 'theme' };
  const clamped = searchPickerReducer(last, { kind: 'moveActive', delta: 1 }, {
    searchPickerIndex: index,
  });
  const wrapped = searchPickerReducer(last, { kind: 'moveActive', delta: 1 }, {
    searchPickerIndex: index,
    navigation: { boundary: 'wrap', initial: 'directional-edge' },
  });
  assert.equal(clamped.activeId, 'theme');
  assert.equal(wrapped.activeId, 'open');
});

void test('scroll transitions consume semantic renderer state', () => {
  const rendered = createScrollState({ offsetRow: 2 });
  const moved = searchPickerReducer({ query: emptyQuery, scroll: createScrollState() }, {
    kind: 'scroll',
    event: {
      action: { kind: 'scrollLines', rows: 2 },
      state: rendered,
      source: 'wheel',
      target: 'content',
    },
  }, { searchPickerIndex: index });
  assert.equal(moved.scroll, rendered);
});
