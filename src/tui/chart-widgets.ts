import { sanitizeTerminalText } from '../text/index.ts';
import {
  chartLabelStyle,
  chartMetricStyle,
  chartPlaceholderStyle,
  chartSelectedStyle,
  chartSpan,
  chartStateBlock,
  chartStateDescription,
  chartStatus,
  chartTextFromBlock,
  chartValueStyle
} from './chart-visual.ts';
import { createCanvas2D, drawLineSeries } from './canvas2d/index.ts';
import { createFrameBuffer } from './frame-buffer.ts';
import { numberProp } from './widget-props.ts';
import { visibleWindow } from './visible-window.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { BarChartItem, ChartPointEvent, ChartSeries, HeatmapCell, Widget } from '../widgets/index.ts';
import type { LayoutNode, Rect } from './layout.ts';
import { clipRenderSpans } from './render-primitives.ts';
import type { RenderBlock, RenderLine, RenderSpan } from './render-primitives.ts';
import type { HitTarget } from './widget-renderer.ts';

const sparkGlyphs = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;
const heatmapGlyphs = [' ', '░', '▒', '▓', '█'] as const;

export function sparklineBlock(widget: Widget, theme: TerminalTheme): RenderBlock {
  const values = numberArray(widget.props['values']);
  const state = chartStateBlock(widget, 'sparkline', theme, {
    empty: values.length === 0,
    emptyText: chartStateDescription(widget, 'No sparkline data'),
    loadingText: cleanLabel(widget.props['loadingText']),
    errorText: cleanLabel(widget.props['errorText'])
  });
  if (state !== undefined) return state;
  const range = rangeFor(values, numberProp(widget, 'min'), numberProp(widget, 'max'));
  return {
    lines: [{
      spans: values.map((value, index) => chartSpan(
        widget,
        'sparkline',
        'point',
        `point.${String(index)}`,
        sparkGlyph(value, range),
        chartValueStyle(widget)
      ))
    }]
  };
}

export function sparklineText(widget: Widget, theme: TerminalTheme): string {
  return chartTextFromBlock(sparklineBlock(widget, theme));
}

export function sparklineAccessibleBase(widget: Widget, id: string): AccessibleNode {
  const values = numberArray(widget.props['values']);
  return {
    id,
    role: 'text',
    label: id,
    ...(values.length === 0 ? {} : { value: `${String(values.length)} points` }),
    description: `${String(values.length)} sparkline points.`
  };
}

export function barChartBlock(widget: Widget, node: LayoutNode, theme: TerminalTheme): RenderBlock {
  const items = barItems(widget.props['items']);
  const state = chartStateBlock(widget, 'barChart', theme, {
    empty: items.length === 0,
    emptyText: chartStateDescription(widget, 'No bars'),
    loadingText: cleanLabel(widget.props['loadingText']),
    errorText: cleanLabel(widget.props['errorText'])
  });
  if (state !== undefined) return state;
  const selected = numberProp(widget, 'selected') ?? -1;
  const max = Math.max(1, numberProp(widget, 'max') ?? Math.max(1, ...items.map((item) => item.value)));
  const window = visibleWindow(items.length, node.bounds.height, selected);
  return {
    lines: items.slice(window.start, window.end).map((item, offset) => {
    const index = window.start + offset;
    const currentSelected = index === selected;
    const prefix = currentSelected ? theme.tokens.symbols.pointer : theme.tokens.symbols.unselected;
    const label = sanitizeTerminalText(item.label).text;
    const available = Math.max(1, node.bounds.width - label.length - String(item.value).length - 5);
    const filled = Math.max(0, Math.min(available, Math.round((item.value / max) * available)));
      const selectionStyle = currentSelected ? chartSelectedStyle(widget) : undefined;
      return {
        spans: [
          chartSpan(widget, 'barChart', 'marker', `bar.${String(index)}.marker`, prefix, selectionStyle ?? chartPlaceholderStyle(widget)),
          chartSpan(widget, 'barChart', 'separator', `bar.${String(index)}.separator.beforeLabel`, ' ', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'barChart', 'label', `bar.${String(index)}.label`, label, selectionStyle ?? chartLabelStyle(widget)),
          chartSpan(widget, 'barChart', 'separator', `bar.${String(index)}.separator.beforeFill`, ' ', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'barChart', 'bar', `bar.${String(index)}.fill`, theme.tokens.symbols.progressFilled.repeat(filled), chartMetricStyle(widget)),
          chartSpan(widget, 'barChart', 'separator', `bar.${String(index)}.separator.beforeValue`, ' ', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'barChart', 'metric', `bar.${String(index)}.value`, String(item.value), selectionStyle ?? chartValueStyle(widget))
        ]
      };
    })
  };
}

