import type { BarChartAction, ChartAction, HeatmapAction } from '../ui-model/visualization.ts';
import type {
  BarChartItem,
  ChartPointSelection,
  ChartSeries,
  HeatmapCell,
  HeatmapSelection
} from '../ui-model/feedback.ts';

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
  return barSelection(items[wrapIndex(current + action.delta, items.length)]?.id);
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
  const currentSeriesIndex = Math.max(0, selectable.findIndex((item) => item.id === state.selected?.series));
  const currentSeries = selectable[currentSeriesIndex] ?? selectable[0];
  if (currentSeries === undefined) return state;
  switch (action.kind) {
    case 'select':
      return selectedChartPoint(selectable, action.series, action.pointIndex, state);
    case 'movePoint':
      return { selected: { series: currentSeries.id, pointIndex: bounded(action.delta + (state.selected?.pointIndex ?? 0), currentSeries.points.length) } };
    case 'pagePoints':
      return {
        selected: {
          series: currentSeries.id,
          pointIndex: bounded((state.selected?.pointIndex ?? 0) + action.delta * normalizedPageSize(options.pageSize), currentSeries.points.length)
        }
      };
    case 'moveSeries': {
      const next = selectable[wrapIndex(currentSeriesIndex + action.delta, selectable.length)];
      return next === undefined
        ? state
        : { selected: { series: next.id, pointIndex: bounded(state.selected?.pointIndex ?? 0, next.points.length) } };
    }
    case 'firstPoint':
      return { selected: { series: currentSeries.id, pointIndex: 0 } };
    case 'lastPoint':
      return { selected: { series: currentSeries.id, pointIndex: Math.max(0, currentSeries.points.length - 1) } };
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
      return cells.some((cell) => cell.rowIndex === action.rowIndex && cell.columnIndex === action.columnIndex)
        ? { selected: { rowIndex: action.rowIndex, columnIndex: action.columnIndex } }
        : state;
    case 'move': {
      const current = selectedHeatmapIndex(cells, state.selected);
      const candidate = directionalHeatmapCell(cells, current, {
        rowIndex: current.rowIndex + action.rows,
        columnIndex: current.columnIndex + action.columns
      });
      return candidate === undefined ? state : { selected: candidate };
    }
    case 'pageRows': {
      const current = selectedHeatmapIndex(cells, state.selected);
      const candidate = directionalHeatmapCell(cells, current, {
        rowIndex: current.rowIndex + action.delta * normalizedPageSize(options.pageRows),
        columnIndex: current.columnIndex
      });
      return candidate === undefined ? state : { selected: candidate };
    }
    case 'first': {
      const first = cells[0];
      return first === undefined ? state : { selected: { rowIndex: first.rowIndex, columnIndex: first.columnIndex } };
    }
    case 'last': {
      const last = cells.at(-1);
      return last === undefined ? state : { selected: { rowIndex: last.rowIndex, columnIndex: last.columnIndex } };
    }
  }
}

function selectedChartPoint(
  series: readonly ChartSeries[],
  id: string,
  pointIndex: number,
  fallback: ChartState
): ChartState {
  const selected = series.find((item) => item.id === id);
  return selected === undefined
    ? fallback
    : {
        selected: {
          series: selected.id,
          pointIndex: bounded(pointIndex, selected.points.length)
        }
      };
}

function selectableHeatmapCells<TValue>(rows: readonly (readonly HeatmapCell<TValue>[])[]): readonly HeatmapSelection[] {
  return rows.flatMap((row, rowIndex) => row.flatMap((cell, columnIndex): readonly HeatmapSelection[] =>
    cell.disabled === true ? [] : [{ rowIndex: rowIndex, columnIndex: columnIndex }]
  ));
}

function selectedHeatmapIndex(cells: readonly HeatmapSelection[], selected: HeatmapSelection | undefined): HeatmapSelection {
  return (selected === undefined
    ? undefined
    : cells.find((cell) => cell.rowIndex === selected.rowIndex && cell.columnIndex === selected.columnIndex))
    ?? cells[0]
    ?? { rowIndex: 0, columnIndex: 0 };
}

function directionalHeatmapCell(
  cells: readonly HeatmapSelection[],
  current: HeatmapSelection,
  target: HeatmapSelection
): HeatmapSelection | undefined {
  const candidates = cells.filter((cell) => followsDirection(cell, current, target));
  return candidates.reduce<HeatmapSelection | undefined>((nearest, cell) => {
    if (nearest === undefined) return cell;
    return compareDirectionalCells(cell, nearest, current, target) < 0 ? cell : nearest;
  }, undefined);
}

function followsDirection(
  cell: HeatmapSelection,
  current: HeatmapSelection,
  target: HeatmapSelection
): boolean {
  const rowDirection = Math.sign(target.rowIndex - current.rowIndex);
  const columnDirection = Math.sign(target.columnIndex - current.columnIndex);
  return (rowDirection === 0 || Math.sign(cell.rowIndex - current.rowIndex) === rowDirection || cell.rowIndex === current.rowIndex)
    && (columnDirection === 0 || Math.sign(cell.columnIndex - current.columnIndex) === columnDirection || cell.columnIndex === current.columnIndex);
}

function compareDirectionalCells(
  left: HeatmapSelection,
  right: HeatmapSelection,
  current: HeatmapSelection,
  target: HeatmapSelection
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
  cell: HeatmapSelection,
  target: HeatmapSelection,
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

function wrapIndex(index: number, count: number): number {
  return ((index % count) + count) % count;
}

function normalizedPageSize(value: number | undefined): number {
  return Math.max(1, Math.floor(Number.isFinite(value) ? value ?? 1 : 1));
}
