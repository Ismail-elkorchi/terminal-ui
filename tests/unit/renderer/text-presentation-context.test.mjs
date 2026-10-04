import assert from 'node:assert/strict';
import test from 'node:test';
import { defineComponent } from '../../../dist/component/index.js';
import { createTerminalTextIndex, defineTextPresentation, segmentGraphemes } from '../../../dist/text/index.js';
import { createFrameBuffer, diffFrames, renderFramePlain } from '../../../dist/renderer/index.js';
import { applyRenderDiff } from '../../../dist/renderer/internal/diff-interpreter.js';
import { renderElementInternal, rerenderElementInternal } from '../../../dist/renderer/internal/render-element.js';
import { createClippedRenderTarget } from '../../../dist/renderer/internal/scoped-render-target.js';

// Synthetic orders exercise the injection/metadata boundary, not UAX conformance or host glyph shaping.
const presentation = (reverse) => defineTextPresentation({ map(request) {
  const clusters = segmentGraphemes(request.text.slice(request.startOffset, request.endOffsetExclusive)).map(cluster => ({
    text: cluster.text, startOffset: request.startOffset + cluster.startOffset,
    endOffsetExclusive: request.startOffset + cluster.endOffsetExclusive, direction: reverse ? 'rtl' : 'ltr',
  }));
  return reverse ? clusters.reverse() : clusters;
} });
const rtl = presentation(true);
const ltr = presentation(false);

test('styled logical spans share one mapped run before clipping and retain source/link metadata', () => {
  const buffer = createFrameBuffer(5, 1, { textPresentation: rtl });
  const target = createClippedRenderTarget(buffer, { row: 1, column: 1, width: 5, height: 1 }, { row: 1, column: 1, width: 2, height: 1 });
  target.write(1, 1, [
    { text: 'א', style: { bold: true }, link: { href: 'https://example.com/a' }, source: { description: 'first' } },
    { text: 'בּג', style: { italic: true }, source: { description: 'rest' } },
  ]);
  const cells = buffer.snapshot().cells;
  assert.deepEqual(cells.map(cell => cell.text), ['ג', 'בּ']);
  assert.ok(cells.every(cell => cell.style.italic === true && cell.source.description === 'rest'));
  const complete = createFrameBuffer(3, 1, { textPresentation: rtl });
  complete.write(1, 1, [{ text: 'אב', link: { href: 'https://example.com/ab' } }, { text: 'ג' }]);
  assert.equal(complete.snapshot().cells.at(-1).link.href, 'https://example.com/ab');
  complete.writeCell({ row: 1, column: 1, text: 'ג', width: 1 });
  assert.equal(complete.snapshot().cells[0].text, 'ג');
});

test('visual spans delimit mapped runs and are never reordered a second time', () => {
  const buffer = createFrameBuffer(12, 1, { textPresentation: rtl });
  buffer.write(1, 1, [{ text: '[', textOrder: 'visual' }, { text: 'אב' }, { text: ']AB', textOrder: 'visual' }]);
  assert.equal(renderFramePlain(buffer.snapshot()), '[בא]AB');
});

const probe = defineComponent({
  name: 'terminal-ui-tests/text-presentation-context', identity: 'required', structure: 'leaf',
  semantics: 'semantic', accessibleRole: 'textbox', metadata: ['focus'],
  createModel: options => options.model,
  reuse: { measurement: model => [model], layout: model => [model], paint: model => [model] },
  measure: () => ({ minWidth: 0, minHeight: 1, preferredWidth: 6, preferredHeight: 1 }),
  render(input) { input.target.write(0, 0, [{ text: input.model.text }]); },
  focusTargets(input) {
    const index = createTerminalTextIndex(input.model.text, input);
    return [{ id: 'self', bounds: input.bounds, cursor: { row: 0, column: index.positionToVisualColumn({ offset: 0, affinity: 'downstream' }) } }];
  },
  hitTargets(input) {
    const index = createTerminalTextIndex(input.model.text, input);
    return [{ id: 'text', bounds: input.bounds, accepts: ['pointerDown'], message: event => ({ offset: index.visualColumnToPosition((event.localColumn ?? 1) - 1).offset }) }];
  },
  accessibility: ({ id, model, focused }) => ({ id, role: 'textbox', value: model.text, focused, label: 'Mapped text' }),
});

test('provider identity invalidates layout and paint retention, while source values stay logical', () => {
  const model = Object.freeze({ text: 'אבג' });
  const element = probe({ id: 'mapped', model, onAction: action => action });
  const size = { columns: 10, rows: 1 };
  const first = renderElementInternal(element, size, { textPresentation: rtl });
  assert.equal(renderFramePlain(first.frame), 'גבא');
  assert.equal(first.frame.cursor.column, 4);
  const next = renderElementInternal(element, size, { textPresentation: ltr, previous: first });
  const fresh = renderElementInternal(element, size, { textPresentation: ltr });
  assert.deepEqual(next.frame, fresh.frame);
  assert.equal(renderFramePlain(next.frame), 'אבג');
  assert.equal(next.frame.cursor.column, 1);
  assert.equal(next.frame.accessibility.root.value, 'אבג');
  const rerendered = rerenderElementInternal(first);
  assert.deepEqual(rerendered.frame, first.frame);
  const diff = diffFrames(first.frame, next.frame);
  assert.deepEqual(applyRenderDiff(first.frame, diff).cells, next.frame.cells);
  assert.deepEqual(applyRenderDiff(undefined, diffFrames(undefined, next.frame)).cells, next.frame.cells);
});
