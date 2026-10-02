import assert from 'node:assert/strict';
import test from 'node:test';

import { createTextDocument, normalizeTextDocumentOffset, normalizeTextDocumentSelection, textDocumentEditExact, textDocumentText } from './document.ts';
import { editTextDocument } from './document-edit.ts';
import { editTextBuffer } from './edit.ts';
import { applyTextEditWithHistory, emptyTextEditHistory } from './edit-history.ts';
import { graphemeBoundaryOffsets, measuredGraphemes } from './graphemes.ts';
import { nextGraphemeBoundary, normalizeTextCursor, normalizeTextSelection, previousGraphemeBoundary } from './text-range.ts';

void test('iterator boundaries agree for Unicode movement, selections, deletion, replacement and undo/redo', () => {
  const samples = ['e\u0301', '👩🏽‍💻', '👩‍💻', '🇲🇦', '𝄞', 'क्‍ष', `e${'\u0301'.repeat(5_000)}`];
  for (const cluster of samples) {
    const source = `A${cluster}Z`;
    const end = 1 + cluster.length;
    const expected = [0, 1, end, end + 1];
    assert.deepEqual(graphemeBoundaryOffsets(source), expected);
    assert.deepEqual(Array.from(measuredGraphemes(source), (item) => item.startOffset), expected.slice(0, -1));
    const document = createTextDocument(source);
    for (let offset = 1; offset < end; offset += 1) {
      assert.equal(normalizeTextCursor(source, offset), 1);
      assert.equal(nextGraphemeBoundary(source, offset), end);
    }
    assert.equal(previousGraphemeBoundary(source, end), 1);
    const selection = { startOffset: 2, endOffsetExclusive: end };
    assert.deepEqual(normalizeTextSelection(source, selection), { startOffset: 1, endOffsetExclusive: end });
    assert.deepEqual(normalizeTextDocumentSelection(document, {
      anchor: { offset: 2, affinity: 'downstream' }, focus: { offset: end, affinity: 'upstream' },
    }), {
      anchor: { offset: 1, affinity: 'downstream' }, focus: { offset: end, affinity: 'upstream' },
    });
    assert.equal(editTextBuffer({ text: source, cursor: end }, { kind: 'moveLeft' }).cursor, 1);
    assert.equal(editTextBuffer({ text: source, cursor: 1 }, { kind: 'moveRight' }).cursor, end);
    assert.equal(editTextBuffer({ text: source, cursor: end }, { kind: 'deleteBackward' }).text, 'AZ');
    assert.equal(editTextBuffer({ text: source, cursor: 1 }, { kind: 'deleteForward' }).text, 'AZ');
    const replacement = editTextBuffer({ text: source, cursor: end, selection }, { kind: 'insert', text: 'B' });
    assert.equal(replacement.text, 'ABZ');
    for (const kind of ['deleteBackward', 'deleteForward'] as const) {
      const result = editTextDocument({ document, caret: { position: {
        offset: kind === 'deleteBackward' ? end : 1, affinity: 'downstream',
      } } }, { kind });
      assert.equal(textDocumentText(result.document), 'AZ');
      assert.equal(result.caret.position.offset, 1);
    }
    const changed = editTextDocument({ document, caret: { position: { offset: 0, affinity: 'downstream' } } }, {
      kind: 'replaceRange', range: selection, text: 'B',
    });
    assert.equal(textDocumentText(changed.document), 'ABZ');
    const initial = { text: source, cursor: end };
    const removed = applyTextEditWithHistory(initial, emptyTextEditHistory(), { kind: 'deleteBackward' });
    const undo = applyTextEditWithHistory(removed.buffer, removed.history, { kind: 'undo' });
    assert.deepEqual(undo.buffer, initial);
    assert.deepEqual(applyTextEditWithHistory(undo.buffer, undo.history, { kind: 'redo' }).buffer, removed.buffer);
  }
});

void test('edits resegment the whole affected logical region when Unicode context changes', () => {
  // Regional-indicator parity can affect every following boundary, so a fixed
  // prefix/suffix repair would be incorrect even far from the insertion.
  const indicators = '🇦'.repeat(300);
  const document = createTextDocument(indicators);
  const before = graphemeBoundaryOffsets(indicators);
  const edit = editTextDocument({ document, caret: { position: { offset: 0, affinity: 'downstream' } } }, {
    kind: 'insert', text: '🇧',
  });
  const source = textDocumentText(edit.document);
  assert.equal(source, `🇧${indicators}`);
  assert.equal(edit.caret.position.offset, 4);
  const buffer = editTextBuffer({ text: indicators, cursor: 0 }, { kind: 'insert', text: '🇧' });
  assert.equal(buffer.cursor, 4);
  const after = graphemeBoundaryOffsets(source);
  assert.equal(before.at(-2), indicators.length - 4);
  assert.equal(after.at(-2), source.length - 2);
  for (const boundary of after) {
    assert.equal(normalizeTextCursor(source, boundary), boundary);
  }
});

void test('deleting between clusters never leaves the caret inside a newly joined grapheme', () => {
  const text = '🇲 🇦';
  const buffer = editTextBuffer({ text, cursor: 3 }, { kind: 'deleteBackward' });
  assert.deepEqual(buffer, { text: '🇲🇦', cursor: 4 });
  const document = editTextDocument({ document: createTextDocument(text), caret: {
    position: { offset: 3, affinity: 'downstream' },
  } }, { kind: 'deleteBackward' });
  assert.equal(textDocumentText(document.document), buffer.text);
  assert.equal(document.caret.position.offset, buffer.cursor);
});

void test('warm edited prefixes preserve iterator boundaries across every seam and retained revision', () => {
  const cases = [
    { text: `head:${'🇦'.repeat(300)}tail`, start: 201, end: 205, insertion: '🇧' },
    { text: `head:${'🇦'.repeat(301)}`, start: 607, end: 607, insertion: '🇧' },
    { text: `head:e${'\u0301'.repeat(5_000)}tail`, start: 5_006, end: 5_006, insertion: '\u0301' },
    { text: 'head:👩🏽 tail', start: 9, end: 10, insertion: '\u200d💻' },
    { text: 'head:क् षtail', start: 7, end: 8, insertion: '\u200d' },
    { text: 'head:🇲 🇦tail', start: 7, end: 8, insertion: '' },
    { text: 'head:\ud83dX\ude00tail', start: 6, end: 7, insertion: '' },
    { text: 'first\r\nsecond', start: 6, end: 6, insertion: 'X' },
  ];
  const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  const checkOffsets = (document: ReturnType<typeof createTextDocument>, text: string): void => {
    const offsets = [...segmenter.segment(text)].map((part) => part.index);
    offsets.push(text.length);
    let boundary = 0;
    for (let offset = 0; offset <= text.length; offset += 1) {
      if (offset === offsets[boundary + 1]) boundary += 1;
      assert.equal(normalizeTextDocumentOffset(document, offset), offsets[boundary], `length ${String(text.length)} at ${String(offset)}`);
    }
  };
  for (const sample of cases) {
    const prefix = 'P'.repeat(2_048);
    const source = prefix + sample.text;
    const original = createTextDocument(source);
    checkOffsets(original, source);
    const changed = textDocumentEditExact(original, prefix.length + sample.start, prefix.length + sample.end, sample.insertion).document;
    checkOffsets(changed, textDocumentText(changed));
    checkOffsets(original, source);
  }
});
