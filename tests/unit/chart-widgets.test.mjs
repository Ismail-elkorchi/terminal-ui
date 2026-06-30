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
import { barChart, chart, sparkline } from '../../dist/widgets/index.js';

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
