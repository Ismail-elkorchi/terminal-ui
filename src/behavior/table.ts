import type { TableAction, TablePresentation, TableSortState } from '../components/table.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
import type { ScrollState } from './scroll.ts';

export interface TableState {
  readonly selectedRow?: number;
  readonly selectedColumn?: number;
  readonly sort?: TableSortState;
  readonly columnWidths?: Readonly<Record<string, number>>;
  readonly scroll?: ScrollState;
}

export interface TableReducerOptions {
  readonly rowCount?: number;
  readonly columnCount?: number;
  readonly minColumnWidth?: number;
}

export type TableCellValueGetter<TRow> = (row: TRow, column: string) => unknown;

export function tableReducer(
  state: TableState,
  action: TableAction,
  options: TableReducerOptions = {}
): TableState {
  switch (action.kind) {
    case 'selectRow':
      return {
        ...state,
        selectedRow: boundedIndex(action.row, options.rowCount)
      };
    case 'selectCell':
      return {
        ...state,
        selectedRow: boundedIndex(action.row, options.rowCount),
        selectedColumn: boundedIndex(action.column, options.columnCount)
      };
    case 'moveRow':
      return selectRow(state, (state.selectedRow ?? 0) + action.delta, options);
    case 'moveColumn':
      return selectCell(state, state.selectedRow ?? 0, (state.selectedColumn ?? 0) + action.delta, options);
    case 'page':
      return selectRow(
        state,
        (state.selectedRow ?? 0) + action.delta * Math.max(1, state.scroll?.viewportRows ?? 1),
        options
      );
    case 'firstRow':
      return selectRow(state, 0, options);
    case 'lastRow':
      return selectRow(state, Math.max(0, (options.rowCount ?? 1) - 1), options);
    case 'activate':
      return state;
    case 'sortBy':
      return {
        ...state,
        sort: nextSort(state.sort, action.column)
      };
    case 'resizeColumn':
      return {
        ...state,
        columnWidths: resizedColumns(state.columnWidths, action.column, action.delta, options.minColumnWidth)
      };
    case 'scroll':
      return state.scroll === undefined
        ? state
        : {
            ...state,
            scroll: applyScrollEvent(state.scroll, action.event)
          };
  }
}

export function tablePresentation(state: TableState): TablePresentation {
  return {
    ...(state.selectedRow === undefined ? {} : { selected: state.selectedRow }),
    ...(state.selectedRow === undefined || state.selectedColumn === undefined
      ? {}
      : { selectedCell: { row: state.selectedRow, column: state.selectedColumn } }),
    ...(state.sort === undefined ? {} : { sort: state.sort }),
    ...(state.columnWidths === undefined ? {} : { columnWidths: state.columnWidths }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll })
  };
}

function selectRow(state: TableState, row: number, options: TableReducerOptions): TableState {
  const selectedRow = boundedIndex(row, options.rowCount);
  const scroll = state.scroll === undefined
    ? undefined
    : scrollReducer(state.scroll, { kind: 'itemIntoView', index: selectedRow });
  if (state.selectedRow === selectedRow && state.scroll === scroll) return state;
  return {
    ...state,
    selectedRow,
    ...(scroll === undefined ? {} : { scroll })
  };
}

function selectCell(
  state: TableState,
  row: number,
  column: number,
  options: TableReducerOptions
): TableState {
  const selectedRow = boundedIndex(row, options.rowCount);
  const selectedColumn = boundedIndex(column, options.columnCount);
  const scroll = state.scroll === undefined
    ? undefined
    : scrollReducer(state.scroll, { kind: 'itemIntoView', index: selectedRow });
  if (state.selectedRow === selectedRow && state.selectedColumn === selectedColumn && state.scroll === scroll) return state;
  return {
    ...state,
    selectedRow,
    selectedColumn,
    ...(scroll === undefined ? {} : { scroll })
  };
}

export function sortTableRows<TRow>(
  rows: readonly TRow[],
  sort: TableSortState | undefined,
  valueForColumn: TableCellValueGetter<TRow>
): readonly TRow[] {
  if (sort === undefined) return rows;
  const direction = sort.direction === 'ascending' ? 1 : -1;
  return [...rows].sort((left, right) =>
    compareValues(valueForColumn(left, sort.column), valueForColumn(right, sort.column)) * direction
  );
}

function nextSort(current: TableSortState | undefined, column: string): TableSortState {
  if (current?.column !== column) return { column, direction: 'ascending' };
  return {
    column,
    direction: current.direction === 'ascending' ? 'descending' : 'ascending'
  };
}

function resizedColumns(
  widths: Readonly<Record<string, number>> | undefined,
  column: string,
  delta: number,
  minColumnWidth: number | undefined
): Readonly<Record<string, number>> {
  const minimum = Math.max(1, Math.floor(minColumnWidth ?? 1));
  const current = widths?.[column] ?? minimum;
  return {
    ...(widths ?? {}),
    [column]: Math.max(minimum, Math.floor(current + delta))
  };
}

function boundedIndex(index: number, count: number | undefined): number {
  const value = Math.max(0, Math.floor(Number.isFinite(index) ? index : 0));
  if (count === undefined || count <= 0) return value;
  return Math.min(count - 1, value);
}

function compareValues(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return comparableText(left).localeCompare(comparableText(right), undefined, { numeric: true });
}

function comparableText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (typeof value === 'function' || typeof value === 'symbol') return '';
  return JSON.stringify(value);
}
