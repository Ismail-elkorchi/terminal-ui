import type {
  ChartInterpolation,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeries,
  ValueScaleStop
} from '../../../../ui-model/feedback.ts';
import type { RenderNodeOfKind } from '../../../model/index.ts';
import { sanitizeTerminalText } from '../../../../text/index.ts';
import { chartSeriesStyle } from '../../chart-visual.ts';
import { normalizeValueScale, valueScaleStyle } from '../../value-scale.ts';

type ChartNode = RenderNodeOfKind<unknown, 'chart'>;

export interface ProjectedChartPoint {
  readonly point: number;
  readonly pointId: string;
  readonly pointLabel: string;
  readonly sourcePosition: number;
  readonly column: number;
  readonly value: number;
}

export function chartSeries(value: unknown): readonly ChartSeries[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is ChartSeries =>
    typeof item === 'object'
    && item !== null
    && typeof (item as { readonly id?: unknown }).id === 'string'
    && typeof (item as { readonly label?: unknown }).label === 'string'
    && Array.isArray((item as { readonly points?: unknown }).points)
  ).map((item) => ({
    id: sanitizeTerminalText(item.id).text,
    label: sanitizeTerminalText(item.label).text,
    points: (item.points as readonly unknown[]).filter((point): point is {
      readonly id: string;
      readonly label: string;
      readonly value: number;
    } =>
      typeof point === 'object'
      && point !== null
      && typeof (point as { readonly id?: unknown }).id === 'string'
      && typeof (point as { readonly label?: unknown }).label === 'string'
      && typeof (point as { readonly value?: unknown }).value === 'number'
      && Number.isFinite((point as { readonly value: number }).value)
    ).map((point) => ({
      id: sanitizeTerminalText(point.id).text,
      label: sanitizeTerminalText(point.label).text,
      value: point.value
    })),
    ...(isChartSeriesKind(item.kind) ? { kind: item.kind } : {}),
    ...(typeof item.glyph === 'string' ? { glyph: sanitizeTerminalText(item.glyph).text } : {}),
    ...(Array.isArray(item.valueScale) ? { valueScale: normalizeValueScale(item.valueScale) } : {}),
    ...(isChartSampleMode(item.sampleMode) ? { sampleMode: item.sampleMode } : {}),
    ...(isChartSampleAlign(item.sampleAlign) ? { sampleAlign: item.sampleAlign } : {}),
    ...(isChartInterpolation(item.interpolation) ? { interpolation: item.interpolation } : {})
  }));
}

export function projectChartSeries(
  renderNode: ChartNode,
  item: ChartSeries,
  plotWidth: number
): readonly ProjectedChartPoint[] {
  if (plotWidth <= 0 || item.points.length === 0) return [];
  const mode = chartSeriesSampleMode(renderNode, item);
  if (mode === 'fit') return fitChartSeries(renderNode, item, plotWidth);
  const count = Math.min(item.points.length, plotWidth);
  const align = mode === 'window' ? chartSeriesSampleAlign(renderNode, item) : 'start';
  const pointStart = mode === 'window'
    ? selectedWindowStart(renderNode, item, count, align)
    : 0;
  const columnStart = align === 'end' ? Math.max(0, plotWidth - count) : 0;
  return Array.from({ length: count }, (_, index) => {
    const point = pointStart + index;
    const source = item.points[point];
    return {
      point,
      pointId: source?.id ?? '',
      pointLabel: source?.label ?? '',
      sourcePosition: point,
      column: columnStart + index,
      value: source?.value ?? 0
    };
  });
}

function selectedWindowStart(
  renderNode: ChartNode,
  item: ChartSeries,
  windowSize: number,
  align: ChartSampleAlign
): number {
  const pointCount = item.points.length;
  const selected = renderNode.props.selected;
  if (selected?.seriesId === item.id) {
    const selectedIndex = item.points.findIndex((point) => point.id === selected.pointId);
    const point = Math.max(0, selectedIndex);
    return Math.max(0, Math.min(pointCount - windowSize, point - Math.floor(windowSize / 2)));
  }
  return align === 'end' ? Math.max(0, pointCount - windowSize) : 0;
}

export function chartSeriesSampleMode(renderNode: ChartNode, item: ChartSeries): ChartSampleMode {
  return item.sampleMode ?? renderNode.props.sampleMode ?? 'one-per-column';
}

export function chartSeriesScale(
  item: ChartSeries,
  fallback: readonly ValueScaleStop[]
): readonly ValueScaleStop[] {
  return Array.isArray(item.valueScale) && item.valueScale.length > 0
    ? normalizeValueScale(item.valueScale)
    : fallback;
}

export function chartPointStyle(
  value: number,
  range: { readonly min: number; readonly max: number },
  scale: readonly ValueScaleStop[],
  fallback: ReturnType<typeof chartSeriesStyle>
): ReturnType<typeof chartSeriesStyle> {
  return valueScaleStyle(value, range, scale, fallback);
}

function fitChartSeries(
  renderNode: ChartNode,
  item: ChartSeries,
  plotWidth: number
): readonly ProjectedChartPoint[] {
  if (plotWidth <= 0 || item.points.length === 0) return [];
  if (plotWidth === 1 || item.points.length === 1) {
    const point = chartSeriesSampleAlign(renderNode, item) === 'end' ? item.points.length - 1 : 0;
    const source = item.points[point];
    return [{
      point,
      pointId: source?.id ?? '',
      pointLabel: source?.label ?? '',
      sourcePosition: point,
      column: 0,
      value: source?.value ?? 0
    }];
  }
  const interpolation = chartSeriesInterpolation(renderNode, item);
  return Array.from({ length: plotWidth }, (_value, column) => {
    const position = (column / Math.max(1, plotWidth - 1)) * (item.points.length - 1);
    const point = Math.max(0, Math.min(item.points.length - 1, Math.round(position)));
    const source = item.points[point];
    return {
      point,
      pointId: source?.id ?? '',
      pointLabel: source?.label ?? '',
      sourcePosition: position,
      column,
      value: interpolation === 'linear'
        ? interpolatedChartValue(item.points, position)
        : source?.value ?? 0
    };
  });
}

function interpolatedChartValue(
  points: ChartSeries['points'],
  position: number
): number {
  const leftIndex = Math.max(0, Math.min(points.length - 1, Math.floor(position)));
  const rightIndex = Math.max(0, Math.min(points.length - 1, Math.ceil(position)));
  const left = points[leftIndex]?.value ?? 0;
  const right = points[rightIndex]?.value ?? left;
  if (leftIndex === rightIndex) return left;
  return left + (right - left) * (position - leftIndex);
}

function chartSeriesSampleAlign(renderNode: ChartNode, item: ChartSeries): ChartSampleAlign {
  return item.sampleAlign ?? renderNode.props.sampleAlign ?? 'start';
}

function chartSeriesInterpolation(renderNode: ChartNode, item: ChartSeries): ChartInterpolation {
  return item.interpolation ?? renderNode.props.interpolation ?? 'nearest';
}

function isChartSeriesKind(value: unknown): value is NonNullable<ChartSeries['kind']> {
  return value === 'line' || value === 'scatter' || value === 'area' || value === 'bar';
}

function isChartSampleMode(value: unknown): value is ChartSampleMode {
  return value === 'one-per-column' || value === 'fit' || value === 'window';
}

function isChartSampleAlign(value: unknown): value is ChartSampleAlign {
  return value === 'start' || value === 'end';
}

function isChartInterpolation(value: unknown): value is ChartInterpolation {
  return value === 'nearest' || value === 'linear';
}
