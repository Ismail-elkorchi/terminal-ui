import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareWork } from '../../foundation/cooperative-work.ts';
import { createTextDocument, textDocumentApplyChangesExact, textDocumentEditExact, textDocumentLength, textDocumentText } from '../../text/document.ts';
import { defaultTextWidthProfile, defineTextWidthProfile } from '../../text/width-profile.ts';
import { createTextAreaDecorations, readTextAreaDecorations, updateTextAreaDecorations } from './decorations.ts';
import type { TextAreaDecoration } from './contracts.ts';
import type { TextAreaDecorationModel } from './decorations.ts';
import { createTextAreaProjection, createTextAreaProjectionWork } from './projection.ts';
import type { TextAreaProjection } from './projection.ts';

function snapshot(projection: TextAreaProjection, sourceLength: number): unknown {
  const offsets = new Set([0, 1, 2, 3, 4, sourceLength - 2, sourceLength - 1, sourceLength]);
  const displayLength = textDocumentLength(projection.document);
  return {
    text: textDocumentText(projection.document),
    styles: projection.styleRanges,
    accessibility: projection.accessibilityWindow(0, 2_000_000),
    lines: projection.accessibilityLineCount(),
    sourceMappings: [...offsets].map(offset => [
      projection.displayOffsetAtSourceOffset(offset, 'upstream'),
      projection.displayOffsetAtSourceOffset(offset, 'downstream'),
      projection.accessibilityOffsetAtSourceOffset(offset, 'upstream'),
      projection.accessibilityOffsetAtSourceOffset(offset, 'downstream'),
    ]),
    displayMappings: [...offsets, displayLength - 1, displayLength].map(offset => [
      projection.sourceOffsetAtDisplayOffset(offset, 'upstream'),
      projection.sourceOffsetAtDisplayOffset(offset, 'downstream'),
    ]),
  };
}

void test('projection work preserves controls, replacements, concealments, style precedence and affinities', async () => {
  const source = 'A\tB\x1b[31mred\x1b[0m\r\n界·😀 Z';
  const decorations: readonly TextAreaDecorationModel[] = Object.freeze([
    { kind: 'style', startOffset: 0, endOffsetExclusive: source.length, order: 0, label: 'outer', style: { bold: true } },
    { kind: 'replace', startOffset: 2, endOffsetExclusive: 3, order: 1, label: 'replacement', replacementText: '·\tQ', accessibilityText: 'read\tme', style: { italic: true } },
    { kind: 'conceal', startOffset: source.length - 2, endOffsetExclusive: source.length, order: 2, label: 'hidden' },
    { kind: 'replace', startOffset: source.length, endOffsetExclusive: source.length, order: 3, label: 'virtual', replacementText: '\nTAIL' },
  ]);
  const profile = defineTextWidthProfile({ ambiguous: 'wide', emoji: 'narrow' });
  const direct = createTextAreaProjection(createTextDocument(source), decorations, profile);
  const document = createTextDocument(source);
  const prepared = await prepareWork(createTextAreaProjectionWork(document, decorations, profile), {
    signal: new AbortController().signal, yield: () => Promise.resolve(),
  });
  assert.deepEqual(snapshot(prepared, source.length), snapshot(direct, source.length));
  assert.equal(textDocumentText(prepared.document), 'A   ·  Qred\n界·😀\nTAIL');
  assert.equal(prepared.accessibilityWindow(0, 100).text, 'A   read    mered\n界·😀\nTAIL');
  assert.equal(createTextAreaProjection(document, decorations, profile), prepared, 'completed work is the ordinary projection cache entry');
  assert.equal(prepared.displayOffsetAtSourceOffset(source.length, 'upstream'), textDocumentLength(prepared.document) - 5);
  assert.equal(prepared.displayOffsetAtSourceOffset(source.length, 'downstream'), textDocumentLength(prepared.document));
});

