import assert from 'node:assert/strict';
import test from 'node:test';

import {
  groupPaletteEntries,
  palettePresentation,
  paletteReducer,
  preparePaletteIndex,
  selectedPaletteEntry,
  paletteStatus
} from '../../dist/behavior/index.js';

const entries = [
  { id: 'open', label: 'Open file', value: 'open', keywords: ['file'] },
  { id: 'close', label: 'Close file', value: 'close', keywords: ['file'] },
  { id: 'theme', label: 'Change theme', value: 'theme', keywords: ['view'] }
];
const index = preparePaletteIndex(entries);

void test('paletteReducer owns query selection preview and multi-select state', () => {
  const initial = { query: '', selectedIndex: 0, selectedIds: [] };
  const queried = paletteReducer(initial, { kind: 'setQuery', query: 'file' }, { index });
  const moved = paletteReducer(queried, { kind: 'moveSelection', delta: -1 }, { index });
  const selected = paletteReducer(moved, { kind: 'toggleSelected', id: 'close' }, { index });
  const preview = paletteReducer(selected, { kind: 'preview', id: 'close' }, { index });
  const cleared = paletteReducer(preview, { kind: 'clearSelected' }, { index });

  assert.deepEqual(queried, { query: 'file', selectedIndex: 0, selectedIds: [] });
  assert.equal(moved.selectedIndex, 1);
  assert.deepEqual(selected.selectedIds, ['close']);
  assert.equal(preview.previewId, 'close');
  assert.deepEqual(cleared.selectedIds, []);
});

void test('paletteReducer can edit query and move within filtered entries', () => {
  const initial = { query: '', selectedIndex: 0, selectedIds: [] };
  const typed = paletteReducer(initial, { kind: 'insertQuery', text: 'file🙂' }, { index });
  const shortened = paletteReducer(typed, { kind: 'deleteQueryBackward' }, { index });
  const moved = paletteReducer(shortened, { kind: 'moveSelection', delta: -1 }, { index });

  assert.deepEqual(typed, { query: 'file🙂', selectedIndex: 0, selectedIds: [] });
  assert.deepEqual(shortened, { query: 'file', selectedIndex: 0, selectedIds: [] });
  assert.equal(moved.selectedIndex, 1);
  assert.deepEqual(palettePresentation(moved), { query: 'file', selected: 1 });
});

void test('selectedPaletteEntry returns the filtered selected entry from palette state', () => {
  const state = { query: 'file', selectedIndex: 1, selectedIds: [] };

  assert.equal(selectedPaletteEntry({ index, state })?.id, 'close');
});

void test('groupPaletteEntries preserves first-seen group order', () => {
  const groups = groupPaletteEntries(entries, (entry) => ({
    id: entry.keywords?.[0] ?? 'general',
    label: entry.keywords?.[0] === 'file' ? 'Files' : 'Other'
  }));

  assert.deepEqual(groups.map((group) => group.id), ['file', 'view']);
  assert.deepEqual(groups[0]?.entries.map((entry) => entry.id), ['open', 'close']);
  assert.equal(groups[0].label, 'Files');
});

void test('paletteStatus distinguishes loading error empty and idle async states', () => {
  assert.equal(paletteStatus({ status: 'loading', entries }), 'loading');
  assert.equal(paletteStatus({ status: 'error', entries, message: 'Network failed' }), 'error');
  assert.equal(paletteStatus({ status: 'idle', entries: [] }), 'empty');
  assert.equal(paletteStatus({ status: 'idle', entries }), 'idle');
});
