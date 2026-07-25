import assert from 'node:assert/strict';
import test from 'node:test';
import {
  searchPickerIndexStatistics,
  prepareSearchPickerIndex,
  querySearchPickerIndex
} from './search-picker-index.ts';

void test('searchPicker indexes snapshot entries and retain ranked query work', () => {
  const source = [
    { id: 'open', label: 'Open file', value: 'open', keywords: ['file'] },
    { id: 'close', label: 'Close file', value: 'close', keywords: ['file'] },
    { id: 'theme', label: 'Change theme', value: 'theme', keywords: ['view'] }
  ];
  const index = prepareSearchPickerIndex(source);
  const first = querySearchPickerIndex(index, 'file');

  source.splice(0, source.length, { id: 'mutated', label: 'Mutated', value: 'mutated', keywords: [] });
  const retained = querySearchPickerIndex(index, 'file');

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
    () => prepareSearchPickerIndex([
      { id: 'same', label: 'One', value: 1 },
      { id: 'same', label: 'Two', value: 2 }
    ]),
    /must be unique/u
  );
});