export function barChartText(widget: Widget, node: LayoutNode, theme: TerminalTheme): string {
  return chartTextFromBlock(barChartBlock(widget, node, theme));
}

export function barChartAccessibleBase(widget: Widget, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const items = barItems(widget.props['items']);
  const selected = numberProp(widget, 'selected') ?? 0;
  const window = visibleWindow(items.length, node.bounds.height, selected);
  return {
    id,
    role: 'listbox',
    label: id,
    description: `${String(items.length)} bars. Showing ${String(window.start + 1)}-${String(window.end)}.`,
    ...(focused ? { focused } : {})
  };
}

export function barChartAccessibleChildren(widget: Widget, node: LayoutNode): readonly AccessibleNode[] {
  const items = barItems(widget.props['items']);
  const selected = numberProp(widget, 'selected') ?? -1;
  const window = visibleWindow(items.length, node.bounds.height, selected);
  return items.slice(window.start, window.end).map((item, offset) => {
    const index = window.start + offset;
    return {
      id: `${widget.id ?? 'bar-chart'}:${String(index)}`,
      role: 'option',
      label: sanitizeTerminalText(item.label).text,
      value: item.value,
      selected: index === selected
    };
  });
}

export function chartBlock(widget: Widget, node: LayoutNode, theme: TerminalTheme): RenderBlock {
  const series = chartSeries(widget.props['series']);
  const points = series.flatMap((item) => item.points);
  const state = chartStateBlock(widget, 'chart', theme, {
    empty: points.length === 0,
    emptyText: chartStateDescription(widget, 'No chart data'),
    loadingText: cleanLabel(widget.props['loadingText']),
    errorText: cleanLabel(widget.props['errorText'])
  });
  if (state !== undefined) return state;
  if (node.bounds.height <= 0 || node.bounds.width <= 0) return { lines: [] };
  const layout = chartLayout(widget, node.bounds);
  if (layout.plotHeight <= 0 || layout.plotWidth <= 0) return chartChromeBlock(widget, node.bounds.width);
  const range = rangeFor(points, numberProp(widget, 'min'), numberProp(widget, 'max'));
  const buffer = createFrameBuffer(node.bounds.width, node.bounds.height);
  writeChartChrome(buffer, widget, node.bounds.width);
  const canvas = createCanvas2D(buffer, {
    row: layout.plotRow,
    column: 1,
    width: layout.plotWidth,
    height: layout.plotHeight
  });
  for (const item of series) {
    const visible = item.points.slice(0, layout.plotWidth);
    const glyph = seriesGlyph(item);
    if (item.kind === 'scatter') {
      visible.forEach((value, column) => {
        canvas.point(
          column,
          yForValue(value, range, layout.plotHeight),
          chartSpan(widget, 'chart', 'point', `series.${item.id}.point`, glyph, chartValueStyle(widget))
        );
      });
    } else {
      drawLineSeries(canvas, visible.map((value, column) => ({ x: column, y: value })), {
        yScale: { domain: [range.min, range.max], range: [layout.plotHeight - 1, 0] },
        span: chartSpan(widget, 'chart', 'line', `series.${item.id}.line`, glyph, chartValueStyle(widget))
      });
    }
  }
  const selected = selectedChartPoint(widget, series);
  if (selected !== undefined) {
    const position = chartPointPosition(widget, node.bounds, selected.series, selected.point, range);
    if (position !== undefined) {
      buffer.write(position.row, position.column, [
        chartSpan(widget, 'chart', 'selected', `selection.${selected.series}.${String(selected.point)}`, '◆', chartSelectedStyle(widget))
      ]);
    }
  }
  return frameBufferBlock(buffer, node.bounds.width, node.bounds.height);
}

export function chartText(widget: Widget, node: LayoutNode, theme: TerminalTheme): string {
  return chartTextFromBlock(chartBlock(widget, node, theme));
}

