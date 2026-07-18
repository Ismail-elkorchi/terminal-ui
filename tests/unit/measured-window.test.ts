import assert from 'node:assert/strict';
import test from 'node:test';

import { measuredWindow } from '../../dist/behavior/index.js';

const items = [
  { id: 'one', value: 'one', rows: 2 },
  { id: 'two', value: 'two', rows: 4 },
  { id: 'three', value: 'three', rows: 1 }
];

void test('measuredWindow projects terminal rows rather than item counts', () => {
  const window = measuredWindow({ items, viewportRows: 3, offsetRow: 1 });

  assert.equal(window.totalRows, 7);
  assert.equal(window.offsetRow, 1);
  assert.deepEqual(window.entries.map((entry) => ({
    id: entry.item.id,
    rowOffset: entry.rowOffset,
    clippedRowsBefore: entry.clippedRowsBefore,
    visibleRows: entry.visibleRows
  })), [
    { id: 'one', rowOffset: 0, clippedRowsBefore: 1, visibleRows: 1 },
    { id: 'two', rowOffset: 1, clippedRowsBefore: 0, visibleRows: 2 }
  ]);
});

void test('measuredWindow reveals a selected item and anchors oversized items at their start', () => {
  const fitting = measuredWindow({ items, viewportRows: 5, selectedId: 'three' });
  const oversized = measuredWindow({ items, viewportRows: 3, selectedId: 'two' });

  assert.equal(fitting.offsetRow, 2);
  assert.equal(fitting.entries.at(-1)?.item.id, 'three');
  assert.equal(oversized.offsetRow, 2);
  assert.deepEqual(oversized.entries.map((entry) => entry.item.id), ['two']);
  assert.equal(oversized.entries[0]?.visibleRows, 3);
});

void test('measuredWindow rejects duplicate identities', () => {
  const first = items[0];
  assert.ok(first);
  assert.throws(() => measuredWindow({
    items: [first, { id: 'one', value: 'duplicate', rows: 1 }],
    viewportRows: 2
  }), /Duplicate measured item id: one/u);
});
