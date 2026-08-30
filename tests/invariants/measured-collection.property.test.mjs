import assert from 'node:assert/strict';
import test from 'node:test';

import {
  appendMeasuredItems,
  measuredCollectionItemById,
  measuredWindow,
  prependMeasuredItems,
  createMeasuredCollection,
  removeMeasuredItems,
  replaceMeasuredItem
} from '../../dist/collection/index.js';

test('persistent measured collections agree with a flat reference model', () => {
  for (const seed of [0x5eedc0de, 0x10203040, 0x89abcdef, 0x76543210, 0xf00dcafe]) {
    assertPersistentScenario(seed);
  }
});

function assertPersistentScenario(seed) {
  const random = deterministicRandom(seed);
  let nextId = 0;
  let reference = Array.from({ length: 40 }, () => newItem());
  let collection = createMeasuredCollection(reference);
  const retainedVersions = [];

  for (let operation = 0; operation < 800; operation += 1) {
    const kind = Math.floor(random() * 4);
    if (kind === 0 || reference.length === 0) {
      const added = Array.from({ length: 1 + Math.floor(random() * 3) }, () => newItem());
      collection = appendMeasuredItems(collection, added);
      reference = [...reference, ...added];
    } else if (kind === 1) {
      const added = Array.from({ length: 1 + Math.floor(random() * 3) }, () => newItem());
      collection = prependMeasuredItems(collection, added);
      reference = [...added, ...reference];
    } else if (kind === 2) {
      const index = Math.floor(random() * reference.length);
      const current = reference[index];
      assert.ok(current);
      const replacement = {
        id: current.id,
        value: `${current.id}:revision-${String(operation)}`,
        rows: 1 + Math.floor(random() * 8)
      };
      collection = replaceMeasuredItem(collection, replacement);
      reference = reference.with(index, replacement);
    } else {
      const firstIndex = Math.floor(random() * reference.length);
      const secondIndex = Math.floor(random() * reference.length);
      const removedIds = [reference[firstIndex]?.id, reference[secondIndex]?.id]
        .filter((id) => id !== undefined);
      collection = removeMeasuredItems(collection, removedIds);
      const removed = new Set(removedIds);
      reference = reference.filter((item) => !removed.has(item.id));
    }

    assertCollection(collection, reference, random);
    if (operation % 75 === 0) retainedVersions.push({ collection, reference });
  }

  for (const retained of retainedVersions) {
    assertCollection(retained.collection, retained.reference, random);
  }

  function newItem() {
    const id = `item-${String(nextId)}`;
    nextId += 1;
    return { id, value: id, rows: 1 + Math.floor(random() * 8) };
  }
}

function assertCollection(collection, items, random) {
  const totalRows = items.reduce((total, item) => total + item.rows, 0);
  assert.equal(collection.itemCount, items.length);
  assert.equal(collection.totalRows, totalRows);

  const sampled = items[Math.floor(random() * items.length)];
  if (sampled !== undefined) {
    assert.deepEqual(measuredCollectionItemById(collection, sampled.id), sampled);
  }

  for (let query = 0; query < 3; query += 1) {
    const viewportRows = Math.floor(random() * 16);
    const offsetRow = Math.floor(random() * (totalRows + 10));
    const actual = measuredWindow(collection, { viewportRows, offsetRow });
    const expected = referenceWindow(items, viewportRows, offsetRow);
    assert.deepEqual({
      offsetRow: actual.offsetRow,
      startIndex: actual.startIndex,
      endIndexExclusive: actual.endIndexExclusive,
      omittedBefore: actual.omittedBefore,
      omittedAfter: actual.omittedAfter,
      entries: actual.entries.map((entry) => ({
        id: entry.item.id,
        itemIndex: entry.itemIndex,
        startRowIndex: entry.startRowIndex,
        endRowIndexExclusive: entry.endRowIndexExclusive,
        rowOffset: entry.rowOffset,
        clippedRowsBefore: entry.clippedRowsBefore,
        visibleRows: entry.visibleRows
      }))
    }, expected);
  }
}

function referenceWindow(items, viewportRows, requestedOffset) {
  const totalRows = items.reduce((total, item) => total + item.rows, 0);
  const offsetRow = Math.min(requestedOffset, Math.max(0, totalRows - viewportRows));
  const viewportEnd = offsetRow + viewportRows;
  const entries = [];
  let startRowIndex = 0;
  for (const [itemIndex, item] of items.entries()) {
    const endRowIndexExclusive = startRowIndex + item.rows;
    if (viewportRows > 0 && startRowIndex < viewportEnd && endRowIndexExclusive > offsetRow) {
      const visibleStart = Math.max(startRowIndex, offsetRow);
      const visibleEnd = Math.min(endRowIndexExclusive, viewportEnd);
      entries.push({
        id: item.id,
        itemIndex,
        startRowIndex,
        endRowIndexExclusive,
        rowOffset: visibleStart - offsetRow,
        clippedRowsBefore: visibleStart - startRowIndex,
        visibleRows: visibleEnd - visibleStart
      });
    }
    startRowIndex = endRowIndexExclusive;
  }
  const startIndex = entries[0]?.itemIndex ?? 0;
  const endIndexExclusive = (entries.at(-1)?.itemIndex ?? -1) + 1;
  return {
    offsetRow,
    startIndex,
    endIndexExclusive,
    omittedBefore: startIndex,
    omittedAfter: Math.max(0, items.length - endIndexExclusive),
    entries
  };
}

function deterministicRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state / 0x1_0000_0000;
  };
}