void test('long tabbed projection checkpoints, retains line maps and never allocates full measured arrays', async () => {
  for (const length of [110_000, 1_100_000]) {
    const source = `${'x'.repeat(length)}\t·😀\tend\nlast`;
    const document = createTextDocument(source);
    const decorations: readonly TextAreaDecorationModel[] = Object.freeze([]);
    const segment = Object.getOwnPropertyDescriptor(Intl.Segmenter.prototype, 'segment');
    const originalSegment = segment?.value as (this: Intl.Segmenter, text: string) => Intl.Segments;
    const freeze = Object.getOwnPropertyDescriptor(Object, 'freeze');
    const originalFreeze = freeze?.value as typeof Object.freeze;
    const nativeSizes: number[] = [];
    let measuredObjects = 0;
    let yields = 0;
    let firstYieldNativeUnits = 0;
    Object.defineProperty(Intl.Segmenter.prototype, 'segment', { configurable: true, value: function(this: Intl.Segmenter, text: string) {
      nativeSizes.push(text.length);
      return originalSegment.call(this, text);
    } });
    Object.defineProperty(Object, 'freeze', { configurable: true, value: (value: unknown) => {
      if (typeof value === 'object' && value !== null && 'cells' in value && 'startOffset' in value && 'text' in value) measuredObjects++;
      return originalFreeze(value);
    } });
    try {
      const prepared = await prepareWork(createTextAreaProjectionWork(document, decorations, defaultTextWidthProfile), {
        signal: new AbortController().signal,
        yield: () => {
          if (yields++ === 0) firstYieldNativeUnits = nativeSizes.reduce((total, size) => total + size, 0);
          return Promise.resolve();
        },
      });
      assert.ok(firstYieldNativeUnits < 10_000, 'cold tab scanning must suspend before traversing the source');
      assert.ok(yields > length / 4_096, `insufficient checkpoints for ${String(length)} units`);
      assert.equal(measuredObjects, 0);
      assert.ok(nativeSizes.every(size => size <= 4_097));
      const warm = nativeSizes.length;
      for (let index = 0; index < 10; index++) {
        assert.equal(prepared.displayOffsetAtSourceOffset(length), length);
        assert.equal(prepared.sourceOffsetAtDisplayOffset(length + 1, 'upstream'), length);
        assert.equal(createTextAreaProjection(document, decorations, defaultTextWidthProfile), prepared);
      }
      assert.equal(nativeSizes.length, warm, 'offset queries reuse prepared maps');
      const edited = textDocumentEditExact(document, source.length - 1, source.length, 'X').document;
      const next = await prepareWork(createTextAreaProjectionWork(edited, decorations, defaultTextWidthProfile), {
        signal: new AbortController().signal, yield: () => Promise.resolve(),
      });
      assert.equal(nativeSizes.length, warm, 'editing another line must preserve a prepared enormous tab-line map');
      assert.ok(textDocumentText(next.document).endsWith('lasX'));
      assert.ok(textDocumentText(prepared.document).endsWith('last'), 'older projection remains immutable');
    } finally {
      if (segment !== undefined) Object.defineProperty(Intl.Segmenter.prototype, 'segment', segment);
      if (freeze !== undefined) Object.defineProperty(Object, 'freeze', freeze);
    }
  }
});

void test('cancellation stops cold source, replacement and dense decoration scans before cache publication', async () => {
  const source = '界\t\x1b[31mX\x1b[0m'.repeat(15_000);
  const cases: readonly { source: string; decorations: readonly TextAreaDecorationModel[] }[] = [
    { source, decorations: [] },
    { source: 'a', decorations: [{ kind: 'replace', startOffset: 0, endOffsetExclusive: 1, order: 0, label: 'large', replacementText: source }] },
    { source: 'abc', decorations: Array.from({ length: 10_000 }, (_, order): TextAreaDecorationModel => ({ kind: 'style', startOffset: 0, endOffsetExclusive: 2, order, label: `style ${String(order)}` })) },
  ];
  for (const input of cases) {
    const document = createTextDocument(input.source);
    const controller = new AbortController();
    let yields = 0;
    await assert.rejects(prepareWork(createTextAreaProjectionWork(document, input.decorations, defaultTextWidthProfile), {
      signal: controller.signal,
      yield: () => { if (++yields === 3) controller.abort(new Error('projection cancelled')); return Promise.resolve(); },
    }), /projection cancelled/u);
    assert.equal(yields, 3);
    const retry = createTextAreaProjectionWork(document, input.decorations, defaultTextWidthProfile);
    assert.equal(retry.next().done, false, 'an aborted result must not appear in the projection cache');
    retry.return(undefined as never);
  }
});

