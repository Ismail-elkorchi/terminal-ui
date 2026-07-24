import assert from 'node:assert/strict';
import test from 'node:test';
import { paginationWindow } from '../../dist/behavior/index.js';

test('paginationWindow bounds pages and returns visible offsets', () => {
  assert.deepEqual(
    paginationWindow({ pageNumber: 99, pageSize: 10, totalCount: 24 }),
    { pageNumber: 3, pageCount: 3, startIndex: 20, endIndexExclusive: 24 }
  );
  assert.deepEqual(
    paginationWindow({ pageSize: 10, totalCount: 0 }),
    { pageNumber: 1, pageCount: 1, startIndex: 0, endIndexExclusive: 0 }
  );
});