export function chartAccessibleBase(widget: Widget, id: string): AccessibleNode {
  const series = chartSeries(widget.props['series']);
  return {
    id,
    role: 'text',
    label: id,
    description: `${String(series.length)} chart series.`
  };
}

export function chartAccessibleChildren(widget: Widget): readonly AccessibleNode[] {
  const series = chartSeries(widget.props['series']);
  const selected = selectedChartPoint(widget, series);
  return series.map((item) => ({
    id: `${widget.id ?? 'chart'}:${item.id}`,
    role: 'text',
    label: item.label ?? item.id,
    value: `${String(item.points.length)} points`,
    selected: selected?.series === item.id
  }));
}

export function chartHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = chartMessageFactory(widget);
  if (toMessage === undefined) return [];
  const series = chartSeries(widget.props['series']);
  const points = series.flatMap((item) => item.points);
  if (points.length === 0) return [];
  const range = rangeFor(points, numberProp(widget, 'min'), numberProp(widget, 'max'));
  return series.flatMap((item) => item.points.flatMap((value, point): HitTarget<TMessage>[] => {
    const position = chartPointPosition(widget, bounds, item.id, point, range);
    if (position === undefined) return [];
    return [{
      id: `${widget.id ?? 'chart'}:${item.id}:${String(point)}`,
      bounds: { row: position.row, column: position.column, width: 1, height: 1 },
      message: () => toMessage({
        series: item.id,
        ...(item.label === undefined ? {} : { seriesLabel: item.label }),
        point,
        value
      }),
      cursor: 'pointer'
    }];
  }));
}

export function gaugeBlock(widget: Widget, theme: TerminalTheme): RenderBlock {
  const value = numberProp(widget, 'value') ?? 0;
  const min = numberProp(widget, 'min') ?? 0;
  const max = Math.max(min + 1, numberProp(widget, 'max') ?? 100);
  const width = boundedInteger(numberProp(widget, 'width'), 4, 40, 12);
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const filled = Math.round(ratio * width);
  const empty = Math.max(0, width - filled);
  const label = cleanLabel(widget.props['label']);
  const status = chartStatus(widget.props['status']);
  const valueText = `${String(Math.round(ratio * 100))}%`;
  return {
    lines: [{
      spans: [
        ...(label.length === 0 ? [] : [
          chartSpan(widget, 'gauge', 'label', 'metric.label', label, chartLabelStyle(widget)),
          chartSpan(widget, 'gauge', 'separator', 'metric.separator.afterLabel', ' ', chartPlaceholderStyle(widget))
        ]),
        chartSpan(widget, 'gauge', 'chrome', 'metric.bar.open', '[', chartPlaceholderStyle(widget)),
        chartSpan(widget, 'gauge', 'fill', 'metric.bar.filled', theme.tokens.symbols.progressFilled.repeat(filled), chartMetricStyle(widget, status)),
        chartSpan(widget, 'gauge', 'fill', 'metric.bar.empty', theme.tokens.symbols.progressEmpty.repeat(empty), chartPlaceholderStyle(widget)),
        chartSpan(widget, 'gauge', 'chrome', 'metric.bar.close', ']', chartPlaceholderStyle(widget)),
        chartSpan(widget, 'gauge', 'separator', 'metric.separator.beforeValue', ' ', chartPlaceholderStyle(widget)),
        chartSpan(widget, 'gauge', 'metric', 'metric.value', valueText, chartMetricStyle(widget, status)),
        ...(status === undefined ? [] : [
          chartSpan(widget, 'gauge', 'separator', 'status.separator', ' ', chartPlaceholderStyle(widget)),
          chartSpan(widget, 'gauge', 'status', 'status.value', status, chartMetricStyle(widget, status))
        ])
      ]
    }]
  };
}

export function gaugeText(widget: Widget, theme: TerminalTheme): string {
  return chartTextFromBlock(gaugeBlock(widget, theme));
}

export function gaugeAccessibleBase(widget: Widget, id: string): AccessibleNode {
  const value = numberProp(widget, 'value') ?? 0;
  const min = numberProp(widget, 'min') ?? 0;
  const max = Math.max(min + 1, numberProp(widget, 'max') ?? 100);
  const label = cleanLabel(widget.props['label']);
  return {
    id,
    role: 'progressbar',
    label: label.length === 0 ? id : label,
    value,
    description: `Gauge from ${String(min)} to ${String(max)}.`
  };
}

