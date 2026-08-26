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
  barChart as createBarChart,
  chart as createChart,
  meter as createMeter,
  heatmap as createHeatmap,
  progressBar,
  sparkline as createSparkline
} from '../../dist/components/index.js';
import {
  row,
  column,
  surface
} from '../../dist/layout/index.js';

function sparkline(options) {
  return createSparkline({ label: options.id ?? 'Sparkline', ...options });
}

function barChart(options) {
  return createBarChart({ label: options.id ?? 'Bar chart', ...options });
}

function chart(options) {
  return createChart({ label: options.id ?? 'Chart', ...options });
}

function meter(options) {
  return createMeter({ label: options.id ?? 'Meter', ...options });
}

function heatmap(options) {
  return createHeatmap({ label: options.id ?? 'Heatmap', ...options });
}

function chartSeries(id, values, options = {}) {
  const label = options.label ?? id;
  return {
    id,
    label,
    points: values.map((value, index) => ({
      id: `${id}:${String(index)}`,
      label: `${label} ${String(index + 1)}`,
      value
    })),
    ...options
  };
}

function heatmapCell(id, value, label = id) {
  return { id, label, value };
}

function hasCauseMessage(pattern) {
  return (error) => error instanceof Error
    && error.cause instanceof Error
    && pattern.test(error.cause.message);
}

test('sparkline component renders bounded numeric points', () => {
  const frame = renderElementFrame(sparkline({
    id: 'spark',
    values: [0, 1, 2, 3]
  }), { columns: 8, rows: 1 });

  assert.equal(renderFramePlain(frame), '▁▃▆█');
  assert.equal(frame.accessibility.root.description, '4 sparkline points.');
  assert.equal(frame.cells.find((cell) => cell.text === '▁')?.source?.elementKind, 'terminal-ui/components/sparkline');
  assert.equal(frame.cells.find((cell) => cell.text === '▁')?.source?.description, 'point.0');
  assert.equal(frame.cells.find((cell) => cell.text === '▁')?.source?.cellRole, 'chart');
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
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'point.0')?.style?.fg?.token, 'scale.low');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'point.1')?.style?.fg?.token, 'scale.high');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'point.2')?.style?.fg?.token, 'scale.critical');
});

test('sparkline renders an empty state with chart source metadata', () => {
  const frame = renderElementFrame(sparkline({
    id: 'empty-spark',
    values: [],
    emptyText: 'No signal'
  }), { columns: 20, rows: 1 });

  assert.match(renderFramePlain(frame), /No signal/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.elementKind, 'terminal-ui/components/sparkline');
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.description, 'state.empty.message');
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.cellRole, 'text');
});

test('barChart windows visible bars and exposes selected accessibility', () => {
  const frame = renderElementFrame(barChart({
    id: 'bars',
    state: { activeId: 'c', selection: { mode: 'single', selectedId: 'c' } },
    onTransition: (transition) => transition,
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
  assert.equal(frame.cells.find((cell) => cell.text === 'C')?.source?.elementKind, 'terminal-ui/components/bar-chart');
  assert.equal(frame.cells.find((cell) => cell.text === 'C')?.source?.description, 'bar.c.label');
  assert.equal(frame.cells.find((cell) => cell.text === '█')?.source?.description, 'bar.b.fill');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'bar.b.fill')?.style?.fg?.token, 'chart.series.2');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'bar.c.fill')?.style?.bg?.token, 'selection.background');
  assert.equal(frame.cells.find((cell) => cell.text === '1')?.source?.description, 'bar.c.value');
});

test('barChart owns retained item data at construction', () => {
  const items = [{ id: 'a', label: 'Original', value: 1 }];
  const element = barChart({ id: 'owned-bars', items });

  items[0].label = 'Changed';
  items.push({ id: 'b', label: 'Added', value: 2 });

  const output = renderFramePlain(renderElementFrame(element, { columns: 24, rows: 2 }));
  assert.match(output, /Original/u);
  assert.doesNotMatch(output, /Changed|Added/u);
});

