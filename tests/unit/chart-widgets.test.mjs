import assert from 'node:assert/strict';
import test from 'node:test';

import {
  highContrastTheme,
  noColorTheme } from '../../dist/theme/index.js';
import {
  createCanvas2D,
  createFrameBuffer,
  drawAxes,
  drawAreaSeries,
  drawBarSeries,
  drawLineSeries,
  layoutElement,
  renderFramePlain,
  renderElementFrame
} from '../../dist/renderer/index.js';
import {
  barChart,
  chart,
  meter,
  heatmap,
  progressBar,
  sparkline
} from '../../dist/components/index.js';
import {
  row,
  column,
  surface
} from '../../dist/layout/index.js';

test('sparkline renders bounded numeric points', () => {
  const frame = renderElementFrame(sparkline({
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

test('sparkline valueScale styles points by normalized value', () => {
  const frame = renderElementFrame(sparkline({
    id: 'scaled-spark',
    values: [0, 50, 100],
    min: 0,
    max: 100,
    valueScale: [
      { at: 0, token: 'scale.low' },
      { at: 0.5, token: 'scale.high' },
      { at: 0.9, token: 'scale.critical' }
    ]
  }), { columns: 8, rows: 1 });

  assert.equal(renderFramePlain(frame), '▁▅█');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'point.0')?.style?.fg?.token, 'scale.low');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'point.1')?.style?.fg?.token, 'scale.high');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'point.2')?.style?.fg?.token, 'scale.critical');
});

test('sparkline renders an empty state with chart source metadata', () => {
  const frame = renderElementFrame(sparkline({
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
  const frame = renderElementFrame(barChart({
    id: 'bars',
    selectedId: 'c',
    items: [
      { id: 'a', label: 'A', value: 1 },
      { id: 'b', label: 'B', value: 5 },
      { id: 'c', label: 'C', value: 10 }
    ]
  }), { columns: 20, rows: 2 });

  const output = renderFramePlain(frame);
  assert.match(output, /B/u);
  assert.match(output, /› C/u);
  assert.equal(frame.accessibility.root.children?.[1]?.selected, true);
  assert.equal(frame.cells.find((cell) => cell.text === 'C')?.source?.ownerKind, 'barChart');
  assert.equal(frame.cells.find((cell) => cell.text === 'C')?.source?.label, 'bar.c.label');
  assert.equal(frame.cells.find((cell) => cell.text === '█')?.source?.label, 'bar.b.fill');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'bar.b.fill')?.style?.fg?.token, 'chart.series.2');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'bar.c.fill')?.style?.bg?.token, 'selection.background');
  assert.equal(frame.cells.find((cell) => cell.text === '1')?.source?.label, 'bar.c.value');
});

test('barChart budgets labels and fills in terminal cells under wide profiles', () => {
  const widthProfile = { emoji: 'wide', ambiguous: 'wide' };
  const frame = renderElementFrame(barChart({
    id: 'wide-bars',
    items: [{ id: 'dots', label: '··', value: 10 }]
  }), { columns: 16, rows: 1 }, { widthProfile });
  const valueCells = frame.cells.filter((cell) => cell.source?.label === 'bar.dots.value');

  assert.equal(renderFramePlain(frame), '  ·· ███ 10');
  assert.deepEqual(valueCells.map((cell) => cell.column), [15, 16]);
});

