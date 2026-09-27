import assert from 'node:assert/strict';
import test from 'node:test';
import { createTextSearchIndex, compileTextSearchQuery, findTextMatches, textSearchOffset } from '../../../dist/text/search-index.js';

test('compact matching preserves Unicode offsets and uses linear token comparisons', () => {
  const ascii = createTextSearchIndex('TEXT '.repeat(20_000));
  assert.equal(typeof ascii.graphemes, 'string');
  assert.equal(ascii.offsets, undefined);
  const index = createTextSearchIndex('A e\u0301 👩‍💻 É');
  const matches = findTextMatches(index, compileTextSearchQuery('é'));
  assert.deepEqual(matches.map(match => [textSearchOffset(index, match.startGraphemeIndex),
    textSearchOffset(index, match.endGraphemeIndexExclusive)]), [[2, 4], [11, 12]]);
  assert.deepEqual(findTextMatches(index, compileTextSearchQuery('👩')), []);
  const tokens = Array.from({ length: 50_000 }, () => 'a');
  let reads = 0;
  const counted = new Proxy(tokens, { get(target, key) {
    if (typeof key === 'string' && /^\d+$/u.test(key)) reads += 1;
    return Reflect.get(target, key);
  } });
  assert.deepEqual(findTextMatches({ graphemes: counted }, compileTextSearchQuery(`${'a'.repeat(1000)}b`)), []);
  assert.ok(reads < tokens.length * 4, `token comparisons grew unexpectedly: ${reads}`);
});
