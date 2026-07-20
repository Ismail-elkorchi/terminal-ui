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
    { startGrapheme: 0, endGrapheme: 4 },
    { startGrapheme: 5, endGrapheme: 9 },
    { startGrapheme: 12, endGrapheme: 16 }
  ]);
  assert.deepEqual(findPreparedTextMatches(index, prepareTextSearchQuery('👨')), []);
});

void test('prepared text search emits non-overlapping ordered matches', () => {
  const index = prepareTextSearchIndex('aaaaa');

  assert.deepEqual(findPreparedTextMatches(index, prepareTextSearchQuery('aa')), [
    { startGrapheme: 0, endGrapheme: 2 },
    { startGrapheme: 2, endGrapheme: 4 }
  ]);
});
