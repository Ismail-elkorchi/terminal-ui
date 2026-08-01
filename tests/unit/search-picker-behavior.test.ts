import assert from 'node:assert/strict';
import test from 'node:test';

import {
  searchPickerReducer,
  searchPickerWindow,
  prepareSearchPickerIndex,
  selectedSearchPickerEntry
} from '../../dist/behavior/index.js';

const entries = [
  { id: 'open', label: 'Open file', value: 'open', keywords: ['file'] },
  { id: 'close', label: 'Close file', value: 'close', keywords: ['file'] },
  { id: 'theme', label: 'Change theme', value: 'theme', keywords: ['view'] }
];
const index = prepareSearchPickerIndex(entries);

void test('searchPickerReducer owns query and filtered selection state', () => {
  const initial = { query: '', selectedId: 'open' };
  const queried = searchPickerReducer(initial, { kind: 'setQuery', query: 'file' }, { searchPickerIndex: index });
  const moved = searchPickerReducer(queried, { kind: 'moveSelection', delta: -1 }, { searchPickerIndex: index });

  assert.deepEqual(queried, { query: 'file', selectedId: 'open' });
  assert.equal(moved.selectedId, 'close');
});

void test('searchPickerReducer can edit query and move within filtered entries', () => {
  const initial = { query: '', selectedId: 'open' };
  const typed = searchPickerReducer(initial, { kind: 'insertQuery', text: 'file🙂' }, { searchPickerIndex: index });
  const shortened = searchPickerReducer(typed, { kind: 'deleteQueryBackward' }, { searchPickerIndex: index });
  const moved = searchPickerReducer(shortened, { kind: 'moveSelection', delta: -1 }, { searchPickerIndex: index });

  assert.deepEqual(typed, { query: 'file🙂' });
  assert.deepEqual(shortened, { query: 'file', selectedId: 'open' });
  assert.equal(moved.selectedId, 'close');
});

void test('searchPickerReducer clears selection when a query has no enabled result', () => {
  const disabledIndex = prepareSearchPickerIndex([
    { id: 'disabled', label: 'Disabled', value: 1, disabled: true }
  ]);

  assert.deepEqual(searchPickerReducer(
    { query: '', selectedId: 'disabled' },
    { kind: 'setQuery', query: 'disabled' },
    { searchPickerIndex: disabledIndex }
  ), { query: 'disabled' });
  assert.deepEqual(searchPickerReducer(
    { query: '', selectedId: 'disabled' },
    { kind: 'setQuery', query: 'missing' },
    { searchPickerIndex: disabledIndex }
  ), { query: 'missing' });
});

void test('selectedSearchPickerEntry returns the filtered selected entry from searchPicker state', () => {
  const state = { query: 'file', selectedId: 'close' };

  assert.equal(selectedSearchPickerEntry({ searchPickerIndex: index, state })?.id, 'close');
  assert.equal(selectedSearchPickerEntry({
    searchPickerIndex: index,
    state: {
      query: 'file',
      scroll: {
        offsetRow: 1,
        offsetColumn: 0,
        contentRows: 2,
        contentColumns: 1,
        viewportRows: 1,
        viewportColumns: 1,
        followTail: false
      }
    },
    limit: 1
  })?.id, 'close');
});

void test('searchPickerReducer moves selection and scroll as one state transition', () => {
  const manyIndex = prepareSearchPickerIndex(Array.from({ length: 5 }, (_, entryIndex) => ({
    id: String(entryIndex),
    label: `Entry ${String(entryIndex)}`,
    value: entryIndex
  })));
  const scroll = {
    offsetRow: 0,
    offsetColumn: 0,
    contentRows: 5,
    contentColumns: 1,
    viewportRows: 3,
    viewportColumns: 1,
    followTail: false
  };
  const moved = searchPickerReducer(
    { query: '', selectedId: '3', scroll },
    { kind: 'moveSelection', delta: 1 },
    { searchPickerIndex: manyIndex }
  );

  assert.equal(moved.selectedId, '4');
  assert.equal(moved.scroll?.offsetRow, 2);
  assert.equal(moved.scroll.selectedIndex, 4);
  assert.deepEqual(searchPickerWindow({
    searchPickerIndex: manyIndex,
    ...moved,
    limit: 3
  }).entries.map((entry) => entry.id), ['2', '3', '4']);

  const queried = searchPickerReducer(
    moved,
    { kind: 'setQuery', query: 'Entry 0' },
    { searchPickerIndex: manyIndex }
  );
  assert.equal(queried.selectedId, '0');
  assert.equal(queried.scroll?.offsetRow, 0);
  assert.equal(queried.scroll.contentRows, 1);
  assert.equal(queried.scroll.selectedIndex, 0);
});

void test('searchPickerReducer uses directional enabled fallbacks for stale selection', () => {
  const disabledIndex = prepareSearchPickerIndex([
    { id: 'disabled', label: 'Disabled', value: 0, disabled: true },
    { id: 'first', label: 'First', value: 1 },
    { id: 'last', label: 'Last', value: 2 }
  ]);

  assert.equal(searchPickerReducer(
    { query: '', selectedId: 'missing' },
    { kind: 'moveSelection', delta: 1 },
    { searchPickerIndex: disabledIndex }
  ).selectedId, 'first');
  assert.equal(searchPickerReducer(
    { query: '', selectedId: 'disabled' },
    { kind: 'moveSelection', delta: -1 },
    { searchPickerIndex: disabledIndex }
  ).selectedId, 'last');
});
