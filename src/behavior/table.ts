import type {
  TableAction,
  TableControlAction,
  TablePresentation,
  TableScrollablePresentation,
  TableSortState
} from '../ui-model/table.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import type { TableCollection, TableCollectionRecord } from '../ui-model/table.ts';
import {
  collectionIds,
  collectionRecordById,
  completeCollection,
  windowedCollection
} from '../ui-model/collection.ts';
import type { CollectionWindow } from '../ui-model/collection.ts';

interface TableStateBase {
  readonly selectedRowId?: string;
  readonly selectedColumn?: number;
  readonly sort?: TableSortState;
  readonly columnWidths?: Readonly<Record<string, number>>;
}

export interface PassiveTableState extends TableStateBase {
  readonly scroll?: never;
}

export interface ScrollableTableState extends TableStateBase {
  readonly scroll: ScrollState;
}

export type TableState = PassiveTableState | ScrollableTableState;

interface TableReducerOptionsBase {
  readonly columnCount?: number;
  readonly minColumnWidth?: number;
}

export type TableReducerOptions<TRow> = TableReducerOptionsBase & (
  | {
      readonly rows: readonly TRow[];
      readonly getRowId: (row: TRow, index: number) => string;
      readonly collection?: never;
    }
  | {
      readonly collection: TableCollection<TRow>;
      readonly rows?: never;
      readonly getRowId?: never;
    }
);

export type TableCellValueGetter<TRow> = (row: TRow, column: string) => unknown;

export function tableReducer<TRow>(
  state: ScrollableTableState,
  action: TableAction,
  options: TableReducerOptions<TRow>
): ScrollableTableState;
export function tableReducer<TRow>(
  state: PassiveTableState,
  action: TableControlAction,
  options: TableReducerOptions<TRow>
): PassiveTableState;
export function tableReducer<TRow>(
  state: TableState,
  action: TableAction,
  options: TableReducerOptions<TRow>
): TableState {
  const collection = collectionForTableOptions(options);
  const rowIds = collectionIds(collection);
  switch (action.kind) {
    case 'selectRow':
      return collectionRecordById(collection, action.rowId) === undefined
        ? state
        : selectRow(state, action.rowId, collection);
    case 'selectCell':
      return collectionRecordById(collection, action.rowId) !== undefined
        ? selectCell(state, action.rowId, action.column, collection, options.columnCount)
        : state;
    case 'moveRow':
      return selectRowAtOffset(state, action.delta, rowIds, collection);
    case 'moveColumn':
      return selectCell(
        state,
        selectedRowId(state, collection),
        (state.selectedColumn ?? 0) + action.delta,
        collection,
        options.columnCount
      );
    case 'page':
      return selectRowAtOffset(
        state,
        action.delta * Math.max(1, state.scroll?.viewportRows ?? 1),
        rowIds,
        collection
      );
    case 'firstRow':
      return selectRow(state, rowIds[0], collection);
    case 'lastRow':
      return selectRow(state, rowIds.at(-1), collection);
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

export function tablePresentation(state: PassiveTableState): TablePresentation {
  return tablePresentationBase(state);
}

export function tableScrollablePresentation(state: ScrollableTableState): TableScrollablePresentation {
  return { ...tablePresentationBase(state), scroll: state.scroll };
}

function tablePresentationBase(state: TableStateBase): TablePresentation {
  return {
    ...(state.selectedRowId === undefined ? {} : { selectedRowId: state.selectedRowId }),
    ...(state.selectedRowId === undefined || state.selectedColumn === undefined
      ? {}
      : { selectedCell: { rowId: state.selectedRowId, column: state.selectedColumn } }),
    ...(state.sort === undefined ? {} : { sort: state.sort }),
    ...(state.columnWidths === undefined ? {} : { columnWidths: state.columnWidths })
  };
}

export function prepareTableCollection<TRow>(
  rows: readonly TRow[],
  getRowId: (row: TRow, index: number) => string,
  window?: CollectionWindow
): TableCollection<TRow> {
  const start = window?.start ?? 0;
  const records = rows.map((row, offset): TableCollectionRecord<TRow> => {
    const index = start + offset;
    return { id: getRowId(row, index), index, row };
  });
  return window === undefined
    ? completeCollection(records)
    : windowedCollection({ records, window });
}

function collectionForTableOptions<TRow>(options: TableReducerOptions<TRow>): TableCollection<TRow> {
  return options.collection ?? prepareTableCollection(options.rows, options.getRowId);
}

function selectRow(
  state: TableState,
  selectedRowId: string | undefined,
  collection: TableCollection<unknown>
): TableState {
  if (selectedRowId === undefined) return withoutRowSelection(state);
  const selectedRow = collectionRecordById(collection, selectedRowId)?.index;
  if (selectedRow === undefined) return state;
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
  collection: TableCollection<unknown>,
  columnCount: number | undefined
): TableState {
  if (selectedRowId === undefined) return withoutRowSelection(state);
  const selectedRow = collectionRecordById(collection, selectedRowId)?.index;
  if (selectedRow === undefined) return state;
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

function selectRowAtOffset(
  state: TableState,
  delta: number,
  rowIds: readonly string[],
  collection: TableCollection<unknown>
): TableState {
  if (rowIds.length === 0) return withoutRowSelection(state);
  const current = rowIds.indexOf(state.selectedRowId ?? '');
  if (current < 0) return selectRow(state, delta < 0 ? rowIds.at(-1) : rowIds[0], collection);
  const index = ((current + delta) % rowIds.length + rowIds.length) % rowIds.length;
  return selectRow(state, rowIds[index], collection);
}

function selectedRowId(state: TableState, collection: TableCollection<unknown>): string | undefined {
  return state.selectedRowId !== undefined && collectionRecordById(collection, state.selectedRowId) !== undefined
    ? state.selectedRowId
    : collectionIds(collection)[0];
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
