import assert from 'node:assert/strict';
import test from 'node:test';

import { highContrastTheme, noColorTheme } from '../../dist/theme/index.js';
import {
  createCanvas2D,
  createFrameBuffer,
  drawAxes,
  drawBarSeries,
  drawLineSeries,
  layoutWidget,
  renderFramePlain,
  renderWidgetFrame
} from '../../dist/tui/index.js';
import { barChart, chart, gauge, heatmap, progressBar, row, sparkline, stack, surface } from '../../dist/widgets/index.js';

test('sparkline renders bounded numeric points', () => {
  const frame = renderWidgetFrame(sparkline({
    id: 'spark',
    values: [0, 1, 2, 3]
  }), { columns: 8, rows: 1 });

  assert.equal(renderFramePlain(frame), '▁▃▆█');
  assert.equal(frame.accessibility.root.description, '4 sparkline points.');
  assert.equal(frame.cells.find((cell) => cell.text === '▁')?.source?.ownerKind, 'sparkline');
  assert.equal(frame.cells.find((cell) => cell.text === '▁')?.source?.label, 'point.0');
  assert.equal(frame.cells.find((cell) => cell.text === '▁')?.source?.role, 'chart');
  assert.equal(frame.cells.find((cell) => cell.text === '▁')?.style?.fg?.token, 'chart.series.1');
});

test('sparkline renders an empty state with chart source metadata', () => {
  const frame = renderWidgetFrame(sparkline({
    id: 'empty-spark',
    values: [],
    emptyText: 'No signal'
  }), { columns: 20, rows: 1 });

  assert.match(renderFramePlain(frame), /No signal/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.ownerKind, 'sparkline');
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.label, 'state.empty.message');
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.role, 'text');
});

test('barChart windows visible bars and exposes selected accessibility', () => {
  const frame = renderWidgetFrame(barChart({
    id: 'bars',
    selected: 2,
    items: [
      { label: 'A', value: 1 },
      { label: 'B', value: 5 },
      { label: 'C', value: 10 }
    ]
  }), { columns: 20, rows: 2 });

  const output = renderFramePlain(frame);
  assert.match(output, /B/u);
  assert.match(output, /› C/u);
  assert.equal(frame.accessibility.root.children?.[1]?.selected, true);
  assert.equal(frame.cells.find((cell) => cell.text === 'C')?.source?.ownerKind, 'barChart');
  assert.equal(frame.cells.find((cell) => cell.text === 'C')?.source?.label, 'bar.2.label');
  assert.equal(frame.cells.find((cell) => cell.text === '█')?.source?.label, 'bar.1.fill');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'bar.1.fill')?.style?.fg?.token, 'chart.series.2');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'bar.2.fill')?.style?.bg?.token, 'selection.background');
  assert.equal(frame.cells.find((cell) => cell.text === '1')?.source?.label, 'bar.2.value');
});

test('barChart renders loading state from shared chart state contract', () => {
  const frame = renderWidgetFrame(barChart({
    id: 'loading-bars',
    status: 'running',
    loadingText: 'Loading bars',
    items: []
  }), { columns: 24, rows: 1 });

  assert.match(renderFramePlain(frame), /Loading bars/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'L')?.source?.ownerKind, 'barChart');
  assert.equal(frame.cells.find((cell) => cell.text === 'L')?.source?.label, 'state.loading.message');
});

test('chart plots series into a bounded text canvas', () => {
  const frame = renderWidgetFrame(chart({
    id: 'chart',
    series: [{ id: 'one', points: [0, 2, 1, 3] }]
  }), { columns: 4, rows: 4 });

  assert.match(renderFramePlain(frame), /\*/u);
  assert.equal(frame.accessibility.root.description, '1 chart series.');
  assert.ok(frame.cells.length <= 16);
  assert.equal(frame.cells.find((cell) => cell.text === '*')?.source?.ownerKind, 'chart');
});

