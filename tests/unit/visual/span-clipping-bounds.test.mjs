import assert from 'node:assert/strict';
import test from 'node:test';
import { createFrameBuffer } from '../../../dist/renderer/frame-buffer.js';
import { clipRenderSpans } from '../../../dist/visual/render-content.js';
import { createClippedRenderTarget } from '../../../dist/renderer/internal/scoped-render-target.js';



test('end clipping never consumes metadata or text beyond the first overflowing span', () => {
  const inaccessible = { get text() { throw new Error('off-screen span was read'); } };
  assert.deepEqual(clipRenderSpans([{ text: 'abcde' }, inaccessible], 4, { ellipsis: '…' }), [{ text: 'abc…' }]);
  assert.deepEqual(clipRenderSpans([{ text: 'é界abc', style: { bold: true } }], 4), [{ text: 'é界a', style: { bold: true } }]);
});

test('clipping a long span bounds segmentation and preserves combining marks at the edge', () => {
  let segmented = 0;
  const buffer = createFrameBuffer(4, 1, { instrumentation: { recordWork(sample) {
    if (sample.kind === 'buffer_segmented_code_units') segmented += sample.count;
  } } });
  const target = createClippedRenderTarget(buffer, { row: 1, column: 1, width: 4, height: 1 },
    { row: 1, column: 1, width: 4, height: 1 });
  target.write(1, 1, [{ text: `abce\u0301${'x'.repeat(100_000)}` }, { text: '\u0308' }]);
  assert.equal(buffer.snapshot().cells.map(cell => cell.text).join(''), 'abcé');
  assert.ok(segmented <= 8, `segmented ${segmented} code units for four cells`);
  target.write(1, 4, [{ text: 'e' }, { text: '\u0308' }]);
  assert.equal(buffer.readCell(1, 4)?.text, 'ë');
});
