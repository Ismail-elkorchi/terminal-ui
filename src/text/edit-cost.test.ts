import assert from 'node:assert/strict';
import test from 'node:test';

import { createTextDocument, textDocumentEdit, textDocumentLineAt } from './document.ts';
import { editTextDocument } from './document-edit.ts';
import type { TextDocumentEditState } from './document-edit.ts';
import { editTextBuffer } from './edit.ts';
import {
  nextGraphemeBoundary,
  normalizeTextCursor,
  previousGraphemeBoundary,
} from './text-range.ts';
import { measuredGraphemes, graphemeBoundaryOffsets } from './graphemes.ts';
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
        containing: () => { throw new Error('Editing must use iterator boundaries.'); },
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

void test('boundary editing reuses unchanged 1K, 10K, and 100K lines with bounded native seam overlap', () => {
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
      assert.ok(count() >= length && count() <= length + Math.ceil(length / 4_095),
        `unexpected native seam overlap at length ${String(length)}`);
      const warmed = count();
      for (let offset = 1; offset < length; offset += 100) {
        normalizeTextCursor(source, offset);
        previousGraphemeBoundary(source, offset);
        nextGraphemeBoundary(source, offset);
      }
      assert.equal(count(), warmed, 'warm boundary operations segmented again');
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
  const document = createTextDocument(`${'v'.repeat(100_000)}\nxx`);
  countSegmentIteration((count) => {
    const fromLong = editTextDocument({
      document,
      caret: { position: { offset: 50_000, affinity: 'downstream' } }
    }, { kind: 'moveLineDown' });
    const afterWarmup = count();
    assert.ok(afterWarmup >= 50_000 && afterWarmup < 51_000, 'only the requested geometry prefix is prepared');
    for (let step = 0; step < 10; step += 1) {
      editTextDocument({ document, caret: fromLong.caret }, { kind: 'moveLineUp' });
    }
    assert.ok(count() <= afterWarmup + 1, 'only the next prefix boundary may be needed');
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

void test('geometry policy changes reuse source boundaries and edits invalidate only changed lines', () => {
  const first = 'source·👩🏽‍💻'.repeat(100);
  const second = 'retained·🇲🇦'.repeat(100);
  const document = createTextDocument(`${first}\n${second}`);
  countSegmentIteration((count) => {
    const firstOffsets = graphemeBoundaryOffsets(first);
    const secondOffsets = graphemeBoundaryOffsets(second);
    const traversed = count();
    assert.equal(traversed, first.length + second.length);
    const narrow = Array.from(measuredGraphemes(first));
    const wide = Array.from(measuredGraphemes(first, { widthProfile: { emoji: 'codepoint', ambiguous: 'wide' } }));
    assert.deepEqual(narrow.map((item) => item.startOffset), firstOffsets.slice(0, -1));
    assert.deepEqual(wide.map((item) => item.startOffset), firstOffsets.slice(0, -1));
    assert.notEqual(narrow.reduce((sum, item) => sum + item.cells, 0), wide.reduce((sum, item) => sum + item.cells, 0));
    assert.equal(count(), traversed, 'width-only changes resegmented source');
    const next = textDocumentEdit(document, { startOffset: 0, endOffsetExclusive: 0 }, 'new ').document;
    const retained = textDocumentLineAt(next, 1);
    assert.equal(retained?.text, second);
    assert.deepEqual(graphemeBoundaryOffsets(retained.text), secondOffsets);
    assert.equal(count(), traversed, 'unaffected document line resegmented');
    const changed = textDocumentLineAt(next, 0)?.text ?? '';
    graphemeBoundaryOffsets(changed);
    assert.equal(count(), traversed + changed.length, 'changed logical line owns fresh boundaries');
  });
});

void test('lazy measurement only advances requested boundaries and owns width policy', () => {
  const text = '🧑🏾‍🚀lazy'.repeat(1_000);
  const profile = { emoji: 'wide' as 'wide' | 'narrow', ambiguous: 'narrow' as const };
  countSegmentIteration((count) => {
    const iterator = measuredGraphemes(text, { widthProfile: profile });
    assert.equal(count(), 0);
    const first = iterator.next();
    if (first.done === true) throw new Error('Missing initial measured grapheme.');
    assert.equal(first.value.cells, 2);
    assert.equal(count(), '🧑🏾‍🚀'.length);
    profile.emoji = 'narrow';
    for (let step = 0; step < 4; step += 1) iterator.next();
    const second = iterator.next();
    if (second.done === true) throw new Error('Missing second measured grapheme.');
    assert.equal(second.value.cells, 2);
    assert.ok(count() < text.length);
    iterator.return?.();
  });
});

void test('source-boundary reuse is bounded and oversized sources remain lazy without retention', () => {
  const sources = Array.from({ length: 26 }, (_, index) => `${String(index).padStart(2, '0')}${'q'.repeat(80_000)}`);
  countSegmentIteration((count) => {
    for (const source of sources) {
      const iterator = measuredGraphemes(source);
      iterator.next();
      iterator.return?.();
    }
    assert.equal(count(), sources.length);
    const oldest = measuredGraphemes(sources[0] ?? '');
    oldest.next();
    oldest.return?.();
    assert.equal(count(), sources.length + 1, 'old source entry survived beyond the cache budget');
    const huge = `uncached${'u'.repeat(1_000_000)}`;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      const iterator = measuredGraphemes(huge);
      iterator.next();
      iterator.return?.();
    }
    assert.equal(count(), sources.length + 3, 'oversized source was retained or eagerly traversed');
  });
});

void test('owned buffers and documents reuse oversized line prefixes through navigation and edits', () => {
  for (const length of [1_100_000, 2_200_000]) {
    for (const kind of ['buffer', 'document']) {
      const text = `${kind}:${'L'.repeat(length)}`;
      countSegmentIteration((count) => {
        let buffer = { text, cursor: text.length - 8 };
        let state: TextDocumentEditState = { document: createTextDocument(text), caret: { position: {
          offset: text.length - 8, affinity: 'downstream' as const,
        } } };
        const move = (operation: 'moveLeft' | 'moveRight' | 'insert' | 'deleteBackward'): void => {
          const edit = operation === 'insert' ? { kind: operation, text: 'x' } as const : { kind: operation };
          if (kind === 'buffer') buffer = editTextBuffer(buffer, edit);
          else state = editTextDocument(state, edit);
        };
        move('moveLeft');
        const cold = count();
        assert.ok(cold >= text.length - 8 && cold <= text.length + Math.ceil(text.length / 4_095));
        for (let step = 0; step < 20; step += 1) { move('moveRight'); move('moveLeft'); }
        assert.ok(count() <= cold + 1, 'warm navigation traversed the unchanged prefix');
        const warm = count();
        for (let step = 0; step < 20; step += 1) { move('insert'); move('deleteBackward'); }
        assert.ok(count() - warm <= 100, `near-end edits resegmented ${String(count() - warm)} code units`);
        assert.equal(kind === 'buffer' ? buffer.cursor : state.caret.position.offset, text.length - 9);
      });
    }
  }
});

void test('owned indexes survive global cache eviction and caller-owned buffer mutation', () => {
  const text = `owned:${'o'.repeat(100_000)}`;
  let buffer = editTextBuffer({ text, cursor: text.length }, { kind: 'moveLeft' });
  let state = editTextDocument({ document: createTextDocument(text), caret: {
    position: { offset: text.length, affinity: 'downstream' },
  } }, { kind: 'moveLeft' });
  for (let index = 0; index < 30; index += 1) {
    const iterator = measuredGraphemes(`evict:${String(index)}${'q'.repeat(80_000)}`);
    iterator.next();
    iterator.return?.();
  }
  countSegmentIteration((count) => {
    buffer = editTextBuffer(buffer, { kind: 'moveLeft' });
    state = editTextDocument(state, { kind: 'moveLeft' });
    assert.equal(count(), 0, 'global cache eviction discarded a live owner’s boundaries');
  });
  const mutable = { text: 'e\u0301', cursor: 2 };
  editTextBuffer(mutable, { kind: 'moveLeft' });
  mutable.text = 'ab';
  assert.equal(editTextBuffer(mutable, { kind: 'moveLeft' }).cursor, 1);
});

void test('an enormous grapheme is scanned whole and its boundaries are reused', () => {
  const cluster = `e${'\u0301'.repeat(1_100_000)}`;
  const text = `huge:${cluster}!`;
  countSegmentIteration((count) => {
    let buffer = editTextBuffer({ text, cursor: text.length }, { kind: 'moveLeft' });
    assert.equal(buffer.cursor, text.length - 1);
    const traversed = count();
    assert.ok(traversed >= text.length && traversed < text.length * 4, 'giant cluster retries must grow geometrically');
    for (let step = 0; step < 10; step += 1) {
      buffer = editTextBuffer(buffer, { kind: 'moveLeft' });
      assert.equal(buffer.cursor, 5);
      buffer = editTextBuffer(buffer, { kind: 'moveRight' });
      assert.equal(buffer.cursor, text.length - 1);
    }
    assert.equal(count(), traversed);
  });
});
