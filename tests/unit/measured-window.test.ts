import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendMeasuredItems,
  measuredAnchorAt,
  measuredCollectionItemById,
  measuredWindow,
  prependMeasuredItems,
  createMeasuredCollection,
  removeMeasuredItems,
  replaceMeasuredItem
} from '../../dist/collection/index.js';
import type { MeasuredCollectionItem } from '../../dist/collection/index.js';

const items: readonly [
  MeasuredCollectionItem<string>,
  MeasuredCollectionItem<string>,
  MeasuredCollectionItem<string>
] = [
  { id: 'one', value: 'one', rows: 2 },
  { id: 'two', value: 'two', rows: 4 },
  { id: 'three', value: 'three', rows: 1 }
];

void test('measuredWindow queries terminal rows from a retained collection', () => {
  const collection = createMeasuredCollection(items);
  const window = measuredWindow(collection, { viewportRows: 3, offsetRow: 1 });

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

void test('active reveal preserves an already-visible oversized item', () => {
  const collection = createMeasuredCollection(items);
  const fitting = measuredWindow(collection, { viewportRows: 5, activeId: 'three' });
  const oversized = measuredWindow(collection, {
    viewportRows: 3,
    offsetRow: 3,
    activeId: 'two'
  });

  assert.equal(fitting.offsetRow, 2);
  assert.equal(fitting.entries.at(-1)?.item.id, 'three');
  assert.equal(oversized.offsetRow, 3);
  assert.deepEqual(oversized.entries.map((entry) => entry.item.id), ['two']);
  assert.equal(oversized.entries[0]?.visibleRows, 3);
});

void test('append and prepend return persistent collection versions', () => {
  const initial = createMeasuredCollection(items.slice(0, 2));
  const appended = appendMeasuredItems(initial, [items[2]]);
  const prepended = prependMeasuredItems(appended, [
    { id: 'zero', value: 'zero', rows: 3 }
  ]);

  assert.equal(initial.itemCount, 2);
  assert.equal(initial.totalRows, 6);
  assert.equal(measuredCollectionItemById(initial, 'three'), undefined);
  assert.equal(appended.itemCount, 3);
  assert.equal(appended.totalRows, 7);
  assert.equal(measuredCollectionItemById(appended, 'three')?.value, 'three');
  assert.deepEqual(
    measuredWindow(prepended, { viewportRows: 20 }).entries.map((entry) => entry.item.id),
    ['zero', 'one', 'two', 'three']
  );
  assert.equal(appendMeasuredItems(initial, []), initial);
  assert.equal(prependMeasuredItems(initial, []), initial);
});

void test('collection construction owns membership and measurement metadata without traversing values', () => {
  const value = { mutableApplicationState: 1 };
  const suppliedItem = { id: 'owned', value, rows: 2 };
  const supplied = [suppliedItem];
  const collection = createMeasuredCollection(supplied);

  suppliedItem.rows = 8;
  supplied.push({ id: 'later', value, rows: 1 });

  const retained = measuredCollectionItemById(collection, 'owned');
  assert.ok(retained);
  assert.equal(collection.itemCount, 1);
  assert.equal(collection.totalRows, 2);
  assert.equal(retained.rows, 2);
  assert.equal(retained.value, value);
  assert.equal(Object.isFrozen(retained), true);
});

void test('replace and remove preserve old versions and elide semantic no-ops', () => {
  const initial = createMeasuredCollection(items);
  const unchanged = replaceMeasuredItem(initial, items[1]);
  const replaced = replaceMeasuredItem(initial, { id: 'two', value: 'changed', rows: 2 });
  const removed = removeMeasuredItems(replaced, ['one', 'missing', 'one']);

  assert.equal(unchanged, initial);
  assert.equal(initial.totalRows, 7);
  assert.equal(replaced.totalRows, 5);
  assert.equal(measuredCollectionItemById(initial, 'two')?.value, 'two');
  assert.equal(measuredCollectionItemById(replaced, 'two')?.value, 'changed');
  assert.deepEqual(
    measuredWindow(removed, { viewportRows: 20 }).entries.map((entry) => entry.item.id),
    ['two', 'three']
  );
});

void test('an item anchor preserves its viewport row when preceding rows change', () => {
  const initial = createMeasuredCollection(items);
  const anchor = measuredAnchorAt(initial, { offsetRow: 3, viewportRow: 1 });
  assert.ok(anchor);
  const expanded = replaceMeasuredItem(initial, { id: 'one', value: 'one', rows: 5 });
  const window = measuredWindow(expanded, {
    viewportRows: 3,
    offsetRow: 3,
    anchor
  });

  assert.deepEqual(anchor, { itemId: 'two', rowWithinItem: 2, viewportRow: 1 });
  assert.equal(window.offsetRow, 6);
  const firstEntry = window.entries[0];
  assert.ok(firstEntry);
  assert.equal(firstEntry.item.id, 'two');
  assert.equal(firstEntry.clippedRowsBefore, 1);
});

void test('anchors clamp after shrink, fall back after removal, and yield to active reveal', () => {
  const initial = createMeasuredCollection(items);
  const anchor = { itemId: 'two', rowWithinItem: 3, viewportRow: 1 } as const;
  const shrunk = replaceMeasuredItem(initial, { id: 'two', value: 'two', rows: 1 });
  const removed = removeMeasuredItems(shrunk, ['two']);

  assert.equal(measuredWindow(shrunk, {
    viewportRows: 3,
    offsetRow: 0,
    anchor
  }).offsetRow, 1);
  assert.equal(measuredWindow(removed, {
    viewportRows: 2,
    offsetRow: 1,
    anchor
  }).offsetRow, 1);
  assert.equal(measuredWindow(shrunk, {
    viewportRows: 2,
    offsetRow: 0,
    anchor,
    activeId: 'three'
  }).offsetRow, 2);
});

void test('retained collections reject malformed data and fabricated handles', () => {
  assert.throws(() => createMeasuredCollection([
    items[0],
    { id: 'one', value: 'duplicate', rows: 1 }
  ]), /item ids must be unique/u);
  assert.throws(
    () => createMeasuredCollection([{ id: 'bad', value: 'bad', rows: 0 }]),
    /positive safe integer/u
  );
  const collection = createMeasuredCollection(items);
  assert.throws(
    () => appendMeasuredItems(collection, [{ id: 'one', value: 'duplicate', rows: 1 }]),
    /item ids must be unique/u
  );
  assert.throws(
    () => replaceMeasuredItem(collection, { id: 'missing', value: 'missing', rows: 1 }),
    /does not contain the replacement item id/u
  );
  assert.throws(
    // @ts-expect-error Runtime nominality rejects fabricated JavaScript handles.
    () => measuredWindow({ kind: 'measured-collection', itemCount: 0, totalRows: 0 }, { viewportRows: 1 }),
    /must be created with createMeasuredCollection/u
  );
});
