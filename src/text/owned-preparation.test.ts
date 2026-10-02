import assert from 'node:assert/strict';
import test from 'node:test';
import type { TextDocument } from './document.ts';
import { createTextDocument, textDocumentEdit, textDocumentLineAt, textDocumentLineBoundaries } from './document.ts';
import { editTextDocument } from './document-edit.ts';
import { editTextBuffer } from './edit.ts';
import { prepareTextBuffer, prepareTextDocumentLine } from './preparation.ts';
import { extractTextBufferSelection } from './selection.ts';
import { SourceBoundaryIndex, bufferSourceBoundaries, sourceBoundaries, cachedSourceBoundaries } from './source-boundaries.ts';
import { sourceGeometry } from './source-geometry.ts';
import { ownedWordBoundaryIndex } from './word-boundaries.ts';
import type { TextEditBuffer } from './types.ts';

function nativeProbe(): { readonly calls: { granularity: string; length: number }[]; readonly measured: () => number; readonly restore: () => void } {
  const segment = Object.getOwnPropertyDescriptor(Intl.Segmenter.prototype, 'segment');
  const freeze = Object.getOwnPropertyDescriptor(Object, 'freeze');
  const originalSegment = segment?.value as (this: Intl.Segmenter, text: string) => Intl.Segments;
  const originalFreeze = freeze?.value as typeof Object.freeze;
  const calls: { granularity: string; length: number }[] = [];
  let measured = 0;
  Object.defineProperty(Intl.Segmenter.prototype, 'segment', { configurable: true, value: function(this: Intl.Segmenter, text: string) {
    calls.push({ granularity: this.resolvedOptions().granularity, length: text.length });
    return originalSegment.call(this, text);
  } });
  Object.defineProperty(Object, 'freeze', { configurable: true, value: (value: unknown) => {
    if (typeof value === 'object' && value !== null && 'cells' in value && 'startOffset' in value && 'text' in value) measured++;
    return originalFreeze(value);
  } });
  return { calls, measured: () => measured, restore: () => {
    if (segment !== undefined) Object.defineProperty(Intl.Segmenter.prototype, 'segment', segment);
    if (freeze !== undefined) Object.defineProperty(Object, 'freeze', freeze);
  } };
}

void test('owned word navigation and selection reuse native word state above standalone retention limits', () => {
  for (const length of [130_000, 1_100_000]) {
    const text = `${'alpha beta '.repeat(Math.ceil(length / 11))}tail`;
    let buffer: TextEditBuffer = { text, cursor: text.length - 4 };
    const document = createTextDocument(text);
    const source = textDocumentLineBoundaries(document, lineAt(document));
    const probe = nativeProbe();
    try {
      buffer = editTextBuffer(buffer, { kind: 'moveWordLeft' });
      const words = ownedWordBoundaryIndex(source);
      assert.equal(words.selectionAt(text.length - 2).startOffset, text.length - 4);
      const warm = probe.calls.length;
      for (let index = 0; index < 12; index++) {
        buffer = editTextBuffer(buffer, { kind: 'moveWordRight' });
        buffer = editTextBuffer(buffer, { kind: 'moveWordLeft' });
        words.previous(text.length);
        words.next(text.length - 4);
        assert.deepEqual(words.selectionAt(text.length - 2), { startOffset: text.length - 4, endOffsetExclusive: text.length });
      }
      assert.equal(probe.calls.length, warm);
      assert.ok(probe.calls.filter(call => call.granularity === 'word').length <= 2);
      assert.equal(probe.measured(), 0, 'word queries must not allocate measured grapheme objects');
      const selected = { ...buffer, selection: { startOffset: text.length - 4, endOffsetExclusive: text.length } };
      // Retain the same owner just as an edit-produced selection does.
      const all = editTextBuffer(buffer, { kind: 'selectAll' });
      assert.equal(extractTextBufferSelection({ buffer: all, sanitize: false }), text);
      assert.equal(extractTextBufferSelection({ buffer: selected, sanitize: false }), 'tail');
      const deleted = editTextBuffer(buffer, { kind: 'deleteWordForward' });
      assert.ok(deleted.text.length < text.length);
      assert.equal(words.selectionAt(text.length - 2).endOffsetExclusive, text.length, 'old revision remains usable');
    } finally { probe.restore(); }
  }
});