test('visualizations own retained multiple-selection state at construction', () => {
  const selectedIds = ['a'];
  const visualizationState = { selection: { mode: 'multiple', selectedIds, anchorId: 'a' } };
  const elements = [
    barChart({
      id: 'owned-bar-selection',
      items: [
        { id: 'a', label: 'A', value: 1 },
        { id: 'b', label: 'B', value: 2 }
      ],
      state: visualizationState,
      onTransition: (transition) => transition
    }),
    chart({
      id: 'owned-chart-selection',
      series: [{
        id: 'series',
        label: 'Series',
        points: [
          { id: 'a', label: 'A', value: 1 },
          { id: 'b', label: 'B', value: 2 }
        ]
      }],
      state: visualizationState,
      onTransition: (transition) => transition
    }),
    heatmap({
      id: 'owned-heatmap-selection',
      rows: [[
        { id: 'a', label: 'A', value: 1 },
        { id: 'b', label: 'B', value: 2 }
      ]],
      state: visualizationState,
      onTransition: (transition) => transition
    })
  ];

  selectedIds.splice(0, selectedIds.length, 'b');

  const [barFrame, chartFrame, heatmapFrame] = elements.map((element) =>
    renderElementFrame(element, { columns: 24, rows: 3 })
  );
  assert.deepEqual(barFrame.accessibility.root.children?.map((item) => item.selected), [true, false]);
  assert.deepEqual(
    chartFrame.accessibility.root.children?.[0]?.children?.map((item) => item.selected),
    [true, false]
  );
  assert.deepEqual(
    heatmapFrame.accessibility.root.children?.[0]?.children?.map((item) => item.selected),
    [true, false]
  );
});

test('barChart budgets labels and fills in terminal cells under wide profiles', () => {
  const widthProfile = { emoji: 'wide', ambiguous: 'wide' };
  const frame = renderElementFrame(barChart({
    id: 'wide-bars',
    items: [{ id: 'dots', label: '··', value: 10 }]
  }), { columns: 16, rows: 1 }, { widthProfile });
  const valueCells = frame.cells.filter((cell) => cell.source?.description === 'bar.dots.value');

  assert.equal(renderFramePlain(frame), '  ·· ███ 10');
  assert.deepEqual(valueCells.map((cell) => cell.column), [15, 16]);
});

test('barChart renders its loading data state', () => {
  const frame = renderElementFrame(barChart({
    id: 'loading-bars',
    dataStatus: 'loading',
    loadingText: 'Loading bars',
    items: []
  }), { columns: 24, rows: 1 });

  assert.match(renderFramePlain(frame), /Loading bars/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'L')?.source?.elementKind, 'terminal-ui/components/bar-chart');
  assert.equal(frame.cells.find((cell) => cell.text === 'L')?.source?.description, 'state.loading.message');
});

test('chart and meter reject values outside their component-specific state contracts', () => {
  assert.throws(
    () => chart({ id: 'invalid-chart', series: [], dataStatus: 'success' }),
    hasCauseMessage(/chart dataStatus must be one of loading, error/u)
  );
  assert.throws(
    () => meter({ id: 'invalid-meter', value: 10, status: 'running' }),
    hasCauseMessage(/meter status must be success, warning, or error/u)
  );
});

test('visualization factories reject malformed semantic data before rendering', () => {
  assert.throws(
    () => sparkline({ label: 'Trend', values: [1, Number.NaN] }),
    hasCauseMessage(/sparkline values item must be finite/u)
  );
  assert.throws(
    () => barChart({
      id: 'invalid-bars',
      label: 'Bars',
      items: [{ id: 'one', label: '', value: 1 }]
    }),
    hasCauseMessage(/label must be a non-empty string/u)
  );
  assert.throws(
    () => chart({
      id: 'invalid-chart',
      label: 'Chart',
      series: [{
        id: 'series',
        label: 'Series',
        points: [{ id: 'point', label: 'Point', value: Number.POSITIVE_INFINITY }]
      }]
    }),
    hasCauseMessage(/point value must be finite/u)
  );
  assert.throws(
    () => heatmap({
      id: 'invalid-heatmap',
      label: 'Heatmap',
      rows: [[{ id: 'cell', label: 'Cell', value: Number.NaN }]]
    }),
    hasCauseMessage(/cell value must be finite/u)
  );
  assert.throws(
    () => meter({ label: 'Load', value: Number.NaN }),
    hasCauseMessage(/meter value must be finite/u)
  );
  assert.throws(
    () => sparkline({
      label: 'Scaled trend',
      values: [1],
      valueScale: [{ at: 0.5, token: 'invalid-token' }]
    }),
    hasCauseMessage(/valid theme color tokens/u)
  );
});

