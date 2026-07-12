import type { ChartSeries } from '../../../ui-model/options/feedback.ts';
import type { ChartAction } from '../../../ui-model/visualization.ts';
import type { RenderNodeOfKind } from '../../../render-node/index.ts';
import type { Rect } from '../../layout.ts';
import { chartLayout } from './chrome.ts';
import {
  type ProjectedChartPoint,
  chartSeries,
  chartSeriesSampleMode,
  projectChartSeries
} from './series.ts';

type ChartNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'chart'>;

export function selectedChartPoint(
  widget: ChartNode,
  series: readonly ChartSeries[]
): { readonly series: string; readonly point: number } | undefined {
  const selected = widget.props.selected;
  if (selected === undefined) return undefined;
  const item = series.find((current) => current.id === selected.series);
  if (item === undefined) return undefined;
  const point = Math.max(0, Math.floor(selected.point));
  return point < item.points.length ? { series: selected.series, point } : undefined;
}

export function chartPointPosition(
  widget: ChartNode,
  bounds: Rect,
  seriesId: string,
  point: number,
  range: { readonly min: number; readonly max: number }
): { readonly row: number; readonly column: number } | undefined {
  const series = chartSeries(widget.props.series).find((item) => item.id === seriesId);
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

export function yForValue(
  value: number,
  range: { readonly min: number; readonly max: number },
  height: number
): number {
  if (height <= 1) return 0;
  if (range.max <= range.min) return height - 1;
  const ratio = Math.max(0, Math.min(1, (value - range.min) / (range.max - range.min)));
  return Math.max(0, Math.min(height - 1, Math.round((1 - ratio) * (height - 1))));
}

export function chartMessageFactory<TMessage>(
  widget: ChartNode<TMessage>
): ((action: ChartAction) => TMessage) | undefined {
  return widget.props.toActionMessage;
}

function selectedProjectedPoint(
  widget: ChartNode,
  series: ChartSeries,
  plotWidth: number,
  point: number
): ProjectedChartPoint | undefined {
  const projected = projectChartSeries(widget, series, plotWidth);
  if (chartSeriesSampleMode(widget, series) !== 'fit') {
    return projected.find((current) => current.point === point);
  }
  return nearestProjectedPoint(projected, point);
}

function nearestProjectedPoint(
  projected: readonly ProjectedChartPoint[],
  point: number
): ProjectedChartPoint | undefined {
  return projected.reduce<ProjectedChartPoint | undefined>((best, current) => {
    if (best === undefined) return current;
    return Math.abs(current.sourcePosition - point) < Math.abs(best.sourcePosition - point)
      ? current
      : best;
  }, undefined);
}