test('barChart renders loading state from shared chart state contract', () => {
  const frame = renderElementFrame(barChart({
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
  const frame = renderElementFrame(chart({
    id: 'chart',
    series: [{ id: 'one', points: [0, 2, 1, 3] }]
  }), { columns: 4, rows: 4 });

  assert.match(renderFramePlain(frame), /\*/u);
  assert.equal(frame.accessibility.root.description, '1 chart series.');
  assert.ok(frame.cells.length <= 16);
  assert.equal(frame.cells.find((cell) => cell.text === '*')?.source?.ownerKind, 'chart');
});

test('chart fit sample mode fills the available plot width', () => {
  const frame = renderElementFrame(chart({
    id: 'fit-chart',
    min: 0,
    max: 100,
    sampleMode: 'fit',
    series: [{ id: 'load', points: [0, 35, 70, 100], kind: 'area' }]
  }), { columns: 12, rows: 4 });
  const areaColumns = frame.cells
    .filter((cell) => cell.source?.label === 'series.load.area')
    .map((cell) => cell.column);

  assert.equal(Math.min(...areaColumns), 1);
  assert.equal(Math.max(...areaColumns), 12);
});

test('chart fit sample mode selects raw points by scaled source position', () => {
  const firstFrame = renderElementFrame(chart({
    id: 'fit-selected-first',
    min: 0,
    max: 10,
    selected: { series: 'load', point: 0 },
    sampleMode: 'fit',
    series: [{ id: 'load', points: [0, 10], kind: 'scatter' }]
  }), { columns: 10, rows: 3 });
  const lastFrame = renderElementFrame(chart({
    id: 'fit-selected-last',
    min: 0,
    max: 10,
    selected: { series: 'load', point: 1 },
    sampleMode: 'fit',
    series: [{ id: 'load', points: [0, 10], kind: 'scatter' }]
  }), { columns: 10, rows: 3 });
  const firstSelection = firstFrame.cells.find((cell) => cell.source?.label === 'selection.load.0');
  const lastSelection = lastFrame.cells.find((cell) => cell.source?.label === 'selection.load.1');

  assert.equal(firstSelection?.column, 1);
  assert.equal(lastSelection?.column, 10);
});

test('chart window sample mode renders a raw aligned window', () => {
  const frame = renderElementFrame(chart({
    id: 'window-chart',
    min: 0,
    max: 50,
    series: [{ id: 'load', points: [10, 20, 30, 40, 50], kind: 'scatter', sampleMode: 'window', sampleAlign: 'end' }],
    onAction: (action) => ({ kind: 'chart', action })
  }), { columns: 3, rows: 3 });
  const firstTarget = frame.hitTargets.find((target) => target.id === 'window-chart:load:0');
  const lastTarget = frame.hitTargets.find((target) => target.id === 'window-chart:load:2');

  assert.deepEqual(firstTarget?.bounds, { row: 2, column: 1, width: 1, height: 1 });
  assert.deepEqual(lastTarget?.bounds, { row: 1, column: 3, width: 1, height: 1 });
});

test('chart signedDomain renders zero baseline and polarity source metadata', () => {
  const frame = renderElementFrame(chart({
    id: 'signed-chart',
    signedDomain: true,
    min: -4,
    max: 4,
    series: [{ id: 'net', points: [-4, -2, 0, 2, 4], glyph: '*' }]
  }), { columns: 12, rows: 5 });
  const baselineCell = frame.cells.find((cell) => cell.source?.label === 'baseline.zero');
  const positiveCell = frame.cells.find((cell) => cell.source?.label === 'series.net.positive.line');
  const negativeCell = frame.cells.find((cell) => cell.source?.label === 'series.net.negative.line');

  assert.match(renderFramePlain(frame), /─/u);
  assert.equal(baselineCell?.source?.partKind, 'baseline');
  assert.equal(baselineCell?.style?.fg?.token, 'chart.baseline');
  assert.equal(positiveCell?.style?.fg?.token, 'chart.positive');
  assert.equal(negativeCell?.style?.fg?.token, 'chart.negative');
});

test('chart renders area and bar series with signed baseline semantics', () => {
  const frame = renderElementFrame(chart({
    id: 'filled-chart',
    signedDomain: true,
    min: -4,
    max: 4,
    series: [
      { id: 'cpu', points: [0, 2, 4], kind: 'area' },
      { id: 'net', points: [0, -2, -4], kind: 'bar' }
    ]
  }), { columns: 8, rows: 5 });
  const areaCell = frame.cells.find((cell) => cell.source?.label === 'series.cpu.positive.area');
  const barCell = frame.cells.find((cell) => cell.source?.label === 'series.net.negative.bar');

  assert.match(renderFramePlain(frame), /█/u);
  assert.equal(areaCell?.source?.partKind, 'area');
  assert.equal(areaCell?.style?.fg?.token, 'chart.positive');
  assert.equal(barCell?.source?.partKind, 'bar');
  assert.equal(barCell?.style?.fg?.token, 'chart.negative');
});

test('heatmap cell width is measured in terminal cells under wide profiles', () => {
  const widthProfile = { emoji: 'wide', ambiguous: 'wide' };
  const frame = renderElementFrame(heatmap({
    id: 'wide-heatmap',
    rows: [[{ id: 'hot', value: 1 }]],
    cellWidth: 3,
    min: 0,
    max: 1
  }), { columns: 3, rows: 1 }, { widthProfile });

  assert.equal(renderFramePlain(frame), '█');
  assert.equal(frame.cells.at(-1)?.column, 3);
  assert.equal(frame.cells.at(-1)?.text, ' ');
});

test('selected heatmap cells and fixed-grid chart glyphs remain one cell under ambiguous-wide profiles', () => {
  const widthProfile = { emoji: 'wide', ambiguous: 'wide' };
  const heatmapFrame = renderElementFrame(heatmap({
    id: 'selected-wide-heatmap',
    rows: [[{ id: 'first', value: 1 }, { id: 'second', value: 0 }]],
    selected: { row: 0, column: 0 },
    cellWidth: 1,
    gap: 0,
    min: 0,
    max: 1
  }), { columns: 2, rows: 1 }, { widthProfile });
  const chartFrame = renderElementFrame(chart({
    id: 'wide-grid-chart',
    selected: { series: 'load', point: 1 },
    series: [{ id: 'load', kind: 'area', points: [1, 2] }]
  }), { columns: 2, rows: 2 }, { widthProfile });

  assert.equal(heatmapFrame.cells.find((cell) => cell.source?.label === 'cell.0.0.selected')?.text, '*');
  assert.ok(heatmapFrame.cells.some((cell) => cell.column === 2));
  assert.ok(chartFrame.cells.every((cell) => cell.width === 1));
  assert.equal(chartFrame.cells.find((cell) => cell.source?.partKind === 'selected')?.text, '*');
});

test('chart valueScale styles area series values without local renderer code', () => {
  const frame = renderElementFrame(chart({
    id: 'scaled-area',
    min: 0,
    max: 100,
    series: [{ id: 'load', points: [10, 60, 95], kind: 'area' }],
    valueScale: [
      { at: 0, token: 'scale.low' },
      { at: 0.5, token: 'scale.high' },
      { at: 0.9, token: 'scale.critical' }
    ]
  }), { columns: 8, rows: 5 });

  assert.equal(frame.cells.some((cell) => cell.source?.label === 'series.load.area' && cell.style?.fg?.token === 'scale.low'), true);
  assert.equal(frame.cells.some((cell) => cell.source?.label === 'series.load.area' && cell.style?.fg?.token === 'scale.high'), true);
  assert.equal(frame.cells.some((cell) => cell.source?.label === 'series.load.area' && cell.style?.fg?.token === 'scale.critical'), true);
});

test('chart renders scatter points legends axis labels and selectable point hit targets', () => {
  const frame = renderElementFrame(chart({
    id: 'scatter-chart',
    legend: true,
    xLabel: 'watch cycle',
    yLabel: 'signal',
    selected: { series: 'scatter', point: 2 },
    series: [
      { id: 'line', label: 'Line', points: [1, 3, 2, 4], kind: 'line', glyph: '+' },
      { id: 'scatter', label: 'Scatter', points: [4, 1, 3, 2], kind: 'scatter', glyph: 'o' }
    ],
    keys: { enter: () => ({ kind: 'chart-enter' }) },
    onAction: (action) => ({ kind: 'chart', action })
  }), { columns: 32, rows: 7 });

  const output = renderFramePlain(frame);
  assert.match(output, /\+ Line  o Scatter/u);
  assert.match(output, /signal/u);
  assert.match(output, /watch cycle/u);
  assert.match(output, /◆/u);
  assert.equal(frame.hitTargets.some((target) => target.id === 'scatter-chart:scatter:2'), true);
  assert.equal(frame.accessibility.root.children?.some((child) =>
    child.label === 'Scatter' && /Selected point 3 of 4/u.test(child.description ?? '')
  ), true);
  assert.equal(frame.cells.find((cell) => cell.text === '◆')?.source?.label, 'selection.scatter.2');
  assert.equal(frame.cells.find((cell) => cell.text === '+')?.source?.label, 'legend.line.glyph');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'legend.line.glyph')?.style?.fg?.token, 'chart.series.1');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'legend.scatter.glyph')?.style?.fg?.token, 'chart.series.2');
  assert.equal(frame.cells.find((cell) => cell.text === 's')?.source?.label, 'axis.y.label');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'axis.y.label')?.style?.fg?.token, 'chart.axis');
  assert.equal(frame.cells.find((cell) => cell.text === 'w')?.source?.label, 'axis.x.label');
});

