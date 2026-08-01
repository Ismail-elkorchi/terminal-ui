import type { BarChartAction, ChartAction, HeatmapAction } from '../ui-model/visualization.ts';
import type {
  BarChartItem,
  ChartPointSelection,
  ChartSeries,
  HeatmapCell,
  HeatmapSelection
} from '../ui-model/feedback.ts';
import { cyclicIndex } from '../foundation/cyclic-index.ts';

export interface BarChartState {
  readonly selectedId?: string;
}

export function barChartReducer(
  state: BarChartState,
  action: BarChartAction,
  items: readonly BarChartItem[]
): BarChartState {
  if (items.length === 0) return state.selectedId === undefined ? state : {};
  if (action.kind === 'activate') return state;
  if (action.kind === 'select') {
    return items.some((item) => item.id === action.id) ? { selectedId: action.id } : state;
  }
  if (action.kind === 'first') return barSelection(items[0]?.id);
  if (action.kind === 'last') return barSelection(items.at(-1)?.id);
  const current = items.findIndex((item) => item.id === state.selectedId);
  if (current < 0) return barSelection(action.delta < 0 ? items.at(-1)?.id : items[0]?.id);
  return barSelection(items[cyclicIndex(current + action.delta, items.length)]?.id);
}

function barSelection(selectedId: string | undefined): BarChartState {
  return selectedId === undefined ? {} : { selectedId };
}

export interface ChartState {
  readonly selected?: ChartPointSelection;
}

export interface ChartReducerOptions {
  readonly pageSize?: number;
}

export function chartReducer(
  state: ChartState,
  action: ChartAction,
  series: readonly ChartSeries[],
  options: ChartReducerOptions = {}
): ChartState {
  const selectable = series.filter((item) => item.points.length > 0);
  if (selectable.length === 0) return state;
  const currentSeriesIndex = Math.max(
    0,
    selectable.findIndex((item) => item.id === state.selected?.seriesId)
  );
  const currentSeries = selectable[currentSeriesIndex] ?? selectable[0];
  if (currentSeries === undefined) return state;
  const currentPointIndex = selectedPointIndex(currentSeries, state.selected);
  switch (action.kind) {
    case 'select':
      return selectedChartPoint(selectable, action.seriesId, action.pointId, state);
    case 'movePoint':
      return chartSelection(
        currentSeries,
        bounded(currentPointIndex + action.delta, currentSeries.points.length)
      );
    case 'pagePoints':
      return chartSelection(
        currentSeries,
        bounded(
          currentPointIndex + action.delta * normalizedPageSize(options.pageSize),
          currentSeries.points.length
        )
      );
    case 'moveSeries': {
      const next = selectable[cyclicIndex(currentSeriesIndex + action.delta, selectable.length)];
      return next === undefined
        ? state
        : chartSelection(next, bounded(currentPointIndex, next.points.length));
    }
    case 'firstPoint':
      return chartSelection(currentSeries, 0);
    case 'lastPoint':
      return chartSelection(currentSeries, currentSeries.points.length - 1);
  }
}

export interface HeatmapState {
  readonly selected?: HeatmapSelection;
}

export interface HeatmapReducerOptions {
  readonly pageRows?: number;
}

export function heatmapReducer<TValue>(
  state: HeatmapState,
  action: HeatmapAction,
  rows: readonly (readonly HeatmapCell<TValue>[])[],
  options: HeatmapReducerOptions = {}
): HeatmapState {
  const cells = selectableHeatmapCells(rows);
  if (cells.length === 0) return state;
  switch (action.kind) {
    case 'select':
      return cells.some((cell) => cell.id === action.id)
        ? { selected: { id: action.id } }
        : state;
    case 'move': {
      const current = selectedHeatmapIndex(cells, state.selected);
      const candidate = directionalHeatmapCell(cells, current, {
        rowIndex: current.rowIndex + action.rows,
        columnIndex: current.columnIndex + action.columns
      });
      return candidate === undefined ? state : { selected: { id: candidate.id } };
    }
    case 'pageRows': {
      const current = selectedHeatmapIndex(cells, state.selected);
      const candidate = directionalHeatmapCell(cells, current, {
        rowIndex: current.rowIndex + action.delta * normalizedPageSize(options.pageRows),
        columnIndex: current.columnIndex
      });
      return candidate === undefined ? state : { selected: { id: candidate.id } };
    }
    case 'first': {
      const first = cells[0];
      return first === undefined ? state : { selected: { id: first.id } };
    }
    case 'last': {
      const last = cells.at(-1);
      return last === undefined ? state : { selected: { id: last.id } };
    }
  }
}

