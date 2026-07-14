import type { TableAction, TablePresentation, TableSortState } from '../ui-model/table.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';

export interface TableState {
  readonly selectedRowId?: string;
  readonly selectedColumn?: number;
  readonly sort?: TableSortState;
  readonly columnWidths?: Readonly<Record<string, number>>;
  readonly scroll?: ScrollState;
}

export interface TableReducerOptions<TRow> {
  readonly rows: readonly TRow[];
  readonly getRowId: (row: TRow, index: number) => string;
  readonly columnCount?: number;
  readonly minColumnWidth?: number;
}

export type TableCellValueGetter<TRow> = (row: TRow, column: string) => unknown;

export function tableReducer<TRow>(
  state: TableState,
  action: TableAction,
  options: TableReducerOptions<TRow>
): TableState {
  const rowIds = options.rows.map(options.getRowId);
  switch (action.kind) {
    case 'selectRow':
      return rowIds.includes(action.rowId) ? selectRow(state, action.rowId, rowIds) : state;
    case 'selectCell':
      return rowIds.includes(action.rowId)
        ? selectCell(state, action.rowId, action.column, rowIds, options.columnCount)
        : state;
    case 'moveRow':
      return selectRowAtOffset(state, action.delta, rowIds);
    case 'moveColumn':
      return selectCell(
        state,
        selectedRowId(state, rowIds),
        (state.selectedColumn ?? 0) + action.delta,
        rowIds,
        options.columnCount
      );
    case 'page':
      return selectRowAtOffset(state, action.delta * Math.max(1, state.scroll?.viewportRows ?? 1), rowIds);
    case 'firstRow':
      return selectRow(state, rowIds[0], rowIds);
    case 'lastRow':
      return selectRow(state, rowIds.at(-1), rowIds);
    case 'activate':
      return state;
    case 'sortBy':
      return {
        ...state,
        sort: nextSort(state.sort, action.column)
      };
    case 'resizeColumnBy':
      return {
        ...state,
        columnWidths: resizedColumns(state.columnWidths, action.column, action.delta, options.minColumnWidth)
      };
    case 'setColumnWidth':
      return {
        ...state,
        columnWidths: setColumnWidth(state.columnWidths, action.column, action.width, options.minColumnWidth)
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
    ...(state.selectedRowId === undefined ? {} : { selectedRowId: state.selectedRowId }),
    ...(state.selectedRowId === undefined || state.selectedColumn === undefined
      ? {}
      : { selectedCell: { rowId: state.selectedRowId, column: state.selectedColumn } }),
    ...(state.sort === undefined ? {} : { sort: state.sort }),
    ...(state.columnWidths === undefined ? {} : { columnWidths: state.columnWidths }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll })
  };
}

function selectRow(state: TableState, selectedRowId: string | undefined, rowIds: readonly string[]): TableState {
  if (selectedRowId === undefined) return withoutRowSelection(state);
  const selectedRow = rowIds.indexOf(selectedRowId);
  if (selectedRow < 0) return state;
  const scroll = state.scroll === undefined
    ? undefined
    : scrollReducer(state.scroll, { kind: 'itemIntoView', index: selectedRow });
  if (state.selectedRowId === selectedRowId && state.scroll === scroll) return state;
  return {
    ...state,
    selectedRowId,
    ...(scroll === undefined ? {} : { scroll })
  };
}

function selectCell(
  state: TableState,
  selectedRowId: string | undefined,
  column: number,
  rowIds: readonly string[],
  columnCount: number | undefined
): TableState {
  if (selectedRowId === undefined) return withoutRowSelection(state);
  const selectedRow = rowIds.indexOf(selectedRowId);
  if (selectedRow < 0) return state;
  const selectedColumn = boundedIndex(column, columnCount);
  const scroll = state.scroll === undefined
    ? undefined
    : scrollReducer(state.scroll, { kind: 'itemIntoView', index: selectedRow });
  if (state.selectedRowId === selectedRowId && state.selectedColumn === selectedColumn && state.scroll === scroll) return state;
  return {
    ...state,
    selectedRowId,
    selectedColumn,
    ...(scroll === undefined ? {} : { scroll })
  };
}

function selectRowAtOffset(state: TableState, delta: number, rowIds: readonly string[]): TableState {
  if (rowIds.length === 0) return withoutRowSelection(state);
  const current = rowIds.indexOf(state.selectedRowId ?? '');
  if (current < 0) return selectRow(state, delta < 0 ? rowIds.at(-1) : rowIds[0], rowIds);
  const index = ((current + delta) % rowIds.length + rowIds.length) % rowIds.length;
  return selectRow(state, rowIds[index], rowIds);
}

function selectedRowId(state: TableState, rowIds: readonly string[]): string | undefined {
  return state.selectedRowId !== undefined && rowIds.includes(state.selectedRowId)
    ? state.selectedRowId
    : rowIds[0];
}

function withoutRowSelection(state: TableState): TableState {
  return {
    ...(state.sort === undefined ? {} : { sort: state.sort }),
    ...(state.columnWidths === undefined ? {} : { columnWidths: state.columnWidths }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll })
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

function setColumnWidth(
  widths: Readonly<Record<string, number>> | undefined,
  column: string,
  width: number,
  minColumnWidth: number | undefined
): Readonly<Record<string, number>> {
  const minimum = Math.max(1, Math.floor(minColumnWidth ?? 1));
  return {
    ...(widths ?? {}),
    [column]: Math.max(minimum, Math.floor(Number.isFinite(width) ? width : minimum))
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
