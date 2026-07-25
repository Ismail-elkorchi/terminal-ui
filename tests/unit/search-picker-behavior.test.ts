import assert from 'node:assert/strict';
import test from 'node:test';

import {
  searchPickerReducer,
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
  const initial = { query: '', selectedIndex: 0 };
  const queried = searchPickerReducer(initial, { kind: 'setQuery', query: 'file' }, { searchPickerIndex: index });
  const moved = searchPickerReducer(queried, { kind: 'moveSelection', delta: -1 }, { searchPickerIndex: index });

  assert.deepEqual(queried, { query: 'file', selectedIndex: 0 });
  assert.equal(moved.selectedIndex, 1);
});

void test('searchPickerReducer can edit query and move within filtered entries', () => {
  const initial = { query: '', selectedIndex: 0 };
  const typed = searchPickerReducer(initial, { kind: 'insertQuery', text: 'file🙂' }, { searchPickerIndex: index });
  const shortened = searchPickerReducer(typed, { kind: 'deleteQueryBackward' }, { searchPickerIndex: index });
  const moved = searchPickerReducer(shortened, { kind: 'moveSelection', delta: -1 }, { searchPickerIndex: index });

  assert.deepEqual(typed, { query: 'file🙂', selectedIndex: 0 });
  assert.deepEqual(shortened, { query: 'file', selectedIndex: 0 });
  assert.equal(moved.selectedIndex, 1);
});

void test('selectedSearchPickerEntry returns the filtered selected entry from searchPicker state', () => {
  const state = { query: 'file', selectedIndex: 1 };

  assert.equal(selectedSearchPickerEntry({ searchPickerIndex: index, state })?.id, 'close');
});
