import assert from 'node:assert/strict';
import test from 'node:test';

import { createTextDocument, textDocumentEdit, textDocumentLineAt } from './document.ts';
import { editTextDocument } from './document-edit.ts';
import { editTextBuffer } from './edit.ts';
import {
  nextGraphemeBoundary,
  normalizeTextCursor,
  previousGraphemeBoundary,
} from './text-range.ts';
import type { TextCaret } from './types.ts';

function countSegmentIteration(run: (count: () => number) => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(Intl.Segmenter.prototype, 'segment');
  const original = descriptor?.value as ((this: Intl.Segmenter, text: string) => Intl.Segments) | undefined;
  if (original === undefined) throw new Error('Intl.Segmenter.segment is unavailable.');
  let traversed = 0;
  Object.defineProperty(Intl.Segmenter.prototype, 'segment', {
    configurable: true,
    value: function (this: Intl.Segmenter, text: string) {
      const segments = original.call(this, text);
      return {
        containing: (offset: number) => segments.containing(offset),
        *[Symbol.iterator]() {
          for (const segment of segments) {
            traversed += segment.segment.length;
            yield segment;
          }
        }
      };
    }
  });
  try { run(() => traversed); }
  finally {
    if (descriptor !== undefined) Object.defineProperty(Intl.Segmenter.prototype, 'segment', descriptor);
  }
}

void test('boundary editing touches no grapheme stream on unchanged 1K, 10K, and 100K lines', () => {
  for (const length of [1_000, 10_000, 100_000]) {
    const source = 'a'.repeat(length);
    countSegmentIteration((count) => {
      for (const initial of [1, Math.floor(length / 2), length - 2]) {
        let buffer = { text: source, cursor: initial };
        let document = createTextDocument(source);
        let caret: TextCaret = { position: { offset: initial, affinity: 'downstream' } };
        for (let step = 0; step < 20; step += 1) {
          buffer = editTextBuffer(buffer, { kind: 'moveRight' });
          const moved = editTextDocument({ document, caret }, { kind: 'moveRight' });
          document = moved.document;
          caret = moved.caret;
        }
        assert.equal(buffer.cursor, Math.min(length, initial + 20));
        assert.equal(caret.position.offset, buffer.cursor);
      }
      assert.equal(count(), 0, `full segmentation during boundary movement at length ${String(length)}`);
    });
  }
});

void test('Unicode clusters and CRLF remain atomic across document chunk seams', () => {
  const cluster = `e${'\u0301'.repeat(5_000)}`;
  const samples = [cluster, '👩🏽‍💻', '🇲🇦', '𝄞', '\r\n'];
  for (const sample of samples) {
    const source = `a${sample}b`;
    assert.equal(normalizeTextCursor(source, 2), 1);
    assert.equal(nextGraphemeBoundary(source, 1), 1 + sample.length);
    assert.equal(previousGraphemeBoundary(source, 1 + sample.length), 1);
    const document = createTextDocument(source);
    const deleted = editTextDocument({
      document,
      caret: { position: { offset: 1 + sample.length, affinity: 'downstream' } }
    }, { kind: 'deleteBackward' });
    assert.equal(textDocumentLineAt(deleted.document, 0)?.text, 'ab');
  }
  const seam = `${'a'.repeat(4_095)}e\u0301`;
  assert.equal(normalizeTextCursor(seam, 4_096), 4_095);
  const joined = editTextDocument({
    document: createTextDocument(seam),
    caret: { position: { offset: seam.length, affinity: 'downstream' } }
  }, { kind: 'deleteBackward' });
  assert.equal(textDocumentLineAt(joined.document, 0)?.text, 'a'.repeat(4_095));
});

void test('vertical editing retains indexes, honors width profiles, and invalidates changed lines', () => {
  const document = createTextDocument(`${'a'.repeat(100_000)}\nxx`);
  countSegmentIteration((count) => {
    const fromLong = editTextDocument({
      document,
      caret: { position: { offset: 50_000, affinity: 'downstream' } }
    }, { kind: 'moveLineDown' });
    const afterWarmup = count();
    assert.ok(afterWarmup >= 100_000);
    for (let step = 0; step < 10; step += 1) {
      editTextDocument({ document, caret: fromLong.caret }, { kind: 'moveLineUp' });
    }
    assert.equal(count(), afterWarmup, 'unchanged lines were segmented again');
  });

  const ambiguous = createTextDocument('·\nxx');
  const start = { document: ambiguous, caret: { position: { offset: 1, affinity: 'downstream' as const } } };
  const narrow = editTextDocument(start, { kind: 'moveLineDown' });
  const wide = editTextDocument(start, { kind: 'moveLineDown' }, {
    widthProfile: { emoji: 'wide', ambiguous: 'wide' }
  });
  assert.equal(narrow.caret.position.offset, 3);
  assert.equal(wide.caret.position.offset, 4);

  const changed = textDocumentEdit(ambiguous, { startOffset: 2, endOffsetExclusive: 4 }, 'Z').document;
  assert.equal(textDocumentLineAt(changed, 1)?.text, 'Z');
  assert.equal(textDocumentLineAt(ambiguous, 1)?.text, 'xx');
});
