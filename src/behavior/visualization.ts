import { collectionInteractionReducer, normalizeCollectionInteraction, prepareCollectionInteractionIndex } from '../interaction/collection.ts';
import type { CollectionInteractionAction } from '../interaction/collection.ts';
import { adjacentItemId } from '../interaction/navigation.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import type {
  BarChartItem,
  ChartSeries,
  HeatmapCell,
} from '../ui-model/feedback.ts';
import type {
  BarChartTransition,
  ChartTransition,
  HeatmapTransition,
  VisualizationPresentation,
} from '../ui-model/visualization.ts';

export interface VisualizationReducerOptions {
  readonly navigation?: NavigationPolicy;
  readonly pageSize?: number;
}

export function barChartReducer(
  state: VisualizationPresentation,
  transition: BarChartTransition,
  items: readonly BarChartItem[],
  options: VisualizationReducerOptions,
): VisualizationPresentation {
  return reduceCollection(state, transition, items.map((item) => item.id), options);
}

export function chartReducer(
  state: VisualizationPresentation,
  transition: ChartTransition,
  series: readonly ChartSeries[],
  options: VisualizationReducerOptions,
): VisualizationPresentation {
  assertGlobalPointIds(series);
  const points = series.flatMap((item) => item.points);
  const ids = points.map((point) => point.id);
  if (isCollectionTransition(transition)) return reduceCollection(state, transition, ids, options);
  const activePoint = points.find((point) => point.id === state.activeId);
  const currentSeriesIndex = Math.max(0, series.findIndex((item) =>
    item.points.some((point) => point.id === activePoint?.id)
  ));
  const currentSeries = series[currentSeriesIndex];
  if (currentSeries === undefined) return normalizeCollectionInteraction(state, prepareCollectionInteractionIndex(ids));
  const currentPointIndex = Math.max(0, currentSeries.points.findIndex((point) => point.id === activePoint?.id));
  if (transition.kind === 'moveSeries') {
    const enabledSeries = series.filter((item) => item.points.length > 0);
    const nextId = adjacentItemId(
      enabledSeries.map((item) => item.id),
      currentSeries.id,
      transition.delta,
      options.navigation,
    );
    const next = enabledSeries.find((item) => item.id === nextId);
    const point = next?.points[Math.min(currentPointIndex, Math.max(0, next.points.length - 1))];
    return setActive(state, point?.id, ids, options);
  }
  const delta = transition.kind === 'pagePoints'
    ? transition.delta * Math.max(1, Math.floor(options.pageSize ?? 1))
    : transition.delta;
  const nextId = adjacentItemId(
    currentSeries.points.map((point) => point.id),
    activePoint?.id,
    delta,
    options.navigation,
  );
  return setActive(state, nextId, ids, options);
}

export function heatmapReducer<TValue>(
  state: VisualizationPresentation,
  transition: HeatmapTransition,
  rows: readonly (readonly HeatmapCell<TValue>[])[],
  options: VisualizationReducerOptions,
): VisualizationPresentation {
  const cells = rows.flatMap((row, rowIndex) => row.flatMap((cell, columnIndex) =>
    cell.disabled === true ? [] : [{ id: cell.id, rowIndex, columnIndex }]
  ));
  const ids = cells.map((cell) => cell.id);
  if (isCollectionTransition(transition)) return reduceCollection(state, transition, ids, options);
  const current = cells.find((cell) => cell.id === state.activeId) ?? cells[0];
  if (current === undefined) return normalizeCollectionInteraction(state, prepareCollectionInteractionIndex(ids));
  const rowsDelta = transition.kind === 'pageRows'
    ? transition.delta * Math.max(1, Math.floor(options.pageSize ?? 1))
    : transition.rows;
  const columnsDelta = transition.kind === 'pageRows' ? 0 : transition.columns;
  const targetRow = Math.max(0, current.rowIndex + rowsDelta);
  const targetColumn = Math.max(0, current.columnIndex + columnsDelta);
  const next = cells.reduce<typeof current | undefined>((best, cell) => {
    if (Math.sign(cell.rowIndex - current.rowIndex) !== Math.sign(rowsDelta) && rowsDelta !== 0) return best;
    if (Math.sign(cell.columnIndex - current.columnIndex) !== Math.sign(columnsDelta) && columnsDelta !== 0) return best;
    if (best === undefined) return cell;
    const distance = Math.abs(cell.rowIndex - targetRow) + Math.abs(cell.columnIndex - targetColumn);
    const bestDistance = Math.abs(best.rowIndex - targetRow) + Math.abs(best.columnIndex - targetColumn);
    return distance < bestDistance ? cell : best;
  }, undefined);
  return setActive(state, next?.id, ids, options);
}

function reduceCollection(
  state: VisualizationPresentation,
  transition: CollectionInteractionAction,
  enabledIds: readonly string[],
  options: VisualizationReducerOptions,
): VisualizationPresentation {
  return collectionInteractionReducer(state, transition, {
    index: prepareCollectionInteractionIndex(enabledIds),
    ...(options.navigation === undefined ? {} : { navigation: options.navigation }),
  });
}

function setActive(
  state: VisualizationPresentation,
  id: string | undefined,
  enabledIds: readonly string[],
  options: VisualizationReducerOptions,
): VisualizationPresentation {
  return reduceCollection(state, {
    kind: 'setActive',
    ...(id === undefined ? {} : { id }),
  }, enabledIds, options);
}

function isCollectionTransition(
  transition: ChartTransition | HeatmapTransition,
): transition is CollectionInteractionAction {
  return !['movePoint', 'pagePoints', 'moveSeries', 'moveCell', 'pageRows'].includes(transition.kind);
}

function assertGlobalPointIds(series: readonly ChartSeries[]): void {
  const ids = series.flatMap((item) => item.points.map((point) => point.id));
  if (new Set(ids).size !== ids.length) {
    throw new TypeError('chart point ids must be unique across all series.');
  }
}
