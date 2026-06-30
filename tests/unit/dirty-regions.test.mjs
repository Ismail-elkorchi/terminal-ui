import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createDirtyRegionSet,
  createFrameBuffer,
  diffFrames,
  dirtyRegionsForRegionChanges,
  renderFramePlain,
  renderWidgetFrame,
  renderWidgetRegions
} from '../../dist/tui/index.js';
import { absolute, canvas, modal, overlay, surface, text } from '../../dist/widgets/index.js';

test('DirtyRegionSet adds unions intersects and normalizes rectangles', () => {
  const first = createDirtyRegionSet([{ row: 2, column: 2, width: 3, height: 1 }]);
  const second = createDirtyRegionSet([{ row: 2, column: 5, width: 2, height: 1 }, { row: 9, column: 1, width: 0, height: 4 }]);
  const combined = first.union(second).add({ row: 4, column: 4, width: 3, height: 2 });
  const clipped = combined.intersect({ row: 1, column: 1, width: 6, height: 4 });

  assert.deepEqual(combined.rects, [
    { row: 2, column: 2, width: 5, height: 1 },
    { row: 4, column: 4, width: 3, height: 2 }
  ]);
  assert.deepEqual(clipped.rects, [
    { row: 2, column: 2, width: 5, height: 1 },
    { row: 4, column: 4, width: 3, height: 1 }
  ]);
});

test('region damage for moving overlay includes old and new bounds only', () => {
  const previous = movingOverlay(2, 2);
  const next = movingOverlay(3, 5);
  const dirty = dirtyRegionsForRegionChanges(
    renderWidgetRegions(previous, { columns: 12, rows: 5 }),
    renderWidgetRegions(next, { columns: 12, rows: 5 })
  );

  assert.deepEqual(dirty?.rects, [
    { row: 2, column: 2, width: 3, height: 1 },
    { row: 3, column: 5, width: 3, height: 1 }
  ]);
});

test('dirty diff for moved regions round-trips to the full next frame', () => {
  const previousWidget = movingOverlay(2, 2);
  const nextWidget = movingOverlay(3, 5);
  const viewport = { columns: 12, rows: 5 };
  const previous = renderWidgetFrame(previousWidget, viewport);
  const next = renderWidgetFrame(nextWidget, viewport);
  const dirtyRegions = dirtyRegionsForRegionChanges(
    renderWidgetRegions(previousWidget, viewport),
    renderWidgetRegions(nextWidget, viewport)
  );
  const diff = diffFrames(previous, next, { dirtyRegions });
  const applied = applyDiffToFrame(previous, diff);

  assert.deepEqual(diff.dirtyRegions, dirtyRegions?.rects);
  assert.equal(diff.fullRewrite, false);
  assert.equal(renderFramePlain(applied), renderFramePlain(next));
  assert.equal(diff.dirtyRegions?.some((rect) => rect.width === viewport.columns && rect.height === viewport.rows), false);
});

test('region fingerprints skip unchanged regions', () => {
  const regions = renderWidgetRegions(text('same', { id: 'fingerprint-same' }), { columns: 12, rows: 3 });
  const dirty = dirtyRegionsForRegionChanges(regions, regions);

  assert.deepEqual(dirty?.rects, []);
});

test('row fingerprints skip unchanged rows in retained region damage', () => {
  const previous = surface(
    canvas({
      id: 'row-fingerprint-canvas',
      painter({ buffer }) {
        buffer.write(1, 1, [{ text: 'stable' }]);
        buffer.write(2, 1, [{ text: 'before' }]);
      }
    }),
    { id: 'row-fingerprint-surface' }
  );
  const next = surface(
    canvas({
      id: 'row-fingerprint-canvas',
      painter({ buffer }) {
        buffer.write(1, 1, [{ text: 'stable' }]);
        buffer.write(2, 1, [{ text: 'after' }]);
      }
    }),
    { id: 'row-fingerprint-surface' }
  );
  const dirty = dirtyRegionsForRegionChanges(
    renderWidgetRegions(previous, { columns: 12, rows: 4 }),
    renderWidgetRegions(next, { columns: 12, rows: 4 })
  );

  assert.deepEqual(dirty?.rects, [
    { row: 2, column: 1, width: 6, height: 1 }
  ]);
});

