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
import { createFrameBuffer } from '../../dist/renderer/frame-buffer.js';
import { renderElementInternal, renderElementRegions } from '../../dist/renderer/internal/render-element.js';
import { dirtyRegionsForRenderCommit } from '../../dist/tui/runtime-frame.js';
import {
  absolute,
  overlay,
  surface
} from '../../dist/layout/index.js';
import {
  dialog,
  text,
  textInput
} from '../../dist/components/index.js';
import { ignoreMessage } from '../../dist/component/index.js';
import { testCanvas as canvas } from '../helpers/canvas.mjs';

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
  const diff = diffFrames(previous, next, { dirtyRegions: dirtyRegions?.rects });
  const applied = applyDiffToFrame(previous, diff);

  assert.deepEqual(diff.dirtyRegions, dirtyRegions?.rects);
  assert.equal(diff.fullRewrite, false);
  assert.equal(renderFramePlain(applied), renderFramePlain(next));
  assert.equal(diff.dirtyRegions?.some((rect) => rect.width === terminalSize.columns && rect.height === terminalSize.rows), false);
});

test('retained commit damage includes styled cursor cells outside region snapshots', () => {
  const terminalSize = { columns: 8, rows: 1 };
  const previous = renderElementInternal(cursorInput(4), terminalSize, { focusPath: ['cursor-input'] });
  const next = renderElementInternal(cursorInput(3), terminalSize, { focusPath: ['cursor-input'] });
  const regionDamage = dirtyRegionsForRegionChanges(previous.regions, next.regions);
  const commitDamage = dirtyRegionsForRenderCommit(previous, next);
  const diff = diffFrames(previous.frame, next.frame, { dirtyRegions: commitDamage?.rects });
  const replayed = applyRenderDiff(previous.frame, diff);

  assert.deepEqual(regionDamage?.rects, []);
  assert.deepEqual(previous.postCompositionDamage.rects, [{ row: 1, column: 7, width: 1, height: 1 }]);
  assert.deepEqual(next.postCompositionDamage.rects, [{ row: 1, column: 6, width: 1, height: 1 }]);
  assert.deepEqual(commitDamage?.rects, [{ row: 1, column: 6, width: 2, height: 1 }]);
  assert.deepEqual(replayed.cells, next.frame.cells);
  assert.deepEqual(replayed.cursor, next.frame.cursor);
});

test('styled cursor damage covers complete wide graphemes', () => {
  const terminalSize = { columns: 8, rows: 1 };
  const previous = renderElementInternal(cursorInput(0, '🙂', 'wide-cursor-input'), terminalSize, {
    focusPath: ['wide-cursor-input']
  });
  const next = renderElementInternal(cursorInput(2, '🙂', 'wide-cursor-input'), terminalSize, {
    focusPath: ['wide-cursor-input']
  });
  const damage = dirtyRegionsForRenderCommit(previous, next);
  const replayed = applyRenderDiff(previous.frame, diffFrames(previous.frame, next.frame, {
    dirtyRegions: damage?.rects
  }));

  assert.deepEqual(previous.postCompositionDamage.rects, [{ row: 1, column: 3, width: 2, height: 1 }]);
  assert.deepEqual(next.postCompositionDamage.rects, [{ row: 1, column: 5, width: 1, height: 1 }]);
  assert.deepEqual(damage?.rects, [{ row: 1, column: 3, width: 3, height: 1 }]);
  assert.deepEqual(replayed.cells, next.frame.cells);
});

test('retained commit damage includes neighboring cells changed by frame passes', () => {
  const horizontal = absolute(borderGlyph('horizontal-border', '─'), {
    id: 'horizontal-border-placement',
    row: 2,
    column: 2,
    width: 1,
    height: 1
  });
  const vertical = absolute(borderGlyph('vertical-border', '│'), {
    id: 'vertical-border-placement',
    row: 1,
    column: 2,
    width: 1,
    height: 1
  });
  const terminalSize = { columns: 4, rows: 3 };
  const previous = renderElementInternal(overlay([horizontal], { id: 'joined-border-root' }), terminalSize);
  const next = renderElementInternal(overlay([horizontal, vertical], { id: 'joined-border-root' }), terminalSize);
  const regionDamage = dirtyRegionsForRegionChanges(previous.regions, next.regions);
  const commitDamage = dirtyRegionsForRenderCommit(previous, next);
  const diff = diffFrames(previous.frame, next.frame, { dirtyRegions: commitDamage?.rects });
  const replayed = applyRenderDiff(previous.frame, diff);
  const removalDamage = dirtyRegionsForRenderCommit(next, previous);
  const removalReplay = applyRenderDiff(next.frame, diffFrames(next.frame, previous.frame, {
    dirtyRegions: removalDamage?.rects
  }));

  assert.deepEqual(regionDamage?.rects, [{ row: 1, column: 2, width: 1, height: 1 }]);
  assert.deepEqual(commitDamage?.rects, [
    { row: 1, column: 2, width: 1, height: 1 },
    { row: 2, column: 2, width: 1, height: 1 }
  ]);
  assert.equal(renderFramePlain(replayed), renderFramePlain(next.frame));
  assert.equal(renderFramePlain(next.frame), ' │\n ┴');
  assert.deepEqual(removalDamage?.rects, commitDamage?.rects);
  assert.equal(renderFramePlain(removalReplay), renderFramePlain(previous.frame));
});

