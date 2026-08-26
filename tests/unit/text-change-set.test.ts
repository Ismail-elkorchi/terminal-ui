import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applyTextChangeSet,
  createTextChangeSet,
  invertTextChangeSet,
  prepareTextDocument,
  textDocumentText
} from '../../dist/text/index.js';

void test('text change sets apply ordered UTF-16 edits against one source revision', () => {
  const document = prepareTextDocument('A🙂BCDEF');
  const changeSet = createTextChangeSet([
    { startOffset: 1, endOffsetExclusive: 3, insertedText: 'emoji' },
    { startOffset: 5, endOffsetExclusive: 7, insertedText: '!' }
  ]);

  const changed = applyTextChangeSet(document, changeSet);

  assert.equal(textDocumentText(changed), 'AemojiBC!F');
  assert.equal(textDocumentText(applyTextChangeSet(changed, invertTextChangeSet(document, changeSet))), 'A🙂BCDEF');
});

void test('text change sets reject ambiguous ranges before editing', () => {
  assert.throws(() => createTextChangeSet([
    { startOffset: 2, endOffsetExclusive: 4, insertedText: 'x' },
    { startOffset: 3, endOffsetExclusive: 5, insertedText: 'y' }
  ]), /ordered by source offset and must not overlap/u);
  assert.throws(() => createTextChangeSet([
    { startOffset: 4, endOffsetExclusive: 4, insertedText: 'x' },
    { startOffset: 2, endOffsetExclusive: 2, insertedText: 'y' }
  ]), /ordered by source offset and must not overlap/u);
  assert.throws(() => applyTextChangeSet(
    prepareTextDocument('short'),
    createTextChangeSet([{ startOffset: 5, endOffsetExclusive: 6, insertedText: '' }])
  ), /exceeds the source document/u);
});

void test('text change sets preserve exact UTF-16 boundaries instead of applying interactive caret normalization', () => {
  const document = prepareTextDocument('ab');
  const changeSet = createTextChangeSet([
    { startOffset: 0, endOffsetExclusive: 1, insertedText: 'X' },
    { startOffset: 1, endOffsetExclusive: 1, insertedText: '\u0301' }
  ]);

  const changed = applyTextChangeSet(document, changeSet);
  assert.equal(textDocumentText(changed), 'X\u0301b');
  assert.equal(
    textDocumentText(applyTextChangeSet(changed, invertTextChangeSet(document, changeSet))),
    'ab'
  );

  const crlf = prepareTextDocument('a\r\nb');
  assert.equal(textDocumentText(applyTextChangeSet(crlf, createTextChangeSet([
    { startOffset: 2, endOffsetExclusive: 2, insertedText: 'X' }
  ]))), 'a\rX\nb');
});

void test('text change sets discard empty changes and preserve document identity for equal replacements', () => {
  const document = prepareTextDocument('same');
  assert.deepEqual(createTextChangeSet([
    { startOffset: 2, endOffsetExclusive: 2, insertedText: '' }
  ]).changes, []);
  assert.equal(applyTextChangeSet(document, createTextChangeSet([
    { startOffset: 0, endOffsetExclusive: 4, insertedText: 'same' }
  ])), document);
});