test('chart plots series into a bounded text canvas', () => {
  const frame = renderElementFrame(chart({
    id: 'chart',
    series: [chartSeries('one', [0, 2, 1, 3])]
  }), { columns: 4, rows: 4 });

  assert.match(renderFramePlain(frame), /\*/u);
  assert.equal(frame.accessibility.root.description, '1 chart series.');
  assert.ok(frame.cells.length <= 16);
  assert.equal(frame.cells.find((cell) => cell.text === '*')?.source?.elementKind, 'terminal-ui/components/chart');
});

test('chart fit sample mode fills the available plot width', () => {
  const frame = renderElementFrame(chart({
    id: 'fit-chart',
    min: 0,
    max: 100,
    sampleMode: 'fit',
    series: [chartSeries('load', [0, 35, 70, 100], { kind: 'area' })]
  }), { columns: 12, rows: 4 });
  const areaColumns = frame.cells
    .filter((cell) => cell.source?.description === 'series.load.area')
    .map((cell) => cell.column);

  assert.equal(Math.min(...areaColumns), 1);
  assert.equal(Math.max(...areaColumns), 12);
});

test('chart fit sample mode selects raw points by scaled source position', () => {
  const firstFrame = renderElementFrame(chart({
    id: 'fit-selected-first',
    min: 0,
    max: 10,
    state: { activeId: 'load:0', selection: { mode: 'single', selectedId: 'load:0' } },
    onTransition: (transition) => transition,
    sampleMode: 'fit',
    series: [chartSeries('load', [0, 10], { kind: 'scatter' })]
  }), { columns: 10, rows: 3 });
  const lastFrame = renderElementFrame(chart({
    id: 'fit-selected-last',
    min: 0,
    max: 10,
    state: { activeId: 'load:1', selection: { mode: 'single', selectedId: 'load:1' } },
    onTransition: (transition) => transition,
    sampleMode: 'fit',
    series: [chartSeries('load', [0, 10], { kind: 'scatter' })]
  }), { columns: 10, rows: 3 });
  const firstSelection = firstFrame.cells.find((cell) => cell.source?.description === 'selection.load.load:0');
  const lastSelection = lastFrame.cells.find((cell) => cell.source?.description === 'selection.load.load:1');

  assert.equal(firstSelection?.column, 1);
  assert.equal(lastSelection?.column, 10);
});

test('chart window sample mode renders a raw aligned window', () => {
  const frame = renderElementFrame(chart({
    id: 'window-chart',
    min: 0,
    max: 50,
    series: [chartSeries('load', [10, 20, 30, 40, 50], {
      kind: 'scatter',
      sampleMode: 'window',
      sampleAlign: 'end'
    })],
    state: { selection: { mode: 'none' } },
    onTransition: (action) => ({ kind: 'chart', action })
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
    series: [chartSeries('net', [-4, -2, 0, 2, 4], { glyph: '*' })]
  }), { columns: 12, rows: 5 });
  const baselineCell = frame.cells.find((cell) => cell.source?.description === 'baseline.zero');
  const positiveCell = frame.cells.find((cell) => cell.source?.description === 'series.net.positive.line');
  const negativeCell = frame.cells.find((cell) => cell.source?.description === 'series.net.negative.line');

  assert.match(renderFramePlain(frame), /─/u);
  assert.equal(baselineCell?.source?.partType, 'baseline');
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
      chartSeries('cpu', [0, 2, 4], { kind: 'area' }),
      chartSeries('net', [0, -2, -4], { kind: 'bar' })
    ]
  }), { columns: 8, rows: 5 });
  const areaCell = frame.cells.find((cell) => cell.source?.description === 'series.cpu.positive.area');
  const barCell = frame.cells.find((cell) => cell.source?.description === 'series.net.negative.bar');

  assert.match(renderFramePlain(frame), /█/u);
  assert.equal(areaCell?.source?.partType, 'area');
  assert.equal(areaCell?.style?.fg?.token, 'chart.positive');
  assert.equal(barCell?.source?.partType, 'bar');
  assert.equal(barCell?.style?.fg?.token, 'chart.negative');
});

