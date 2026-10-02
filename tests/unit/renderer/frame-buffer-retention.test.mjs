import { frameSnapshotMetadata } from '../../../dist/renderer/internal/frame-snapshot.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { applyImplicitCanvasBackdrop, createCompositingFrameBuffer, createFrameBuffer, seedFrameBufferRows, transferFrameBufferSpans } from '../../../dist/renderer/frame-buffer.js';


test('admitted runs reuse matching cells, refresh metadata, and preserve wide overlap and combining marks', () => {
  const first = createFrameBuffer(4, 1);
  first.write(1, 1, [{ text: 'abcd', style: { bold: true } }]);
  const frame = first.snapshot();
  const next = createFrameBuffer(4, 1);
  seedFrameBufferRows(next, frameSnapshotMetadata(frame).rowIndexes);
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

test('canvas projection preserves owned cells whose style already includes the canvas', () => {
  const buffer = createFrameBuffer(4, 1);
  buffer.write(1, 1, [{ text: 'same', style: { bold: true, bg: { kind: 'ansi', value: 1 } } }]);
  const before = buffer.snapshot();
  const after = buffer.snapshot({ canvasStyle: { bg: { kind: 'ansi', value: 1 } } });
  for (let index = 0; index < before.cells.length; index += 1) {
    assert.strictEqual(after.cells[index], before.cells[index]);
  }
  const changed = buffer.snapshot({ canvasStyle: { italic: true } });
  assert.equal(changed.cells[0].style.italic, true);
  assert.notStrictEqual(changed.cells[0], before.cells[0]);
  assert.equal(before.cells[0].style.italic, undefined);
});

test('compositing shares inherited background styles without inheriting other background-layer flags', () => {
  const buffer = createCompositingFrameBuffer(4, 1);
  buffer.write(1, 1, [{ text: 'base', style: { bg: { kind: 'ansi', value: 1 }, bold: true } }]);
  const before = buffer.snapshot();
  buffer.write(1, 1, [{ text: 'next', style: { italic: true } }]);
  const after = buffer.snapshot();
  for (const cell of after.cells) {
    assert.strictEqual(cell.style, after.cells[0].style);
    assert.deepEqual(cell.style, { bg: { kind: 'ansi', value: 1 }, italic: true });
  }
  assert.equal(before.cells[0].style.bold, true);
  assert.equal(before.cells[0].style.italic, undefined);
  buffer.write(1, 1, [{ text: 'own', style: { bg: { kind: 'ansi', value: 2 } } }]);
  assert.deepEqual(buffer.readCell(1, 1).style, { bg: { kind: 'ansi', value: 2 } });
});

test('canvas backdrops compose a shared owned style while removing links and retaining cell metadata', () => {
  const buffer = createFrameBuffer(4, 1);
  buffer.write(1, 1, [{ text: 'ab界', style: { bold: true, bg: { kind: 'ansi', value: 1 } },
    link: { href: 'https://example.com' }, source: { elementId: 'content', cellRole: 'text' } }]);
  const before = buffer.snapshot();
  const backdrop = { bg: { kind: 'ansi', value: 2 }, dim: true };
  assert.equal(applyImplicitCanvasBackdrop(buffer, { row: 1, column: 1, width: 4, height: 1 }, backdrop), true);
  const after = buffer.snapshot();
  for (let index = 0; index < after.cells.length; index += 1) {
    const cell = after.cells[index];
    assert.strictEqual(cell.style, after.cells[0].style);
    assert.deepEqual(cell.style, { bold: true, bg: { kind: 'ansi', value: 2 }, dim: true });
    assert.equal(cell.link, undefined);
    assert.strictEqual(cell.source, before.cells[index].source);
    assert.equal(cell.text, before.cells[index].text);
    assert.equal(cell.continuation, before.cells[index].continuation);
    assert.equal(before.cells[index].style.bg.value, 1);
    assert.equal(before.cells[index].link.href, 'https://example.com');
  }
  applyImplicitCanvasBackdrop(buffer, { row: 1, column: 1, width: 4, height: 1 }, backdrop);
  const repeated = buffer.snapshot();
  for (let index = 0; index < after.cells.length; index += 1) {
    assert.strictEqual(repeated.cells[index], after.cells[index]);
  }
});
