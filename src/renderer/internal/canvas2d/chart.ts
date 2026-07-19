import { frameCellSource } from '../../../visual/source.ts';
import type { RenderSpan } from '../../../visual/render.ts';
import type { Canvas2D } from './canvas2d.ts';
import { oneCellGlyph } from '../../../text/index.ts';

export interface ChartScale {
  readonly domain: readonly [number, number];
  readonly range: readonly [number, number];
}

export interface ChartPoint {
  readonly x: number;
  readonly y: number;
}

export interface ChartAxesOptions {
  readonly xTicks?: readonly number[];
  readonly yTicks?: readonly number[];
  readonly labels?: boolean;
  readonly span?: RenderSpan;
  readonly tickSpan?: RenderSpan;
}

export interface SeriesOptions {
  readonly xScale?: ChartScale;
  readonly yScale?: ChartScale;
  readonly span?: RenderSpan;
}

export interface AreaSeriesOptions extends SeriesOptions {
  readonly baseline?: number;
}

export interface BarDatum {
  readonly x: number;
  readonly value: number;
}

export interface BarSeriesOptions extends SeriesOptions {
  readonly width?: number;
}

const DEFAULT_AXIS_SPAN = {
  text: '─',
  source: frameCellSource({ ownerKind: 'canvas2d', family: 'drawing', role: 'separator', part: 'axis.line', label: 'axis.line' })
} satisfies RenderSpan;
const DEFAULT_TICK_SPAN = {
  text: '┼',
  source: frameCellSource({ ownerKind: 'canvas2d', family: 'drawing', role: 'chart', part: 'axis.tick', label: 'axis.tick' })
} satisfies RenderSpan;
const DEFAULT_SERIES_SPAN = {
  text: '*',
  source: frameCellSource({ ownerKind: 'canvas2d', family: 'drawing', role: 'chart', part: 'series.line', label: 'series.line' })
} satisfies RenderSpan;
const DEFAULT_BAR_SPAN = {
  text: '█',
  source: frameCellSource({ ownerKind: 'canvas2d', family: 'drawing', role: 'chart', part: 'bar.fill', label: 'bar.fill' })
} satisfies RenderSpan;
const DEFAULT_AREA_SPAN = {
  text: '█',
  source: frameCellSource({ ownerKind: 'canvas2d', family: 'drawing', role: 'chart', part: 'area.fill', label: 'area.fill' })
} satisfies RenderSpan;

export function scaleChartValue(value: number, scale: ChartScale): number {
  const [domainStart, domainEnd] = scale.domain;
  const [rangeStart, rangeEnd] = scale.range;
  if (domainEnd === domainStart) return rangeStart;
  const ratio = (value - domainStart) / (domainEnd - domainStart);
  return rangeStart + (rangeEnd - rangeStart) * ratio;
}

export function drawAxes(canvas: Canvas2D, options: ChartAxesOptions = {}): void {
  const axisSpan = fixedCellSpan(canvas, options.span ?? DEFAULT_AXIS_SPAN, '-');
  const tickSpan = fixedCellSpan(canvas, options.tickSpan ?? DEFAULT_TICK_SPAN, '+');
  const bottom = Math.max(0, canvas.bounds.height - 1);
  const left = 0;
  canvas.line(0, bottom, Math.max(0, canvas.bounds.width - 1), bottom, axisSpan);
  canvas.line(left, 0, left, bottom, withSpanText(axisSpan, oneCellGlyph('│', '|', {
    widthProfile: canvas.widthProfile
  })));
  for (const tick of options.xTicks ?? []) canvas.point(tick, bottom, tickSpan);
  for (const tick of options.yTicks ?? []) canvas.point(left, tick, tickSpan);
}

export function drawLineSeries(
  canvas: Canvas2D,
  points: readonly ChartPoint[],
  options: SeriesOptions = {}
): void {
  const span = fixedCellSpan(canvas, options.span ?? DEFAULT_SERIES_SPAN, '*');
  const scaled = points.map((point) => ({
    x: options.xScale === undefined ? point.x : scaleChartValue(point.x, options.xScale),
    y: options.yScale === undefined ? point.y : scaleChartValue(point.y, options.yScale)
  }));
  canvas.polyline(scaled, span);
}

export function drawAreaSeries(
  canvas: Canvas2D,
  points: readonly ChartPoint[],
  options: AreaSeriesOptions = {}
): void {
  const span = fixedCellSpan(canvas, options.span ?? DEFAULT_AREA_SPAN, '#');
  const baseline = Math.round(options.baseline ?? Math.max(0, canvas.bounds.height - 1));
  for (const point of points) {
    const x = options.xScale === undefined ? point.x : scaleChartValue(point.x, options.xScale);
    const y = options.yScale === undefined ? point.y : scaleChartValue(point.y, options.yScale);
    canvas.line(Math.round(x), Math.round(y), Math.round(x), baseline, span);
  }
}

export function drawBarSeries(
  canvas: Canvas2D,
  bars: readonly BarDatum[],
  options: BarSeriesOptions = {}
): void {
  const span = fixedCellSpan(canvas, options.span ?? DEFAULT_BAR_SPAN, '#');
  const width = Math.max(1, Math.floor(options.width ?? 1));
  const bottom = Math.max(0, canvas.bounds.height - 1);
  for (const bar of bars) {
    const x = options.xScale === undefined ? bar.x : scaleChartValue(bar.x, options.xScale);
    const y = options.yScale === undefined ? bar.value : scaleChartValue(bar.value, options.yScale);
    const top = Math.min(bottom, Math.round(y));
    const height = Math.max(0, bottom - top + 1);
    canvas.rect({ row: top, column: Math.round(x), width, height }, { fill: span });
  }
}

function withSpanText(span: RenderSpan, text: string): RenderSpan {
  return {
    text,
    ...(span.style === undefined ? {} : { style: span.style }),
    ...(span.link === undefined ? {} : { link: span.link }),
    ...(span.source === undefined ? {} : { source: span.source })
  };
}

function fixedCellSpan(canvas: Canvas2D, value: RenderSpan, fallback: string): RenderSpan {
  return withSpanText(value, oneCellGlyph(value.text, fallback, { widthProfile: canvas.widthProfile }));
}
