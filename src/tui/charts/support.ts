import type {
  BarChartItem,
  ChartInterpolation,
  ChartPointEvent,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeries,
  HeatmapCell
} from '../../components/options/feedback.ts';
import type { RenderNode } from '../../render-node/index.ts';
import { sanitizeTerminalText } from '../../text/index.ts';
import {
  chartAxisStyle,
  chartHeatmapStyle,
  chartLabelStyle,
  chartPlaceholderStyle,
  chartSeriesStyle,
  chartSpan
} from '../chart-visual.ts';
import { createFrameBuffer } from '../frame-buffer.ts';
import type { Rect } from '../layout.ts';
import { numberProp } from '../render-node-props.ts';
import { clipRenderSpans } from '../render-primitives.ts';
import type { RenderBlock, RenderLine, RenderSpan } from '../render-primitives.ts';
import { normalizeValueScale, valueScaleStyle } from '../value-scale.ts';
import type { NormalizedValueScaleStop } from '../value-scale.ts';

const sparkGlyphs = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'] as const;
const heatmapGlyphs = [' ', '░', '▒', '▓', '█'] as const;

export const heatmapIntensityLevelCount = heatmapGlyphs.length;

export interface ProjectedChartPoint {
  readonly point: number;
  readonly sourcePosition: number;
  readonly column: number;
  readonly value: number;
}

export function sparkGlyph(value: number, range: { readonly min: number; readonly max: number }): string {
  return sparkGlyphs[normalizedIndex(value, range, sparkGlyphs.length - 1)] ?? sparkGlyphs[0];
}

export function normalizedIndex(value: number, range: { readonly min: number; readonly max: number }, maxIndex: number): number {
  if (range.max <= range.min) return 0;
  const ratio = Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
  return Math.max(0, Math.min(maxIndex, Math.round(ratio * maxIndex)));
}

export function rangeFor(values: readonly number[], explicitMin: number | undefined, explicitMax: number | undefined): { readonly min: number; readonly max: number } {
  const min = explicitMin ?? Math.min(...values);
  const max = explicitMax ?? Math.max(...values);
  return { min, max: max <= min ? min + 1 : max };
}

export function numberArray(value: unknown): readonly number[] {
  return Array.isArray(value) ? value.filter((item): item is number => typeof item === 'number' && Number.isFinite(item)) : [];
}

export function barItems(value: unknown): readonly BarChartItem[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is BarChartItem =>
    typeof item === 'object'
    && item !== null
    && typeof (item as { readonly label?: unknown }).label === 'string'
    && typeof (item as { readonly value?: unknown }).value === 'number'
    && Number.isFinite((item as { readonly value: number }).value)
  );
}

export function chartSeries(value: unknown): readonly ChartSeries[] {
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
    ...(isChartSeriesKind(item.kind) ? { kind: item.kind } : {}),
    ...(typeof item.glyph === 'string' ? { glyph: sanitizeTerminalText(item.glyph).text } : {}),
    ...(Array.isArray(item.valueScale) ? { valueScale: normalizeValueScale(item.valueScale) } : {}),
    ...(isChartSampleMode(item.sampleMode) ? { sampleMode: item.sampleMode } : {}),
    ...(isChartSampleAlign(item.sampleAlign) ? { sampleAlign: item.sampleAlign } : {}),
    ...(isChartInterpolation(item.interpolation) ? { interpolation: item.interpolation } : {})
  }));
}

export function isChartSeriesKind(value: unknown): value is NonNullable<ChartSeries['kind']> {
  return value === 'line' || value === 'scatter' || value === 'area' || value === 'bar';
}

export function isChartSampleMode(value: unknown): value is ChartSampleMode {
  return value === 'one-per-column' || value === 'fit' || value === 'window';
}

export function isChartSampleAlign(value: unknown): value is ChartSampleAlign {
  return value === 'start' || value === 'end';
}

export function isChartInterpolation(value: unknown): value is ChartInterpolation {
  return value === 'nearest' || value === 'linear';
}

