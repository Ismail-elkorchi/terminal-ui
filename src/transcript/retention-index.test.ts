import assert from 'node:assert/strict';
import test from 'node:test';

import { RetentionIndex } from './retention-index.ts';

interface Entry {
  readonly category: 'step' | 'diagnostic';
  readonly sequence: number;
}

void test('retention index deletion releases chronological and category ownership together', () => {
  const index = new RetentionIndex<Entry>();
  const diagnostic = { category: 'diagnostic', sequence: -1 } as const;
  index.add(diagnostic);

  for (let sequence = 0; sequence < 100_000; sequence += 1) {
    index.add({ category: 'step', sequence });
    if (index.categorySize('step') > 32) {
      const oldest = index.oldestInCategory('step');
      if (oldest === undefined) assert.fail('step retention lost its oldest entry');
      index.delete(oldest);
    }
  }

  assert.equal(index.size, 33);
  assert.equal(index.categorySize('step'), 32);
  assert.equal(index.categorySize('diagnostic'), 1);
  assert.equal(index.oldest(), diagnostic);
  assert.deepEqual(
    index.categoryValues('step').map((entry) => entry.sequence),
    Array.from({ length: 32 }, (_value, offset) => 99_968 + offset),
  );

  index.delete(diagnostic);
  assert.equal(index.size, 32);
  assert.equal(index.categorySize('diagnostic'), 0);
});

void test('retention index rejects duplicate ownership', () => {
  const index = new RetentionIndex<Entry>();
  const entry = { category: 'step', sequence: 1 } as const;
  index.add(entry);

  assert.throws(() => { index.add(entry); }, /only once/u);
});
