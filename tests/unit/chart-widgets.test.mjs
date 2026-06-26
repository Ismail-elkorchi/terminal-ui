import assert from 'node:assert/strict';
import test from 'node:test';

import { renderFrame, renderWidgetFrame } from '../../dist/tui/index.js';
import { barChart, chart, sparkline } from '../../dist/widgets/index.js';

test('sparkline renders bounded numeric points', () => {
  const frame = renderWidgetFrame(sparkline({
    id: 'spark',
    values: [0, 1, 2, 3]
  }), { columns: 8, rows: 1 });

  assert.equal(renderFrame(frame), '▁▃▆█');
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

  const output = renderFrame(frame);
  assert.match(output, /B/u);
  assert.match(output, /› C/u);
  assert.equal(frame.accessibility.root.children?.[1]?.selected, true);
});

test('chart plots series into a bounded text canvas', () => {
  const frame = renderWidgetFrame(chart({
    id: 'chart',
    series: [{ id: 'one', points: [0, 2, 1, 3] }]
  }), { columns: 4, rows: 4 });

  assert.match(renderFrame(frame), /\*/u);
  assert.equal(frame.accessibility.root.description, '1 chart series.');
  assert.ok(frame.cells.length <= 16);
});
