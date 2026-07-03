import type { RenderSpan } from '../render-primitives.ts';
import type { Canvas2D } from './canvas2d.ts';

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

export interface BarDatum {
  readonly x: number;
  readonly value: number;
}

export interface BarSeriesOptions extends SeriesOptions {
  readonly width?: number;
}

const DEFAULT_AXIS_SPAN = {
  text: '─',
  source: { kind: 'canvas2d', role: 'separator', label: 'axis.line' }
} satisfies RenderSpan;
const DEFAULT_TICK_SPAN = {
  text: '┼',
  source: { kind: 'canvas2d', role: 'chart', label: 'axis.tick' }
} satisfies RenderSpan;
const DEFAULT_SERIES_SPAN = {
  text: '*',
  source: { kind: 'canvas2d', role: 'chart', label: 'series.line' }
} satisfies RenderSpan;
const DEFAULT_BAR_SPAN = {
  text: '█',
  source: { kind: 'canvas2d', role: 'chart', label: 'bar.fill' }
} satisfies RenderSpan;

export function scaleChartValue(value: number, scale: ChartScale): number {
  const [domainStart, domainEnd] = scale.domain;
  const [rangeStart, rangeEnd] = scale.range;
  if (domainEnd === domainStart) return rangeStart;
  const ratio = (value - domainStart) / (domainEnd - domainStart);
  return rangeStart + (rangeEnd - rangeStart) * ratio;
}

export function drawAxes(canvas: Canvas2D, options: ChartAxesOptions = {}): void {
  const axisSpan = options.span ?? DEFAULT_AXIS_SPAN;
  const tickSpan = options.tickSpan ?? DEFAULT_TICK_SPAN;
  const bottom = Math.max(0, canvas.bounds.height - 1);
  const left = 0;
  canvas.line(0, bottom, Math.max(0, canvas.bounds.width - 1), bottom, axisSpan);
  canvas.line(left, 0, left, bottom, withSpanText(axisSpan, '│'));
  for (const tick of options.xTicks ?? []) canvas.point(tick, bottom, tickSpan);
  for (const tick of options.yTicks ?? []) canvas.point(left, tick, tickSpan);
}

export function drawLineSeries(
  canvas: Canvas2D,
  points: readonly ChartPoint[],
  options: SeriesOptions = {}
): void {
  const span = options.span ?? DEFAULT_SERIES_SPAN;
  const scaled = points.map((point) => ({
    x: options.xScale === undefined ? point.x : scaleChartValue(point.x, options.xScale),
    y: options.yScale === undefined ? point.y : scaleChartValue(point.y, options.yScale)
  }));
  canvas.polyline(scaled, span);
}

export function drawBarSeries(
  canvas: Canvas2D,
  bars: readonly BarDatum[],
  options: BarSeriesOptions = {}
): void {
  const span = options.span ?? DEFAULT_BAR_SPAN;
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