void test('owned geometry measures only requested prefixes, preserves preferred columns and separates profiles', () => {
  for (const length of [110_000, 1_100_000]) {
    const document = createTextDocument(`${'v'.repeat(length)}\n·😀${'x'.repeat(length)}`);
    const source = textDocumentLineBoundaries(document, lineAt(document));
    const slices: number[] = [];
    const original = source.source.slice.bind(source.source);
    source.source.slice = (start, end = source.source.length) => { slices.push(end - start); return original(start, end); };
    const probe = nativeProbe();
    try {
      const start = { document, caret: { position: { offset: 4, affinity: 'downstream' as const } } };
      const moved = editTextDocument(start, { kind: 'moveLineDown' });
      assert.equal(moved.caret.position.offset, length + 5);
      assert.equal(moved.caret.preferredColumnCells, 4);
      const calls = probe.calls.length;
      for (let index = 0; index < 20; index++) {
        const back = editTextDocument(moved, { kind: 'moveLineUp' });
        assert.equal(back.caret.position.offset, 4);
        assert.equal(editTextDocument(back, { kind: 'moveLineDown' }).caret.position.offset, moved.caret.position.offset);
      }
      assert.equal(probe.calls.length, calls);
      assert.equal(probe.measured(), 0, 'vertical movement must not build frozen measured arrays');
      assert.ok(slices.every(size => size <= 4_097), `materialized oversized slices: ${String(Math.max(...slices))}`);
      const wide = editTextDocument(start, { kind: 'moveLineDown' }, { widthProfile: { emoji: 'wide', ambiguous: 'wide' } });
      assert.equal(wide.caret.position.offset, length + 4);
      assert.equal(probe.calls.length, calls, 'width changes reuse source boundaries');
      const preferred = editTextDocument({ document, caret: { position: { offset: length - 10, affinity: 'downstream' }, preferredColumnCells: 2 } }, { kind: 'moveLineDown' });
      assert.equal(preferred.caret.position.offset, length + 2);
      assert.equal(sourceGeometry(source).columnAt(4), 4);
      const changed = textDocumentEdit(document, { startOffset: 0, endOffsetExclusive: 1 }, '界').document;
      assert.equal(editTextDocument({ ...start, document: changed }, { kind: 'moveLineDown' }).caret.preferredColumnCells, 5);
      assert.equal(editTextDocument(start, { kind: 'moveLineDown' }).caret.preferredColumnCells, 4);
    } finally { probe.restore(); source.source.slice = original; }
  }
});

void test('locale state is canonical, bounded per owner and remains independent of geometry', () => {
  const source = new SourceBoundaryIndex('ภาษาไทย English 中文 word');
  const english = ownedWordBoundaryIndex(source, { locale: 'en-us' });
  assert.equal(english, ownedWordBoundaryIndex(source, { locale: 'en-US' }));
  const native = (locale: string) => [...new Intl.Segmenter(locale, { granularity: 'word' }).segment(source.source.slice(0))].filter(segment => segment.isWordLike);
  for (const locale of ['en-US', 'th', 'zh', 'ja', 'fr', 'de', 'es', 'it', 'nl', 'pl', 'sv', 'fi']) {
    const index = ownedWordBoundaryIndex(source, { locale });
    for (const segment of native(locale)) assert.equal(index.next(segment.index), segment.index + segment.segment.length);
  }
  assert.notEqual(english, ownedWordBoundaryIndex(source, { locale: 'en-US' }), 'old locale owner was not evicted');
  assert.equal(english.next(0), native('en-US')[0]?.segment.length, 'eviction must not invalidate an existing reference');
});