function selectedChartPoint(
  series: readonly ChartSeries[],
  seriesId: string,
  pointId: string,
  fallback: ChartState
): ChartState {
  const selectedSeries = series.find((item) => item.id === seriesId);
  const selectedPoint = selectedSeries?.points.find((point) => point.id === pointId);
  return selectedSeries === undefined || selectedPoint === undefined
    ? fallback
    : { selected: { seriesId: selectedSeries.id, pointId: selectedPoint.id } };
}

function chartSelection(series: ChartSeries, pointIndex: number): ChartState {
  const point = series.points[bounded(pointIndex, series.points.length)];
  return point === undefined
    ? {}
    : { selected: { seriesId: series.id, pointId: point.id } };
}

function selectedPointIndex(
  series: ChartSeries,
  selected: ChartPointSelection | undefined
): number {
  const pointIndex = selected?.seriesId === series.id
    ? series.points.findIndex((point) => point.id === selected.pointId)
    : -1;
  return pointIndex < 0 ? 0 : pointIndex;
}

interface HeatmapLocation {
  readonly id: string;
  readonly rowIndex: number;
  readonly columnIndex: number;
}

function selectableHeatmapCells<TValue>(
  rows: readonly (readonly HeatmapCell<TValue>[])[]
): readonly HeatmapLocation[] {
  return rows.flatMap((row, rowIndex) => row.flatMap((cell, columnIndex): readonly HeatmapLocation[] =>
    cell.disabled === true ? [] : [{ id: cell.id, rowIndex, columnIndex }]
  ));
}

function selectedHeatmapIndex(
  cells: readonly HeatmapLocation[],
  selected: HeatmapSelection | undefined
): HeatmapLocation {
  return (selected === undefined
    ? undefined
    : cells.find((cell) => cell.id === selected.id))
    ?? cells[0]
    ?? { id: '', rowIndex: 0, columnIndex: 0 };
}

function directionalHeatmapCell(
  cells: readonly HeatmapLocation[],
  current: HeatmapLocation,
  target: Pick<HeatmapLocation, 'rowIndex' | 'columnIndex'>
): HeatmapLocation | undefined {
  const candidates = cells.filter((cell) => followsDirection(cell, current, target));
  return candidates.reduce<HeatmapLocation | undefined>((nearest, cell) => {
    if (nearest === undefined) return cell;
    return compareDirectionalCells(cell, nearest, current, target) < 0 ? cell : nearest;
  }, undefined);
}

function followsDirection(
  cell: HeatmapLocation,
  current: HeatmapLocation,
  target: Pick<HeatmapLocation, 'rowIndex' | 'columnIndex'>
): boolean {
  const rowDirection = Math.sign(target.rowIndex - current.rowIndex);
  const columnDirection = Math.sign(target.columnIndex - current.columnIndex);
  return (rowDirection === 0 || Math.sign(cell.rowIndex - current.rowIndex) === rowDirection || cell.rowIndex === current.rowIndex)
    && (columnDirection === 0 || Math.sign(cell.columnIndex - current.columnIndex) === columnDirection || cell.columnIndex === current.columnIndex);
}

function compareDirectionalCells(
  left: HeatmapLocation,
  right: HeatmapLocation,
  current: HeatmapLocation,
  target: Pick<HeatmapLocation, 'rowIndex' | 'columnIndex'>
): number {
  const rowMovement = target.rowIndex !== current.rowIndex;
  const columnMovement = target.columnIndex !== current.columnIndex;
  const leftDistance = navigationDistance(left, target, rowMovement, columnMovement);
  const rightDistance = navigationDistance(right, target, rowMovement, columnMovement);
  for (let index = 0; index < leftDistance.length; index += 1) {
    const difference = (leftDistance[index] ?? 0) - (rightDistance[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.rowIndex - right.rowIndex || left.columnIndex - right.columnIndex;
}

function navigationDistance(
  cell: HeatmapLocation,
  target: Pick<HeatmapLocation, 'rowIndex' | 'columnIndex'>,
  rowMovement: boolean,
  columnMovement: boolean
): readonly number[] {
  const rowDistance = Math.abs(cell.rowIndex - target.rowIndex);
  const columnDistance = Math.abs(cell.columnIndex - target.columnIndex);
  if (rowMovement && !columnMovement) return [rowDistance, columnDistance];
  if (columnMovement && !rowMovement) return [columnDistance, rowDistance];
  return [rowDistance + columnDistance, rowDistance, columnDistance];
}

function bounded(index: number, count: number): number {
  return Math.max(0, Math.min(Math.max(0, count - 1), Math.floor(Number.isFinite(index) ? index : 0)));
}

function normalizedPageSize(value: number | undefined): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value ?? 1 : 1));
}
