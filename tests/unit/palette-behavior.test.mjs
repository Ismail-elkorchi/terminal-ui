import assert from 'node:assert/strict';
import test from 'node:test';

import {
  groupPaletteEntries,
  paletteReducer,
  paletteStatus
} from '../../dist/widgets/index.js';

const entries = [
  { id: 'open', label: 'Open file', value: 'open', keywords: ['file'] },
  { id: 'close', label: 'Close file', value: 'close', keywords: ['file'] },
  { id: 'theme', label: 'Change theme', value: 'theme', keywords: ['view'] }
];

test('paletteReducer owns query selection preview and multi-select state', () => {
  const initial = { query: '', selectedIndex: 0, selectedIds: [] };
  const queried = paletteReducer(initial, { kind: 'setQuery', query: 'file' });
  const moved = paletteReducer(queried, { kind: 'moveSelection', delta: -1, entryCount: 3 });
  const selected = paletteReducer(moved, { kind: 'toggleSelected', id: 'close' });
  const preview = paletteReducer(selected, { kind: 'preview', id: 'close' });
  const cleared = paletteReducer(preview, { kind: 'clearSelected' });

  assert.deepEqual(queried, { query: 'file', selectedIndex: 0, selectedIds: [] });
  assert.equal(moved.selectedIndex, 2);
  assert.deepEqual(selected.selectedIds, ['close']);
  assert.equal(preview.previewId, 'close');
  assert.deepEqual(cleared.selectedIds, []);
});

test('groupPaletteEntries preserves first-seen group order', () => {
  const groups = groupPaletteEntries(entries, (entry) => ({
    id: entry.keywords?.[0] ?? 'general',
    label: entry.keywords?.[0] === 'file' ? 'Files' : 'Other'
  }));

  assert.deepEqual(groups.map((group) => group.id), ['file', 'view']);
  assert.deepEqual(groups[0]?.entries.map((entry) => entry.id), ['open', 'close']);
  assert.equal(groups[0]?.label, 'Files');
});

test('paletteStatus distinguishes loading error empty and idle async states', () => {
  assert.equal(paletteStatus({ status: 'loading', entries }), 'loading');
  assert.equal(paletteStatus({ status: 'error', entries, message: 'Network failed' }), 'error');
  assert.equal(paletteStatus({ status: 'idle', entries: [] }), 'empty');
  assert.equal(paletteStatus({ status: 'idle', entries }), 'idle');
});
