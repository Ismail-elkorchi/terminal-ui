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
import { absolute, overlay, surface, text } from '../../dist/widgets/index.js';

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
