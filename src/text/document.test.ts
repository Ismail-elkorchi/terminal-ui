import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isTextDocument,
  createTextDocument,
  textDocumentEdit,
  textDocumentLength,
  textDocumentLineAt,
  textDocumentLineCount,
  textDocumentText
} from './document.ts';

void test('text documents are opaque retained values', () => {
  const document = createTextDocument('alpha\nbeta');

  assert.equal(isTextDocument({}), false);
  assert.deepEqual(Object.keys(document), []);
  assert.equal(textDocumentLength(document), 10);
  assert.equal(textDocumentLineCount(document), 2);
});

void test('piece-tree edits preserve content and document identity for no-op replacements', () => {
  const document = createTextDocument('alpha\nbeta\ngamma');
  const noChange = textDocumentEdit(document, { startOffset: 6, endOffsetExclusive: 10 }, 'beta');
  const changed = textDocumentEdit(document, { startOffset: 6, endOffsetExclusive: 10 }, 'BRAVO');

  assert.equal(noChange.document, document);
  assert.equal(textDocumentText(changed.document), 'alpha\nBRAVO\ngamma');
  assert.deepEqual(textDocumentLineAt(changed.document, 1), {
    lineIndex: 1,
    startOffset: 6,
    endOffsetExclusive: 11,
    text: 'BRAVO'
  });
});

void test('single-character edits in large documents preserve exact text geometry', () => {
  const lines = Array.from({ length: 20_000 }, (_value, index) => `line-${String(index)}`);
  const source = lines.join('\n');
  const document = createTextDocument(source);
  const start = source.indexOf('line-10000') + 5;
  const changed = textDocumentEdit(document, {
    startOffset: start,
    endOffsetExclusive: start + 1
  }, 'X').document;

  assert.equal(textDocumentLineCount(changed), lines.length);
  assert.equal(textDocumentLineAt(changed, 10_000)?.text, 'line-X0000');
  assert.equal(textDocumentLength(changed), source.length);
});
