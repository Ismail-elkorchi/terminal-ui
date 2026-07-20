import assert from 'node:assert/strict';
import test from 'node:test';
import {
  paletteIndexStatistics,
  preparePaletteIndex,
  projectPaletteQuery
} from './palette-index.ts';

void test('palette indexes snapshot entries and retain ranked query work', () => {
  const source = [
    { id: 'open', label: 'Open file', value: 'open', keywords: ['file'] },
    { id: 'close', label: 'Close file', value: 'close', keywords: ['file'] },
    { id: 'theme', label: 'Change theme', value: 'theme', keywords: ['view'] }
  ];
  const index = preparePaletteIndex(source);
  const first = projectPaletteQuery(index, 'file');

  source.splice(0, source.length, { id: 'mutated', label: 'Mutated', value: 'mutated', keywords: [] });
  const retained = projectPaletteQuery(index, 'file');

  assert.equal(retained, first);
  assert.deepEqual(retained.entries.map((entry) => entry.id), ['open', 'close']);
  assert.deepEqual(paletteIndexStatistics(index), {
    entries: 3,
    cachedQueries: 1,
    queryEvaluations: 1,
    candidateEvaluations: 3
  });
});

void test('palette indexes reject ambiguous entry identity', () => {
  assert.throws(
    () => preparePaletteIndex([
      { id: 'same', label: 'One', value: 1 },
      { id: 'same', label: 'Two', value: 2 }
    ]),
    /must be unique/u
  );
});