export function heatmapBlock(widget: Widget, node: LayoutNode, theme: TerminalTheme): RenderBlock {
  const rows = heatmapRows(widget.props['rows']);
  const state = chartStateBlock(widget, 'heatmap', theme, {
    empty: rows.length === 0,
    emptyText: chartStateDescription(widget, 'No heatmap data'),
    loadingText: cleanLabel(widget.props['loadingText']),
    errorText: cleanLabel(widget.props['errorText'])
  });
  if (state !== undefined) return state;
  const cellWidth = heatmapCellWidth(widget);
  const gap = heatmapGap(widget);
  const range = heatmapRange(rows, numberProp(widget, 'min'), numberProp(widget, 'max'));
  const selected = heatmapSelected(widget);
  const rowWindow = visibleWindow(rows.length, node.bounds.height, selected?.row ?? 0);
  return {
    lines: rows.slice(rowWindow.start, rowWindow.end).map((row, rowOffset): RenderLine => {
    const rowIndex = rowWindow.start + rowOffset;
      const spans = row.flatMap((cell, columnIndex): readonly RenderSpan[] => [
        ...(columnIndex === 0 ? [] : [
          chartSpan(widget, 'heatmap', 'separator', `cell.${String(rowIndex)}.${String(columnIndex)}.gap`, ' '.repeat(gap), chartPlaceholderStyle(widget))
        ]),
        ...heatmapCellSpans(widget, cell, rowIndex, columnIndex, {
          cellWidth,
          range,
          selected: selected?.row === rowIndex && selected.column === columnIndex
        })
      ]);
      return { spans: clipLineSpans(spans, Math.max(0, node.bounds.width)) };
    })
  };
}

export function heatmapText(widget: Widget, node: LayoutNode, theme: TerminalTheme): string {
  return chartTextFromBlock(heatmapBlock(widget, node, theme));
}

export function heatmapAccessibleBase(widget: Widget, node: LayoutNode, id: string, focused: boolean): AccessibleNode {
  const rows = heatmapRows(widget.props['rows']);
  const selected = heatmapSelected(widget);
  const rowWindow = visibleWindow(rows.length, node.bounds.height, selected?.row ?? 0);
  return {
    id,
    role: 'table',
    label: id,
    description: `${String(rows.length)} heatmap rows. Showing ${String(rowWindow.start + 1)}-${String(rowWindow.end)}.`,
    ...(focused ? { focused } : {})
  };
}

export function heatmapAccessibleChildren(widget: Widget, node: LayoutNode): readonly AccessibleNode[] {
  const rows = heatmapRows(widget.props['rows']);
  const selected = heatmapSelected(widget);
  const rowWindow = visibleWindow(rows.length, node.bounds.height, selected?.row ?? 0);
  return rows.slice(rowWindow.start, rowWindow.end).flatMap((row, rowOffset) => {
    const rowIndex = rowWindow.start + rowOffset;
    return row.map((cell, columnIndex) => ({
      id: `${widget.id ?? 'heatmap'}:${String(rowIndex)}:${String(columnIndex)}`,
      role: 'cell' as const,
      label: cell.label ?? cell.id,
      value: cell.value,
      selected: selected?.row === rowIndex && selected.column === columnIndex
    }));
  });
}

export function heatmapHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = heatmapMessageFactory(widget);
  if (toMessage === undefined) return [];
  const rows = heatmapRows(widget.props['rows']);
  const selected = heatmapSelected(widget);
  const rowWindow = visibleWindow(rows.length, bounds.height, selected?.row ?? 0);
  const cellWidth = heatmapCellWidth(widget);
  const gap = heatmapGap(widget);
  return rows.slice(rowWindow.start, rowWindow.end).flatMap((row, rowOffset): HitTarget<TMessage>[] => {
    const rowIndex = rowWindow.start + rowOffset;
    return row.flatMap((cell, columnIndex): HitTarget<TMessage>[] => {
      if (cell.disabled === true) return [];
      const column = bounds.column + columnIndex * (cellWidth + gap);
      if (column > bounds.column + bounds.width - 1) return [];
      return [{
        id: `${widget.id ?? 'heatmap'}:${String(rowIndex)}:${String(columnIndex)}`,
        bounds: {
          row: bounds.row + rowOffset,
          column,
          width: Math.min(cellWidth, bounds.column + bounds.width - column),
          height: 1
        },
        message: () => toMessage(cell, rowIndex, columnIndex),
        cursor: 'pointer'
      }];
    });
  });
}

