import assert from 'node:assert/strict';
import test from 'node:test';
import { paginationWindow } from '../../dist/behavior/index.js';

test('paginationWindow bounds pages and returns visible offsets', () => {
  assert.deepEqual(
    paginationWindow({ page: 99, pageSize: 10, total: 24 }),
    { page: 3, pageCount: 3, start: 20, end: 24 }
  );
});
