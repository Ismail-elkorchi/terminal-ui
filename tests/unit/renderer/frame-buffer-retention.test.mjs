import assert from 'node:assert/strict';
import test from 'node:test';
import { createFrameBuffer, retainFrameBufferRows, transferFrameBufferSpans } from '../../../dist/renderer/frame-buffer.js';


test('admitted runs reuse matching cells, refresh metadata, and preserve wide overlap and combining marks', () => {
  const first = createFrameBuffer(4, 1);
  first.write(1, 1, [{ text: 'abcd', style: { bold: true } }]);
  const frame = first.snapshot();
  const next = createFrameBuffer(4, 1);
  retainFrameBufferRows(next, frame);
  transferFrameBufferSpans(next, 1, 1, [{ graphemes: [{ text: 'a', cells: 1 }, { text: 'b', cells: 1 }], style: { bold: true } }]);
  assert.strictEqual(next.readCell(1, 1), frame.cells[0]);
  transferFrameBufferSpans(next, 1, 3, [{ graphemes: [{ text: 'c', cells: 1 }], style: { italic: true } }]);
  assert.equal(next.readCell(1, 3).style.italic, true);
  assert.notStrictEqual(next.readCell(1, 3), frame.cells[2]);
  next.write(1, 2, [{ text: '界' }]);
  transferFrameBufferSpans(next, 1, 3, [{ graphemes: [{ text: 'x', cells: 1 }, { text: '̈', cells: 0 }] }]);
  assert.equal(next.readCell(1, 2), undefined);
  assert.equal(next.readCell(1, 3).text, 'ẍ');
});