void test('source preparation yields, owns dependencies, resumes after abort and feeds ordinary editing', async () => {
  const buffer = { text: `cold:${'a b '.repeat(30_000)}`, cursor: 80_000 };
  const profile = { emoji: 'wide' as 'wide' | 'narrow', ambiguous: 'narrow' as const };
  const request = { throughOffset: 90_000, words: true, geometry: true, locale: 'en-us', widthProfile: profile };
  const controller = new AbortController();
  let yields = 0;
  await assert.rejects(prepareTextBuffer(buffer, request, { signal: controller.signal, yield: () => {
    yields++;
    controller.abort(new Error('cancelled preparation'));
    return Promise.resolve();
  } }), /cancelled preparation/u);
  const abortedYields = yields;
  assert.equal(abortedYields, 1);
  const prepared = await prepareTextBuffer(buffer, request, { signal: new AbortController().signal, yield: () => {
    yields++;
    request.throughOffset = 0;
    profile.emoji = 'narrow';
    return Promise.resolve();
  } });
  assert.equal(prepared.buffer, buffer);
  assert.equal(prepared.text, buffer.text);
  assert.equal(prepared.request.throughOffset, 90_000);
  assert.equal(prepared.request.widthProfile.emoji, 'wide');
  assert.equal(prepared.request.locale, 'en-US');
  assert.ok(yields > 100);
  const probe = nativeProbe();
  try {
    editTextBuffer(buffer, { kind: 'moveWordRight' }, { locale: prepared.request.locale });
    sourceGeometry(bufferSourceBoundaries(buffer), prepared.request).columnAt(80_000);
    assert.equal(probe.calls.length, 0);
    assert.equal(probe.measured(), 0);
  } finally { probe.restore(); }
  const aborted = new AbortController();
  aborted.abort(new Error('already aborted'));
  assert.throws(() => prepareTextBuffer(buffer, {}, { signal: aborted.signal, yield: () => Promise.resolve() }), /already aborted/u);
  for (const throughOffset of [NaN, Infinity, -1, 1.5, buffer.text.length + 1]) {
    assert.throws(() => prepareTextBuffer(buffer, { throughOffset }, { signal: new AbortController().signal, yield: () => Promise.resolve() }), RangeError);
  }
});

void test('interleaved preparation and synchronous readers do not lose pending native word segments', async () => {
  const buffer = { text: `${'a'.repeat(15_000)} tail`, cursor: 0 };
  let interleaved = false;
  const prepared = await prepareTextBuffer(buffer, { throughOffset: 0, words: true }, {
    signal: new AbortController().signal,
    yield: () => {
      if (!interleaved) {
        interleaved = true;
        assert.equal(editTextBuffer(buffer, { kind: 'moveWordRight' }).cursor, 15_000);
      }
      return Promise.resolve();
    },
  });
  assert.equal(prepared.buffer, buffer);
  assert.equal(ownedWordBoundaryIndex(bufferSourceBoundaries(buffer)).next(15_000), buffer.text.length);
  const document = createTextDocument('·😀abcdef\nother');
  const result = await prepareTextDocumentLine(document, 0, { throughOffset: 0, throughColumnCells: 4 }, {
    signal: new AbortController().signal, yield: () => Promise.resolve(),
  });
  assert.equal(result.document, document);
  assert.equal(result.lineIndex, 0);
  assert.equal(result.request.throughColumnCells, 4);
});

void test('near-end revisions inherit numeric geometry pages without copying or measuring their unchanged prefixes', () => {
  const original = createTextDocument(`geometry:${'·a'.repeat(550_000)}`);
  const originalLine = lineAt(original);
  const originalSource = textDocumentLineBoundaries(original, originalLine);
  const originalGeometry = sourceGeometry(originalSource);
  const cells = originalGeometry.columnAt(originalLine.endOffsetExclusive);
  let document = original;
  for (let edit = 0; edit < 12; edit++) {
    const previousLine = lineAt(document);
    const at = previousLine.endOffsetExclusive - 3;
    document = textDocumentEdit(document, { startOffset: at, endOffsetExclusive: at }, 'x').document;
    const line = lineAt(document);
    const source = textDocumentLineBoundaries(document, line);
    let slicedUnits = 0;
    const slice = source.source.slice.bind(source.source);
    source.source.slice = (start, end = source.source.length) => { slicedUnits += end - start; return slice(start, end); };
    assert.equal(sourceGeometry(source).columnAt(line.endOffsetExclusive), cells + edit + 1);
    assert.ok(slicedUnits < 100, `revision remeasured ${String(slicedUnits)} unchanged source units`);
    source.source.slice = slice;
  }
  for (let edit = 0; edit < 20; edit++) {
    const line = lineAt(document);
    document = textDocumentEdit(document, { startOffset: line.endOffsetExclusive - 1, endOffsetExclusive: line.endOffsetExclusive - 1 }, 'q').document;
  }
  const lastLine = lineAt(document);
  const lastSource = textDocumentLineBoundaries(document, lastLine);
  let afterBurstUnits = 0;
  const lastSlice = lastSource.source.slice.bind(lastSource.source);
  lastSource.source.slice = (start, end = lastSource.source.length) => { afterBurstUnits += end - start; return lastSlice(start, end); };
  assert.equal(sourceGeometry(lastSource).columnAt(lastLine.endOffsetExclusive), cells + 32);
  assert.ok(afterBurstUnits < 200, 'unpainted intermediate revisions discarded inherited geometry');
  assert.equal(originalGeometry.columnAt(originalLine.endOffsetExclusive), cells);
});

