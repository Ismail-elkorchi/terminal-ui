import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createSplitPaneState,
  splitPaneLayout,
  splitPaneReducer
} from '../../dist/behavior/index.js';
import type { SplitPaneState } from '../../dist/behavior/index.js';
import { text } from '../../dist/components/index.js';
import { splitPane } from '../../dist/layout/index.js';
import type { SplitPaneTransition } from '../../dist/layout/index.js';
import { createTerminalHarness } from '../../dist/testing/index.js';
import { renderElementFrame } from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/renderer/internal/render-element.js';
import { createTuiRuntime, defineTui } from '../../dist/tui/index.js';
import { routedPointerEvent } from '../helpers/pointer.ts';

void test('split pane reducer preserves adjacent share totals and enforces constraints', () => {
  const initial = createSplitPaneState(3, [0.25, 0.5, 0.25]);
  const moved = splitPaneReducer(initial, { kind: 'resizeBy', deltaShare: 0.2 }, {
    constraints: [
      { minShare: 0.2, maxShare: 0.4 },
      { minShare: 0.35 },
      { minShare: 0.2 }
    ]
  });

  assert.deepEqual(moved.shares, [0.4, 0.35, 0.25]);
  assert.equal(moved.shares.reduce((sum, value) => sum + value, 0), 1);
  assert.deepEqual(splitPaneLayout(moved).sizes, [
    { kind: 'percent', value: 40 },
    { kind: 'percent', value: 35 },
    { kind: 'percent', value: 25 }
  ]);
});

void test('split pane drag uses its immutable press anchor', () => {
  const initial = createSplitPaneState(2, [0.5, 0.5]);
  const started = splitPaneReducer(initial, { kind: 'beginResize', dividerIndex: 0 });
  const first = splitPaneReducer(started, {
    kind: 'resizeFromAnchor',
    dividerIndex: 0,
    deltaShare: 0.1
  });
  const second = splitPaneReducer(first, {
    kind: 'resizeFromAnchor',
    dividerIndex: 0,
    deltaShare: 0.2
  });
  const ended = splitPaneReducer(second, { kind: 'endResize', dividerIndex: 0 });

  assert.deepEqual(first.shares, [0.6, 0.4]);
  assert.deepEqual(second.shares, [0.7, 0.3]);
  assert.equal(ended.drag, undefined);
});

void test('resizable split pane routes keyboard and captured pointer drag actions', async () => {
  const app = defineTui<
    { readonly split: SplitPaneState },
    { readonly action: SplitPaneTransition }
  >({
    id: 'resizable-split-pane',
    init: () => ({ state: ({ split: createSplitPaneState(2, [0.5, 0.5]) }) }),
    update: (state, message) => ({
      state: { split: splitPaneReducer(state.split, message.action) }
    }),
    view: (state) => splitPane([
      text({ content: 'left', id: 'left' }),
      text({ content: 'right', id: 'right' })
    ], {
      id: 'workspace-split',
      direction: 'horizontal',
      ...splitPaneLayout(state.split),
      onTransition: (action) => ({ action })
    })
  });
  const harness = createTerminalHarness({ terminalSize: { columns: 20, rows: 3 } });
  const runtime = createTuiRuntime({
    app,
    host: harness.host,
    input: { mouseReporting: 'drag' }
  });

  await runtime.start();
  await runtime.handleInput({ kind: 'key', key: 'arrowRight', modifiers: { ctrl: false, alt: false, shift: false, meta: false }, eventType: 'press', location: 'standard' });
  assert.deepEqual(runtime.state().split.shares, [0.55, 0.45]);

  const frame = runtime.frame();
  assert.ok(frame);
  const divider = frame.hitTargets?.find((target) => target.id === 'divider.0');
  assert.deepEqual(divider?.bounds, { row: 1, column: 11, width: 1, height: 3 });
  await runtime.handleInputChunk({ data: '\u001B[<0;11;1M' });
  await runtime.handleInputChunk({ data: '\u001B[<32;13;1M' });
  await runtime.handleInputChunk({ data: '\u001B[<0;13;1m' });

  const leadingShare = runtime.state().split.shares[0];
  assert.ok(leadingShare !== undefined);
  assert.ok(Math.abs(leadingShare - (0.55 + (2 / 18))) < 1e-12);
  assert.equal(runtime.state().split.drag, undefined);
});

void test('vertical split pane divider exposes complete pointer lifecycle actions', () => {
  const regions = renderElementRegions(splitPane([
    text({ content: 'top' }),
    text({ content: 'bottom' })
  ], {
    id: 'vertical-split',
    direction: 'vertical',
    sizes: [{ kind: 'percent', value: 50 }, { kind: 'percent', value: 50 }],
    onTransition: (action) => action
  }), { columns: 12, rows: 9 });
  const divider = regions.flatMap((region) => region.hitTargets).find((target) => target.id === 'divider.0');
  assert.ok(divider);

  assert.deepEqual(divider.message(routedPointerEvent({
    kind: 'pointerDown',
    row: 5,
    column: 1
  })), { kind: 'beginResize', dividerIndex: 0 });
  assert.deepEqual(divider.message(routedPointerEvent({
    kind: 'drag',
    row: 7,
    column: 1,
    pressRow: 5,
    pressColumn: 1
  })), { kind: 'resizeFromAnchor', dividerIndex: 0, deltaShare: 0.25 });
  assert.deepEqual(divider.message(routedPointerEvent({
    kind: 'dragEnd',
    row: 7,
    column: 1
  })), { kind: 'endResize', dividerIndex: 0 });
});

void test('passive split pane dividers remain structural instead of active', () => {
  const passive = renderElementFrame(splitPane([
    text({ content: 'left' }),
    text({ content: 'right' })
  ], {
    id: 'passive-split',
    direction: 'horizontal',
    gap: 1,
    sizes: [{ kind: 'fill' }, { kind: 'fixed', cells: 5 }]
  }), { columns: 12, rows: 2 });
  const interactive = renderElementFrame(splitPane([
    text({ content: 'left' }),
    text({ content: 'right' })
  ], {
    id: 'interactive-split',
    direction: 'horizontal',
    sizes: [{ kind: 'percent', value: 50 }, { kind: 'percent', value: 50 }],
    onTransition: (action) => action
  }), { columns: 12, rows: 2 });
  const passiveDivider = passive.cells.find((cell) => cell.source?.elementId === 'passive-split');
  const activeDivider = interactive.cells.find((cell) => cell.source?.elementId === 'interactive-split');

  assert.equal(passiveDivider?.source?.partName, 'divider');
  assert.deepEqual(passiveDivider.style?.fg, { kind: 'theme', token: 'surface.border' });
  assert.equal(activeDivider?.source?.partName, 'divider.active');
  assert.deepEqual(activeDivider.style?.fg, { kind: 'theme', token: 'accent.primary' });
});

void test('resizable split pane rejects geometry that cannot expose dividers', () => {
  assert.throws(
    () => splitPane([text({ content: 'only' })], {
      id: 'invalid-one-pane',
      direction: 'horizontal',
      sizes: [{ kind: 'percent', value: 100 }],
      onTransition: () => ({ kind: 'none' })
    }),
    /requires at least two children/u
  );
  assert.throws(
    () => splitPane([text({ content: 'left' }), text({ content: 'right' })], {
      id: 'invalid-gap',
      direction: 'horizontal',
      sizes: [{ kind: 'percent', value: 50 }, { kind: 'percent', value: 50 }],
      gap: 0,
      onTransition: () => ({ kind: 'none' })
    }),
    /gap of at least one cell/u
  );
});
