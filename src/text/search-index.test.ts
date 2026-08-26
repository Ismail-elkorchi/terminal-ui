import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findTextMatches,
  createTextSearchIndex,
  compileTextSearchQuery
} from './search-index.ts';

void test('indexed text search preserves grapheme boundaries and normalization', () => {
  const index = createTextSearchIndex('Cafe\u0301 CAFÉ 👨‍👩‍👧‍👦 café', {
    accentSensitive: false,
    caseSensitive: false
  });

  assert.deepEqual(findTextMatches(
    index,
    compileTextSearchQuery('café', { accentSensitive: false, caseSensitive: false })
  ), [
    { startGraphemeIndex: 0, endGraphemeIndexExclusive: 4 },
    { startGraphemeIndex: 5, endGraphemeIndexExclusive: 9 },
    { startGraphemeIndex: 12, endGraphemeIndexExclusive: 16 }
  ]);
  assert.deepEqual(findTextMatches(index, compileTextSearchQuery('👨')), []);
});

void test('indexed text search emits non-overlapping ordered matches', () => {
  const index = createTextSearchIndex('aaaaa');

  assert.deepEqual(findTextMatches(index, compileTextSearchQuery('aa')), [
    { startGraphemeIndex: 0, endGraphemeIndexExclusive: 2 },
    { startGraphemeIndex: 2, endGraphemeIndexExclusive: 4 }
  ]);
});
