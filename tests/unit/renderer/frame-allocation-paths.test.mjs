import assert from 'node:assert/strict';
import test from 'node:test';
import {
  applyImplicitCanvasBackdrop, captureFrameBufferDamage, captureFramePaint,
  createCompositingFrameBuffer, createFrameBuffer, createRegionFrameBuffer,
  restoreFramePaint, transferFrameBufferSpans,
} from '../../../dist/renderer/frame-buffer.js';
import { diffFrames, renderFramePlain } from '../../../dist/renderer/frame.js';
import { frameSnapshotMetadata } from '../../../dist/renderer/internal/frame-snapshot.js';
import { rasterImage } from '../../../dist/graphics/index.js';
import { measureTerminalCellText } from '../../../dist/text/measure.js';

function transfer(buffer, row, column, spans) {
  transferFrameBufferSpans(buffer, row, column, spans.map(({ text, ...options }) => ({
    graphemes: measureTerminalCellText(text, { widthProfile: buffer.widthProfile }).graphemes,
    ...options,
  })));
}

function assertMatchingFrames(actual, expected) {
  assert.deepEqual(actual, expected);
  const left = frameSnapshotMetadata(actual);
  const right = frameSnapshotMetadata(expected);
  assert.deepEqual(left.writtenBounds.rects, right.writtenBounds.rects);
  assert.deepEqual(left.clearedBounds.rects, right.clearedBounds.rects);
  assert.equal(left.fingerprint, right.fingerprint);
  assert.equal(left.terminalFingerprint, right.terminalFingerprint);
}

test('width-one overwrite runs preserve inherited backgrounds, sources, links and snapshot ownership', () => {
  for (const create of [createFrameBuffer, createCompositingFrameBuffer]) {
    const batch = create(8, 2);
    const scalar = create(8, 2);
    for (const buffer of [batch, scalar]) {
      buffer.write(1, 1, [{ text: 'abcd', style: { bg: { kind: 'ansi', value: 1 }, bold: true } }]);
      buffer.write(1, 5, [{ text: 'efgh', style: { bg: { kind: 'ansi', value: 2 } } }]);
    }
    const before = batch.snapshot();
    const copy = structuredClone(before);
    const spans = [{ text: 'REPLACE!', style: { italic: true },
      link: { href: 'https://example.test/run' }, source: { elementId: 'replacement' } }];
    const batchDamage = captureFrameBufferDamage(batch, () => transfer(batch, 1, 1, spans));
    const scalarDamage = captureFrameBufferDamage(scalar, () => scalar.write(1, 1, spans));
    assert.deepEqual(batchDamage.rects, scalarDamage.rects);
    assertMatchingFrames(batch.snapshot(), scalar.snapshot());
    assert.deepEqual(before, copy);
    const first = batch.readCell(1, 1);
    transfer(batch, 1, 1, spans);
    assert.strictEqual(batch.readCell(1, 1), first, 'matching occupants are reused before allocation');
    const terminalBefore = batch.snapshot();
    transfer(batch, 1, 1, [{ ...spans[0], source: { elementId: 'new-source' } }]);
    assert.equal(batch.readCell(1, 1).source.elementId, 'new-source');
    assert.equal(diffFrames(terminalBefore, batch.snapshot()).operations.length, 0);
  }
});

test('width-one writes with graphics retain established fragment identities', () => {
  const image = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([20, 40, 60]) });
  const batch = createCompositingFrameBuffer(10, 3);
  const scalar = createCompositingFrameBuffer(10, 3);
  for (const buffer of [batch, scalar]) {
    buffer.write(2, 2, [{ text: 'occupied' }]);
    buffer.placeGraphic({ id: 'image', image, fit: 'fill', bounds: { row: 1, column: 1, width: 10, height: 3 } });
  }
  transfer(batch, 2, 3, [{ text: 'run' }]);
  scalar.write(2, 3, [{ text: 'run' }]);
  assertMatchingFrames(batch.snapshot(), scalar.snapshot());
});