function sparkGlyph(value: number, range: { readonly min: number; readonly max: number }): string {
  return sparkGlyphs[normalizedIndex(value, range, sparkGlyphs.length - 1)] ?? sparkGlyphs[0];
}

function normalizedIndex(value: number, range: { readonly min: number; readonly max: number }, maxIndex: number): number {
  if (range.max <= range.min) return 0;
  const ratio = Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
  return Math.max(0, Math.min(maxIndex, Math.round(ratio * maxIndex)));
}

function rangeFor(values: readonly number[], explicitMin: number | undefined, explicitMax: number | undefined): { readonly min: number; readonly max: number } {
  const min = explicitMin ?? Math.min(...values);
  const max = explicitMax ?? Math.max(...values);
  return { min, max: max <= min ? min + 1 : max };
}

function numberArray(value: unknown): readonly number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)) : [];
}

function barItems(value: unknown): readonly BarChartItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is BarChartItem =>
    typeof item === 'object'
    && item !== null
    && typeof (item as { readonly label?: unknown }).label === 'string'
    && typeof (item as { readonly value?: unknown }).value === 'number'
    && Number.isFinite((item as { readonly value: number }).value)
  );
}

function chartSeries(value: unknown): readonly ChartSeries[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ChartSeries =>
    typeof item === 'object'
    && item !== null
    && typeof (item as { readonly id?: unknown }).id === 'string'
    && Array.isArray((item as { readonly points?: unknown }).points)
  ).map((item) => ({
    id: sanitizeTerminalText(item.id).text,
    ...(item.label === undefined ? {} : { label: sanitizeTerminalText(item.label).text }),
    points: numberArray(item.points),
    ...(item.kind === 'scatter' ? { kind: item.kind } : {}),
    ...(typeof item.glyph === 'string' ? { glyph: sanitizeTerminalText(item.glyph).text } : {})
  }));
}

function chartLayout(widget: Widget, bounds: Rect): {
  readonly plotRow: number;
  readonly plotWidth: number;
  readonly plotHeight: number;
} {
  const headerRows = chartHeaderRows(widget);
  const footerRows = cleanLabel(widget.props['xLabel']).length > 0 ? 1 : 0;
  return {
    plotRow: 1 + headerRows,
    plotWidth: bounds.width,
    plotHeight: Math.max(0, bounds.height - headerRows - footerRows)
  };
}

function chartHeaderRows(widget: Widget): number {
  return (widget.props['legend'] === true ? 1 : 0) + (cleanLabel(widget.props['yLabel']).length > 0 ? 1 : 0);
}

function writeChartChrome(buffer: ReturnType<typeof createFrameBuffer>, widget: Widget, width: number): void {
  chartHeaderBlock(widget, width).lines.forEach((line, index) => {
    buffer.write(index + 1, 1, line.spans);
  });
  const footer = chartFooterBlock(widget, width);
  if (footer.lines.length > 0) {
    buffer.write(buffer.height, 1, footer.lines[0]?.spans ?? []);
  }
}

function chartChromeBlock(widget: Widget, width: number): RenderBlock {
  return { lines: [...chartHeaderBlock(widget, width).lines, ...chartFooterBlock(widget, width).lines] };
}

function chartHeaderBlock(widget: Widget, width: number): RenderBlock {
  const rows: RenderLine[] = [];
  if (widget.props['legend'] === true) {
    rows.push({
      spans: clipLineSpans(chartSeries(widget.props['series']).flatMap((item, index): readonly RenderSpan[] => [
        ...(index === 0 ? [] : [chartSpan(widget, 'chart', 'separator', `legend.${item.id}.separator.beforeGlyph`, '  ', chartPlaceholderStyle(widget))]),
        chartSpan(widget, 'chart', 'legend', `legend.${item.id}.glyph`, seriesGlyph(item), chartValueStyle(widget)),
        chartSpan(widget, 'chart', 'separator', `legend.${item.id}.separator.beforeLabel`, ' ', chartPlaceholderStyle(widget)),
        chartSpan(widget, 'chart', 'legend', `legend.${item.id}.label`, item.label ?? item.id, chartLabelStyle(widget))
      ]), width)
    });
  }
  const yLabel = cleanLabel(widget.props['yLabel']);
  if (yLabel.length > 0) {
    rows.push({ spans: [chartSpan(widget, 'chart', 'axis', 'axis.y.label', yLabel.slice(0, width), chartLabelStyle(widget))] });
  }
  return { lines: rows };
}

