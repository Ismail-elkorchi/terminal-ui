import assert from 'node:assert/strict';
import test from 'node:test';

import {
  isTextDocument,
  createTextDocument,
  textDocumentEdit,
  textDocumentApplyChangesExact,
  textDocumentChunkMetrics,
  textDocumentLength,
  textDocumentLineAt,
  textDocumentLineCount,
  textDocumentLineIndexAtOffset,
  textDocumentLines,
  textDocumentPreviousMutation,
  textDocumentText
} from './document.ts';

void test('text documents are opaque retained values', () => {
  const document = createTextDocument('alpha\nbeta');

  assert.equal(isTextDocument({}), false);
  assert.deepEqual(Object.keys(document), []);
  assert.equal(textDocumentLength(document), 10);
  assert.equal(textDocumentLineCount(document), 2);
});

void test('chunk-tree edits preserve content and document identity for no-op replacements', () => {
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

void test('text document lines recognize CR, LF, and CRLF across chunk boundaries', () => {
  const prefix = 'x'.repeat(4_095);
  const document = createTextDocument(`${prefix}\r\nsecond\rthird\nfourth`);

  assert.equal(textDocumentLineCount(document), 4);
  assert.equal(textDocumentLineAt(document, 0)?.text, prefix);
  assert.equal(textDocumentLineAt(document, 1)?.text, 'second');
  assert.equal(textDocumentLineAt(document, 2)?.text, 'third');
  assert.equal(textDocumentLineAt(document, 3)?.text, 'fourth');
  assert.equal(textDocumentLineIndexAtOffset(document, prefix.length + 1), 0);
  assert.equal(textDocumentLineIndexAtOffset(document, prefix.length + 2), 1);
  assert.deepEqual(
    [...textDocumentLines(document)],
    Array.from({ length: textDocumentLineCount(document) }, (_value, lineIndex) => (
      textDocumentLineAt(document, lineIndex)
    )),
  );
  assert.deepEqual([...textDocumentLines(createTextDocument('one\r\n'))], [
    { lineIndex: 0, startOffset: 0, endOffsetExclusive: 3, text: 'one' },
    { lineIndex: 1, startOffset: 5, endOffsetExclusive: 5, text: '' },
  ]);
});

void test('sequential typing coalesces adjacent document chunks', () => {
  let document = createTextDocument('');
  for (let index = 0; index < 10_000; index += 1) {
    document = textDocumentEdit(document, {
      startOffset: index,
      endOffsetExclusive: index,
    }, 'x').document;
  }

  const metrics = textDocumentChunkMetrics(document);
  assert.equal(textDocumentLength(document), 10_000);
  assert.ok(metrics.chunkCount <= 16, JSON.stringify(metrics));
  assert.ok(metrics.treeHeight <= 7, JSON.stringify(metrics));
  assert.ok(metrics.underfilledChunkCount <= 12, JSON.stringify(metrics));
});

void test('multi-range changes create one document transition from their source', () => {
  const document = createTextDocument('alpha beta gamma');
  const changes = Object.freeze([
    Object.freeze({ startOffset: 0, endOffsetExclusive: 5, insertedText: 'A' }),
    Object.freeze({ startOffset: 11, endOffsetExclusive: 16, insertedText: 'G' }),
  ]);
  const changed = textDocumentApplyChangesExact(document, changes);

  assert.equal(textDocumentText(changed), 'A beta G');
  assert.equal(textDocumentPreviousMutation(changed)?.document, document);
  assert.deepEqual(textDocumentPreviousMutation(changed)?.changes, changes);
});

void test('large atomic change plans compact fragmented document chunks', () => {
  const source = 'abcd'.repeat(1_024);
  const document = createTextDocument(source);
  const changes = Object.freeze(Array.from({ length: 512 }, (_value, index) => {
    const startOffset = index * 8 + 3;
    return Object.freeze({
      startOffset,
      endOffsetExclusive: startOffset + 1,
      insertedText: '',
    });
  }));
  const changed = textDocumentApplyChangesExact(document, changes);
  const metrics = textDocumentChunkMetrics(changed);

  assert.equal(textDocumentLength(changed), source.length - changes.length);
  assert.ok(metrics.chunkCount <= 4, JSON.stringify(metrics));
  assert.equal(textDocumentPreviousMutation(changed)?.document, document);
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
