import assert from 'node:assert/strict';
import test from 'node:test';

import {
  barChartReducer,
  chartReducer,
  heatmapReducer
} from '../../dist/behavior/index.js';
import { barChart, chart, heatmap } from '../../dist/components/index.js';
import type { BarChartItem } from '../../dist/components/index.js';
import { renderElementFrame } from '../../dist/renderer/index.js';
import { renderElementRegions } from '../../dist/testing/index.js';
import { routedPointerEvent } from '../helpers/pointer.ts';

void test('bar chart behavior keeps stable selection through reorder and deletion', () => {
  const items = [
    { id: 'cpu', label: 'CPU', value: 40 },
    { id: 'memory', label: 'Memory', value: 70 },
    { id: 'disk', label: 'Disk', value: 20 }
  ] satisfies readonly BarChartItem[];
  const [cpu, memory, disk] = items;
  assert.ok(cpu);
  assert.ok(memory);
  assert.ok(disk);
  const selected = barChartReducer({}, { kind: 'select', id: 'memory', itemIndex: 1 }, items);
  const reordered = [disk, memory, cpu];
  const moved = barChartReducer(selected, { kind: 'move', delta: 1 }, reordered);
  const recovered = barChartReducer(selected, { kind: 'move', delta: 1 }, [cpu, disk]);

  assert.deepEqual(selected, { selectedId: 'memory' });
  assert.deepEqual(moved, { selectedId: 'cpu' });
  assert.deepEqual(recovered, { selectedId: 'cpu' });
});

void test('bar chart pointer targets emit stable item actions', () => {
  const regions = renderElementRegions(barChart({
    id: 'bar-actions',
    selectedId: 'memory',
    items: [
      { id: 'cpu', label: 'CPU', value: 40 },
      { id: 'memory', label: 'Memory', value: 70 }
    ],
    onAction: (action) => action
  }), { columns: 20, rows: 2 });
  const targets = regions.flatMap((region) => region.hitTargets);

  assert.deepEqual(targets[1]?.message(routedPointerEvent()), { kind: 'select', id: 'memory', itemIndex: 1 });
});

void test('chart behavior navigates series, points, and pages without owning data', () => {
  const series = [
    { id: 'cpu', points: [1, 2, 3, 4, 5, 6] },
    { id: 'memory', points: [2, 4, 6] }
  ];
  const paged = chartReducer({ selected: { series: 'cpu', pointIndex: 1 } }, { kind: 'pagePoints', delta: 1 }, series, { pageSize: 3 });
  const moved = chartReducer(paged, { kind: 'moveSeries', delta: 1 }, series);

  assert.deepEqual(paged, { selected: { series: 'cpu', pointIndex: 4 } });
  assert.deepEqual(moved, { selected: { series: 'memory', pointIndex: 2 } });
});

void test('window charts keep keyboard selection inside the projected viewport', () => {
  const frame = renderElementFrame(chart({
    id: 'windowed',
    series: [{ id: 'cpu', points: [1, 2, 3, 4, 5, 6], sampleMode: 'window' }],
    selected: { series: 'cpu', pointIndex: 4 }
  }), { columns: 3, rows: 3 });

  assert.equal(frame.cells.some((cell) => cell.source?.description === 'selection.cpu.4'), true);
});

void test('heatmap behavior navigates selectable cells by row and page', () => {
  const rows = [
    [{ id: 'a', value: 1 }, { id: 'b', value: 2 }],
    [{ id: 'c', value: 3, disabled: true }, { id: 'd', value: 4 }],
    [{ id: 'e', value: 5 }, { id: 'f', value: 6 }]
  ];
  const moved = heatmapReducer({ selected: { rowIndex: 0, columnIndex: 0 } }, { kind: 'move', rows: 1, columns: 0 }, rows);
  const paged = heatmapReducer(moved, { kind: 'pageRows', delta: 1 }, rows, { pageRows: 2 });

  assert.deepEqual(moved, { selected: { rowIndex: 1, columnIndex: 1 } });
  assert.deepEqual(paged, { selected: { rowIndex: 2, columnIndex: 1 } });
});

void test('chart and heatmap pointer targets emit semantic select actions', () => {
  const chartRegions = renderElementRegions(chart({
    id: 'chart-actions',
    series: [{ id: 'cpu', points: [1, 2] }],
    onAction: (action) => action
  }), { columns: 4, rows: 2 });
  const heatmapRegions = renderElementRegions(heatmap({
    id: 'heatmap-actions',
    rows: [[{ id: 'one', value: 1 }]],
    onAction: (action) => action
  }), { columns: 4, rows: 1 });

  const chartTarget = chartRegions.flatMap((region) => region.hitTargets)[0];
  const heatmapTarget = heatmapRegions.flatMap((region) => region.hitTargets)[0];
  assert.deepEqual(chartTarget?.message(routedPointerEvent()), { kind: 'select', series: 'cpu', pointIndex: 0 });
  assert.deepEqual(heatmapTarget?.message(routedPointerEvent()), { kind: 'select', rowIndex: 0, columnIndex: 0 });
});