function chartFooterBlock(widget: Widget, width: number): RenderBlock {
  const xLabel = cleanLabel(widget.props['xLabel']);
  return {
    lines: xLabel.length === 0
      ? []
      : [{ spans: [chartSpan(widget, 'chart', 'axis', 'axis.x.label', xLabel.slice(0, width), chartLabelStyle(widget))] }]
  };
}

function seriesGlyph(series: ChartSeries): string {
  const glyph = cleanLabel(series.glyph);
  return glyph.length === 0 ? '*' : glyph.slice(0, 2);
}

function selectedChartPoint(
  widget: Widget,
  series: readonly ChartSeries[]
): { readonly series: string; readonly point: number } | undefined {
  const selected = widget.props['selected'];
  if (typeof selected !== 'object' || selected === null) return undefined;
  const selectedSeries = (selected as { readonly series?: unknown }).series;
  const point = (selected as { readonly point?: unknown }).point;
  if (typeof selectedSeries !== 'string' || typeof point !== 'number' || !Number.isFinite(point)) return undefined;
  const item = series.find((current) => current.id === selectedSeries);
  if (item === undefined) return undefined;
  const index = Math.max(0, Math.floor(point));
  return index < item.points.length ? { series: selectedSeries, point: index } : undefined;
}

function chartPointPosition(
  widget: Widget,
  bounds: Rect,
  seriesId: string,
  point: number,
  range: { readonly min: number; readonly max: number }
): { readonly row: number; readonly column: number } | undefined {
  const series = chartSeries(widget.props['series']).find((item) => item.id === seriesId);
  if (series === undefined) return undefined;
  const value = series.points[point];
  const layout = chartLayout(widget, bounds);
  if (value === undefined || point >= layout.plotWidth || layout.plotHeight <= 0) return undefined;
  return {
    row: bounds.row + layout.plotRow - 1 + yForValue(value, range, layout.plotHeight),
    column: bounds.column + point
  };
}

function yForValue(value: number, range: { readonly min: number; readonly max: number }, height: number): number {
  if (height <= 1) return 0;
  if (range.max <= range.min) return height - 1;
  const ratio = Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
  return Math.max(0, Math.min(height - 1, Math.round((1 - ratio) * (height - 1))));
}

function chartMessageFactory<TMessage>(
  widget: Widget<TMessage>
): ((point: ChartPointEvent) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  return typeof toMessage === 'function'
    ? (point) => (toMessage as (point: ChartPointEvent) => TMessage)(point)
    : undefined;
}

function heatmapRows(value: unknown): readonly (readonly HeatmapCell[])[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => Array.isArray(row) ? row.filter(isHeatmapCell).map((cell) => ({
    id: sanitizeTerminalText(cell.id).text,
    ...(cell.label === undefined ? {} : { label: sanitizeTerminalText(cell.label).text }),
    value: cell.value,
    ...(cell.payload === undefined ? {} : { payload: cell.payload }),
    ...(cell.disabled === undefined ? {} : { disabled: cell.disabled })
  })) : []);
}

function isHeatmapCell(value: unknown): value is HeatmapCell {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { readonly id?: unknown }).id === 'string'
    && typeof (value as { readonly value?: unknown }).value === 'number'
    && Number.isFinite((value as { readonly value: number }).value);
}

