import assert from 'node:assert/strict';
import test from 'node:test';
import {
  searchPickerIndexStatistics,
  prepareSearchPickerQuery,
  matchingSearchPickerQuery,
  createSearchPickerIndex,
  querySearchPickerIndex,
  searchPickerEntryById,
} from './search-picker-index.ts';

void test('searchPicker indexes snapshot entries and retain ranked query work', () => {
  const source = [
    { id: 'open', label: 'Open file', value: 'open', keywords: ['file'] },
    { id: 'close', label: 'Close file', value: 'close', keywords: ['file'] },
    { id: 'theme', label: 'Change theme', value: 'theme', keywords: ['view'] }
  ];
  const index = createSearchPickerIndex(source);
  const query = { text: 'file', mode: 'fuzzy' } as const;
  const first = querySearchPickerIndex(index, query);

  source.splice(0, source.length, { id: 'mutated', label: 'Mutated', value: 'mutated', keywords: [] });
  const retained = querySearchPickerIndex(index, query);

  assert.equal(retained, first);
  assert.deepEqual(retained.entries.map((entry) => entry.id), ['open', 'close']);
  assert.deepEqual(searchPickerIndexStatistics(index), {
    entries: 3,
    cachedQueries: 1,
    retainedQueryBytes: searchPickerIndexStatistics(index).retainedQueryBytes,
    queryCacheByteLimit: 256 * 1024,
    queryEvaluations: 1,
    candidateEvaluations: 3
  });
});

void test('searchPicker indexes reject ambiguous entry identity', () => {
  assert.throws(
    () => createSearchPickerIndex([
      { id: 'same', label: 'One', value: 1 },
      { id: 'same', label: 'Two', value: 2 }
    ]),
    /must be unique/u
  );
});

void test('searchPicker indexes retain stable-id lookup and mapped source identity', () => {
  const source = [
    { key: 'open', title: 'Open file' },
    { key: 'close', title: 'Close file' },
  ];
  const toEntry = (entry: typeof source[number]) => ({
    id: entry.key,
    label: entry.title,
    value: entry,
  });
  const first = createSearchPickerIndex(source, toEntry);
  const retained = createSearchPickerIndex(source, toEntry);

  assert.equal(retained, first);
  assert.equal(searchPickerEntryById(first, 'close')?.value, source[1]);
  assert.equal(searchPickerEntryById(first, 'missing'), undefined);
  assert.deepEqual(querySearchPickerIndex(first, { text: 'open', mode: 'fuzzy' }).entries, [
    searchPickerEntryById(first, 'open'),
  ]);
});

void test('cooperative picker queries match synchronous stable ranking and yield through every large stage', async () => {
  const entries = Array.from({ length: 4096 }, (_, i) => ({
    id: String(i), label: `${'x'.repeat(i % 9)}needle ${String(i)}`, value: i, disabled: i % 13 === 0,
  }));
  const index = createSearchPickerIndex(entries);
  let yields = 0;
  const result = await prepareSearchPickerQuery(index, { text: 'needle', mode: 'contains' }, {
    signal: new AbortController().signal,
    yield: () => { yields += 1; return Promise.resolve(); },
  });
  const other = createSearchPickerIndex([...entries]);
  assert.deepEqual(result.matches, querySearchPickerIndex(other, { text: 'needle', mode: 'contains' }).matches);
  assert.deepEqual(result.entries, querySearchPickerIndex(other, { text: 'needle', mode: 'contains' }).entries);
  assert.ok(yields > 4096 / 256 * 3, 'scan, merge sort, projection and navigation index must cooperate');
  assert.notEqual(querySearchPickerIndex(index, { text: 'needle', mode: 'contains' }), result, 'oversized broad results remain usable but are not cached');
});

