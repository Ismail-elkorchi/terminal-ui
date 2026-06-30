import { sanitizeTerminalText } from '../text/index.ts';
import { createCanvas2D, drawLineSeries } from './canvas2d/index.ts';
import { createFrameBuffer } from './frame-buffer.ts';
import { numberProp } from './widget-props.ts';
import { visibleWindow } from './visible-window.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { BarChartItem, ChartPointEvent, ChartSeries, HeatmapCell, Widget } from '../widgets/index.ts';
import type { LayoutNode, Rect } from './layout.ts';
import type { HitTarget } from './widget-renderer.ts';

const sparkGlyphs = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;
const heatmapGlyphs = [' ', '░', '▒', '▓', '█'] as const;

export function sparklineText(widget: Widget): string {
  const values = numberArray(widget.props['values']);
  if (values.length === 0) return '';
  const range = rangeFor(values, numberProp(widget, 'min'), numberProp(widget, 'max'));
  return values.map((value) => sparkGlyph(value, range)).join('');
}

export function sparklineAccessibleBase(widget: Widget, id: string): AccessibleNode {
  const values = numberArray(widget.props['values']);
  return {
    id,
    role: 'text',
    label: id,
    value: sparklineText(widget),
    description: `${String(values.length)} sparkline points.`
  };
}

export function barChartText(widget: Widget, node: LayoutNode, theme: TerminalTheme): string {
  const items = barItems(widget.props['items']);
  const selected = numberProp(widget, 'selected') ?? -1;
  const max = Math.max(1, numberProp(widget, 'max') ?? Math.max(1, ...items.map((item) => item.value)));
  const window = visibleWindow(items.length, node.bounds.height, selected);
  return items.slice(window.start, window.end).map((item, offset) => {
    const index = window.start + offset;
    const prefix = index === selected ? theme.symbols.pointer : theme.symbols.unselected;
    const label = sanitizeTerminalText(item.label).text;
    const available = Math.max(1, node.bounds.width - label.length - String(item.value).length - 5);
    const filled = Math.max(0, Math.min(available, Math.round((item.value / max) * available)));
    return `${prefix} ${label} ${theme.symbols.progressFilled.repeat(filled)} ${String(item.value)}`;
  }).join('\n');
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

export function chartText(widget: Widget, node: LayoutNode): string {
  const series = chartSeries(widget.props['series']);
  const points = series.flatMap((item) => item.points);
  if (points.length === 0 || node.bounds.height <= 0 || node.bounds.width <= 0) return '';
  const layout = chartLayout(widget, node.bounds);
  if (layout.plotHeight <= 0 || layout.plotWidth <= 0) return chartChromeText(widget, node.bounds.width);
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
        canvas.point(column, yForValue(value, range, layout.plotHeight), { text: glyph });
      });
    } else {
      drawLineSeries(canvas, visible.map((value, column) => ({ x: column, y: value })), {
        yScale: { domain: [range.min, range.max], range: [layout.plotHeight - 1, 0] },
        span: { text: glyph }
      });
    }
  }
  const selected = selectedChartPoint(widget, series);
  if (selected !== undefined) {
    const position = chartPointPosition(widget, node.bounds, selected.series, selected.point, range);
    if (position !== undefined) {
      buffer.write(position.row, position.column, [{ text: '◆' }]);
    }
  }
  return frameBufferText(buffer, node.bounds.width, node.bounds.height);
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
      message: toMessage({
        series: item.id,
        ...(item.label === undefined ? {} : { seriesLabel: item.label }),
        point,
        value
      }),
      cursor: 'pointer'
    }];
  }));
}

