import assert from 'node:assert/strict';
import test from 'node:test';
import { createLogHistory } from '../../../dist/behavior/log-history.js';
import { logViewerLayout } from '../../../dist/components/log-viewer/layout.js';
import { defaultTextWidthProfile } from '../../../dist/text/index.js';


test('unwrapped log geometry is shared across widths and folding does not scan a cached history', () => {
  const history = createLogHistory(Array.from({ length: 10_000 }, (_, index) => ({ id: String(index), text: 'first\nsecond' })));
  let reads = 0;
  const folds = new Set(['3', '7']);
  const has = folds.has.bind(folds);
  folds.has = id => { reads += 1; return has(id); };
  const first = logViewerLayout(history, 40, false, defaultTextWidthProfile, folds);
  assert.equal(first.totalRows, 10_000);
  assert.equal(reads, 0);
  assert.strictEqual(logViewerLayout(history, 39, false, defaultTextWidthProfile, folds), first);
  const wrapped = logViewerLayout(history, 40, true, defaultTextWidthProfile, folds);
  reads = 0;
  assert.strictEqual(logViewerLayout(history, 40, true, defaultTextWidthProfile, folds), wrapped);
  assert.equal(reads, 0);
});