test('write coverage narrows retained damage columns when row fingerprints change', () => {
  const previous = surface(
    canvas({
      id: 'coverage-canvas',
      painter({ buffer }) {
        buffer.write(2, 5, [{ text: 'A' }]);
      }
    }),
    { id: 'coverage-surface' }
  );
  const next = surface(
    canvas({
      id: 'coverage-canvas',
      painter({ buffer }) {
        buffer.write(2, 5, [{ text: 'B' }]);
      }
    }),
    { id: 'coverage-surface' }
  );
  const dirty = dirtyRegionsForRegionChanges(
    renderWidgetRegions(previous, { columns: 12, rows: 4 }),
    renderWidgetRegions(next, { columns: 12, rows: 4 })
  );

  assert.deepEqual(dirty?.rects, [
    { row: 2, column: 5, width: 1, height: 1 }
  ]);
});

test('region ids stay stable when a sibling overlay is inserted', () => {
  const before = overlay([
    text('background', { id: 'stable-background' }),
    absolute(text('HUD', { id: 'stable-hud', zIndex: 10 }), {
      id: 'stable-hud-position',
      row: 2,
      column: 2,
      width: 3,
      height: 1
    })
  ], { id: 'stable-overlay-root' });
  const after = overlay([
    text('background', { id: 'stable-background' }),
    absolute(text('TIP', { id: 'inserted-tip', zIndex: 5 }), {
      id: 'inserted-tip-position',
      row: 1,
      column: 8,
      width: 3,
      height: 1
    }),
    absolute(text('HUD', { id: 'stable-hud', zIndex: 10 }), {
      id: 'stable-hud-position',
      row: 2,
      column: 2,
      width: 3,
      height: 1
    })
  ], { id: 'stable-overlay-root' });
  const beforeHud = renderWidgetRegions(before, { columns: 16, rows: 4 }).find((region) => region.zIndex === 10);
  const afterHud = renderWidgetRegions(after, { columns: 16, rows: 4 }).find((region) => region.zIndex === 10);

  assert.equal(beforeHud?.id, afterHud?.id);
});

test('region ids stay stable when modal content changes', () => {
  const before = overlay([
    text('backdrop', { id: 'modal-backdrop' }),
    modal(text('front', { id: 'modal-content' }), {
      id: 'stable-dialog',
      title: 'Dialog',
      width: 12,
      height: 5,
      zIndex: 20
    })
  ], { id: 'modal-region-root' });
  const after = overlay([
    text('backdrop', { id: 'modal-backdrop' }),
    modal(text('changed', { id: 'modal-content' }), {
      id: 'stable-dialog',
      title: 'Dialog',
      width: 12,
      height: 5,
      zIndex: 20
    })
  ], { id: 'modal-region-root' });
  const beforeDialog = renderWidgetRegions(before, { columns: 20, rows: 7 }).find((region) => region.zIndex === 20);
  const afterDialog = renderWidgetRegions(after, { columns: 20, rows: 7 }).find((region) => region.zIndex === 20);

  assert.equal(beforeDialog?.id, afterDialog?.id);
});

function movingOverlay(row, column) {
  return surface(
    overlay([
      text('background', { id: 'background' }),
      absolute(text('HUD', { id: 'hud', zIndex: 10 }), {
        id: 'hud-position',
        row,
        column,
        width: 3,
        height: 1
      })
    ], { id: 'moving-overlay' }),
    { id: 'moving-surface' }
  );
}

function applyDiffToFrame(frame, diff) {
  const buffer = createFrameBuffer(diff.width, diff.height);
  for (const cell of frame.cells) {
    if (cell.continuation !== true) buffer.writeCell(cell);
  }
  for (const operation of diff.operations) {
    switch (operation.kind) {
      case 'write':
        buffer.write(operation.row, operation.column, operation.spans);
        break;
      case 'clearRect':
        buffer.clear(operation.bounds);
        break;
      case 'clearLine':
        buffer.clear({
          row: operation.row,
          column: operation.fromColumn ?? 1,
          width: diff.width - (operation.fromColumn ?? 1) + 1,
          height: 1
        });
        break;
      case 'moveCursor':
      case 'showCursor':
        break;
    }
  }
  return buffer.snapshot({ accessibility: frame.accessibility });
}