export function projectChartSeries(widget: RenderNode, item: ChartSeries, plotWidth: number): readonly ProjectedChartPoint[] {
  if (plotWidth <= 0 || item.points.length === 0) return [];
  const mode = chartSeriesSampleMode(widget, item);
  if (mode === 'fit') return fitChartSeries(widget, item, plotWidth);
  const count = Math.min(item.points.length, plotWidth);
  const align = mode === 'window' ? chartSeriesSampleAlign(widget, item) : 'start';
  const pointStart = align === 'end' ? Math.max(0, item.points.length - count) : 0;
  const columnStart = align === 'end' ? Math.max(0, plotWidth - count) : 0;
  return Array.from({ length: count }, (_, index) => {
    const point = pointStart + index;
    return {
      point,
      sourcePosition: point,
      column: columnStart + index,
      value: item.points[point] ?? 0
    };
  });
}

export function fitChartSeries(widget: RenderNode, item: ChartSeries, plotWidth: number): readonly ProjectedChartPoint[] {
  if (plotWidth <= 0 || item.points.length === 0) return [];
  if (plotWidth === 1 || item.points.length === 1) {
    const point = chartSeriesSampleAlign(widget, item) === 'end' ? item.points.length - 1 : 0;
    return [{ point, sourcePosition: point, column: 0, value: item.points[point] ?? 0 }];
  }
  const interpolation = chartSeriesInterpolation(widget, item);
  return Array.from({ length: plotWidth }, (_value, column) => {
    const position = (column / Math.max(1, plotWidth - 1)) * (item.points.length - 1);
    const point = Math.max(0, Math.min(item.points.length - 1, Math.round(position)));
    return {
      point,
      sourcePosition: position,
      column,
      value: interpolation === 'linear' ? interpolatedChartValue(item.points, position) : item.points[point] ?? 0
    };
  });
}

export function interpolatedChartValue(points: readonly number[], position: number): number {
  const leftIndex = Math.max(0, Math.min(points.length - 1, Math.floor(position)));
  const rightIndex = Math.max(0, Math.min(points.length - 1, Math.ceil(position)));
  const left = points[leftIndex] ?? 0;
  const right = points[rightIndex] ?? left;
  if (leftIndex === rightIndex) return left;
  return left + (right - left) * (position - leftIndex);
}

export function chartSeriesSampleMode(widget: RenderNode, item: ChartSeries): ChartSampleMode {
  return item.sampleMode ?? (isChartSampleMode(widget.props['sampleMode']) ? widget.props['sampleMode'] : 'one-per-column');
}

export function chartSeriesSampleAlign(widget: RenderNode, item: ChartSeries): ChartSampleAlign {
  return item.sampleAlign ?? (isChartSampleAlign(widget.props['sampleAlign']) ? widget.props['sampleAlign'] : 'start');
}

export function chartSeriesInterpolation(widget: RenderNode, item: ChartSeries): ChartInterpolation {
  return item.interpolation ?? (isChartInterpolation(widget.props['interpolation']) ? widget.props['interpolation'] : 'nearest');
}

export function chartSeriesScale(
  item: ChartSeries,
  fallback: readonly NormalizedValueScaleStop[]
): readonly NormalizedValueScaleStop[] {
  return Array.isArray(item.valueScale) && item.valueScale.length > 0
    ? normalizeValueScale(item.valueScale)
    : fallback;
}

export function chartPointStyle(
  value: number,
  range: { readonly min: number; readonly max: number },
  scale: readonly NormalizedValueScaleStop[],
  fallback: ReturnType<typeof chartSeriesStyle>
): ReturnType<typeof chartSeriesStyle> {
  return valueScaleStyle(value, range, scale, fallback);
}

