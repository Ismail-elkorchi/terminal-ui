import assert from 'node:assert/strict';
import test from 'node:test';

import {
  diffFrames,
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  createDirtyRegionSet,
  dirtyRegionsForRegionChanges
} from '../../dist/renderer/internal/dirty-regions.js';
import { applyRenderDiff } from '../../dist/renderer/internal/diff-interpreter.js';
import { renderElementRegions } from '../../dist/renderer/internal/render.js';
import {
  absolute,
  overlay,
  surface
} from '../../dist/layout/index.js';
import {
  canvas,
  dialog,
  text
} from '../../dist/components/index.js';

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
    renderElementRegions(previous, { columns: 12, rows: 5 }),
    renderElementRegions(next, { columns: 12, rows: 5 })
  );

  assert.deepEqual(dirty?.rects, [
    { row: 2, column: 2, width: 3, height: 1 },
    { row: 3, column: 5, width: 3, height: 1 }
  ]);
});

test('dirty diff for moved regions round-trips to the full next frame', () => {
  const previousElement = movingOverlay(2, 2);
  const nextElement = movingOverlay(3, 5);
  const terminalSize = { columns: 12, rows: 5 };
  const previous = renderElementFrame(previousElement, terminalSize);
  const next = renderElementFrame(nextElement, terminalSize);
  const dirtyRegions = dirtyRegionsForRegionChanges(
    renderElementRegions(previousElement, terminalSize),
    renderElementRegions(nextElement, terminalSize)
  );
  const diff = diffFrames(previous, next, { dirtyRegions });
  const applied = applyDiffToFrame(previous, diff);

  assert.deepEqual(diff.dirtyRegions, dirtyRegions?.rects);
  assert.equal(diff.fullRewrite, false);
  assert.equal(renderFramePlain(applied), renderFramePlain(next));
  assert.equal(diff.dirtyRegions?.some((rect) => rect.width === terminalSize.columns && rect.height === terminalSize.rows), false);
});

test('incremental diff projections reject width-profile changes', () => {
  const wide = { emoji: 'wide', ambiguous: 'narrow' };
  const narrow = { emoji: 'narrow', ambiguous: 'narrow' };
  const previous = renderElementFrame(text('🙂'), { columns: 4, rows: 1 }, { widthProfile: wide });
  const incompatible = {
    ...diffFrames(previous, previous),
    widthProfile: narrow
  };

  assert.throws(
    () => applyRenderDiff(previous, incompatible),
    /width profile/u
  );

  const rewritten = renderElementFrame(text('🙂'), { columns: 4, rows: 1 }, { widthProfile: narrow });
  const projection = applyRenderDiff(undefined, diffFrames(undefined, rewritten));
  assert.deepEqual(projection.widthProfile, narrow);
});

test('region fingerprints skip unchanged regions', () => {
  const regions = renderElementRegions(text('same', { id: 'fingerprint-same' }), { columns: 12, rows: 3 });
  const dirty = dirtyRegionsForRegionChanges(regions, regions);

  assert.deepEqual(dirty?.rects, []);
});

test('row fingerprints skip unchanged rows in retained region damage', () => {
  const previous = surface(
    canvas({
      id: 'row-fingerprint-canvas',
      painter({ canvas }) {
        canvas.text(0, 0, [{ text: 'stable' }]);
        canvas.text(0, 1, [{ text: 'before' }]);
      }
    }),
    { id: 'row-fingerprint-surface' }
  );
  const next = surface(
    canvas({
      id: 'row-fingerprint-canvas',
      painter({ canvas }) {
        canvas.text(0, 0, [{ text: 'stable' }]);
        canvas.text(0, 1, [{ text: 'after' }]);
      }
    }),
    { id: 'row-fingerprint-surface' }
  );
  const dirty = dirtyRegionsForRegionChanges(
    renderElementRegions(previous, { columns: 12, rows: 4 }),
    renderElementRegions(next, { columns: 12, rows: 4 })
  );

  assert.deepEqual(dirty?.rects, [
    { row: 2, column: 1, width: 6, height: 1 }
  ]);
});

