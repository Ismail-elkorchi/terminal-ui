import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import test from 'node:test';
import {
  captureFramePaint, checkpointFrameBuffer, createCompositingFrameBuffer, createFrameBuffer,
  frameSnapshotWork, restoreFrameBufferStorage, restoreFramePaint, createRegionFrameBuffer, blitFrameCell, transferFrameCell,
} from '../../../dist/renderer/frame-buffer.js';
import { frameSnapshotMetadata } from '../../../dist/renderer/internal/frame-snapshot.js';
import { renderFramePlain } from '../../../dist/renderer/index.js';
import { rasterImage } from '../../../dist/graphics/index.js';

const text = (buffer, row, column, value, style) => buffer.write(row, column, [{ text: value, ...(style ? { style } : {}) }]);

test('retained frame storage shares untouched rows and copies only edited rows', () => {
  const source = createFrameBuffer(20, 4);
  text(source, 1, 1, 'first'); text(source, 2, 1, 'second'); text(source, 4, 1, 'last');
  const first = source.snapshot();
  const copy = structuredClone(first);
  const next = createFrameBuffer(20, 4);
  assert.equal(restoreFrameBufferStorage(next, checkpointFrameBuffer(source)), true);
  text(next, 2, 2, 'X');
  const second = next.snapshot();
  const before = frameSnapshotMetadata(first).rowIndexes;
  const after = frameSnapshotMetadata(second).rowIndexes;
  assert.strictEqual(before[0], after[0]);
  assert.notStrictEqual(before[1], after[1]);
  assert.strictEqual(before[2], after[2]);
  assert.deepEqual(frameSnapshotWork(second), { rows: 1, cells: 6 });
  assert.deepEqual(first, copy);
  next.clear({ row: 4, column: 1, width: 20, height: 1 });
  assert.deepEqual(first, copy);
  assert.equal(renderFramePlain(second), 'first\nsXcond\n\nlast');
});

test('retained paint adopts owned rows without replay and preserves disjoint same-row changes', () => {
  const first = createCompositingFrameBuffer(20, 2);
  text(first, 1, 1, 'base');
  const patch = captureFramePaint(first, () => { text(first, 1, 7, 'retained'); });
  const next = createCompositingFrameBuffer(20, 2);
  text(next, 1, 1, 'new!');
  assert.equal(restoreFramePaint(next, patch), true);
  assert.equal(renderFramePlain(next.snapshot()), 'new!  retained');
  text(next, 1, 7, 'changed');
  assert.equal(renderFramePlain(first.snapshot()), 'base  retained');
});

test('paint witnesses reject inherited-background and wide-cell changes atomically', () => {
  const first = createCompositingFrameBuffer(8, 2);
  text(first, 1, 1, '界', { bg: { kind: 'ansi', value: 1 } });
  text(first, 2, 1, 'base');
  const patch = captureFramePaint(first, () => { text(first, 2, 7, 'a'); text(first, 1, 2, 'X'); });
  const next = createCompositingFrameBuffer(8, 2);
  text(next, 1, 1, '語', { bg: { kind: 'ansi', value: 2 } });
  text(next, 2, 1, 'base');
  const before = next.snapshot();
  assert.equal(restoreFramePaint(next, patch), false);
  assert.deepEqual(next.snapshot(), before, 'no earlier compatible row is adopted on a later witness miss');
  assert.equal(next.readCell(2, 7), undefined);
});

test('paint retention includes clear expansion, combining marks and graphics effects', () => {
  const image = rasterImage({ width: 1, height: 1, format: 'rgb8', data: new Uint8Array([20, 40, 60]) });
  const initialize = () => {
    const buffer = createCompositingFrameBuffer(10, 3);
    text(buffer, 1, 2, '界'); text(buffer, 2, 1, 'e');
    return buffer;
  };
  const source = initialize();
  const draw = buffer => {
    buffer.clear({ row: 1, column: 3, width: 1, height: 1 });
    text(buffer, 2, 2, '\u0301');
    buffer.placeGraphic({ id: 'image', image, fit: 'fill', bounds: { row: 3, column: 2, width: 4, height: 1 } });
    text(buffer, 3, 3, 'X');
  };
  const patch = captureFramePaint(source, () => draw(source));
  const next = initialize();
  assert.equal(restoreFramePaint(next, patch), true);
  assert.deepEqual(next.snapshot(), source.snapshot());
  assert.equal(next.readCell(1, 2), undefined, 'clear removed the wide anchor outside the explicit rectangle');
  assert.equal(next.readCell(2, 1).text, 'é');
});

