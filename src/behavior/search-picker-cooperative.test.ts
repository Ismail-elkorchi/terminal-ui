import assert from 'node:assert/strict';
import test from 'node:test';
import { searchPicker } from '../components/search-picker/definition.ts';
import { renderElementFrame } from '../renderer/index.ts';
import {
  createSearchPickerIndex,
  prepareSearchPickerIndex,
  querySearchPickerIndex,
  searchPickerQueryEntries,
  prepareSearchPickerQuery,
  searchPickerIndexStatistics,
} from './search-picker-index.ts';
import {
  createSearchPickerState,
  searchPickerReducer,
  searchPickerView,
  searchPickerWindow,
} from './search-picker-operations.ts';

void test('pending picker edits and stale results do not evaluate queries or expose stale activation', async () => {
  const index = createSearchPickerIndex(Array.from({ length: 2048 }, (_, i) => ({
    id: String(i), label: `Incident ${String(i)}`, value: i,
  })));
  const initial = createSearchPickerState({ queryResult: null }, index);
  const next = searchPickerReducer(initial, { kind: 'edit', operation: { kind: 'insert', text: 'Incident 1' } }, {
    searchPickerIndex: index, queryResult: null,
  });
  assert.equal(next.editor.input.text, 'Incident 1');
  assert.equal(next.editor.activeId, undefined);
  assert.equal(searchPickerIndexStatistics(index).queryEvaluations, 0);
  const result = await prepareSearchPickerQuery(index, { text: 'Incident 1', mode: 'fuzzy' }, {
    signal: new AbortController().signal, yield: () => Promise.resolve(),
  });
  const newest = searchPickerReducer(next, { kind: 'edit', operation: { kind: 'insert', text: '9' } }, {
    searchPickerIndex: index, queryResult: result,
  });
  const stale = searchPickerWindow({ searchPickerIndex: index, query: { text: newest.editor.input.text, mode: 'fuzzy' }, queryResult: result });
  assert.equal(stale.totalCount, 0);
  assert.equal(stale.activeEntry, undefined);
  assert.equal(searchPickerIndexStatistics(index).queryEvaluations, 1);
  const navigated = searchPickerReducer(newest, { kind: 'moveActive', delta: 1 }, { searchPickerIndex: index, queryResult: result });
  assert.equal(navigated.editor.activeId, undefined);
});

void test('pending picker never performs implicit query work during render preparation', async () => {
  const index = createSearchPickerIndex(Array.from({ length: 4096 }, (_, i) => ({
    id: String(i), label: `Incident ${String(i)}`, value: i,
  })));
  const state = createSearchPickerState({ query: { text: 'Incident' }, queryResult: null }, index);
  const element = searchPicker({ id: 'picker', title: 'Search', searchPickerIndex: index, queryResult: null, view: searchPickerView(state), onTransition: () => ({ kind: 'change' }) });
  assert.equal(searchPickerIndexStatistics(index).queryEvaluations, 0);
  renderElementFrame(element, { columns: 80, rows: 24 });
  assert.equal(searchPickerIndexStatistics(index).cachedQueries, 0);
});

void test('cooperative construction owns descriptors before yielding and agrees with synchronous construction', async () => {
  const source = [{ id: 'one', label: 'é'.repeat(5000), value: 1, keywords: ['needle'] }];
  const entry = source[0];
  assert.ok(entry);
  const expected = createSearchPickerIndex(source);
  let yields = 0;
  const result = await prepareSearchPickerIndex([source], {
    signal: new AbortController().signal,
    yield: () => {
      yields += 1;
      entry.label = 'changed';
      entry.keywords[0] = 'changed';
      return Promise.resolve();
    },
  });
  assert.ok(yields > 4);
  assert.deepEqual(searchPickerQueryEntries(querySearchPickerIndex(result, { text: 'needle' })),
    searchPickerQueryEntries(querySearchPickerIndex(expected, { text: 'needle' })));
});

void test('one large record can be cancelled during construction and matching without accepting a cache result', async () => {
  const entries = [{ id: 'one', label: 'x'.repeat(100_000), value: 1 }];
  let completeYields = 0;
  await prepareSearchPickerIndex([entries], {
    signal: new AbortController().signal,
    yield: () => { completeYields += 1; return Promise.resolve(); },
  });
  assert.ok(completeYields >= 3, 'exercise early, middle and late content cancellation');
  for (const stop of [1, Math.ceil(completeYields / 2), completeYields]) {
    const controller = new AbortController();
    let yields = 0;
    await assert.rejects(prepareSearchPickerIndex([entries], {
      signal: controller.signal,
      yield: () => { if (++yields === stop) controller.abort(new Error('superseded')); return Promise.resolve(); },
    }), /superseded/u);
  }
  const index = createSearchPickerIndex(entries);
  const controller = new AbortController();
  let yields = 0;
  await assert.rejects(prepareSearchPickerQuery(index, { text: 'missing', caseSensitive: true }, {
    signal: controller.signal,
    yield: () => { yields += 1; controller.abort(new Error('superseded')); return Promise.resolve(); },
  }), /superseded/u);
  assert.equal(yields, 1);
  assert.equal(searchPickerIndexStatistics(index).cachedQueries, 0);
  assert.equal(querySearchPickerIndex(index, { text: 'xxx', mode: 'prefix' }).count, 1);
});

void test('long whitespace without a newline is normalized linearly and can be cancelled', async () => {
  const source = [[{ id: 'one', label: ' '.repeat(100_000), value: 1 }]];
  let completeYields = 0;
  await prepareSearchPickerIndex(source, {
    signal: new AbortController().signal,
    yield: () => { completeYields += 1; return Promise.resolve(); },
  });
  assert.ok(completeYields > 1);
  const controller = new AbortController();
  let yields = 0;
  await assert.rejects(prepareSearchPickerIndex(source, {
    signal: controller.signal,
    yield: () => { if (++yields === Math.ceil(completeYields / 2)) controller.abort(new Error('new source')); return Promise.resolve(); },
  }), /new source/u);
  const index = createSearchPickerIndex([{ id: 'one', label: '  a \n \t b  ', value: 1 }]);
  assert.equal(querySearchPickerIndex(index).entryAt(0)?.label, '  a b  ');
});

void test('concurrent query admission counts each retained result once through weighted eviction', async () => {
  const label = Array.from({ length: 12 }, (_, i) => `needle${String(i)}`).join(' ');
  const entries = () => Array.from({ length: 300 }, (_, i) => ({ id: String(i), label, value: i }));
  const concurrent = createSearchPickerIndex(entries());
  const sequential = createSearchPickerIndex(entries());
  const context = { signal: new AbortController().signal, yield: () => Promise.resolve() };
  for (let i = 0; i < 12; i += 1) {
    const query = { text: `needle${String(i)}`, mode: 'contains' as const };
    const results = await Promise.all(Array.from({ length: 4 }, () => prepareSearchPickerQuery(concurrent, query, context)));
    assert.ok(results.every(result => result === results[0]), 'concurrent completions must share the admitted owner');
    querySearchPickerIndex(sequential, query);
    const actual = searchPickerIndexStatistics(concurrent);
    const expected = searchPickerIndexStatistics(sequential);
    assert.equal(actual.cachedQueries, expected.cachedQueries);
    assert.equal(actual.retainedQueryBytes, expected.retainedQueryBytes, 'evictions must not retain phantom storage weight');
  }
  assert.ok(searchPickerIndexStatistics(concurrent).cachedQueries < 12, 'exercise weighted eviction');
});
