import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createScrollState,
  visibleRowWindow,
  createListboxCollection,
  createTableCollection,
  createTreeCollectionFromRows,
} from '../../dist/behavior/index.js';
import {
  createCompleteCollection,
  createWindowedCollection,
  isCollectionSnapshot,
} from '../../dist/collection/index.js';

test('visibleRowWindow centers an initial active row and preserves explicit scroll windows', () => {
  assert.deepEqual(
    visibleRowWindow({ totalRows: 100, viewportRows: 5, activeIndex: 40 }),
    {
      totalRows: 100,
      startIndex: 38,
      endIndexExclusive: 43,
      activeIndex: 40,
      activeVisibleIndex: 2,
      offsetColumn: 0,
      omittedBefore: 38,
      omittedAfter: 57
    }
  );

  assert.deepEqual(
    visibleRowWindow({
      totalRows: 100,
      viewportRows: 5,
      contentColumns: 20,
      viewportColumns: 8,
      scroll: createScrollState({
        offsetRow: 10,
        offsetColumn: 3
      })
    }),
    {
      totalRows: 100,
      startIndex: 10,
      endIndexExclusive: 15,
      offsetColumn: 3,
      omittedBefore: 10,
      omittedAfter: 85
    }
  );
});

test('retained collections reject ambiguous identity and invalid global windows', () => {
  assert.throws(
    () => createListboxCollection(['same', 'same'], (item) => ({ id: item, label: item })),
    /must be unique/u
  );
  assert.throws(
    () => createTableCollection([{ id: 'one' }, { id: 'two' }], () => 'same'),
    /must be unique/u
  );
  assert.throws(
    () => createTreeCollectionFromRows([{ node: { id: 'one', label: 'One', kind: 'leaf' }, depth: 0, path: ['one'] }], {
      startIndex: 2,
      totalCount: 2,
      scope: { kind: 'source' }
    }),
    /must fit inside/u
  );
});

test('collection predicates recognize only complete and windowed factory snapshots', () => {
  const complete = createCompleteCollection([{ id: 'one', itemIndex: 0 }]);
  const windowed = createWindowedCollection({
    items: [{ id: 'two', itemIndex: 2 }],
    window: { startIndex: 2, totalCount: 4, scope: { kind: 'source' } }
  });
  assert.equal(isCollectionSnapshot(complete), true);
  assert.equal(isCollectionSnapshot(windowed), true);

  assert.equal(isCollectionSnapshot({ ...complete }), false);
  assert.equal(isCollectionSnapshot(Object.fromEntries(
    Reflect.ownKeys(complete).map((key) => [key, complete[key]])
  )), false);
  assert.equal(isCollectionSnapshot({
    kind: 'complete',
    items: complete.items,
    startIndex: 0,
    totalCount: 1,
  }), false);
});