export function gaugeText(widget: Widget, theme: TerminalTheme): string {
  const value = numberProp(widget, 'value') ?? 0;
  const min = numberProp(widget, 'min') ?? 0;
  const max = Math.max(min + 1, numberProp(widget, 'max') ?? 100);
  const width = boundedInteger(numberProp(widget, 'width'), 4, 40, 12);
  const ratio = Math.max(0, Math.min(1, (value - min) / (max - min)));
  const filled = Math.round(ratio * width);
  const empty = Math.max(0, width - filled);
  const label = cleanLabel(widget.props['label']);
  const status = cleanLabel(widget.props['status']);
  const valueText = `${String(Math.round(ratio * 100))}%`;
  const prefix = label.length === 0 ? '' : `${label} `;
  const suffix = status.length === 0 ? valueText : `${valueText} ${status}`;
  return `${prefix}[${theme.symbols.progressFilled.repeat(filled)}${theme.symbols.progressEmpty.repeat(empty)}] ${suffix}`;
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

export function heatmapText(widget: Widget, node: LayoutNode): string {
  const rows = heatmapRows(widget.props['rows']);
  if (rows.length === 0) return '';
  const cellWidth = heatmapCellWidth(widget);
  const gap = heatmapGap(widget);
  const range = heatmapRange(rows, numberProp(widget, 'min'), numberProp(widget, 'max'));
  const selected = heatmapSelected(widget);
  const rowWindow = visibleWindow(rows.length, node.bounds.height, selected?.row ?? 0);
  return rows.slice(rowWindow.start, rowWindow.end).map((row, rowOffset) => {
    const rowIndex = rowWindow.start + rowOffset;
    const cells = row.map((cell, columnIndex) => heatmapCellText(cell, {
      cellWidth,
      range,
      selected: selected?.row === rowIndex && selected.column === columnIndex
    }));
    return cells.join(' '.repeat(gap)).slice(0, Math.max(0, node.bounds.width));
  }).join('\n');
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
        message: toMessage(cell, rowIndex, columnIndex),
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
  const rows = chartChromeRows(widget);
  rows.forEach((line, index) => {
    buffer.write(index + 1, 1, [{ text: line.slice(0, width) }]);
  });
  const xLabel = cleanLabel(widget.props['xLabel']);
  if (xLabel.length > 0) {
    buffer.write(buffer.height, 1, [{ text: xLabel.slice(0, width) }]);
  }
}

function chartChromeText(widget: Widget, width: number): string {
  const rows = chartChromeRows(widget);
  const xLabel = cleanLabel(widget.props['xLabel']);
  return [...rows, ...(xLabel.length === 0 ? [] : [xLabel])].map((line) => line.slice(0, width)).join('\n');
}

function chartChromeRows(widget: Widget): readonly string[] {
  const rows: string[] = [];
  if (widget.props['legend'] === true) {
    const labels = chartSeries(widget.props['series']).map((item) => `${seriesGlyph(item)} ${item.label ?? item.id}`);
    rows.push(labels.join('  '));
  }
  const yLabel = cleanLabel(widget.props['yLabel']);
  if (yLabel.length > 0) rows.push(yLabel);
  return rows;
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

function heatmapCellText(
  cell: HeatmapCell,
  options: {
    readonly cellWidth: number;
    readonly range: { readonly min: number; readonly max: number };
    readonly selected: boolean;
  }
): string {
  const glyph = heatmapGlyphs[normalizedIndex(cell.value, options.range, heatmapGlyphs.length - 1)] ?? heatmapGlyphs[0];
  if (!options.selected) return glyph.repeat(options.cellWidth);
  if (options.cellWidth === 1) return '◆';
  if (options.cellWidth === 2) return `›${glyph}`;
  return `[${glyph.repeat(Math.max(1, options.cellWidth - 2))}]`;
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

function frameBufferText(buffer: ReturnType<typeof createFrameBuffer>, width: number, height: number): string {
  const rows = Array.from({ length: height }, () => Array.from({ length: width }, () => ' '));
  for (const cell of buffer.snapshot().cells) {
    const row = rows[cell.row - 1];
    if (row === undefined || cell.column < 1 || cell.column > width) continue;
    row[cell.column - 1] = cell.text;
  }
  return rows.map((row) => row.join('').trimEnd()).join('\n');
}