test('heatmap cell width is measured in terminal cells under wide profiles', () => {
  const widthProfile = { emoji: 'wide', ambiguous: 'wide' };
  const frame = renderElementFrame(heatmap({
    id: 'wide-heatmap',
    rows: [[heatmapCell('hot', 1)]],
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
    rows: [[heatmapCell('first', 1), heatmapCell('second', 0)]],
    state: { activeId: 'first', selection: { mode: 'single', selectedId: 'first' } },
    onTransition: (transition) => transition,
    cellWidth: 1,
    gap: 0,
    min: 0,
    max: 1
  }), { columns: 2, rows: 1 }, { widthProfile });
  const chartFrame = renderElementFrame(chart({
    id: 'wide-grid-chart',
    state: { activeId: 'load:1', selection: { mode: 'single', selectedId: 'load:1' } },
    onTransition: (transition) => transition,
    series: [chartSeries('load', [1, 2], { kind: 'area' })]
  }), { columns: 2, rows: 2 }, { widthProfile });

  assert.equal(heatmapFrame.cells.find((cell) => cell.source?.description === 'cell.first.selected')?.text, '*');
  assert.ok(heatmapFrame.cells.some((cell) => cell.column === 2));
  assert.ok(chartFrame.cells.every((cell) => cell.width === 1));
  assert.equal(chartFrame.cells.find((cell) => cell.source?.partType === 'selected')?.text, '*');
});

test('chart valueScale styles area series values without local renderer code', () => {
  const frame = renderElementFrame(chart({
    id: 'scaled-area',
    min: 0,
    max: 100,
    series: [chartSeries('load', [10, 60, 95], { kind: 'area' })],
    valueScale: [
      { at: 0, token: 'scale.low' },
      { at: 0.5, token: 'scale.high' },
      { at: 0.9, token: 'scale.critical' }
    ]
  }), { columns: 8, rows: 5 });

  assert.equal(frame.cells.some((cell) => cell.source?.description === 'series.load.area' && cell.style?.fg?.token === 'scale.low'), true);
  assert.equal(frame.cells.some((cell) => cell.source?.description === 'series.load.area' && cell.style?.fg?.token === 'scale.high'), true);
  assert.equal(frame.cells.some((cell) => cell.source?.description === 'series.load.area' && cell.style?.fg?.token === 'scale.critical'), true);
});

test('chart renders scatter points legends axis labels and selectable point hit targets', () => {
  const frame = renderElementFrame(chart({
    id: 'scatter-chart',
    showLegend: true,
    xLabel: 'watch cycle',
    yLabel: 'signal',
    state: { activeId: 'scatter:2', selection: { mode: 'single', selectedId: 'scatter:2' } },
    series: [
      chartSeries('line', [1, 3, 2, 4], {
        label: 'Line',
        kind: 'line',
        glyph: '+'
      }),
      chartSeries('scatter', [4, 1, 3, 2], {
        label: 'Scatter',
        kind: 'scatter',
        glyph: 'o'
      })
    ],
    onTransition: (action) => ({ kind: 'chart', action })
  }), { columns: 32, rows: 7 });

  const output = renderFramePlain(frame);
  assert.match(output, /\+ Line  o Scatter/u);
  assert.match(output, /signal/u);
  assert.match(output, /watch cycle/u);
  assert.match(output, /◆/u);
  assert.equal(frame.hitTargets.some((target) => target.id === 'scatter-chart:scatter:2'), true);
  assert.equal(frame.accessibility.root.children?.some((child) =>
    child.label === 'Scatter'
    && child.children?.some((point) => point.label === 'Scatter 3' && point.selected === true)
  ), true);
  assert.equal(frame.cells.find((cell) => cell.text === '◆')?.source?.description, 'selection.scatter.scatter:2');
  assert.equal(frame.cells.find((cell) => cell.text === '+')?.source?.description, 'legend.line.glyph');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'legend.line.glyph')?.style?.fg?.token, 'chart.series.1');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'legend.scatter.glyph')?.style?.fg?.token, 'chart.series.2');
  assert.equal(frame.cells.find((cell) => cell.text === 's')?.source?.description, 'axis.y.label');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'axis.y.label')?.style?.fg?.token, 'chart.axis');
  assert.equal(frame.cells.find((cell) => cell.text === 'w')?.source?.description, 'axis.x.label');
});

test('chart renders error state without anonymous text cells', () => {
  const frame = renderElementFrame(chart({
    id: 'error-chart',
    dataStatus: 'error',
    errorText: 'Chart unavailable',
    series: [chartSeries('one', [1, 2, 3])]
  }), { columns: 24, rows: 1 });

  assert.match(renderFramePlain(frame), /Chart unavailable/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'C')?.source?.elementKind, 'terminal-ui/components/chart');
  assert.equal(frame.cells.find((cell) => cell.text === 'C')?.source?.description, 'state.error.message');
});