function heatmapCellSpans(
  widget: Widget,
  cell: HeatmapCell,
  rowIndex: number,
  columnIndex: number,
  options: {
    readonly cellWidth: number;
    readonly range: { readonly min: number; readonly max: number };
    readonly selected: boolean;
  }
): readonly RenderSpan[] {
  const glyph = heatmapGlyphs[normalizedIndex(cell.value, options.range, heatmapGlyphs.length - 1)] ?? heatmapGlyphs[0];
  const id = `cell.${String(rowIndex)}.${String(columnIndex)}`;
  const cellStyle = options.selected ? chartSelectedStyle(widget) : chartMetricStyle(widget);
  if (!options.selected) {
    return [chartSpan(widget, 'heatmap', 'cell', `${id}.value`, glyph.repeat(options.cellWidth), cellStyle)];
  }
  if (options.cellWidth === 1) {
    return [chartSpan(widget, 'heatmap', 'selected', `${id}.selected`, '◆', cellStyle)];
  }
  if (options.cellWidth === 2) {
    return [
      chartSpan(widget, 'heatmap', 'marker', `${id}.selected.marker`, '›', cellStyle),
      chartSpan(widget, 'heatmap', 'cell', `${id}.value`, glyph, cellStyle)
    ];
  }
  return [
    chartSpan(widget, 'heatmap', 'marker', `${id}.selected.open`, '[', cellStyle),
    chartSpan(widget, 'heatmap', 'cell', `${id}.value`, glyph.repeat(Math.max(1, options.cellWidth - 2)), cellStyle),
    chartSpan(widget, 'heatmap', 'marker', `${id}.selected.close`, ']', cellStyle)
  ];
}

function heatmapRange(
  rows: readonly (readonly HeatmapCell[])[],
  explicitMin: number | undefined,
  explicitMax: number | undefined
): { readonly min: number; readonly max: number } {
  const values = rows.flatMap((row) => row.map((cell) => cell.value));
  return values.length === 0 ? { min: 0, max: 1 } : rangeFor(values, explicitMin, explicitMax);
}

function heatmapSelected(widget: Widget): { readonly row: number; readonly column: number } | undefined {
  const selected = widget.props['selected'];
  if (typeof selected !== 'object' || selected === null) return undefined;
  const row = (selected as { readonly row?: unknown }).row;
  const column = (selected as { readonly column?: unknown }).column;
  if (typeof row !== 'number' || typeof column !== 'number') return undefined;
  if (!Number.isFinite(row) || !Number.isFinite(column)) return undefined;
  return { row: Math.max(0, Math.floor(row)), column: Math.max(0, Math.floor(column)) };
}

function heatmapCellWidth(widget: Widget): number {
  return boundedInteger(numberProp(widget, 'cellWidth'), 1, 8, 3);
}

function heatmapGap(widget: Widget): number {
  return boundedInteger(numberProp(widget, 'gap'), 0, 4, 1);
}

function boundedInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

function cleanLabel(value: unknown): string {
  return typeof value === 'string' ? sanitizeTerminalText(value).text : '';
}

function heatmapMessageFactory<TMessage>(
  widget: Widget<TMessage>
): ((cell: HeatmapCell, row: number, column: number) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  return typeof toMessage === 'function'
    ? (cell, row, column) => (toMessage as (cell: HeatmapCell, row: number, column: number) => TMessage)(cell, row, column)
    : undefined;
}

function frameBufferBlock(buffer: ReturnType<typeof createFrameBuffer>, width: number, height: number): RenderBlock {
  const rows = Array.from({ length: height }, (): RenderSpan[] =>
    Array.from({ length: width }, (): RenderSpan => ({ text: ' ' }))
  );
  for (const cell of buffer.snapshot().cells) {
    const row = rows[cell.row - 1];
    if (row === undefined || cell.column < 1 || cell.column > width) continue;
    row[cell.column - 1] = {
      text: cell.text,
      ...(cell.style === undefined ? {} : { style: cell.style }),
      ...(cell.link === undefined ? {} : { link: cell.link }),
      ...(cell.source === undefined ? {} : { source: cell.source })
    };
  }
  return {
    lines: rows.map((row) => ({ spans: trimTrailingPlainSpaces(row) }))
  };
}

function clipLineSpans(spans: readonly RenderSpan[], width: number): readonly RenderSpan[] {
  return clipRenderSpans(spans, width);
}

function trimTrailingPlainSpaces(spans: readonly RenderSpan[]): readonly RenderSpan[] {
  let end = spans.length;
  while (end > 0) {
    const current = spans[end - 1];
    if (current?.text !== ' ' || current.style !== undefined || current.link !== undefined || current.source !== undefined) break;
    end -= 1;
  }
  return spans.slice(0, end);
}
