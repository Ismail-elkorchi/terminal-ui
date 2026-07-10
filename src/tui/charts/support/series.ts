import type {
  ChartInterpolation,
  ChartSampleAlign,
  ChartSampleMode,
  ChartSeries
} from '../../../components/options/feedback.ts';
import type { RenderNodeOfKind } from '../../../render-node/index.ts';
import { sanitizeTerminalText } from '../../../text/index.ts';
import { chartSeriesStyle } from '../../chart-visual.ts';
import { normalizeValueScale, valueScaleStyle } from '../../value-scale.ts';
import type { NormalizedValueScaleStop } from '../../value-scale.ts';
import { numberArray } from './values.ts';

type ChartNode = RenderNodeOfKind<unknown, 'chart'>;

export interface ProjectedChartPoint {
  readonly point: number;
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

export function projectChartSeries(
  widget: ChartNode,
  item: ChartSeries,
  plotWidth: number
): readonly ProjectedChartPoint[] {
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

export function chartSeriesSampleMode(widget: ChartNode, item: ChartSeries): ChartSampleMode {
  return item.sampleMode ?? widget.props.sampleMode ?? 'one-per-column';
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

function fitChartSeries(
  widget: ChartNode,
  item: ChartSeries,
  plotWidth: number
): readonly ProjectedChartPoint[] {
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
      value: interpolation === 'linear'
        ? interpolatedChartValue(item.points, position)
        : item.points[point] ?? 0
    };
  });
}

function interpolatedChartValue(points: readonly number[], position: number): number {
  const leftIndex = Math.max(0, Math.min(points.length - 1, Math.floor(position)));
  const rightIndex = Math.max(0, Math.min(points.length - 1, Math.ceil(position)));
  const left = points[leftIndex] ?? 0;
  const right = points[rightIndex] ?? left;
  if (leftIndex === rightIndex) return left;
  return left + (right - left) * (position - leftIndex);
}

function chartSeriesSampleAlign(widget: ChartNode, item: ChartSeries): ChartSampleAlign {
  return item.sampleAlign ?? widget.props.sampleAlign ?? 'start';
}

function chartSeriesInterpolation(widget: ChartNode, item: ChartSeries): ChartInterpolation {
  return item.interpolation ?? widget.props.interpolation ?? 'nearest';
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