test('chart intrinsic measurement remains bounded inside content layout', () => {
  const layout = layoutElement(column([
    row([
      surface(column([
        progressBar({
          id: 'progress',
          label: 'Progress',
          mode: { kind: 'determinate', value: 48, max: 100 }
        }),
        chart({ id: 'chart', series: [chartSeries('live', [2, 4, 3, 5, 6, 8])] })
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
  assert.equal(frame.cells.find((cell) => cell.text === 'T')?.source?.elementKind, 'terminal-ui/components/meter');
  assert.equal(frame.cells.find((cell) => cell.text === 'T')?.source?.description, 'metric.label');
  assert.equal(frame.cells.find((cell) => cell.text === '7')?.source?.description, 'metric.value');
  assert.equal(frame.cells.find((cell) => cell.text === 's')?.source?.description, 'status.value');
});

test('meter width is a terminal-cell budget under wide profiles', () => {
  const widthProfile = { emoji: 'wide', ambiguous: 'wide' };
  const frame = renderElementFrame(meter({
    id: 'wide-meter',
    label: 'Load',
    value: 100,
    width: 4
  }), { columns: 20, rows: 1 }, { widthProfile });

  assert.equal(renderFramePlain(frame), 'Load [██] 100%');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'metric.value')?.column, 13);
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
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'dial.needle')?.style?.fg?.token, 'status.warning');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'dial.value')?.source?.partType, 'metric');
});

test('heatmap intensity uses muted normal and emphasized visual levels', () => {
  const frame = renderElementFrame(heatmap({
    id: 'intensity-heatmap',
    rows: [[
      heatmapCell('empty', 0),
      heatmapCell('mid', 2),
      heatmapCell('hot', 4)
    ]],
    min: 0,
    max: 4
  }), { columns: 12, rows: 1 });
  const empty = frame.cells.find((cell) => cell.source?.description === 'cell.empty.value');
  const mid = frame.cells.find((cell) => cell.source?.description === 'cell.mid.value');
  const hot = frame.cells.find((cell) => cell.source?.description === 'cell.hot.value');

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
    rows: [[heatmapCell('cool', 1), heatmapCell('hot', 9)]],
    min: 0,
    max: 10,
    valueScale: [
      { at: 0, token: 'scale.low' },
      { at: 0.8, token: 'scale.critical' }
    ]
  }), { columns: 8, rows: 1 });

  assert.equal(frame.cells.find((cell) => cell.source?.description === 'cell.cool.value')?.style?.fg?.token, 'scale.low');
  assert.equal(frame.cells.find((cell) => cell.source?.description === 'cell.hot.value')?.style?.fg?.token, 'scale.critical');
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
    state: { activeId: 'b', selection: { mode: 'single', selectedId: 'b' } },
    onTransition: (action) => ({ kind: 'heatmap', action })
  }), { columns: 12, rows: 3 });

  const output = renderFramePlain(frame);
  assert.match(output, /\[█\]/u);
  assert.equal(frame.accessibility.root.role, 'grid');
  assert.equal(frame.accessibility.root.children?.some((row) =>
    row.children?.some((child) => child.label === 'Bravo' && child.selected === true)
  ), true);
  assert.deepEqual(frame.accessibility.root.children?.[0]?.position, {
    rowIndex: 1,
    rowCount: 2,
    columnCount: 2
  });
  assert.deepEqual(frame.accessibility.root.children?.[0]?.children?.[1]?.position, {
    rowIndex: 1,
    rowCount: 2,
    columnIndex: 2,
    columnCount: 2
  });
  assert.equal(frame.hitTargets.some((target) => target.id === 'heatmap:b' && target.cursor === 'pointer'), true);
  assert.equal(frame.cells.find((cell) => cell.text === '[')?.source?.elementKind, 'terminal-ui/components/heatmap');
  assert.equal(frame.cells.find((cell) => cell.text === '[')?.source?.description, 'cell.b.selected.open');
  assert.equal(frame.cells.find((cell) => cell.text === '█')?.source?.description, 'cell.b.value');
  assert.equal(frame.cells.find((cell) => cell.text === ']')?.source?.description, 'cell.b.selected.close');
});