test('chart renders error state without anonymous text cells', () => {
  const frame = renderElementFrame(chart({
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
  const layout = layoutElement(column([
    row([
      surface(column([
        progressBar({ id: 'progress', mode: { kind: 'determinate', value: 48, max: 100 } }),
        chart({ id: 'chart', series: [{ id: 'live', points: [2, 4, 3, 5, 6, 8] }] })
      ]), { id: 'motion', title: 'Motion', border: { kind: 'single' } })
    ])
  ]), { columns: 84, rows: 18 });
  const chartNode = findLayoutNode(layout, 'chart');

  assert.ok(chartNode !== undefined);
  assert.equal(chartNode.bounds.width <= 84, true);
  assert.equal(chartNode.bounds.height <= 18, true);
});

test('meter renders a labeled bounded meter with progress accessibility', () => {
  const frame = renderElementFrame(meter({
    id: 'meter',
    label: 'Throughput',
    value: 75,
    max: 100,
    width: 10,
    status: 'success'
  }), { columns: 32, rows: 1 });

  const output = renderFramePlain(frame);
  assert.match(output, /Throughput/u);
  assert.match(output, /75%/u);
  assert.equal(frame.accessibility.root.role, 'meter');
  assert.equal(frame.accessibility.root.value, 75);
  assert.deepEqual(frame.accessibility.root.numericValue, {
    current: 75,
    minimum: 0,
    maximum: 100
  });
  assert.equal(frame.cells.find((cell) => cell.text === 'T')?.source?.ownerKind, 'meter');
  assert.equal(frame.cells.find((cell) => cell.text === 'T')?.source?.label, 'metric.label');
  assert.equal(frame.cells.find((cell) => cell.text === '7')?.source?.label, 'metric.value');
  assert.equal(frame.cells.find((cell) => cell.text === 's')?.source?.label, 'status.value');
});

test('meter width is a terminal-cell budget under wide profiles', () => {
  const widthProfile = { emoji: 'wide', ambiguous: 'wide' };
  const frame = renderElementFrame(meter({
    id: 'wide-meter',
    value: 100,
    width: 4
  }), { columns: 12, rows: 1 }, { widthProfile });

  assert.equal(renderFramePlain(frame), '[██] 100%');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'metric.value')?.column, 8);
});

test('meter dial variant renders distinct tested dial anatomy', () => {
  const frame = renderElementFrame(meter({
    id: 'dial-meter',
    label: 'CPU',
    value: 73,
    max: 100,
    width: 8,
    variant: 'dial',
    status: 'warning'
  }), { columns: 16, rows: 4 });
  const output = renderFramePlain(frame);

  assert.match(output, /CPU/u);
  assert.match(output, /73%/u);
  assert.match(output, /▲/u);
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'dial.needle')?.style?.fg?.token, 'status.warning');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'dial.value')?.source?.partKind, 'metric');
});

