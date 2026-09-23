import assert from 'node:assert/strict';
import test from 'node:test';

import { button } from '../../dist/components/index.js';
import { column } from '../../dist/layout/index.js';
import { renderElementInternal } from '../../dist/renderer/internal/render-element.js';
import {
  collectLayoutFocusTargets,
  collectRenderNodeLayoutTargets,
} from '../../dist/renderer/internal/focus.js';
import { createRegionTargetIndex } from '../../dist/renderer/internal/region-target-index.js';

test('row interval index preserves target order and visits only relevant rows', () => {
  const elements = Array.from({ length: 80 }, (_, index) => button({
    id: `item-${String(index)}`, label: `Item ${String(index)}`,
    onPress: () => index,
  }));
  const rendered = renderElementInternal(column(elements), { columns: 20, rows: 80 });
  const measurements = [];
  const index = createRegionTargetIndex(rendered.node, rendered.layout, {
    recordWork: (entry) => measurements.push(entry),
  });
  const allLayout = collectRenderNodeLayoutTargets(rendered.node, rendered.layout);
  const allFocus = collectLayoutFocusTargets(rendered.layout);
  const overlaps = (left, right) => left.row < right.row + right.height
    && left.row + left.height > right.row
    && left.column < right.column + right.width
    && left.column + left.width > right.column;
  for (const row of [1, 15, 39, 60, 80]) {
    const bounds = { row, column: 1, width: 20, height: 1 };
    const expectedLayout = allLayout.filter((target) =>
      target.layer.zIndex === 0 && overlaps(target.bounds, bounds));
    const expectedFocus = allFocus.filter((target) =>
      target.layer.zIndex === 0 && overlaps(target.bounds, bounds));
    assert.deepEqual(index.layoutTargetsForRegion(0, bounds), expectedLayout);
    assert.deepEqual(index.focusTargetsForRegion(0, bounds), expectedFocus);
  }
  const visits = measurements
    .filter((entry) => entry.kind === 'region_target_visits')
    .reduce((sum, entry) => sum + entry.count, 0);
  assert.ok(visits < 80, `Expected spatial lookup to visit fewer than 80 targets, visited ${String(visits)}.`);
});

test('layout pairing cache follows render-node identity when geometry is reused', () => {
  const first = renderElementInternal(button({ id: 'same', label: 'Same', onPress: () => 'first' }), {
    columns: 12, rows: 2,
  });
  const second = renderElementInternal(button({ id: 'same', label: 'Same', onPress: () => 'second' }), {
    columns: 12, rows: 2,
  });
  const before = collectRenderNodeLayoutTargets(first.node, first.layout);
  const after = collectRenderNodeLayoutTargets(second.node, first.layout);
  assert.equal(before[0]?.renderNode, first.node);
  assert.equal(after[0]?.renderNode, second.node);
  const firstIndex = createRegionTargetIndex(first.node, first.layout);
  assert.equal(createRegionTargetIndex(first.node, first.layout), firstIndex);
  const nextIndex = createRegionTargetIndex(second.node, first.layout);
  assert.notEqual(nextIndex, firstIndex);
  assert.equal(nextIndex.layoutTargets[0]?.renderNode, second.node);
});
