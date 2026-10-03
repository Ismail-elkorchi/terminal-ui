import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareWork } from '../foundation/cooperative-work.ts';

import { findTextMatches, createTextSearchIndex, createTextSearchIndexWork, compileTextSearchQuery, textSearchOffset } from './search-index.ts';

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

void test('bounded ASCII construction charges one native unit and preserves normalization and offsets', () => {
  for (const text of ['', 'ASCII I TEST', 'X'.repeat(2048)]) {
    for (const options of [{}, { caseSensitive: true }, { caseSensitive: false, locale: 'tr' }, { accentSensitive: false }]) {
      const work = createTextSearchIndexWork(text, options);
      const checkpoint = work.next();
      assert.equal(checkpoint.done, false);
      assert.equal(checkpoint.value, text.length * 2);
      const completed = work.next();
      assert.equal(completed.done, true);
      const expected = options.caseSensitive === true ? text
        : options.locale === undefined ? text.toLowerCase() : text.toLocaleLowerCase(options.locale);
      assert.equal(completed.value.graphemes, expected);
      assert.equal(textSearchOffset(completed.value, text.length), text.length);
      assert.equal(Object.isFrozen(completed.value), true);
    }
  }
  const lines = createTextSearchIndex('a\r\nb');
  assert.deepEqual(lines.graphemes, ['a', '\r\n', 'b']);
  assert.deepEqual(Array.from(lines.offsets ?? []), [0, 1, 3, 4]);
});

void test('long ASCII still checkpoints its scan and cancellation never returns a partial index', async () => {
  const first = createTextSearchIndexWork('X'.repeat(8192));
  assert.deepEqual(first.next(), { done: false, value: 256 });
  first.return(undefined as never);
  for (const text of ['X'.repeat(2048), 'X'.repeat(8192)]) {
    const controller = new AbortController();
    let turns = 0;
    await assert.rejects(prepareWork(createTextSearchIndexWork(text), {
      signal: controller.signal, operationLimit: 256,
      yield: () => { turns++; controller.abort(new Error('obsolete source')); return Promise.resolve(); },
    }), /obsolete source/u);
    assert.equal(turns, 1);
  }
});
