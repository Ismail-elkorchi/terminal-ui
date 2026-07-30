import type { ChartSeries } from '../../../../ui-model/feedback.ts';
import type { ChartAction } from '../../../../ui-model/visualization.ts';
import type { RenderNodeOfKind } from '../../../model/index.ts';
import type { Rect } from '../../../contracts.ts';
import { chartLayout } from './labels.ts';
import {
  type ProjectedChartPoint,
  chartSeries,
  chartSeriesSampleMode,
  projectChartSeries
} from './series.ts';

type ChartNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'chart'>;

export function selectedChartPoint(
  renderNode: ChartNode,
  series: readonly ChartSeries[]
): { readonly series: string; readonly pointIndex: number } | undefined {
  const selected = renderNode.props.selected;
  if (selected === undefined) return undefined;
  const item = series.find((current) => current.id === selected.series);
  if (item === undefined) return undefined;
  const pointIndex = Math.max(0, Math.floor(selected.pointIndex));
  return pointIndex < item.points.length ? { series: selected.series, pointIndex } : undefined;
}

export function chartPointPosition(
  renderNode: ChartNode,
  bounds: Rect,
  seriesId: string,
  point: number,
  range: { readonly min: number; readonly max: number }
): { readonly row: number; readonly column: number } | undefined {
  const series = chartSeries(renderNode.props.series).find((item) => item.id === seriesId);
  if (series === undefined) return undefined;
  const value = series.points[point];
  const layout = chartLayout(renderNode, bounds);
  if (value === undefined || layout.plotHeight <= 0 || layout.plotWidth <= 0) return undefined;
  const projected = selectedProjectedPoint(renderNode, series, layout.plotWidth, point);
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
  renderNode: ChartNode<TMessage>
): ((action: ChartAction) => TMessage) | undefined {
  return renderNode.props.toActionMessage;
}

function selectedProjectedPoint(
  renderNode: ChartNode,
  series: ChartSeries,
  plotWidth: number,
  point: number
): ProjectedChartPoint | undefined {
  const projected = projectChartSeries(renderNode, series, plotWidth);
  if (chartSeriesSampleMode(renderNode, series) !== 'fit') {
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
