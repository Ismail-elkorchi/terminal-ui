import assert from 'node:assert/strict';
import test from 'node:test';

import {
  completeCollection,
  createScrollState,
  dataWindow,
  isCollectionProjection,
  prepareListboxCollection,
  prepareTableCollection,
  prepareTreeRows,
  windowedCollection
} from '../../dist/behavior/index.js';

test('dataWindow centers an initial active row and preserves explicit scroll windows', () => {
  assert.deepEqual(
    dataWindow({ totalRows: 100, viewportRows: 5, activeIndex: 40 }),
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
    dataWindow({
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

test('prepared collections reject ambiguous identity and invalid global windows', () => {
  assert.throws(
    () => prepareListboxCollection(['same', 'same'], (item) => ({ id: item, label: item })),
    /must be unique/u
  );
  assert.throws(
    () => prepareTableCollection([{ id: 'one' }, { id: 'two' }], () => 'same'),
    /must be unique/u
  );
  assert.throws(
    () => prepareTreeRows([{ node: { id: 'one', label: 'One', kind: 'leaf' }, depth: 0, path: ['one'] }], {
      startIndex: 2,
      totalCount: 2,
      domain: { kind: 'source' }
    }),
    /must fit inside/u
  );
});

test('collection predicates recognize only complete and windowed factory projections', () => {
  const complete = completeCollection([{ id: 'one', itemIndex: 0 }]);
  const windowed = windowedCollection({
    records: [{ id: 'two', itemIndex: 2 }],
    window: { startIndex: 2, totalCount: 4, domain: { kind: 'source' } }
  });
  assert.equal(isCollectionProjection(complete), true);
  assert.equal(isCollectionProjection(windowed), true);

  assert.equal(isCollectionProjection({ ...complete }), false);
  assert.equal(isCollectionProjection(Object.fromEntries(
    Reflect.ownKeys(complete).map((key) => [key, complete[key]])
  )), false);
  assert.equal(isCollectionProjection({
    kind: 'complete',
    records: complete.records,
    startIndex: 0,
    totalCount: 1,
  }), false);
});