test('failed writes and failed captures cannot mutate snapshots or checkpoints', () => {
  const source = createFrameBuffer(12, 1);
  text(source, 1, 1, 'committed');
  const committed = source.snapshot();
  const copy = structuredClone(committed);
  const checkpoint = checkpointFrameBuffer(source);
  const candidate = createFrameBuffer(12, 1);
  restoreFrameBufferStorage(candidate, checkpoint);
  assert.throws(() => captureFramePaint(candidate, () => {
    text(candidate, 1, 1, 'partial');
    text(candidate, 1, 9, 'bad', { bold: 'invalid' });
  }), /boolean/u);
  assert.deepEqual(committed, copy);
  const retry = createFrameBuffer(12, 1);
  restoreFrameBufferStorage(retry, checkpoint);
  assert.deepEqual(retry.snapshot(), committed);
});

test('flat cells are materialized once at the public boundary and counted separately', () => {
  const counts = {};
  const buffer = createFrameBuffer(100, 100, { instrumentation: { recordWork({ kind, count }) {
    counts[kind] = (counts[kind] ?? 0) + count;
  } } });
  text(buffer, 1, 1, 'tiny');
  const frame = buffer.snapshot();
  assert.equal(counts.snapshot_materializations, undefined);
  assert.equal(frameSnapshotMetadata(frame).rowIndexes[0].cells.size, 4);
  assert.equal(counts.snapshot_materializations, undefined);
  const cells = frame.cells;
  assert.strictEqual(frame.cells, cells);
  assert.equal(counts.snapshot_materializations, 1);
  assert.equal(counts.snapshot_materialized_cells, 4);
  assert.deepEqual(frameSnapshotWork(frame), { rows: 1, cells: 4 });
});

test('long-lived retained rows keep a bounded set of canvas-style projections', () => {
  execFileSync(process.execPath, ['--expose-gc', '--input-type=module', '-e', `
    import assert from 'node:assert/strict';
    import { createFrameBuffer } from './dist/renderer/frame-buffer.js';
    import { frameSnapshotMetadata } from './dist/renderer/internal/frame-snapshot.js';
    const buffer = createFrameBuffer(8, 1);
    buffer.write(1, 1, [{ text: 'stable' }]);
    const old = [];
    let current;
    for (let value = 0; value < 40; value++) {
      current = buffer.snapshot({ canvasStyle: { fg: { kind: 'ansi', value } } });
      old.push(new WeakRef(frameSnapshotMetadata(current).rowIndexes[0]));
    }
    for (let count = 0; count < 5; count++) { await new Promise(resolve => setImmediate(resolve)); global.gc(); }
    assert.ok(old.slice(0, 35).every(reference => reference.deref() === undefined));
    assert.equal(current.cells.length, 6);
    assert.equal(buffer.readCell(1, 1).text, 's');
  `]);
});

test('a no-op combining write still retains its absent-cell read witness', () => {
  const source = createCompositingFrameBuffer(8, 1);
  const patch = captureFramePaint(source, () => text(source, 1, 2, '\u0301'));
  const unchanged = createCompositingFrameBuffer(8, 1);
  assert.equal(restoreFramePaint(unchanged, patch), true);
  const populated = createCompositingFrameBuffer(8, 1);
  text(populated, 1, 1, 'a');
  assert.equal(restoreFramePaint(populated, patch), false);
  text(populated, 1, 2, '\u0301');
  assert.equal(populated.readCell(1, 1).text, 'á');
});

