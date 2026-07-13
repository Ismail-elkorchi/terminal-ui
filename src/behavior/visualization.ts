import type { ChartAction, HeatmapAction } from '../ui-model/visualization.ts';
import type {
  ChartPointSelection,
  ChartSeries,
  HeatmapCell,
  HeatmapSelection
} from '../ui-model/feedback.ts';

export interface ChartState {
  readonly selected?: ChartPointSelection;
}

export interface ChartReducerOptions {
  readonly pageSize?: number;
}

export type ChartPresentation = ChartState;

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
      return selectedChartPoint(selectable, action.series, action.point, state);
    case 'movePoint':
      return { selected: { series: currentSeries.id, point: bounded(action.delta + (state.selected?.point ?? 0), currentSeries.points.length) } };
    case 'pagePoints':
      return {
        selected: {
          series: currentSeries.id,
          point: bounded((state.selected?.point ?? 0) + action.delta * normalizedPageSize(options.pageSize), currentSeries.points.length)
        }
      };
    case 'moveSeries': {
      const next = selectable[wrapIndex(currentSeriesIndex + action.delta, selectable.length)];
      return next === undefined
        ? state
        : { selected: { series: next.id, point: bounded(state.selected?.point ?? 0, next.points.length) } };
    }
    case 'firstPoint':
      return { selected: { series: currentSeries.id, point: 0 } };
    case 'lastPoint':
      return { selected: { series: currentSeries.id, point: Math.max(0, currentSeries.points.length - 1) } };
  }
}

export function chartPresentation(state: ChartState): ChartPresentation {
  return state.selected === undefined ? {} : { selected: state.selected };
}

export interface HeatmapState {
  readonly selected?: HeatmapSelection;
}

export interface HeatmapReducerOptions {
  readonly pageRows?: number;
}

export type HeatmapPresentation = HeatmapState;

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
      return cells.some((cell) => cell.row === action.row && cell.column === action.column)
        ? { selected: { row: action.row, column: action.column } }
        : state;
    case 'move': {
      const current = selectedHeatmapIndex(cells, state.selected);
      const candidate = directionalHeatmapCell(cells, current, {
        row: current.row + action.rows,
        column: current.column + action.columns
      });
      return candidate === undefined ? state : { selected: candidate };
    }
    case 'pageRows': {
      const current = selectedHeatmapIndex(cells, state.selected);
      const candidate = directionalHeatmapCell(cells, current, {
        row: current.row + action.delta * normalizedPageSize(options.pageRows),
        column: current.column
      });
      return candidate === undefined ? state : { selected: candidate };
    }
    case 'first': {
      const first = cells[0];
      return first === undefined ? state : { selected: { row: first.row, column: first.column } };
    }
    case 'last': {
      const last = cells.at(-1);
      return last === undefined ? state : { selected: { row: last.row, column: last.column } };
    }
  }
}

export function heatmapPresentation(state: HeatmapState): HeatmapPresentation {
  return state.selected === undefined ? {} : { selected: state.selected };
}

function selectedChartPoint(
  series: readonly ChartSeries[],
  id: string,
  point: number,
  fallback: ChartState
): ChartState {
  const selected = series.find((item) => item.id === id);
  return selected === undefined
    ? fallback
    : { selected: { series: selected.id, point: bounded(point, selected.points.length) } };
}

function selectableHeatmapCells<TValue>(rows: readonly (readonly HeatmapCell<TValue>[])[]): readonly HeatmapSelection[] {
  return rows.flatMap((row, rowIndex) => row.flatMap((cell, columnIndex): readonly HeatmapSelection[] =>
    cell.disabled === true ? [] : [{ row: rowIndex, column: columnIndex }]
  ));
}

function selectedHeatmapIndex(cells: readonly HeatmapSelection[], selected: HeatmapSelection | undefined): HeatmapSelection {
  return (selected === undefined
    ? undefined
    : cells.find((cell) => cell.row === selected.row && cell.column === selected.column))
    ?? cells[0]
    ?? { row: 0, column: 0 };
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
  const rowDirection = Math.sign(target.row - current.row);
  const columnDirection = Math.sign(target.column - current.column);
  return (rowDirection === 0 || Math.sign(cell.row - current.row) === rowDirection || cell.row === current.row)
    && (columnDirection === 0 || Math.sign(cell.column - current.column) === columnDirection || cell.column === current.column);
}

function compareDirectionalCells(
  left: HeatmapSelection,
  right: HeatmapSelection,
  current: HeatmapSelection,
  target: HeatmapSelection
): number {
  const rowMovement = target.row !== current.row;
  const columnMovement = target.column !== current.column;
  const leftDistance = navigationDistance(left, target, rowMovement, columnMovement);
  const rightDistance = navigationDistance(right, target, rowMovement, columnMovement);
  for (let index = 0; index < leftDistance.length; index += 1) {
    const difference = (leftDistance[index] ?? 0) - (rightDistance[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return left.row - right.row || left.column - right.column;
}

function navigationDistance(
  cell: HeatmapSelection,
  target: HeatmapSelection,
  rowMovement: boolean,
  columnMovement: boolean
): readonly number[] {
  const rowDistance = Math.abs(cell.row - target.row);
  const columnDistance = Math.abs(cell.column - target.column);
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
