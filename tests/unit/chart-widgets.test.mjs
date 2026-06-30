import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createCanvas2D,
  createFrameBuffer,
  drawAxes,
  drawBarSeries,
  drawLineSeries,
  renderFramePlain,
  renderWidgetFrame
} from '../../dist/tui/index.js';
import { barChart, chart, gauge, heatmap, sparkline } from '../../dist/widgets/index.js';

test('sparkline renders bounded numeric points', () => {
  const frame = renderWidgetFrame(sparkline({
    id: 'spark',
    values: [0, 1, 2, 3]
  }), { columns: 8, rows: 1 });

  assert.equal(renderFramePlain(frame), '▁▃▆█');
  assert.equal(frame.accessibility.root.description, '4 sparkline points.');
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
});

test('chart plots series into a bounded text canvas', () => {
  const frame = renderWidgetFrame(chart({
    id: 'chart',
    series: [{ id: 'one', points: [0, 2, 1, 3] }]
  }), { columns: 4, rows: 4 });

  assert.match(renderFramePlain(frame), /\*/u);
  assert.equal(frame.accessibility.root.description, '1 chart series.');
  assert.ok(frame.cells.length <= 16);
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
});

test('Canvas2D chart helpers draw axes line series and bars', () => {
  const buffer = createFrameBuffer(8, 4);
  const canvas = createCanvas2D(buffer, { row: 1, column: 1, width: 8, height: 4 });

  drawAxes(canvas, { xTicks: [1, 3], yTicks: [1] });
  drawLineSeries(canvas, [{ x: 0, y: 3 }, { x: 3, y: 0 }], { span: { text: '*' } });
  drawBarSeries(canvas, [{ x: 5, value: 4 }], {
    yScale: { domain: [0, 4], range: [3, 0] },
    span: { text: '█' },
    width: 2
  });

  const text = frameBufferText(buffer, 8, 4);

  assert.match(text, /\*/u);
  assert.match(text, /█/u);
  assert.match(text, /┼/u);
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
