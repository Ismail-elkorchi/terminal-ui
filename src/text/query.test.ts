import assert from 'node:assert/strict';
import test from 'node:test';

import {
  compareCollectionText,
  matchCollectionQuery,
  compileCollectionQuery,
  indexQueryCandidate,
  matchCompiledCollectionQuery,
} from '../text/query.ts';

void test('collection query matching returns exact grapheme-aligned fuzzy ranges', () => {
  assert.deepEqual(matchCollectionQuery(
    { id: 'item', primary: 'a-b-c' },
    { text: 'ac', mode: 'fuzzy' },
  )?.ranges, [
    { field: 'primary', fieldIndex: 0, start: 0, end: 1 },
    { field: 'primary', fieldIndex: 0, start: 4, end: 5 },
  ]);

  assert.deepEqual(matchCollectionQuery(
    { id: 'combining', primary: 'e\u0301clair' },
    { text: '\u00e9', mode: 'prefix' },
  )?.ranges, [
    { field: 'primary', fieldIndex: 0, start: 0, end: 2 },
  ]);

  assert.deepEqual(matchCollectionQuery(
    { id: 'emoji', primary: '👩‍💻 work' },
    { text: '👩‍💻', mode: 'prefix' },
  )?.ranges, [
    { field: 'primary', fieldIndex: 0, start: 0, end: 5 },
  ]);
});

void test('default case folding and ordering are locale independent', () => {
  assert.notEqual(matchCollectionQuery({ id: 'ascii-i', primary: 'I' }, { text: 'i', mode: 'exact' }), undefined);
  assert.equal(matchCollectionQuery({ id: 'dotted-i', primary: 'İ' }, { text: 'i', mode: 'exact' }), undefined);
  assert.equal(matchCollectionQuery({ id: 'dotless-i', primary: 'ı' }, { text: 'i', mode: 'exact' }), undefined);
  assert.equal(compareCollectionText('z', 'ä'), -1);
  assert.equal(compareCollectionText('same', 'same'), 0);
});

void test('compiled collection queries are retained and nominally proved', () => {
  const query = compileCollectionQuery({ text: 'open', mode: 'contains' });
  const candidate = indexQueryCandidate({ id: 'open', primary: 'Open file' });
  assert.equal(compileCollectionQuery(query), query);
  assert.notEqual(matchCompiledCollectionQuery(candidate, query), undefined);
  assert.throws(
    () => matchCompiledCollectionQuery({ ...candidate }, query),
    /indexQueryCandidate/u,
  );
});