test('chart renders scatter points legends axis labels and selectable point hit targets', () => {
  const frame = renderWidgetFrame(chart({
    id: 'scatter-chart',
    legend: true,
    xLabel: 'watch cycle',
    yLabel: 'signal',
    selected: { series: 'scatter', point: 2 },
    series: [
      { id: 'line', label: 'Line', points: [1, 3, 2, 4], kind: 'line', glyph: '+' },
      { id: 'scatter', label: 'Scatter', points: [4, 1, 3, 2], kind: 'scatter', glyph: 'o' }
    ],
    keyMap: { enter: { kind: 'chart-enter' } },
    toMessage: (point) => ({ kind: 'chart-point', ...point })
  }), { columns: 32, rows: 7 });

  const output = renderFramePlain(frame);
  assert.match(output, /\+ Line  o Scatter/u);
  assert.match(output, /signal/u);
  assert.match(output, /watch cycle/u);
  assert.match(output, /◆/u);
  assert.equal(frame.hitTargets.some((target) => target.id === 'scatter-chart:scatter:2'), true);
  assert.equal(frame.accessibility.root.children?.some((child) => child.label === 'Scatter' && child.selected === true), true);
  assert.equal(frame.cells.find((cell) => cell.text === '◆')?.source?.label, 'selection.scatter.2');
  assert.equal(frame.cells.find((cell) => cell.text === '+')?.source?.label, 'legend.line.glyph');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'legend.line.glyph')?.style?.fg?.token, 'chart.series.1');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'legend.scatter.glyph')?.style?.fg?.token, 'chart.series.2');
  assert.equal(frame.cells.find((cell) => cell.text === 's')?.source?.label, 'axis.y.label');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'axis.y.label')?.style?.fg?.token, 'chart.axis');
  assert.equal(frame.cells.find((cell) => cell.text === 'w')?.source?.label, 'axis.x.label');
});

test('chart renders error state without anonymous text cells', () => {
  const frame = renderWidgetFrame(chart({
    id: 'error-chart',
    status: 'error',
    errorText: 'Chart unavailable',
    series: [{ id: 'one', points: [1, 2, 3] }]
  }), { columns: 24, rows: 1 });

  assert.match(renderFramePlain(frame), /Chart unavailable/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'C')?.source?.ownerKind, 'chart');
  assert.equal(frame.cells.find((cell) => cell.text === 'C')?.source?.label, 'state.error.message');
});

test('chart intrinsic measurement remains bounded inside content layout', () => {
  const layout = layoutWidget(stack([
    row([
      surface(stack([
        progressBar({ id: 'progress', value: 48, max: 100 }),
        chart({ id: 'chart', series: [{ id: 'live', points: [2, 4, 3, 5, 6, 8] }] })
      ]), { id: 'motion', border: { label: 'Motion' } })
    ])
  ]), { columns: 84, rows: 18 });
  const chartNode = findLayoutNode(layout, 'chart');

  assert.ok(chartNode !== undefined);
  assert.equal(chartNode.bounds.width <= 84, true);
  assert.equal(chartNode.bounds.height <= 18, true);
});

test('gauge renders a labeled bounded meter with progress accessibility', () => {
  const frame = renderWidgetFrame(gauge({
    id: 'gauge',
    label: 'Throughput',
    value: 75,
    max: 100,
    width: 10,
    status: 'success'
  }), { columns: 32, rows: 1 });

  const output = renderFramePlain(frame);
  assert.match(output, /Throughput/u);
  assert.match(output, /75%/u);
  assert.equal(frame.accessibility.root.role, 'progressbar');
  assert.equal(frame.accessibility.root.value, 75);
  assert.equal(frame.cells.find((cell) => cell.text === 'T')?.source?.ownerKind, 'gauge');
  assert.equal(frame.cells.find((cell) => cell.text === 'T')?.source?.label, 'metric.label');
  assert.equal(frame.cells.find((cell) => cell.text === '7')?.source?.label, 'metric.value');
  assert.equal(frame.cells.find((cell) => cell.text === 's')?.source?.label, 'status.value');
});

test('heatmap intensity uses muted normal and emphasized visual levels', () => {
  const frame = renderWidgetFrame(heatmap({
    id: 'intensity-heatmap',
    rows: [[{ id: 'empty', value: 0 }, { id: 'mid', value: 2 }, { id: 'hot', value: 4 }]],
    min: 0,
    max: 4
  }), { columns: 12, rows: 1 });
  const empty = frame.cells.find((cell) => cell.source?.label === 'cell.0.0.value');
  const mid = frame.cells.find((cell) => cell.source?.label === 'cell.0.1.value');
  const hot = frame.cells.find((cell) => cell.source?.label === 'cell.0.2.value');

  assert.equal(empty?.style?.fg?.token, 'chart.muted');
  assert.equal(empty?.style?.dim, true);
  assert.equal(mid?.style?.fg?.token, 'chart.series.1');
  assert.equal(mid?.style?.bold, undefined);
  assert.equal(hot?.style?.fg?.token, 'chart.series.1');
  assert.equal(hot?.style?.bold, true);
});