test('heatmap intensity uses muted normal and emphasized visual levels', () => {
  const frame = renderElementFrame(heatmap({
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

test('heatmap valueScale can override intensity color while preserving glyph intensity', () => {
  const frame = renderElementFrame(heatmap({
    id: 'scaled-heatmap',
    rows: [[{ id: 'cool', value: 1 }, { id: 'hot', value: 9 }]],
    min: 0,
    max: 10,
    valueScale: [
      { at: 0, token: 'scale.low' },
      { at: 0.8, token: 'scale.critical' }
    ]
  }), { columns: 8, rows: 1 });

  assert.equal(frame.cells.find((cell) => cell.source?.label === 'cell.0.0.value')?.style?.fg?.token, 'scale.low');
  assert.equal(frame.cells.find((cell) => cell.source?.label === 'cell.0.1.value')?.style?.fg?.token, 'scale.critical');
});

test('heatmap renders selectable cells with accessibility and hit targets', () => {
  const frame = renderElementFrame(heatmap({
    id: 'heatmap',
    rows: [
      [{ id: 'a', label: 'Alpha', value: 1 }, { id: 'b', label: 'Bravo', value: 5 }],
      [{ id: 'c', label: 'Charlie', value: 3 }]
    ],
    min: 0,
    max: 5,
    selected: { row: 0, column: 1 },
    keys: { enter: () => ({ kind: 'select-current' }) },
    onAction: (action) => ({ kind: 'heatmap', action })
  }), { columns: 12, rows: 3 });

  const output = renderFramePlain(frame);
  assert.match(output, /\[█\]/u);
  assert.equal(frame.accessibility.root.role, 'grid');
  assert.equal(frame.accessibility.root.children?.some((row) =>
    row.children?.some((child) => child.label === 'Bravo' && child.selected === true)
  ), true);
  assert.deepEqual(frame.accessibility.root.children?.[0]?.position, {
    rowNumber: 1,
    rowCount: 2,
    columnCount: 2
  });
  assert.deepEqual(frame.accessibility.root.children?.[0]?.children?.[1]?.position, {
    rowNumber: 1,
    rowCount: 2,
    columnNumber: 2,
    columnCount: 2
  });
  assert.equal(frame.hitTargets.some((target) => target.id === 'heatmap:0:1' && target.cursor === 'pointer'), true);
  assert.equal(frame.cells.find((cell) => cell.text === '[')?.source?.ownerKind, 'heatmap');
  assert.equal(frame.cells.find((cell) => cell.text === '[')?.source?.label, 'cell.0.1.selected.open');
  assert.equal(frame.cells.find((cell) => cell.text === '█')?.source?.label, 'cell.0.1.value');
  assert.equal(frame.cells.find((cell) => cell.text === ']')?.source?.label, 'cell.0.1.selected.close');
});

test('heatmap renders empty state through chart state contract', () => {
  const frame = renderElementFrame(heatmap({
    id: 'empty-heatmap',
    rows: [],
    emptyText: 'No heatmap data'
  }), { columns: 24, rows: 1 });

  assert.match(renderFramePlain(frame), /No heatmap data/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.ownerKind, 'heatmap');
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.label, 'state.empty.message');
});

test('chart widgets preserve visualization meaning in high contrast and no color themes', () => {
  const highContrast = renderElementFrame(chart({
    id: 'contrast-chart',
    legend: true,
    selected: { series: 'alpha', point: 1 },
    series: [{ id: 'alpha', label: 'Alpha', points: [1, 3, 2], glyph: '+' }]
  }), { columns: 18, rows: 5 }, { theme: highContrastTheme });
  const noColor = renderElementFrame(heatmap({
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

test('Canvas2D chart helpers draw axes line area series and bars', () => {
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
  drawAreaSeries(canvas, [{ x: 7, y: 2 }], {
    baseline: 3,
    span: {
      text: 'a',
      source: { ownerKind: 'custom-area', role: 'chart', label: 'area.fill' }
    }
  });
  drawAreaSeries(canvas, [{ x: 4, y: 2 }], { baseline: 3 });
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
  assert.equal(frame.cells.find((cell) => cell.text === 'a')?.source?.label, 'area.fill');
  assert.equal(frame.cells.find((cell) => cell.column === 5 && cell.text === '█')?.source?.ownerKind, 'canvas2d');
  assert.equal(frame.cells.find((cell) => cell.column === 5 && cell.text === '█')?.source?.label, 'area.fill');
  assert.ok(frame.cells.some((cell) => cell.text === '█' && cell.source?.label === 'bar.fill'));
});

test('Canvas2D chart helpers preserve fixed-cell geometry under ambiguous-wide profiles', () => {
  const buffer = createFrameBuffer(6, 3, {
    widthProfile: { emoji: 'wide', ambiguous: 'wide' }
  });
  const canvas = createCanvas2D(buffer, { row: 1, column: 1, width: 6, height: 3 });

  drawAxes(canvas, { xTicks: [2], yTicks: [1] });
  drawLineSeries(canvas, [{ x: 1, y: 1 }, { x: 3, y: 0 }]);
  drawAreaSeries(canvas, [{ x: 4, y: 1 }], { baseline: 2 });
  drawBarSeries(canvas, [{ x: 5, value: 2 }]);

  const frame = buffer.snapshot();
  assert.ok(frame.cells.length > 0);
  assert.ok(frame.cells.every((cell) => cell.width === 1));
  assert.ok(frame.cells.every((cell) => cell.continuation !== true));
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
