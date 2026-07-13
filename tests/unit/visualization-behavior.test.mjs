import assert from 'node:assert/strict';
import test from 'node:test';

import {
  chartPresentation,
  chartReducer,
  heatmapPresentation,
  heatmapReducer
} from '../../dist/behavior/index.js';
import { chart, heatmap } from '../../dist/components/index.js';
import { renderElementFrame, renderElementRegions } from '../../dist/renderer/index.js';

test('chart behavior navigates series, points, and pages without owning data', () => {
  const series = [
    { id: 'cpu', points: [1, 2, 3, 4, 5, 6] },
    { id: 'memory', points: [2, 4, 6] }
  ];
  const paged = chartReducer({ selected: { series: 'cpu', point: 1 } }, { kind: 'pagePoints', delta: 1 }, series, { pageSize: 3 });
  const moved = chartReducer(paged, { kind: 'moveSeries', delta: 1 }, series);

  assert.deepEqual(chartPresentation(paged), { selected: { series: 'cpu', point: 4 } });
  assert.deepEqual(moved, { selected: { series: 'memory', point: 2 } });
});

test('window charts keep keyboard selection inside the projected viewport', () => {
  const frame = renderElementFrame(chart({
    id: 'windowed',
    series: [{ id: 'cpu', points: [1, 2, 3, 4, 5, 6], sampleMode: 'window' }],
    selected: { series: 'cpu', point: 4 }
  }), { columns: 3, rows: 3 });

  assert.equal(frame.cells.some((cell) => cell.source?.label === 'selection.cpu.4'), true);
});

test('heatmap behavior navigates selectable cells by row and page', () => {
  const rows = [
    [{ id: 'a', value: 1 }, { id: 'b', value: 2 }],
    [{ id: 'c', value: 3, disabled: true }, { id: 'd', value: 4 }],
    [{ id: 'e', value: 5 }, { id: 'f', value: 6 }]
  ];
  const moved = heatmapReducer({ selected: { row: 0, column: 0 } }, { kind: 'move', rows: 1, columns: 0 }, rows);
  const paged = heatmapReducer(moved, { kind: 'pageRows', delta: 1 }, rows, { pageRows: 2 });

  assert.deepEqual(moved, { selected: { row: 1, column: 1 } });
  assert.deepEqual(heatmapPresentation(paged), { selected: { row: 2, column: 1 } });
});

test('chart and heatmap pointer targets emit semantic select actions', () => {
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
  assert.deepEqual(chartTarget?.message({}), { kind: 'select', series: 'cpu', point: 0 });
  assert.deepEqual(heatmapTarget?.message({}), { kind: 'select', row: 0, column: 0 });
});
