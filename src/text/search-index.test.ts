import assert from 'node:assert/strict';
import test from 'node:test';

import {
  findPreparedTextMatches,
  prepareTextSearchIndex,
  prepareTextSearchQuery
} from './search-index.ts';

void test('prepared text search preserves grapheme boundaries and normalization', () => {
  const index = prepareTextSearchIndex('Cafe\u0301 CAFÉ 👨‍👩‍👧‍👦 café', {
    accentSensitive: false,
    caseSensitive: false
  });

  assert.deepEqual(findPreparedTextMatches(
    index,
    prepareTextSearchQuery('café', { accentSensitive: false, caseSensitive: false })
  ), [
    { startGraphemeIndex: 0, endGraphemeIndexExclusive: 4 },
    { startGraphemeIndex: 5, endGraphemeIndexExclusive: 9 },
    { startGraphemeIndex: 12, endGraphemeIndexExclusive: 16 }
  ]);
  assert.deepEqual(findPreparedTextMatches(index, prepareTextSearchQuery('👨')), []);
});

void test('prepared text search emits non-overlapping ordered matches', () => {
  const index = prepareTextSearchIndex('aaaaa');

  assert.deepEqual(findPreparedTextMatches(index, prepareTextSearchQuery('aa')), [
    { startGraphemeIndex: 0, endGraphemeIndexExclusive: 2 },
    { startGraphemeIndex: 2, endGraphemeIndexExclusive: 4 }
  ]);
});
