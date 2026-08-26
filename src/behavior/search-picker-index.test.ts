import assert from 'node:assert/strict';
import test from 'node:test';
import {
  searchPickerIndexStatistics,
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
