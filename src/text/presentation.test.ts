import assert from 'node:assert/strict';
import test from 'node:test';
import { defineTextPresentation } from './presentation.ts';
import { createTerminalTextIndex, sliceTerminalTextIndex } from './terminal-text-index.ts';
import { editTextBuffer } from './edit.ts';
import { applyTextEditWithHistory, emptyTextEditHistory } from './edit-history.ts';
import { clipRenderSpans, layoutRenderSpans, wrapRenderSpans } from '../visual/render-content.ts';
import type { TextVisualOrderRequest } from './types.ts';

// Fixed visual-order fixture, deliberately not a bidi implementation.
const text = 'abאב12';
const order = [0, 1, 4, 5, 3, 2];
const presentation = defineTextPresentation({ map(request: TextVisualOrderRequest) {
  const positions = request.text === text ? order : request.graphemes.map(g => g.startOffset);
  return positions.flatMap(offset => {
    const g = request.graphemes.find(cluster => cluster.startOffset === offset);
    return g === undefined ? [] : [{ ...g, direction: request.text === text && (offset === 2 || offset === 3) ? 'rtl' as const : 'ltr' as const }];
  });
} });

void test('one source owner supplies visual paint, inverse edges, and affinity-preserving navigation', () => {
  const index = createTerminalTextIndex(text, { textPresentation: presentation });
  assert.strictEqual(index, createTerminalTextIndex(text, { textPresentation: presentation }));
  assert.equal(index.text, text);
  assert.equal(index.visualGraphemes.map(g => g.text).join(''), 'ab12בא');
  assert.equal(index.positionToVisualColumn({ offset: 2, affinity: 'upstream' }), 2);
  assert.equal(index.positionToVisualColumn({ offset: 2, affinity: 'downstream' }), 6);
  assert.deepEqual(index.visualColumnToPosition(4), { offset: 4, affinity: 'upstream' });
  assert.deepEqual(index.moveVisualPosition({ offset: 2, affinity: 'downstream' }, -1), { offset: 3, affinity: 'upstream' });
  assert.deepEqual(index.visualGraphemesInColumns(2, 5).map(g => g.startOffset), [4, 5, 3]);
  assert.equal(index.selectedText({ startOffset: 2, endOffsetExclusive: 4 }), 'אב');
});

void test('wrapped ranges receive complete paragraph context and authoritative grapheme boundaries', () => {
  const logical = createTerminalTextIndex(text);
  const row = sliceTerminalTextIndex(logical, 2, 6, { textPresentation: presentation, paragraph: { text, startOffset: 2 } });
  assert.equal(row.visualGraphemes.map(g => g.text).join(''), '12בא');
  assert.deepEqual(row.visualGraphemes.map(g => g.startOffset), [2, 3, 1, 0]);
  const lines = wrapRenderSpans([{ text }], 3, { textPresentation: presentation });
  assert.deepEqual(lines.map(line => line.spans.map(span => span.text).join('')), ['abא', '12ב']);
});

void test('styles move with logical clusters and already mapped output is not transformed twice', () => {
  const spans = [{ text: 'ab' }, { text: 'אב', style: { bold: true } }, { text: '12' }];
  const mapped = layoutRenderSpans(spans, { textPresentation: presentation });
  assert.equal(mapped.map(span => span.text).join(''), 'ab12בא');
  assert.equal(mapped.find(span => span.style?.bold)?.text, 'בא');
  assert.deepEqual(layoutRenderSpans(mapped, { textPresentation: presentation }), mapped);
  assert.equal(clipRenderSpans(spans, 5, { textPresentation: presentation }).map(span => span.text).join(''), 'ab12ב');
});

void test('provider validation rejects dropped, duplicate, split, control, and widened clusters', () => {
  const invalid = [
    (request: TextVisualOrderRequest) => request.graphemes.slice(1).map(g => ({ ...g, direction: 'ltr' as const })),
    (request: TextVisualOrderRequest) => request.graphemes.map(() => ({ ...request.graphemes[0], direction: 'ltr' })),
    (request: TextVisualOrderRequest) => request.graphemes.map(g => ({ ...g, endOffsetExclusive: g.startOffset, direction: 'ltr' })),
    (request: TextVisualOrderRequest) => request.graphemes.map(g => ({ ...g, text: '\u001b[31m', direction: 'ltr' })),
    (request: TextVisualOrderRequest) => request.graphemes.map(g => ({ ...g, text: '界', direction: 'ltr' })),
  ];
  for (const map of invalid) {
    assert.throws(() => createTerminalTextIndex('ab', { textPresentation: defineTextPresentation({ map }) }).visualGraphemes, TypeError);
  }
});