test('write coverage narrows retained damage columns when row fingerprints change', () => {
  const previous = surface(
    canvas({
      id: 'coverage-canvas',
      painter({ canvas }) {
        canvas.text(4, 1, [{ text: 'A' }]);
      }
    }),
    { id: 'coverage-surface' }
  );
  const next = surface(
    canvas({
      id: 'coverage-canvas',
      painter({ canvas }) {
        canvas.text(4, 1, [{ text: 'B' }]);
      }
    }),
    { id: 'coverage-surface' }
  );
  const dirty = dirtyRegionsForRegionChanges(
    renderElementRegions(previous, { columns: 12, rows: 4 }),
    renderElementRegions(next, { columns: 12, rows: 4 })
  );

  assert.deepEqual(dirty?.rects, [
    { row: 2, column: 5, width: 1, height: 1 }
  ]);
});

test('region ids stay stable when a sibling overlay is inserted', () => {
  const before = overlay([
    text('background', { id: 'stable-background' }),
    absolute(text('HUD', {
    id: 'stable-hud',
    meta: {
        layer: {
            zIndex: 10
        }
    }
}), {
      id: 'stable-hud-position',
      row: 2,
      column: 2,
      width: 3,
      height: 1
    })
  ], { id: 'stable-overlay-root' });
  const after = overlay([
    text('background', { id: 'stable-background' }),
    absolute(text('TIP', {
    id: 'inserted-tip',
    meta: {
        layer: {
            zIndex: 5
        }
    }
}), {
      id: 'inserted-tip-position',
      row: 1,
      column: 8,
      width: 3,
      height: 1
    }),
    absolute(text('HUD', {
    id: 'stable-hud',
    meta: {
        layer: {
            zIndex: 10
        }
    }
}), {
      id: 'stable-hud-position',
      row: 2,
      column: 2,
      width: 3,
      height: 1
    })
  ], { id: 'stable-overlay-root' });
  const beforeHud = renderElementRegions(before, { columns: 16, rows: 4 }).find((region) => region.zIndex === 10);
  const afterHud = renderElementRegions(after, { columns: 16, rows: 4 }).find((region) => region.zIndex === 10);

  assert.equal(beforeHud?.id, afterHud?.id);
});

test('region ids stay stable when dialog content changes', () => {
  const before = overlay([
    text('backdrop', { id: 'dialog-backdrop' }),
    dialog(text('front', { id: 'dialog-content' }), {
    id: 'stable-dialog',
    title: 'Dialog',
    modal: true,
    focusPolicy: { returnFocus: 'restore' },
    width: 12,
    height: 5,
    meta: {
        layer: {
            zIndex: 20
        }
    }
})
  ], { id: 'dialog-region-root' });
  const after = overlay([
    text('backdrop', { id: 'dialog-backdrop' }),
    dialog(text('changed', { id: 'dialog-content' }), {
    id: 'stable-dialog',
    title: 'Dialog',
    modal: true,
    focusPolicy: { returnFocus: 'restore' },
    width: 12,
    height: 5,
    meta: {
        layer: {
            zIndex: 20
        }
    }
})
  ], { id: 'dialog-region-root' });
  const beforeDialog = renderElementRegions(before, { columns: 20, rows: 7 }).find((region) => region.zIndex === 20);
  const afterDialog = renderElementRegions(after, { columns: 20, rows: 7 }).find((region) => region.zIndex === 20);

  assert.equal(beforeDialog?.id, afterDialog?.id);
});

test('adding a modal dirties the complete backdrop instead of only the dialog bounds', () => {
  const terminalSize = { columns: 20, rows: 7 };
  const before = text('background', { id: 'modal-dirty-background' });
  const after = overlay([
    before,
    dialog(text('front', { id: 'modal-dirty-content' }), {
      id: 'modal-dirty-dialog',
      title: 'Dialog',
      modal: true,
      focusPolicy: { returnFocus: 'restore' },
      width: 12,
      height: 5
    })
  ], { id: 'modal-dirty-overlay' });
  const dirty = dirtyRegionsForRegionChanges(
    renderElementRegions(before, terminalSize),
    renderElementRegions(after, terminalSize)
  );

  assert.deepEqual(dirty?.rects, [
    { row: 1, column: 1, width: terminalSize.columns, height: terminalSize.rows }
  ]);
});

function movingOverlay(row, column) {
  return surface(
    overlay([
      text('background', { id: 'background' }),
      absolute(text('HUD', {
    id: 'hud',
    meta: {
        layer: {
            zIndex: 10
        }
    }
}), {
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

const applyDiffToFrame = applyRenderDiff;