void test('preparation rejects invalid JavaScript contracts and column-only work stays a prefix', async () => {
  const buffer = { text: `column:${'z'.repeat(1_100_000)}`, cursor: 0 };
  const context = { signal: new AbortController().signal, yield: () => Promise.resolve() };
  for (const request of [null, [], { obsolete: true }, { geometry: 'yes' }, { words: 1 }, { locale: 1 },
    { locale: 'invalid_locale' }, { widthProfile: { emoji: 'unknown', ambiguous: 'wide' } }, { throughColumnCells: Infinity }, { throughOffset: null }]) {
    assert.throws(() => prepareTextBuffer(buffer, request as never, context));
  }
  for (const source of [null, {}, { text: 1, cursor: 0 }, { text: '', cursor: '0' }]) {
    assert.throws(() => prepareTextBuffer(source as never, {}, context), TypeError);
  }
  const probe = nativeProbe();
  try {
    const prepared = await prepareTextBuffer(buffer, { throughColumnCells: 20 }, context);
    assert.equal(prepared.request.throughOffset, 0);
    assert.equal(prepared.request.throughColumnCells, 20);
    assert.ok(probe.calls.reduce((sum, call) => sum + call.length, 0) <= 4_096);
  } finally { probe.restore(); }
});

function lineAt(document: TextDocument) {
  const line = textDocumentLineAt(document, 0);
  assert.ok(line);
  return line;
}

void test('lazy terminal prefix geometry matches materialized Unicode indexes for every width profile', async () => {
  const { createTerminalTextIndex } = await import('./terminal-text-index.ts');
  const { segmentGraphemesForMeasurement } = await import('./graphemes.ts');
  const sources = ['', '\u0301', '\u0301a\u200b', '·😀界e\u0301\r\n🇲🇦a', '👩🏽‍💻𑄌\u094d\u0937\tend'];
  for (const emoji of ['narrow', 'wide', 'codepoint'] as const) for (const ambiguous of ['narrow', 'wide'] as const) {
    const options = { widthProfile: { emoji, ambiguous } };
    for (const text of sources) {
      const segments = segmentGraphemesForMeasurement(text, options);
      const offsets = [0];
      const columns = [0];
      for (const segment of segments) {
        offsets.push(segment.endOffsetExclusive);
        columns.push((columns.at(-1) ?? 0) + segment.cells);
      }
      const index = createTerminalTextIndex(text, options);
      for (let offset = 0; offset <= text.length; offset++) {
        const expected = offsets.findLastIndex(value => value <= offset);
        assert.equal(index.codeUnitOffsetToGraphemeIndex(offset), expected);
      }
      for (let column = 0; column <= (columns.at(-1) ?? 0) + 2; column++) {
        const expected = columns.findLastIndex(value => value <= column);
        assert.equal(index.visualColumnToGraphemeIndex(column), expected);
      }
      for (let position = 0; position <= offsets.length + 2; position++) {
        assert.equal(index.graphemeIndexToCodeUnitOffset(position), offsets[Math.min(position, offsets.length - 1)]);
        assert.equal(index.graphemeIndexToVisualColumn(position), columns[Math.min(position, columns.length - 1)]);
      }
    }
  }
});

void test('tiny selections on owned rope indexes materialize only the requested UTF-16 slice', async () => {
  const { ownedTerminalTextIndex } = await import('./terminal-text-index.ts');
  const document = createTextDocument(`selection:${'a'.repeat(1_100_000)}😀`);
  const source = textDocumentLineBoundaries(document, lineAt(document));
  let units = 0;
  const slice = source.source.slice.bind(source.source);
  source.source.slice = (start, end = source.source.length) => { units += end - start; return slice(start, end); };
  const index = ownedTerminalTextIndex(source);
  assert.equal(index.selectedText({ startOffset: 100, endOffsetExclusive: 103 }), 'aaa');
  assert.equal(units, 3);
  // Public selectedText slices raw UTF-16 bounds; it does not expand a selection.
  assert.equal(index.selectedText({ startOffset: source.source.length - 1, endOffsetExclusive: source.source.length }), '\ude00');
  assert.equal(units, 4);
});

