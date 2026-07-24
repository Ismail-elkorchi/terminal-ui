import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createScrollState,
  dataWindow,
  prepareListCollection,
  prepareTableCollection,
  prepareTreeRows
} from '../../dist/behavior/index.js';

test('dataWindow keeps selected rows visible and preserves explicit scroll windows', () => {
  assert.deepEqual(
    dataWindow({ totalRows: 100, viewportRows: 5, selectedIndex: 40 }),
    {
      totalRows: 100,
      startIndex: 38,
      endIndexExclusive: 43,
      selectedIndex: 40,
      selectedVisibleIndex: 2,
      offsetColumn: 0,
      omittedBefore: 38,
      omittedAfter: 57
    }
  );

  assert.deepEqual(
    dataWindow({
      totalRows: 100,
      viewportRows: 5,
      scroll: createScrollState({
        offsetRow: 10,
        offsetColumn: 3,
        contentRows: 100,
        contentColumns: 20,
        viewportRows: 5,
        viewportColumns: 8
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
    () => prepareListCollection(['same', 'same'], (item) => ({ id: item, label: item })),
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
