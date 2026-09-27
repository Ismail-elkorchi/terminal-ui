import assert from 'node:assert/strict';
import test from 'node:test';
import { defaultTextWidthProfile, createTextDocument } from '../../../dist/text/index.js';
import { layoutTextAreaDocument } from '../../../dist/components/text-area/layout.js';

test('unwrapped editor geometry is independent of scrollbar width', () => {
  const document = createTextDocument('first\n界 second\nthird');
  const first = layoutTextAreaDocument(document, 40, false, defaultTextWidthProfile);
  assert.strictEqual(layoutTextAreaDocument(document, 39, false, defaultTextWidthProfile), first);
  assert.equal(first.lineAtRow(1).index.cells, 9);
});
