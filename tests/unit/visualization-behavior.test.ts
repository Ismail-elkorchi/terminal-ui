import assert from 'node:assert/strict';
import test from 'node:test';

import { barChartReducer, chartReducer, heatmapReducer } from '../../dist/behavior/index.js';
import { barChart, chart, heatmap } from '../../dist/components/index.js';
import type { BarChartItem } from '../../dist/components/index.js';
import { renderElementFrame } from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/renderer/internal/render-element.js';
import { routedPointerEvent } from '../helpers/pointer.ts';

const manual = {};

void test('bar charts distinguish active datum from committed selection across reorder', () => {
  const items = [
    { id: 'cpu', label: 'CPU', value: 40 },
    { id: 'memory', label: 'Memory', value: 70 },
    { id: 'disk', label: 'Disk', value: 20 },
  ] satisfies readonly BarChartItem[];
  const initial = {
    activeId: 'memory',
    selection: { mode: 'single' as const, selectedId: 'memory' },
  };
  const moved = barChartReducer(initial, { kind: 'moveActive', delta: 1 }, [...items].reverse(), manual);
  const committed = barChartReducer(moved, { kind: 'commitActive' }, items, manual);

  assert.equal(moved.activeId, 'cpu');
  assert.deepEqual(moved.selection, { mode: 'single', selectedId: 'memory' });
  assert.deepEqual(committed.selection, { mode: 'single', selectedId: 'cpu' });
});

void test('bar chart pointer targets emit stable active-id transitions', () => {
  const regions = renderElementRegions(barChart({
    id: 'bar-actions',
    label: 'Resource usage',
    items: [
      { id: 'cpu', label: 'CPU', value: 40 },
      { id: 'memory', label: 'Memory', value: 70 },
    ],
    state: { activeId: 'cpu', selection: { mode: 'single', selectedId: 'cpu' } },
    onTransition: (transition) => transition,
  }), { columns: 20, rows: 2 });
  const targets = regions.flatMap((region) => region.hitTargets);
  assert.deepEqual(targets[1]?.message(routedPointerEvent({ kind: 'pointerDown' })), {
    kind: 'setActive',
    id: 'memory',
  });
});

void test('chart behavior navigates points, series, and pages through globally stable point ids', () => {
  const series = [
    {
      id: 'cpu',
      label: 'CPU',
      points: [1, 2, 3, 4, 5, 6].map((value) => ({
        id: `cpu-${String(value)}`,
        label: `CPU ${String(value)}`,
        value,
      })),
    },
    {
      id: 'memory',
      label: 'Memory',
      points: [2, 4, 6].map((value) => ({
        id: `memory-${String(value)}`,
        label: `Memory ${String(value)}`,
        value,
      })),
    },
  ];
  const initial = { activeId: 'cpu-2', selection: { mode: 'none' as const } };
  const paged = chartReducer(initial, { kind: 'pagePoints', delta: 1 }, series, {
    pageSize: 3,
  });
  const moved = chartReducer(paged, { kind: 'moveSeries', delta: 1 }, series, {});

  assert.equal(paged.activeId, 'cpu-5');
  assert.equal(moved.activeId, 'memory-6');
  assert.throws(() => chartReducer(initial, { kind: 'firstActive' }, [
    { id: 'one', label: 'One', points: [{ id: 'same', label: 'One', value: 1 }] },
    { id: 'two', label: 'Two', points: [{ id: 'same', label: 'Two', value: 2 }] },
  ], {}), /unique across all series/u);
});

void test('window charts render active and selected states through the shared interaction state', () => {
  const frame = renderElementFrame(chart({
    id: 'windowed',
    label: 'CPU trend',
    series: [{
      id: 'cpu',
      label: 'CPU',
      points: [1, 2, 3, 4, 5, 6].map((value) => ({
        id: `point-${String(value)}`,
        label: `Point ${String(value)}`,
        value,
      })),
      sampleMode: 'window',
    }],
    state: { activeId: 'point-5', selection: { mode: 'single', selectedId: 'point-5' } },
    onTransition: (transition) => transition,
  }), { columns: 3, rows: 3 });
  assert.equal(frame.cells.some((cell) => cell.source?.description === 'selection.cpu.point-5'), true);
});

void test('heatmap behavior navigates enabled cells by row and page', () => {
  const rows = [
    [{ id: 'a', label: 'A', value: 1 }, { id: 'b', label: 'B', value: 2 }],
    [{ id: 'c', label: 'C', value: 3, disabled: true }, { id: 'd', label: 'D', value: 4 }],
    [{ id: 'e', label: 'E', value: 5 }, { id: 'f', label: 'F', value: 6 }],
  ];
  const initial = { activeId: 'a', selection: { mode: 'none' as const } };
  const moved = heatmapReducer(initial, { kind: 'moveCell', rows: 1, columns: 0 }, rows, {});
  const paged = heatmapReducer(moved, { kind: 'pageRows', delta: 1 }, rows, {
    pageSize: 2,
  });
  assert.equal(moved.activeId, 'd');
  assert.equal(paged.activeId, 'f');
});

void test('chart and heatmap pointer transitions follow the same active-datum contract', () => {
  const chartRegions = renderElementRegions(chart({
    id: 'chart-actions',
    label: 'CPU trend',
    series: [{
      id: 'cpu',
      label: 'CPU',
      points: [{ id: 'first', label: 'First', value: 1 }, { id: 'second', label: 'Second', value: 2 }],
    }],
    state: { selection: { mode: 'none' } },
    onTransition: (transition) => transition,
  }), { columns: 4, rows: 2 });
  const heatmapRegions = renderElementRegions(heatmap({
    id: 'heatmap-actions',
    label: 'Utilization',
    rows: [[{ id: 'one', label: 'One', value: 1 }]],
    state: { selection: { mode: 'none' } },
    onTransition: (transition) => transition,
  }), { columns: 4, rows: 1 });
  assert.deepEqual(chartRegions.flatMap((region) => region.hitTargets)[0]?.message(routedPointerEvent({
    kind: 'pointerDown',
  })), {
    kind: 'setActive',
    id: 'first',
  });
  assert.deepEqual(heatmapRegions.flatMap((region) => region.hitTargets)[0]?.message(routedPointerEvent({
    kind: 'pointerDown',
  })), {
    kind: 'setActive',
    id: 'one',
  });
});