void test('shared projection work handles dense virtual and conceal spans with synchronous parity', async () => {
  const source = 'a '.repeat(3_000);
  const decorations: TextAreaDecorationModel[] = [];
  for (let index = 0; index < source.length; index += 2) {
    decorations.push({ kind: 'conceal', startOffset: index, endOffsetExclusive: index + 1, order: decorations.length, label: 'hidden' });
    decorations.push({ kind: 'replace', startOffset: index + 1, endOffsetExclusive: index + 1, order: decorations.length, label: 'insert', replacementText: '·\t' });
  }
  let yields = 0;
  const prepared = await prepareWork(createTextAreaProjectionWork(createTextDocument(source), decorations, defaultTextWidthProfile), {
    signal: new AbortController().signal, yield: () => { yields++; return Promise.resolve(); },
  });
  assert.ok(yields > 100);
  const direct = createTextAreaProjection(createTextDocument(source), decorations, defaultTextWidthProfile);
  assert.deepEqual(snapshot(prepared, source.length), snapshot(direct, source.length));
  assert.ok(!textDocumentText(prepared.document).includes('a'));
});

void test('incremental materialized projection keeps prior mappings and cooperates while replacing spans', async () => {
  const source = 'header\n' + 'row\tvalue\n'.repeat(2_000) + 'tail';
  const document = createTextDocument(source);
  const decorationInput: readonly TextAreaDecoration[] = [
    { kind: 'replace', startOffset: 0, endOffsetExclusive: 6, label: 'heading', replacementText: 'H', accessibilityText: 'Heading' },
    { kind: 'conceal', startOffset: source.length - 4, endOffsetExclusive: source.length, label: 'concealed' },
  ];
  const decorations = createTextAreaDecorations({ document, decorations: decorationInput });
  const original = createTextAreaProjection(document, readTextAreaDecorations(decorations).decorations, defaultTextWidthProfile);
  const changeOffset = source.indexOf('row', 5_000);
  const insertion = 'more\tdata\n';
  const edited = textDocumentEditExact(document, changeOffset, changeOffset, insertion).document;
  const heading = decorationInput[0];
  assert.ok(heading !== undefined);
  const nextInput: readonly TextAreaDecoration[] = [heading,
    { kind: 'conceal', startOffset: source.length - 4 + insertion.length, endOffsetExclusive: source.length + insertion.length, label: 'concealed' }];
  const nextDecorations = updateTextAreaDecorations({ previousDecorations: decorations, document: edited, decorations: nextInput });
  let yields = 0;
  const prepared = await prepareWork(createTextAreaProjectionWork(edited, readTextAreaDecorations(nextDecorations).decorations, defaultTextWidthProfile), {
    signal: new AbortController().signal, yield: () => { yields++; return Promise.resolve(); },
  });
  assert.ok(yields > 20, 'retained mapping replacement must cooperate');
  assert.equal(textDocumentText(prepared.document), 'H\n' + 'row value\n'.repeat((changeOffset - 7) / 10) + 'more    data\n' + 'row value\n'.repeat(2_000 - (changeOffset - 7) / 10));
  assert.equal(prepared.accessibilityWindow(0, 20).text.startsWith('Heading\n'), true);
  assert.equal(textDocumentText(original.document), 'H\n' + 'row value\n'.repeat(2_000));
  assert.equal(prepared.displayOffsetAtSourceOffset(source.length + insertion.length), textDocumentLength(prepared.document));
});

void test('prepared long-line maps follow inserted and removed line ranges without retaining stale offsets', async () => {
  const source = 'head\n' + 'a'.repeat(5_000) + '\tA\nmid\n' + 'b'.repeat(5_000) + '\tB\ntail';
  const decorations: readonly TextAreaDecorationModel[] = Object.freeze([]);
  let document = createTextDocument(source);
  createTextAreaProjection(document, decorations, defaultTextWidthProfile);
  document = textDocumentApplyChangesExact(document, [
    { startOffset: 0, endOffsetExclusive: 0, insertedText: 'new\n' },
    { startOffset: source.indexOf('mid'), endOffsetExclusive: source.indexOf('mid') + 4, insertedText: '' },
  ]);
  const projection = await prepareWork(createTextAreaProjectionWork(document, decorations, defaultTextWidthProfile), {
    signal: new AbortController().signal, yield: () => Promise.resolve(),
  });
  const changed = textDocumentText(document);
  const fresh = createTextAreaProjection(createTextDocument(changed), decorations, defaultTextWidthProfile);
  assert.deepEqual(snapshot(projection, changed.length), snapshot(fresh, changed.length));
  for (let offset = 0; offset < changed.length; offset++) {
    assert.equal(projection.displayOffsetAtSourceOffset(offset), fresh.displayOffsetAtSourceOffset(offset));
  }
});