void test('combining and zero-width source clusters remain indivisible and mirrored glyph widths are checked', () => {
  const original = 'مَ\u202c(🙂';
  const index = createTerminalTextIndex(original, { textPresentation: defineTextPresentation({
    map(request: TextVisualOrderRequest) { return request.graphemes.toReversed().map(g => ({ ...g,
      text: g.text === '(' ? ')' : g.text, direction: 'rtl' })); },
  }) });
  assert.equal(index.visualGraphemes.map(g => g.text).join(''), '🙂)\u202cمَ');
  assert.equal(index.visualGraphemes.at(-1)?.endOffsetExclusive, 2);
  assert.equal(index.visualGraphemes.find(g => g.text === '\u202c')?.cells, 0);
  assert.equal(index.visualGraphemesInColumns(1, 4).some(g => g.text === '🙂'), false);
});

void test('buffer edits and history retain chosen run-boundary affinity while values stay logical', () => {
  const buffer = { text, cursor: 2 };
  const moved = editTextBuffer(buffer, { kind: 'moveTo', caret: { position: { offset: 2, affinity: 'upstream' } } });
  assert.deepEqual(moved, { text, cursor: 2, affinity: 'upstream' });
  const changed = applyTextEditWithHistory(moved, emptyTextEditHistory(), { kind: 'insert', text: 'x' });
  const restored = applyTextEditWithHistory(changed.buffer, changed.history, { kind: 'undo' });
  assert.deepEqual(restored.buffer, moved);
});

void test('already visual wrapped spans are not reordered and plain-string clipping rejects mapping', async () => {
  const reverse = defineTextPresentation({ map(request: TextVisualOrderRequest) {
    return request.graphemes.toReversed().map(g => ({ ...g, direction: 'rtl' }));
  } });
  const mapped = layoutRenderSpans([{ text: 'abc' }], { textPresentation: reverse });
  assert.equal(wrapRenderSpans(mapped, 2, { textPresentation: reverse }).flatMap(line => line.spans).map(span => span.text).join(''), 'cba');
  const { clipTextCells } = await import('./clip.ts');
  const { wrapTextCells } = await import('./wrap.ts');
  assert.throws(() => clipTextCells(text, 4, { textPresentation: presentation }), /clipRenderSpans/u);
  assert.throws(() => wrapTextCells(text, 4, { textPresentation: presentation }), /wrapRenderSpans/u);
});

void test('failed provider preparation can retry without retaining a closed or partial iterator', () => {
  let attempts = 0;
  const index = createTerminalTextIndex('ab', { textPresentation: defineTextPresentation({ map() { attempts++; throw new Error('unavailable'); } }) });
  assert.throws(() => index.visualGraphemes, /unavailable/u);
  assert.throws(() => index.visualGraphemes, /unavailable/u);
  assert.equal(attempts, 2);
});

void test('revision owners retain large visual maps after bounded global source eviction', async () => {
  const { terminalTextIndexForOwner } = await import('./terminal-text-index.ts');
  const owner = {};
  const large = 'a'.repeat(100_000);
  let calls = 0;
  const provider = defineTextPresentation({ map(request: TextVisualOrderRequest) {
    calls++;
    return request.graphemes.map(g => ({ ...g, direction: 'ltr' }));
  } });
  const index = terminalTextIndexForOwner(owner, large, { textPresentation: provider });
  for (const _charge of index.prepareVisualWork()) void _charge;
  assert.strictEqual(terminalTextIndexForOwner(owner, large, { textPresentation: provider }), index);
  assert.equal(index.visualGraphemesInColumns(50_000, 50_010).length, 10);
  assert.equal(calls, 1);
});