test('incremental diff replay rejects width-profile changes', () => {
  const wide = { emoji: 'wide', ambiguous: 'narrow' };
  const narrow = { emoji: 'narrow', ambiguous: 'narrow' };
  const previous = renderElementFrame(text({ content: '🙂' }), { columns: 4, rows: 1 }, { widthProfile: wide });
  const incompatible = {
    ...diffFrames(previous, previous),
    widthProfile: narrow
  };

  assert.throws(
    () => applyRenderDiff(previous, incompatible),
    /width profile/u
  );

  const rewritten = renderElementFrame(text({ content: '🙂' }), { columns: 4, rows: 1 }, { widthProfile: narrow });
  const replayed = applyRenderDiff(undefined, diffFrames(undefined, rewritten));
  assert.deepEqual(replayed.widthProfile, narrow);
});

test('diff replay preserves the target canvas style explicitly', () => {
  const previousBuffer = createFrameBuffer(4, 1);
  previousBuffer.write(1, 1, [{ text: 'old' }]);
  const nextBuffer = createFrameBuffer(4, 1);
  nextBuffer.write(1, 1, [{ text: 'new' }]);
  const previous = previousBuffer.snapshot({ canvasStyle: { bg: { kind: 'ansi', value: 1 } } });
  const next = nextBuffer.snapshot({ canvasStyle: { bg: { kind: 'ansi', value: 4 } } });

  const diff = diffFrames(previous, next);
  const replayed = applyRenderDiff(previous, diff);

  assert.deepEqual(diff.canvasStyle, next.canvasStyle);
  assert.deepEqual(replayed.canvasStyle, next.canvasStyle);
  assert.deepEqual(replayed.cells, next.cells);

  const withoutCanvas = nextBuffer.snapshot();
  const cleared = applyRenderDiff(replayed, diffFrames(next, withoutCanvas));
  assert.equal(cleared.canvasStyle, undefined);
});

test('region fingerprints skip unchanged regions', () => {
  const regions = renderElementRegions(text({ content: 'same', id: 'fingerprint-same' }), { columns: 12, rows: 3 });
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
    text({ content: 'background', id: 'stable-background' }),
    absolute(text({ content: 'HUD', id: 'stable-hud',
    meta: {
        layer: {
            zIndex: 10
        }
    } }), {
      id: 'stable-hud-position',
      row: 2,
      column: 2,
      width: 3,
      height: 1
    })
  ], { id: 'stable-overlay-root' });
  const after = overlay([
    text({ content: 'background', id: 'stable-background' }),
    absolute(text({ content: 'TIP', id: 'inserted-tip',
    meta: {
        layer: {
            zIndex: 5
        }
    } }), {
      id: 'inserted-tip-position',
      row: 1,
      column: 8,
      width: 3,
      height: 1
    }),
    absolute(text({ content: 'HUD', id: 'stable-hud',
    meta: {
        layer: {
            zIndex: 10
        }
    } }), {
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
    text({ content: 'backdrop', id: 'dialog-backdrop' }),
    dialog({
    slots: { content: text({ content: 'front', id: 'dialog-content' }) },
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
    text({ content: 'backdrop', id: 'dialog-backdrop' }),
    dialog({
    slots: { content: text({ content: 'changed', id: 'dialog-content' }) },
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
  const before = text({ content: 'background', id: 'modal-dirty-background' });
  const after = overlay([
    before,
    dialog({
      slots: { content: text({ content: 'front', id: 'modal-dirty-content' }) },
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
      text({ content: 'background', id: 'background' }),
      absolute(text({ content: 'HUD', id: 'hud',
    meta: {
        layer: {
            zIndex: 10
        }
    } }), {
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

function borderGlyph(id, content) {
  return canvas({
    id,
    painter({ canvas: target, frameSource }) {
      target.text(0, 0, [{
        text: content,
        source: frameSource({ cellRole: 'border', partName: 'border', partType: 'border' })
      }]);
    }
  });
}

function cursorInput(cursor, value = 'abcd', id = 'cursor-input') {
  return textInput({
    id,
    meta: { accessibleName: 'Cursor input' },
    state: { value, cursor },
    onTransition: () => ignoreMessage()
  });
}

const applyDiffToFrame = applyRenderDiff;