export function chartLayout(widget: RenderNode, bounds: Rect): {
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

export function chartHeaderRows(widget: RenderNode): number {
  return (widget.props['legend'] === true ? 1 : 0) + (cleanLabel(widget.props['yLabel']).length > 0 ? 1 : 0);
}

export function writeChartChrome(buffer: ReturnType<typeof createFrameBuffer>, widget: RenderNode, width: number): void {
  chartHeaderBlock(widget, width).lines.forEach((line, index) => {
    buffer.write(index + 1, 1, line.spans);
  });
  const footer = chartFooterBlock(widget, width);
  if (footer.lines.length > 0) {
    buffer.write(buffer.height, 1, footer.lines[0]?.spans ?? []);
  }
}

export function chartChromeBlock(widget: RenderNode, width: number): RenderBlock {
  return { lines: [...chartHeaderBlock(widget, width).lines, ...chartFooterBlock(widget, width).lines] };
}

export function chartHeaderBlock(widget: RenderNode, width: number): RenderBlock {
  const rows: RenderLine[] = [];
  if (widget.props['legend'] === true) {
    rows.push({
      spans: clipLineSpans(chartSeries(widget.props['series']).flatMap((item, index): readonly RenderSpan[] => [
        ...(index === 0 ? [] : [chartSpan(widget, 'chart', 'separator', `legend.${item.id}.separator.beforeGlyph`, '  ', chartPlaceholderStyle(widget))]),
        chartSpan(widget, 'chart', 'legend', `legend.${item.id}.glyph`, seriesGlyph(item), chartSeriesStyle(widget, index)),
        chartSpan(widget, 'chart', 'separator', `legend.${item.id}.separator.beforeLabel`, ' ', chartPlaceholderStyle(widget)),
        chartSpan(widget, 'chart', 'legend', `legend.${item.id}.label`, item.label ?? item.id, chartLabelStyle(widget))
      ]), width)
    });
  }
  const yLabel = cleanLabel(widget.props['yLabel']);
  if (yLabel.length > 0) {
    rows.push({ spans: [chartSpan(widget, 'chart', 'axis', 'axis.y.label', yLabel.slice(0, width), chartAxisStyle(widget))] });
  }
  return { lines: rows };
}

export function chartFooterBlock(widget: RenderNode, width: number): RenderBlock {
  const xLabel = cleanLabel(widget.props['xLabel']);
  return {
    lines: xLabel.length === 0
      ? []
      : [{ spans: [chartSpan(widget, 'chart', 'axis', 'axis.x.label', xLabel.slice(0, width), chartAxisStyle(widget))] }]
  };
}

export function seriesGlyph(series: ChartSeries): string {
  const glyph = cleanLabel(series.glyph);
  if (glyph.length > 0) return glyph.slice(0, 2);
  return series.kind === 'area' || series.kind === 'bar' ? '█' : '*';
}

export function usesSignedDomain(widget: RenderNode): boolean {
  return widget.props['signedDomain'] === true;
}

export function polarityForValue(value: number): 'positive' | 'negative' {
  return value < 0 ? 'negative' : 'positive';
}

export function selectedChartPoint(
  widget: RenderNode,
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

export function chartPointPosition(
  widget: RenderNode,
  bounds: Rect,
  seriesId: string,
  point: number,
  range: { readonly min: number; readonly max: number }
): { readonly row: number; readonly column: number } | undefined {
  const series = chartSeries(widget.props['series']).find((item) => item.id === seriesId);
  if (series === undefined) return undefined;
  const value = series.points[point];
  const layout = chartLayout(widget, bounds);
  if (value === undefined || layout.plotHeight <= 0 || layout.plotWidth <= 0) return undefined;
  const projected = selectedProjectedPoint(widget, series, layout.plotWidth, point);
  if (projected === undefined) return undefined;
  return {
    row: bounds.row + layout.plotRow - 1 + yForValue(projected.value, range, layout.plotHeight),
    column: bounds.column + projected.column
  };
}

export function selectedProjectedPoint(
  widget: RenderNode,
  series: ChartSeries,
  plotWidth: number,
  point: number
): ProjectedChartPoint | undefined {
  const projected = projectChartSeries(widget, series, plotWidth);
  if (chartSeriesSampleMode(widget, series) !== 'fit') return projected.find((current) => current.point === point);
  return nearestProjectedPoint(projected, point);
}

export function nearestProjectedPoint(
  projected: readonly ProjectedChartPoint[],
  point: number
): ProjectedChartPoint | undefined {
  return projected.reduce<ProjectedChartPoint | undefined>((best, current) => {
    if (best === undefined) return current;
    return Math.abs(current.sourcePosition - point) < Math.abs(best.sourcePosition - point) ? current : best;
  }, undefined);
}

export function yForValue(value: number, range: { readonly min: number; readonly max: number }, height: number): number {
  if (height <= 1) return 0;
  if (range.max <= range.min) return height - 1;
  const ratio = Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
  return Math.max(0, Math.min(height - 1, Math.round((1 - ratio) * (height - 1))));
}

export function chartMessageFactory<TMessage>(
  widget: RenderNode<TMessage>
): ((point: ChartPointEvent) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  return typeof toMessage === 'function'
    ? (point) => (toMessage as (point: ChartPointEvent) => TMessage)(point)
    : undefined;
}

export function heatmapRows(value: unknown): readonly (readonly HeatmapCell[])[] {
  if (!Array.isArray(value)) return [];
  return value.map((row) => Array.isArray(row) ? row.filter(isHeatmapCell).map((cell) => ({
    id: sanitizeTerminalText(cell.id).text,
    ...(cell.label === undefined ? {} : { label: sanitizeTerminalText(cell.label).text }),
    value: cell.value,
    ...(cell.payload === undefined ? {} : { payload: cell.payload }),
    ...(cell.disabled === undefined ? {} : { disabled: cell.disabled })
  })) : []);
}

export function isHeatmapCell(value: unknown): value is HeatmapCell {
  return typeof value === 'object'
    && value !== null
    && typeof (value as { readonly id?: unknown }).id === 'string'
    && typeof (value as { readonly value?: unknown }).value === 'number'
    && Number.isFinite((value as { readonly value: number }).value);
}

export function heatmapCellSpans(
  widget: RenderNode,
  rowIndex: number,
  columnIndex: number,
  options: {
    readonly cellWidth: number;
    readonly value: number;
    readonly range: { readonly min: number; readonly max: number };
    readonly scale: readonly NormalizedValueScaleStop[];
    readonly intensity: number;
    readonly selected: boolean;
  }
): readonly RenderSpan[] {
  const glyph = heatmapGlyphs[options.intensity] ?? heatmapGlyphs[0];
  const id = `cell.${String(rowIndex)}.${String(columnIndex)}`;
  const cellStyle = valueScaleStyle(
    options.value,
    options.range,
    options.scale,
    chartHeatmapStyle(widget, options.intensity, options.selected)
  );
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

export function heatmapRange(
  rows: readonly (readonly HeatmapCell[])[],
  explicitMin: number | undefined,
  explicitMax: number | undefined
): { readonly min: number; readonly max: number } {
  const values = rows.flatMap((row) => row.map((cell) => cell.value));
  return values.length === 0 ? { min: 0, max: 1 } : rangeFor(values, explicitMin, explicitMax);
}

export function heatmapSelected(widget: RenderNode): { readonly row: number; readonly column: number } | undefined {
  const selected = widget.props['selected'];
  if (typeof selected !== 'object' || selected === null) return undefined;
  const row = (selected as { readonly row?: unknown }).row;
  const column = (selected as { readonly column?: unknown }).column;
  if (typeof row !== 'number' || typeof column !== 'number') return undefined;
  if (!Number.isFinite(row) || !Number.isFinite(column)) return undefined;
  return { row: Math.max(0, Math.floor(row)), column: Math.max(0, Math.floor(column)) };
}

export function heatmapCellWidth(widget: RenderNode): number {
  return boundedInteger(numberProp(widget, 'cellWidth'), 1, 8, 3);
}

export function heatmapGap(widget: RenderNode): number {
  return boundedInteger(numberProp(widget, 'gap'), 0, 4, 1);
}

export function boundedInteger(value: number | undefined, min: number, max: number, fallback: number): number {
  if (value === undefined || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(value)));
}

export function cleanLabel(value: unknown): string {
  return typeof value === 'string' ? sanitizeTerminalText(value).text : '';
}

export function heatmapMessageFactory<TMessage>(
  widget: RenderNode<TMessage>
): ((cell: HeatmapCell, row: number, column: number) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  return typeof toMessage === 'function'
    ? (cell, row, column) => (toMessage as (cell: HeatmapCell, row: number, column: number) => TMessage)(cell, row, column)
    : undefined;
}

export function frameBufferBlock(buffer: ReturnType<typeof createFrameBuffer>, width: number, height: number): RenderBlock {
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

export function clipLineSpans(spans: readonly RenderSpan[], width: number): readonly RenderSpan[] {
  return clipRenderSpans(spans, width);
}

export function trimTrailingPlainSpaces(spans: readonly RenderSpan[]): readonly RenderSpan[] {
  let end = spans.length;
  while (end > 0) {
    const current = spans[end - 1];
    if (current?.text !== ' ' || current.style !== undefined || current.link !== undefined || current.source !== undefined) break;
    end -= 1;
  }
  return spans.slice(0, end);
}