void test('wrapped independent visual runs cannot cut a logical combining cluster', () => {
  const lines = wrapRenderSpans([{ text: 'e', textOrder: 'visual' }, { text: '\u0301אב' }], 3, { textPresentation: presentation });
  assert.equal(lines.flatMap(line => line.spans).map(span => span.text).join(''), 'e\u0301אב');
  const joinedStyleCluster = wrapRenderSpans([{ text: 'e' }, { text: '\u0301אב', style: { bold: true } }], 3, { textPresentation: presentation });
  assert.equal(joinedStyleCluster[0]?.spans[0]?.text, 'e\u0301');
});

void test('visual word navigation follows physical word edges through pure RTL words', () => {
  const rtl = defineTextPresentation({ map(request: TextVisualOrderRequest) {
    return request.graphemes.toReversed().map(g => ({ ...g, direction: 'rtl' }));
  } });
  const index = createTerminalTextIndex('אב גד', { textPresentation: rtl });
  const right = index.moveVisualWordPosition({ offset: 5, affinity: 'downstream' }, 1);
  assert.deepEqual(right, { offset: 3, affinity: 'downstream' });
  assert.deepEqual(index.moveVisualWordPosition(right, 1), { offset: 0, affinity: 'downstream' });
  const left = index.moveVisualWordPosition({ offset: 0, affinity: 'downstream' }, -1);
  assert.deepEqual(left, { offset: 2, affinity: 'upstream' });
  assert.deepEqual(index.moveVisualWordPosition(left, -1), { offset: 5, affinity: 'upstream' });
});

void test('cooperative validation owns provider arrays and records before its first checkpoint', () => {
  let returned: { startOffset: number; endOffsetExclusive: number; text: string; direction: 'ltr' }[] | undefined;
  const index = createTerminalTextIndex('a'.repeat(600), { textPresentation: defineTextPresentation({ map(request: TextVisualOrderRequest) {
    returned = request.graphemes.map(g => ({ ...g, direction: 'ltr' }));
    return returned;
  } }) });
  const work = index.prepareVisualWork();
  while (returned === undefined) assert.equal(work.next().done, false);
  const first = returned[0];
  if (first !== undefined) first.text = 'z';
  returned.length = 256;
  for (const charge of work) void charge;
  assert.equal(index.visualGraphemes.length, 600);
  assert.equal(index.visualGraphemes[0]?.text, 'a');
  assert.equal(index.positionToVisualColumn({ offset: 600, affinity: 'upstream' }), 600);
});

void test('a mirrored glyph cannot inject unbounded combining content at unchanged cell width', () => {
  const index = createTerminalTextIndex('x', { textPresentation: defineTextPresentation({ map(request: TextVisualOrderRequest) {
    return request.graphemes.map(g => ({ ...g, text: 'x' + '\u0301'.repeat(100_000), direction: 'ltr' }));
  } }) });
  assert.throws(() => index.visualGraphemes, /must not expand or contract/u);
});

void test('insertions attach to their resulting trailing grapheme edge and deletion retains the chosen edge', () => {
  const initial = { text: 'abcאבג', cursor: 3, affinity: 'upstream' as const };
  const inserted = editTextBuffer(initial, { kind: 'insert', text: 'X' });
  assert.deepEqual(inserted, { text: 'abcXאבג', cursor: 4, affinity: 'upstream' });
  assert.deepEqual(editTextBuffer(inserted, { kind: 'deleteBackward' }), initial);
  assert.deepEqual(editTextBuffer(initial, { kind: 'deleteForward' }), { text: 'abcבג', cursor: 3, affinity: 'upstream' });
  const joined = editTextBuffer({ text: 'a\u0301b', cursor: 0 }, { kind: 'insert', text: 'e\u0301' });
  assert.equal(joined.affinity, 'upstream');
  assert.equal(joined.cursor, 2);
});

void test('visual word movement does not treat trailing whitespace as the preceding word', () => {
  const identity = defineTextPresentation({ map(request: TextVisualOrderRequest) {
    return request.graphemes.map(g => ({ ...g, direction: 'ltr' }));
  } });
  const index = createTerminalTextIndex('ij  ', { textPresentation: identity });
  assert.deepEqual(index.moveVisualWordPosition({ offset: 2, affinity: 'upstream' }, 1), { offset: 4, affinity: 'upstream' });
});