void test('word work survives edits to a different logical line without retaining the old source wrapper', () => {
  const long = `${'alpha beta '.repeat(100_000)}tail`;
  const original = createTextDocument(`other\n${long}`);
  const originalLine = textDocumentLineAt(original, 1);
  assert.ok(originalLine);
  const originalSource = textDocumentLineBoundaries(original, originalLine);
  const originalWords = ownedWordBoundaryIndex(originalSource);
  assert.equal(originalWords.next(long.length - 4), long.length);
  let document = original;
  const probe = nativeProbe();
  try {
    for (let edit = 0; edit < 12; edit++) {
      document = textDocumentEdit(document, { startOffset: 1, endOffsetExclusive: 1 }, 'x').document;
      const line = textDocumentLineAt(document, 1);
      assert.ok(line);
      const source = textDocumentLineBoundaries(document, line);
      assert.notEqual(source, originalSource);
      const words = ownedWordBoundaryIndex(source);
      assert.notEqual(words, originalWords);
      assert.equal(words.previous(long.length), long.length - 4);
      assert.equal(words.next(long.length - 4), long.length);
    }
    assert.equal(probe.calls.filter(call => call.granularity === 'word').length, 0, 'an untouched logical line restarted native word segmentation');
    assert.ok(probe.calls.every(call => call.length < 100), 'edits to the small line resegmented the large retained line');
    assert.equal(originalWords.next(long.length - 4), long.length);
    const line = textDocumentLineAt(document, 1);
    assert.ok(line);
    const changed = textDocumentEdit(document, { startOffset: line.startOffset, endOffsetExclusive: line.startOffset + 5 }, 'CHANGED').document;
    const changedLine = textDocumentLineAt(changed, 1);
    assert.ok(changedLine);
    assert.equal(ownedWordBoundaryIndex(textDocumentLineBoundaries(changed, changedLine)).next(0), 7);
    assert.equal(probe.calls.filter(call => call.granularity === 'word').length, 1, 'a changed line must get independent locale state');
  } finally { probe.restore(); }
});

void test('derived locale and geometry retention is charged against the standalone source budget', () => {
  const text = `budgeted ${'ab '.repeat(34_000)}`;
  const source = sourceBoundaries(text);
  assert.equal(cachedSourceBoundaries(text), source);
  const words = ownedWordBoundaryIndex(source, { locale: 'en' });
  assert.equal(words.next(0), 8);
  assert.equal(sourceGeometry(source).columnAt(10), 10);
  ownedWordBoundaryIndex(source, { locale: 'th' });
  ownedWordBoundaryIndex(source, { locale: 'fr' });
  assert.equal(cachedSourceBoundaries(text), undefined, 'derived native/numeric reservations bypassed the source budget');
  assert.equal(words.next(0), 8, 'global eviction invalidated the live owner');
});

void test('cooperative projection sanitizers share direct semantics and own width policy across yields', async () => {
  const { sanitizeTerminalText, sanitizeTerminalTextWork, sanitizeTerminalControlText, sanitizeTerminalControlTextWork } = await import('./sanitize.ts');
  const source = `${'·'.repeat(3_000)}\tZ\u001b[31mred\u001b[0m\r\nend`;
  const profile = { emoji: 'wide' as const, ambiguous: 'wide' as 'wide' | 'narrow' };
  const expected = sanitizeTerminalText(source, { widthProfile: { ...profile } });
  const work = sanitizeTerminalTextWork(source, { widthProfile: profile });
  let step = work.next();
  assert.equal(step.done, false);
  profile.ambiguous = 'narrow';
  while (!step.done) step = work.next();
  assert.deepEqual(step.value, expected);
  const controls = sanitizeTerminalControlTextWork(source);
  let control = controls.next();
  while (!control.done) control = controls.next();
  assert.deepEqual(control.value, sanitizeTerminalControlText(source));
});

