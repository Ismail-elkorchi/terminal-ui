import assert from 'node:assert/strict';
import test from 'node:test';

import {
  groupSearchPickerEntries,
  searchPickerPresentation,
  searchPickerReducer,
  prepareSearchPickerIndex,
  selectedSearchPickerEntry,
  searchPickerStatus
} from '../../dist/behavior/index.js';

const entries = [
  { id: 'open', label: 'Open file', value: 'open', keywords: ['file'] },
  { id: 'close', label: 'Close file', value: 'close', keywords: ['file'] },
  { id: 'theme', label: 'Change theme', value: 'theme', keywords: ['view'] }
];
const index = prepareSearchPickerIndex(entries);

void test('searchPickerReducer owns query selection preview and multi-select state', () => {
  const initial = { query: '', selectedIndex: 0, selectedIds: [] };
  const queried = searchPickerReducer(initial, { kind: 'setQuery', query: 'file' }, { searchPickerIndex: index });
  const moved = searchPickerReducer(queried, { kind: 'moveSelection', delta: -1 }, { searchPickerIndex: index });
  const selected = searchPickerReducer(moved, { kind: 'toggleSelected', id: 'close' }, { searchPickerIndex: index });
  const preview = searchPickerReducer(selected, { kind: 'preview', id: 'close' }, { searchPickerIndex: index });
  const cleared = searchPickerReducer(preview, { kind: 'clearSelected' }, { searchPickerIndex: index });

  assert.deepEqual(queried, { query: 'file', selectedIndex: 0, selectedIds: [] });
  assert.equal(moved.selectedIndex, 1);
  assert.deepEqual(selected.selectedIds, ['close']);
  assert.equal(preview.previewId, 'close');
  assert.deepEqual(cleared.selectedIds, []);
});

void test('searchPickerReducer can edit query and move within filtered entries', () => {
  const initial = { query: '', selectedIndex: 0, selectedIds: [] };
  const typed = searchPickerReducer(initial, { kind: 'insertQuery', text: 'file🙂' }, { searchPickerIndex: index });
  const shortened = searchPickerReducer(typed, { kind: 'deleteQueryBackward' }, { searchPickerIndex: index });
  const moved = searchPickerReducer(shortened, { kind: 'moveSelection', delta: -1 }, { searchPickerIndex: index });

  assert.deepEqual(typed, { query: 'file🙂', selectedIndex: 0, selectedIds: [] });
  assert.deepEqual(shortened, { query: 'file', selectedIndex: 0, selectedIds: [] });
  assert.equal(moved.selectedIndex, 1);
  assert.deepEqual(searchPickerPresentation(moved), { query: 'file', selectedIndex: 1 });
});

void test('selectedSearchPickerEntry returns the filtered selected entry from searchPicker state', () => {
  const state = { query: 'file', selectedIndex: 1, selectedIds: [] };

  assert.equal(selectedSearchPickerEntry({ searchPickerIndex: index, state })?.id, 'close');
});

void test('groupSearchPickerEntries preserves first-seen group order', () => {
  const groups = groupSearchPickerEntries(entries, (entry) => ({
    id: entry.keywords?.[0] ?? 'general',
    label: entry.keywords?.[0] === 'file' ? 'Files' : 'Other'
  }));

  assert.deepEqual(groups.map((group) => group.id), ['file', 'view']);
  assert.deepEqual(groups[0]?.entries.map((entry) => entry.id), ['open', 'close']);
  assert.equal(groups[0].label, 'Files');
});

void test('searchPickerStatus distinguishes loading error empty and idle async states', () => {
  assert.equal(searchPickerStatus({ status: 'loading', entries }), 'loading');
  assert.equal(searchPickerStatus({ status: 'error', entries, message: 'Network failed' }), 'error');
  assert.equal(searchPickerStatus({ status: 'idle', entries: [] }), 'empty');
  assert.equal(searchPickerStatus({ status: 'idle', entries }), 'idle');
});
