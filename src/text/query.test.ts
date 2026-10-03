import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareWork } from '../foundation/cooperative-work.ts';

import {
  compareCollectionText,
  matchCollectionQuery,
  compileCollectionQuery,
  compileCollectionQueryWork,
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

void test('concurrent compilation admits one canonical query owner without phantom eviction weight', async () => {
  const context = { signal: new AbortController().signal, yield: () => Promise.resolve() };
  for (let i = 0; i < 4; i += 1) {
    const query = { text: `${String(i)}${'é'.repeat(2_100)}`, mode: 'exact' as const };
    const compiled = await Promise.all(Array.from({ length: 4 }, () => prepareWork(compileCollectionQueryWork(query), context)));
    assert.ok(compiled.every(value => value === compiled[0]), 'concurrent compilers must return the admitted owner');
    assert.equal(compileCollectionQuery(query), compiled[0]);
  }
  // Every long query above evicts previous long entries. Replacement accounting
  // errors otherwise leave enough phantom weight to evict even a tiny new owner.
  const request = { text: 'canonical-after-concurrent-evictions', mode: 'exact' as const };
  const compiled = compileCollectionQuery(request);
  assert.equal(compileCollectionQuery(request), compiled);
});

void test('bounded ASCII and general Unicode token representations agree in every mode', () => {
  // NFC maps the Kelvin sign to K, preserving each original UTF-16 offset while
  // forcing an array-of-Unicode-tokens representation instead of compact ASCII.
  for (const text of ['K K', 'KK', 'x_K_x', '', 'K'.repeat(255), 'K'.repeat(2100)]) {
    for (const queryText of ['', 'K', 'KK', 'K K', 'missing', 'k', 'K'.repeat(34)]) {
      for (const mode of ['contains', 'prefix', 'exact', 'fuzzy'] as const) {
        for (const caseSensitive of [false, true]) {
          const query = { text: queryText, mode, caseSensitive };
          const bounded = { id: 'one', primary: text, secondary: ['x K'] };
          const general = { id: 'one', primary: text.replaceAll('K', 'K'), secondary: ['x K'] };
          assert.deepEqual(matchCollectionQuery(bounded, query), matchCollectionQuery(general, query));
        }
      }
    }
  }
});

void test('one charged matcher preserves scores, stable field ties and Unicode offsets in both drivers', async () => {
  const { queryIndexedCandidates, queryIndexedCandidatesWork } = await import('./query.ts');
  const candidates = [
    { id: 'ascii', primary: 'a-b-c', secondary: ['xx abc', 'a-b-c'] },
    { id: 'combining', primary: 'e\u0301clair', secondary: ['éclair'] },
    { id: 'emoji', primary: '👩‍💻_é_👩‍💻', secondary: ['👩‍💻é'] },
    { id: 'tie-first', primary: 'aa', secondary: ['aa'] },
    { id: 'tie-second', primary: 'aa' },
    { id: 'case-expansion', primary: 'İIı', secondary: ['i\u0307Iı'] },
  ].map(indexQueryCandidate);
  for (const mode of ['contains', 'prefix', 'exact', 'fuzzy'] as const) {
    for (const text of ['', 'ac', 'é', '👩‍💻', 'aa', 'İ', 'missing']) {
      for (const caseSensitive of [false, true]) {
        const query = compileCollectionQuery({ text, mode, caseSensitive });
        const expected = queryIndexedCandidates(candidates, query);
        const prepared = await prepareWork(queryIndexedCandidatesWork(candidates, query), {
          signal: new AbortController().signal, operationLimit: 7, yield: () => Promise.resolve(),
        });
        assert.deepEqual(prepared, expected);
        assert.ok(prepared.every(match => Object.isFrozen(match) && Object.isFrozen(match.ranges)));
      }
    }
  }
  const ties = queryIndexedCandidates(candidates, compileCollectionQuery({ text: 'aa', mode: 'exact' }));
  assert.deepEqual(ties.map(match => match.id), ['tie-first', 'tie-second']);
  assert.equal(ties[0]?.ranges[0]?.field, 'primary');
});

void test('long-field matching cancels before publication and simultaneous fuzzy scans have independent state', async () => {
  const { matchCompiledCollectionQueryWork } = await import('./query.ts');
  const candidate = indexQueryCandidate({ id: 'long', primary: `${'a'.repeat(30_000)}b_c`, secondary: ['b-c'] });
  for (const mode of ['contains', 'fuzzy'] as const) {
    const query = compileCollectionQuery({ text: 'bc', mode });
    const controller = new AbortController();
    let published = false;
    function* work(): Generator<number, unknown> {
      const result = yield* matchCompiledCollectionQueryWork(candidate, query);
      published = true;
      return result;
    }
    await assert.rejects(prepareWork(work(), { signal: controller.signal, operationLimit: 256,
      yield: () => { controller.abort(new Error('new query')); return Promise.resolve(); },
    }), /new query/u);
    assert.equal(published, false);
  }
  const requests = ['abc', 'ac', 'bc', 'ab'].map(text => compileCollectionQuery({ text, mode: 'fuzzy' }));
  const values = await Promise.all(requests.map(query => prepareWork(matchCompiledCollectionQueryWork(candidate, query), {
    signal: new AbortController().signal, operationLimit: 73, yield: () => Promise.resolve(),
  })));
  values.forEach((value, index) => {
    const query = requests[index];
    assert.ok(query !== undefined);
    assert.deepEqual(value, matchCompiledCollectionQuery(candidate, query));
  });
});

void test('contains materializes one final span per winner without temporary position arrays', async () => {
  const { queryIndexedCandidates } = await import('./query.ts');
  const candidates = Array.from({ length: 2_000 }, (_, i) => indexQueryCandidate({
    id: String(i), primary: 'xx needle', secondary: ['x needle'],
  }));
  const query = compileCollectionQuery({ text: 'needle', mode: 'contains', caseSensitive: true });
  const original = Array.from;
  let positionArrays = 0;
  Array.from = ((...args: Parameters<typeof Array.from>) => {
    positionArrays += 1;
    return Reflect.apply(original, Array, args);
  }) as typeof Array.from;
  try {
    const matches = queryIndexedCandidates(candidates, query);
    assert.equal(matches.length, 2_000);
    assert.ok(matches.every(match => match.score === 598 && match.ranges.length === 1
      && match.ranges[0]?.field === 'secondary' && match.ranges[0].start === 2 && match.ranges[0].end === 8));
    assert.equal(positionArrays, 0, 'matching must not materialize per-character index arrays');
  } finally { Array.from = original; }
});

void test('domain field adapters reuse raw offsets and one folded index without changing primary highlights', async () => {
  const { finishWork } = await import('../foundation/cooperative-work.ts');
  const { matchCompiledCollectionQueryFieldWork, queryFieldSearchIndexWork } = await import('./query.ts');
  const candidate = indexQueryCandidate({ id: 'entry', primary: 'XX e\u0301clair', secondary: ['Éclair'] });
  const query = compileCollectionQuery({ text: 'é', mode: 'contains' });
  assert.equal(matchCompiledCollectionQuery(candidate, query)?.ranges[0]?.field, 'secondary');
  assert.deepEqual(finishWork(matchCompiledCollectionQueryFieldWork(candidate, query, 0))?.ranges,
    [{ field: 'primary', fieldIndex: 0, start: 3, end: 5 }]);
  const raw = finishWork(queryFieldSearchIndexWork(candidate, 0, true));
  const folded = finishWork(queryFieldSearchIndexWork(candidate, 0, false));
  assert.equal(folded.offsets, raw.offsets);
  assert.equal(folded, finishWork(queryFieldSearchIndexWork(candidate, 0, false)));
  assert.throws(() => { finishWork(queryFieldSearchIndexWork(candidate, 9, false)); }, /out of range/u);
  assert.throws(() => { finishWork(matchCompiledCollectionQueryFieldWork(candidate, query, -1)); }, /out of range/u);
});

void test('bounded candidate scans batch checkpoints without losing cold or cached field charges', async () => {
  const { queryIndexedCandidatesWork } = await import('./query.ts');
  const field = 'short ASCII field';
  const candidates = Array.from({ length: 2_000 }, (_, i) => indexQueryCandidate({
    id: String(i), primary: field, secondary: [field, field, field, field],
  }));
  const query = compileCollectionQuery({ text: 'missing', mode: 'contains' });
  const scannedUnits = candidates.length * 5 * field.length;
  for (const expectedUnits of [scannedUnits * 2, scannedUnits]) {
    const work = queryIndexedCandidatesWork(candidates, query);
    let checkpoints = 0;
    let charged = 0;
    let step = work.next();
    while (!step.done) {
      checkpoints += 1;
      charged += step.value;
      step = work.next();
    }
    assert.deepEqual(step.value, []);
    assert.ok(charged >= expectedUnits, 'charge every visited character, including first-use folding');
    assert.ok(checkpoints < candidates.length, 'short fields and records must share bounded checkpoints');
  }
});

void test('one record with many bounded fields remains interruptible and closes its producer', async () => {
  const { queryIndexedCandidatesWork } = await import('./query.ts');
  const field = 'x'.repeat(40);
  const candidate = indexQueryCandidate({ id: 'many-fields', primary: field, secondary: Array<string>(4_096).fill(field) });
  const query = compileCollectionQuery({ text: 'missing', mode: 'contains', caseSensitive: true });
  const work = queryIndexedCandidatesWork([candidate], query);
  const first = work.next();
  assert.equal(first.done, false);
  assert.ok(typeof first.value === 'number' && first.value >= 256 && first.value < 512,
    'the first checkpoint must bound field traversal rather than finish the entire record');
  work.return([]);
  const controller = new AbortController();
  let closed = false;
  let published = false;
  function* candidates(): Generator<typeof candidate> {
    try { yield candidate; }
    finally { closed = true; }
  }
  function* prepare(): Generator<number, unknown> {
    const result = yield* queryIndexedCandidatesWork(candidates(), query);
    published = true;
    return result;
  }
  await assert.rejects(prepareWork(prepare(), { signal: controller.signal, operationLimit: 1,
    yield: () => { controller.abort(new Error('field scan superseded')); return Promise.resolve(); },
  }), /field scan superseded/u);
  assert.equal(closed, true);
  assert.equal(published, false);
});

void test('a suspended fold resumes safely when a synchronous reader admits its cached field', async () => {
  const { queryIndexedCandidates, queryIndexedCandidatesWork } = await import('./query.ts');
  const candidates = [
    indexQueryCandidate({ id: 'unicode', primary: `${'É'.repeat(600)}_X_Y`, secondary: ['X_Y'] }),
    indexQueryCandidate({ id: 'ascii', primary: 'xx X_Y', secondary: ['x-y'] }),
  ];
  const query = compileCollectionQuery({ text: 'xy', mode: 'fuzzy' });
  const work = queryIndexedCandidatesWork(candidates, query);
  assert.equal(work.next().done, false);
  const expected = queryIndexedCandidates(candidates, query);
  let step = work.next();
  while (!step.done) step = work.next();
  assert.deepEqual(step.value, expected);
  assert.deepEqual(step.value.map(match => match.id), ['unicode', 'ascii']);
});

void test('compact ASCII folds promote in place to one stable domain index during interleaving', async () => {
  const { finishWork } = await import('../foundation/cooperative-work.ts');
  const { queryFieldSearchIndexWork } = await import('./query.ts');
  const candidate = indexQueryCandidate({ id: 'compact', primary: 'XX NEEDLE', secondary: ['needle'] });
  const query = compileCollectionQuery({ text: 'needle', mode: 'contains' });
  const adapter = queryFieldSearchIndexWork(candidate, 0, false);
  assert.equal(adapter.next().done, false);
  const expected = matchCompiledCollectionQuery(candidate, query);
  let step = adapter.next();
  while (!step.done) step = adapter.next();
  const folded = step.value;
  assert.equal(folded.graphemes, 'xx needle');
  assert.ok(Object.isFrozen(folded));
  assert.equal(folded, finishWork(queryFieldSearchIndexWork(candidate, 0, false)));
  assert.deepEqual(matchCompiledCollectionQuery(candidate, query), expected);
  assert.equal(finishWork(queryFieldSearchIndexWork(candidate, 0, true)).graphemes, 'XX NEEDLE');
});

void test('impossible token lengths reject raw fields without unnecessary case folding', (context) => {
  const candidate = indexQueryCandidate({ id: 'short', primary: 'ABC', secondary: ['ÉÉ', 'İ'] });
  const queries = (['contains', 'prefix', 'exact', 'fuzzy'] as const)
    .map(mode => compileCollectionQuery({ text: 'long needle', mode }));
  const lowercase = context.mock.method(String.prototype, 'toLowerCase');
  for (const query of queries) assert.equal(matchCompiledCollectionQuery(candidate, query), undefined);
  assert.equal(lowercase.mock.callCount(), 0);
});