void test('cooperative document creation and exact changes share sync results and publish nothing on abort', async () => {
  const { prepareTextDocument } = await import('./preparation.ts');
  const { textDocumentText, textDocumentBytes, textDocumentLineCount, textDocumentEditExact,
    textDocumentEditExactWork, textDocumentApplyChangesExact, textDocumentApplyChangesExactWork } = await import('./document.ts');
  const { prepareWork } = await import('../foundation/cooperative-work.ts');
  const source = `header\r\n${'·😀e\u0301\tline\n'.repeat(40_000)}`;
  let yields = 0;
  const context = { signal: new AbortController().signal, yield: () => { yields++; return Promise.resolve(); } };
  const prepared = await prepareTextDocument(source, context);
  const direct = createTextDocument(source);
  assert.equal(textDocumentText(prepared), textDocumentText(direct));
  assert.equal(textDocumentBytes(prepared), textDocumentBytes(direct));
  assert.equal(textDocumentLineCount(prepared), textDocumentLineCount(direct));
  assert.ok(yields > 10);
  const replacement = 'replacement\n'.repeat(20_000);
  const changed = await prepareWork(textDocumentEditExactWork(prepared, 5, 11, replacement), context);
  const syncChanged = textDocumentEditExact(direct, 5, 11, replacement);
  assert.equal(textDocumentText(changed.document), textDocumentText(syncChanged.document));
  assert.deepEqual(changed.replaced, syncChanged.replaced);
  const changes = Array.from({ length: 512 }, (_, index) => ({ startOffset: index * 8, endOffsetExclusive: index * 8 + 1, insertedText: 'x' }));
  const batched = await prepareWork(textDocumentApplyChangesExactWork(prepared, changes), context);
  assert.equal(textDocumentText(batched), textDocumentText(textDocumentApplyChangesExact(direct, changes)));
  const controller = new AbortController();
  let abortYields = 0;
  await assert.rejects(prepareTextDocument(source, { signal: controller.signal, yield: () => {
    abortYields++;
    controller.abort(new Error('stop document loading'));
    return Promise.resolve();
  } }), /stop document loading/u);
  assert.equal(abortYields, 1);
  assert.equal(textDocumentText(prepared), source, 'aborted work modified an existing document');
  const preAborted = new AbortController();
  preAborted.abort(new Error('before loading'));
  assert.throws(() => prepareTextDocument(source, { signal: preAborted.signal, yield: () => Promise.resolve() }), /before loading/u);
});

void test('standalone word cache validates locale before admitting text-key reuse', async () => {
  const { nextWordBoundary } = await import('./word-boundaries.ts');
  nextWordBoundary('prefix\u0000word', 0, { locale: 'en' });
  assert.throws(() => nextWordBoundary('word', 0, { locale: 'en\u0000prefix' }), RangeError);
});

void test('an unchanged-line fork can finish a pending native word without corrupting either revision', async () => {
  const document = createTextDocument(`other\n${'x'.repeat(15_000)} tail`);
  const gate = Promise.withResolvers<undefined>();
  const started = Promise.withResolvers<undefined>();
  let blocked = false;
  const preparing = prepareTextDocumentLine(document, 1, { throughOffset: 0, words: true }, {
    signal: new AbortController().signal,
    yield: () => {
      if (!blocked) { blocked = true; started.resolve(undefined); return gate.promise; }
      return Promise.resolve();
    },
  });
  await started.promise;
  const changed = textDocumentEdit(document, { startOffset: 0, endOffsetExclusive: 0 }, 'new ').document;
  const changedLine = textDocumentLineAt(changed, 1);
  assert.ok(changedLine);
  const changedWords = ownedWordBoundaryIndex(textDocumentLineBoundaries(changed, changedLine));
  assert.equal(changedWords.next(0), 15_000);
  assert.equal(changedWords.next(15_000), 15_005);
  gate.resolve(undefined);
  assert.equal((await preparing).document, document);
  const originalLine = textDocumentLineAt(document, 1);
  assert.ok(originalLine);
  const originalWords = ownedWordBoundaryIndex(textDocumentLineBoundaries(document, originalLine));
  assert.equal(originalWords.next(0), 15_000);
  assert.equal(originalWords.next(15_000), 15_005);
});

void test('oversized owned edits never hash full new buffer strings for an ineligible stateless cache', () => {
  const text = `hash:${'a'.repeat(1_100_000)}`;
  let buffer = editTextBuffer({ text, cursor: text.length - 3 }, { kind: 'moveLeft' });
  const descriptor = Object.getOwnPropertyDescriptor(Map.prototype, 'get');
  const original = descriptor?.value as (this: Map<unknown, unknown>, key: unknown) => unknown;
  let oversizedLookups = 0;
  Object.defineProperty(Map.prototype, 'get', { configurable: true, value: function(this: Map<unknown, unknown>, key: unknown) {
    if (typeof key === 'string' && key.length >= 1_000_000) oversizedLookups++;
    return original.call(this, key);
  } });
  try {
    for (let edit = 0; edit < 8; edit++) {
      buffer = editTextBuffer(buffer, { kind: 'insert', text: 'x' });
      buffer = editTextBuffer(buffer, { kind: 'deleteBackward' });
    }
    assert.equal(oversizedLookups, 0);
  } finally {
    if (descriptor !== undefined) Object.defineProperty(Map.prototype, 'get', descriptor);
  }
});