test('terminal-coordinate region storage rejects admitted glyphs crossing its edge', () => {
  const region = createRegionFrameBuffer(10, 3, { row: 2, column: 3, width: 2, height: 1 });
  const crossing = { row: 2, column: 4, text: '界', width: 2 };
  blitFrameCell(region, crossing);
  transferFrameCell(region, crossing);
  assert.deepEqual(region.snapshot().cells, []);
  transferFrameCell(region, { ...crossing, column: 3 });
  assert.equal(region.readCell(2, 3).text, '界');
  assert.equal(region.readCell(2, 4).continuation, true);
  assert.equal(region.readCell(2, 5), undefined);
});

test('retained storage cannot cross width-policy or clipping boundaries', () => {
  const source = createRegionFrameBuffer(10, 3, { row: 1, column: 1, width: 4, height: 2 });
  const patch = captureFramePaint(source, () => text(source, 1, 3, '界'));
  const clipped = createRegionFrameBuffer(10, 3, { row: 1, column: 1, width: 3, height: 2 });
  assert.equal(restoreFramePaint(clipped, patch), false);
  assert.deepEqual(clipped.snapshot().cells, []);
  const changedWidth = createFrameBuffer(10, 3, { widthProfile: { emoji: 'narrow', ambiguous: 'narrow' } });
  assert.equal(restoreFrameBufferStorage(changedWidth, checkpointFrameBuffer(source)), false);
});

test('seeded paint-patch differential covers absent reads, clears and overlapping wide glyphs', () => {
  let seed = 18;
  const random = limit => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) % limit;
  const strings = ['a', '語', 'abc', '👩🏽‍💻', '\u0301', '界界', ''];
  const operation = () => random(4) === 0
    ? { clear: { row: 1 + random(3), column: 1 + random(14), width: random(5), height: 1 + random(2) } }
    : { row: 1 + random(3), column: 1 + random(14), text: strings[random(strings.length)], color: random(4) };
  const apply = (buffer, operations) => {
    for (const item of operations) {
      if (item.clear) buffer.clear(item.clear);
      else text(buffer, item.row, item.column, item.text, { bg: { kind: 'ansi', value: item.color } });
    }
  };
  let hits = 0;
  for (let trial = 0; trial < 3000; trial++) {
    const base = Array.from({ length: random(15) }, operation);
    const edits = Array.from({ length: 1 + random(5) }, operation);
    const other = Array.from({ length: random(5) }, operation);
    const source = createCompositingFrameBuffer(16, 4);
    apply(source, base);
    const patch = captureFramePaint(source, () => apply(source, edits));
    const next = createCompositingFrameBuffer(16, 4);
    apply(next, base); apply(next, other);
    const untouched = next.snapshot();
    if (!restoreFramePaint(next, patch)) {
      assert.deepEqual(next.snapshot(), untouched, `atomic miss at trial ${trial}`);
      continue;
    }
    const expected = createCompositingFrameBuffer(16, 4);
    apply(expected, base); apply(expected, other); apply(expected, edits);
    assert.deepEqual(next.snapshot(), expected.snapshot(), `fresh equivalence at trial ${trial}`);
    hits++;
  }
  assert.ok(hits > 2000, 'the oracle must exercise genuine retained reuse');
});

test('a rejected snapshot cannot leave a mutable row in the projection cache', () => {
  const buffer = createFrameBuffer(8, 1);
  text(buffer, 1, 1, 'before');
  assert.throws(() => buffer.snapshot({ cursor: { row: 1, column: 1, style: { bold: 'invalid' } } }), /boolean/u);
  text(buffer, 1, 1, 'after!');
  assert.equal(renderFramePlain(buffer.snapshot()), 'after!');
});

test('nested retained paint preserves read-only witnesses in its outer patch', () => {
  const buffer = createCompositingFrameBuffer(8, 1);
  const inner = captureFramePaint(buffer, () => text(buffer, 1, 2, '\u0301'));
  const outer = captureFramePaint(buffer, () => { assert.equal(restoreFramePaint(buffer, inner), true); });
  const next = createCompositingFrameBuffer(8, 1);
  text(next, 1, 1, 'a');
  assert.equal(restoreFramePaint(next, outer), false);
});