test('run admission falls back for wide occupants, combining marks and region edges', () => {
  const bounds = { row: 2, column: 3, width: 5, height: 1 };
  const batch = createRegionFrameBuffer(12, 3, bounds);
  const scalar = createRegionFrameBuffer(12, 3, bounds);
  const operations = [
    [2, 3, [{ text: '界界a' }]],
    [2, 4, [{ text: 'XY' }, { text: '\u0301' }]],
    [2, 6, [{ text: 'b界' }]],
    [2, 2, [{ text: 'ab' }]],
    [2, 7, [{ text: '👩🏽‍💻' }]],
  ];
  for (const [row, column, spans] of operations) {
    transfer(batch, row, column, spans);
    scalar.write(row, column, spans);
    assertMatchingFrames(batch.snapshot(), scalar.snapshot());
  }
});

test('overwrite runs capture inherited-background witnesses before mutating owned rows', () => {
  const make = color => {
    const buffer = createCompositingFrameBuffer(6, 1);
    buffer.write(1, 1, [{ text: 'before', style: { bg: { kind: 'ansi', value: color } } }]);
    return buffer;
  };
  const source = make(1);
  const patch = captureFramePaint(source, () => transfer(source, 1, 1, [{ text: 'after!' }]));
  const compatible = make(1);
  assert.equal(restoreFramePaint(compatible, patch), true);
  assertMatchingFrames(compatible.snapshot(), source.snapshot());
  const changed = make(2);
  const before = changed.snapshot();
  assert.equal(restoreFramePaint(changed, patch), false);
  assert.deepEqual(changed.snapshot(), before);
});

test('terminal span assembly groups metadata runs and leaves earlier operations unchanged', () => {
  const buffer = createFrameBuffer(16, 1);
  const background = { bg: { kind: 'ansi', value: 4 } };
  buffer.write(1, 1, [{ text: 'ab', style: { bold: true }, source: { elementId: 'one' } }]);
  buffer.write(1, 3, [{ text: 'cd', style: { bold: true }, source: { elementId: 'one' } }]);
  buffer.write(1, 5, [{ text: 'e', style: { bold: true }, source: { elementId: 'two' } }]);
  buffer.write(1, 6, [{ text: '界', link: { href: 'https://example.test' } }]);
  buffer.write(1, 10, [{ text: 'e\u0301z' }]);
  const first = diffFrames(undefined, buffer.snapshot({ canvasStyle: background }));
  const before = structuredClone(first.operations);
  const spans = first.operations.find(operation => operation.kind === 'write').spans;
  assert.deepEqual(spans.map(span => span.text), ['abcd', 'e', '界', '  éz']);
  assert.equal(spans[0].source.elementId, 'one');
  assert.equal(spans[1].source.elementId, 'two');
  assert.equal(spans[2].link.href, 'https://example.test');
  for (const span of spans) assert.deepEqual(span.style.bg, background.bg);
  buffer.write(1, 1, [{ text: 'changed' }]);
  diffFrames(undefined, buffer.snapshot({ canvasStyle: background }));
  assert.deepEqual(first.operations, before);
});

test('row iteration remains ordered and immutable through direct clear and backdrop passes', () => {
  for (const seal of [false, true]) {
    const buffer = createFrameBuffer(12, 4);
    buffer.write(4, 8, [{ text: 'last' }]);
    buffer.write(1, 5, [{ text: '界ab界', link: { href: 'https://example.test' } }]);
    buffer.write(1, 1, [{ text: 'head' }]);
    const before = seal ? buffer.snapshot() : undefined;
    const copy = before === undefined ? undefined : structuredClone(before);
    buffer.clear({ row: 1, column: 6, width: 4, height: 1 });
    applyImplicitCanvasBackdrop(buffer, { row: 1, column: 1, width: 12, height: 4 }, { dim: true });
    const after = buffer.snapshot();
    assert.equal(renderFramePlain(after), 'head\n\n\n       last');
    assert.deepEqual(after.cells.map(cell => [cell.row, cell.column]), [
      [1, 1], [1, 2], [1, 3], [1, 4], [4, 8], [4, 9], [4, 10], [4, 11],
    ]);
    assert.ok(after.cells.every(cell => cell.style.dim && cell.link === undefined));
    if (before !== undefined) assert.deepEqual(before, copy);
  }
});