test('heatmap renders empty state through chart state contract', () => {
  const frame = renderElementFrame(heatmap({
    id: 'empty-heatmap',
    rows: [],
    emptyText: 'No heatmap data'
  }), { columns: 24, rows: 1 });

  assert.match(renderFramePlain(frame), /No heatmap data/u);
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.elementKind, 'terminal-ui/components/heatmap');
  assert.equal(frame.cells.find((cell) => cell.text === 'N')?.source?.description, 'state.empty.message');
});

test('chart components preserve visualization meaning in high contrast and no color themes', () => {
  const highContrast = renderElementFrame(chart({
    id: 'contrast-chart',
    showLegend: true,
    state: { activeId: 'alpha:1', selection: { mode: 'single', selectedId: 'alpha:1' } },
    onTransition: (transition) => transition,
    series: [chartSeries('alpha', [1, 3, 2], { label: 'Alpha', glyph: '+' })]
  }), { columns: 18, rows: 5 }, { theme: highContrastTheme });
  const noColor = renderElementFrame(heatmap({
    id: 'mono-heatmap',
    rows: [[heatmapCell('a', 1), heatmapCell('b', 4)]],
    state: { activeId: 'b', selection: { mode: 'single', selectedId: 'b' } },
    onTransition: (transition) => transition,
    min: 0,
    max: 4
  }), { columns: 10, rows: 1 }, { theme: noColorTheme });
  const noColorSeries = renderElementFrame(chart({
    id: 'mono-series-chart',
    showLegend: true,
    series: [
      chartSeries('alpha', [1, 3, 2], { label: 'Alpha' }),
      chartSeries('beta', [3, 1, 2], { label: 'Beta' })
    ]
  }), { columns: 20, rows: 6 }, { theme: noColorTheme });

  assert.match(renderFramePlain(highContrast), /Alpha/u);
  assert.equal(highContrast.cells.find((cell) => cell.source?.description === 'selection.alpha.alpha:1')?.style?.bg?.token, 'selection.background');
  assert.match(renderFramePlain(noColor), /\[█\]/u);
  assert.equal(noColor.cells.find((cell) => cell.source?.description === 'cell.b.selected.open')?.text, '[');
  assert.equal(noColor.cells.find((cell) => cell.source?.description === 'cell.b.value')?.source?.cellRole, 'chart');
  assert.match(renderFramePlain(noColorSeries), /\* Alpha/u);
  assert.match(renderFramePlain(noColorSeries), /\+ Beta/u);
});

test('Canvas2D chart helpers draw axes line area series and bars', () => {
  const buffer = createFrameBuffer(8, 4);
  const canvas = createCanvas2D(buffer, { row: 1, column: 1, width: 8, height: 4 });

  drawAxes(canvas, { xTicks: [1, 3], yTicks: [1] });
  drawLineSeries(canvas, [{ x: 0, y: 3 }, { x: 3, y: 0 }]);
  drawLineSeries(canvas, [{ x: 2, y: 3 }, { x: 2, y: 0 }], {
    span: {
      text: '+',
      source: { elementKind: 'custom-series', cellRole: 'chart', description: 'caller.series' }
    }
  });
  drawAreaSeries(canvas, [{ x: 7, y: 2 }], {
    baseline: 3,
    span: {
      text: 'a',
      source: { elementKind: 'custom-area', cellRole: 'chart', description: 'area.fill' }
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
  assert.equal(frame.cells.find((cell) => cell.text === '┼')?.source?.description, 'axis.tick');
  assert.equal(frame.cells.find((cell) => cell.text === '│')?.source?.description, 'axis.line');
  assert.equal(frame.cells.find((cell) => cell.text === '*')?.source?.description, 'series.line');
  assert.equal(frame.cells.find((cell) => cell.text === '+')?.source?.description, 'caller.series');
  assert.equal(frame.cells.find((cell) => cell.text === 'a')?.source?.description, 'area.fill');
  assert.equal(frame.cells.find((cell) => cell.column === 5 && cell.text === '█')?.source?.elementKind, 'canvas2d');
  assert.equal(frame.cells.find((cell) => cell.column === 5 && cell.text === '█')?.source?.description, 'area.fill');
  assert.ok(frame.cells.some((cell) => cell.text === '█' && cell.source?.description === 'bar.fill'));
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