void test('aborted scan, sort and projection never publish a partial picker result', async () => {
  const entries = Array.from({ length: 2048 }, (_, i) => ({
    id: String(i), label: `${'x'.repeat(i % 5)}needle`, value: i,
  }));
  for (const abortAt of [1, 12, 98]) {
    const index = createSearchPickerIndex([...entries]);
    const controller = new AbortController();
    let yields = 0;
    await assert.rejects(prepareSearchPickerQuery(index, { text: 'needle', mode: 'contains' }, {
      signal: controller.signal,
      yield: () => {
        yields += 1;
        if (yields === abortAt) controller.abort(new Error('superseded'));
        return Promise.resolve();
      },
    }), /superseded/u);
    assert.equal(yields, abortAt);
    assert.equal(searchPickerIndexStatistics(index).cachedQueries, 0);
    const newest = await prepareSearchPickerQuery(index, { text: 'missing' }, {
      signal: new AbortController().signal, yield: () => Promise.resolve(),
    });
    assert.equal(newest.entries.length, 0);
  }
});

void test('prepared picker results reject a changed query or source without evaluating it', async () => {
  const index = createSearchPickerIndex([{ id: 'a', label: 'alpha', value: 'a' }]);
  const result = await prepareSearchPickerQuery(index, { text: 'alpha' }, {
    signal: new AbortController().signal, yield: () => Promise.resolve(),
  });
  assert.equal(matchingSearchPickerQuery(index, { text: 'alpha' }, result), result);
  assert.equal(matchingSearchPickerQuery(index, { text: 'beta' }, result), undefined);
  assert.equal(matchingSearchPickerQuery(createSearchPickerIndex([]), { text: 'alpha' }, result), undefined);
  assert.equal(searchPickerIndexStatistics(index).queryEvaluations, 1);
  const controller = new AbortController();
  controller.abort(new Error('disposed'));
  await assert.rejects(prepareSearchPickerQuery(index, { text: 'alpha' }, {
    signal: controller.signal, yield: () => Promise.resolve(),
  }), /disposed/u);
});

void test('picker cache charges query text, ranges and navigation, and skips individually oversized results', () => {
  const index = createSearchPickerIndex(Array.from({ length: 4000 }, (_, i) => ({
    id: String(i), label: `a-b-c ${String(i)}`, value: i, disabled: i % 2 === 0,
  })));
  const narrow = querySearchPickerIndex(index, { text: '3999', mode: 'contains' });
  const before = searchPickerIndexStatistics(index);
  const huge = { text: 'missing'.repeat(50_000), mode: 'contains' } as const;
  assert.equal(querySearchPickerIndex(index, huge).entries.length, 0);
  assert.equal(searchPickerIndexStatistics(index).cachedQueries, before.cachedQueries);
  assert.equal(searchPickerIndexStatistics(index).retainedQueryBytes, before.retainedQueryBytes);
  const broad = querySearchPickerIndex(index, { text: 'ac', mode: 'fuzzy' });
  assert.equal(broad.entries.length, 4000);
  assert.equal(broad.matches[0]?.ranges.length, 2);
  assert.equal(querySearchPickerIndex(index, { text: '3999', mode: 'contains' }), narrow);
  for (let i = 0; i < 24; i += 1) querySearchPickerIndex(index, { text: `absent ${String(i)}` });
  const final = searchPickerIndexStatistics(index);
  assert.equal(final.cachedQueries, 8);
  assert.ok(final.retainedQueryBytes <= final.queryCacheByteLimit);
  assert.equal(broad.entries[0]?.id, '0', 'caller-owned evicted results remain complete');
});

void test('empty picker queries reuse source order and navigation without scanning or match allocation', () => {
  const index = createSearchPickerIndex([
    { id: 'a', label: 'alpha', value: 1 },
    { id: 'b', label: 'beta', value: 2, disabled: true },
    { id: 'c', label: 'gamma', value: 3 },
  ]);
  const first = querySearchPickerIndex(index, { text: '', mode: 'exact' });
  const second = querySearchPickerIndex(index, { text: '   ', mode: 'fuzzy' });
  assert.equal(first.entries, second.entries);
  assert.equal(first.interactionIndex, second.interactionIndex);
  assert.deepEqual(first.matches, []);
  assert.equal(searchPickerIndexStatistics(index).candidateEvaluations, 0);
});