test('heatmap renders selectable cells with accessibility and hit targets', () => {
  const frame = renderWidgetFrame(heatmap({
    id: 'heatmap',
    rows: [
      [{ id: 'a', label: 'Alpha', value: 1 }, { id: 'b', label: 'Bravo', value: 5 }],
      [{ id: 'c', label: 'Charlie', value: 3 }]
    ],
    min: 0,
    max: 5,
    selected: { row: 0, column: 1 },
    keyMap: { enter: { kind: 'select-current' } },
    toMessage: (cell, row, column) => ({ kind: 'heatmap-select', id: cell.id, row, column })
  }), { columns: 12, rows: 3 });

  const output = renderFramePlain(frame);
  assert.match(output, /\[█\]/u);
  assert.equal(frame.accessibility.root.role, 'table');
  assert.equal(frame.accessibility.root.children?.some((child) => child.label === 'Bravo' && child.selected === true), true);
  assert.equal(frame.hitTargets.some((target) => target.id === 'heatmap:0:1' && target.cursor === 'pointer'), true);
  assert.equal(frame.cells.find((cell) => cell.text === '[')?.source?.ownerKind, 'heatmap');
  assert.equal(frame.cells.find((cell) => cell.text === '[')?.source?.label, 'cell.0.1.selected.open');
  assert.equal(frame.cells.find((cell) => cell.text === '█')?.source?.label, 'cell.0.1.value');
  assert.equal(frame.cells.find((cell) => cell.text === ']')?.source?.label, 'cell.0.1.selected.close');
});

test('heatmap renders empty state through chart state contract', () => {
  const frame = renderWidgetFrame(heatmap({
    id: 'empty-heatmap',
    rows: [],
    emptyText: 'No heatmap data'
  }), { columns: 24, rows: 1 });

  assert.match(renderFramePlain(frame), /No heatmap data/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.ownerKind, 'heatmap');
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.label, 'state.empty.message');
});

test('chart widgets preserve visualization meaning in high contrast and no color themes', () => {
  const highContrast = renderWidgetFrame(chart({
    id: 'contrast-chart',
    legend: true,
    selected: { series: 'alpha', point: 1 },
    series: [{ id: 'alpha', label: 'Alpha', points: [1, 3, 2], glyph: '+' }]
  }), { columns: 18, rows: 5 }, { theme: highContrastTheme });
  const noColor = renderWidgetFrame(heatmap({
    id: 'mono-heatmap',
    rows: [[{ id: 'a', value: 1 }, { id: 'b', value: 4 }]],
    selected: { row: 0, column: 1 },
    min: 0,
    max: 4
  }), { columns: 10, rows: 1 }, { theme: noColorTheme });

  assert.match(renderFramePlain(highContrast), /Alpha/u);
  assert.equal(highContrast.cells.find((cell) => cell.source?.label === 'selection.alpha.1')?.style?.bg?.token, 'selection.background');
  assert.match(renderFramePlain(noColor), /\[█\]/u);
  assert.equal(noColor.cells.find((cell) => cell.source?.label === 'cell.0.1.selected.open')?.text, '[');
  assert.equal(noColor.cells.find((cell) => cell.source?.label === 'cell.0.1.value')?.source?.role, 'chart');
});

test('Canvas2D chart helpers draw axes line series and bars', () => {
  const buffer = createFrameBuffer(8, 4);
  const canvas = createCanvas2D(buffer, { row: 1, column: 1, width: 8, height: 4 });

  drawAxes(canvas, { xTicks: [1, 3], yTicks: [1] });
  drawLineSeries(canvas, [{ x: 0, y: 3 }, { x: 3, y: 0 }]);
  drawLineSeries(canvas, [{ x: 2, y: 3 }, { x: 2, y: 0 }], {
    span: {
      text: '+',
      source: { ownerKind: 'custom-series', role: 'chart', label: 'caller.series' }
    }
  });
  drawBarSeries(canvas, [{ x: 5, value: 4 }], {
    yScale: { domain: [0, 4], range: [3, 0] },
    width: 2
  });

  const text = frameBufferText(buffer, 8, 4);
  const frame = buffer.snapshot();

  assert.match(text, /\*/u);
  assert.match(text, /█/u);
  assert.match(text, /┼/u);
  assert.equal(frame.cells.find((cell) => cell.text === '┼')?.source?.label, 'axis.tick');
  assert.equal(frame.cells.find((cell) => cell.text === '│')?.source?.label, 'axis.line');
  assert.equal(frame.cells.find((cell) => cell.text === '*')?.source?.label, 'series.line');
  assert.equal(frame.cells.find((cell) => cell.text === '+')?.source?.label, 'caller.series');
  assert.equal(frame.cells.find((cell) => cell.text === '█')?.source?.label, 'bar.fill');
});

function frameBufferText(buffer, width, height) {
  const rows = Array.from({ length: height }, () => Array.from({ length: width }, () => ' '));
  for (const cell of buffer.snapshot().cells) {
    const row = rows[cell.row - 1];
    if (row === undefined || cell.column < 1 || cell.column > width) continue;
    row[cell.column - 1] = cell.text;
  }
  return rows.map((row) => row.join('').trimEnd()).join('\n');
}

function findLayoutNode(node, id) {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const found = findLayoutNode(child, id);
    if (found !== undefined) return found;
  }
  return undefined;
}
