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
import { cyclicIndex } from '../foundation/cyclic-index.ts';

interface TableStateBase {
  readonly selectedRowId?: string;
  readonly selectedColumnIndex?: number;
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

export type TableCellValueGetter<TRow> = (row: TRow, columnId: string) => unknown;

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
        ? selectCell(state, action.rowId, action.columnIndex, collection, options.columnCount)
        : state;
    case 'moveRow':
      return selectRowAtOffset(state, action.delta, rowIds, collection);
    case 'moveColumn':
      return selectCell(
        state,
        selectedRowId(state, collection),
        (state.selectedColumnIndex ?? 0) + action.delta,
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
        sort: nextSort(state.sort, action.columnId)
      };
    case 'resizeColumnBy':
      return {
        ...state,
        columnWidths: resizedColumns(state.columnWidths, action.columnId, action.delta, options.minColumnWidth)
      };
    case 'setColumnWidth':
      return {
        ...state,
        columnWidths: setColumnWidth(state.columnWidths, action.columnId, action.width, options.minColumnWidth)
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
    ...(state.selectedRowId === undefined || state.selectedColumnIndex === undefined
      ? {}
      : { selectedCell: { rowId: state.selectedRowId, columnIndex: state.selectedColumnIndex } }),
    ...(state.sort === undefined ? {} : { sort: state.sort }),
    ...(state.columnWidths === undefined ? {} : { columnWidths: state.columnWidths })
  };
}

export function prepareTableCollection<TRow>(
  rows: readonly TRow[],
  getRowId: (row: TRow, index: number) => string,
  window?: CollectionWindow
): TableCollection<TRow> {
  const startIndex = window?.startIndex ?? 0;
  const records = rows.map((row, offset): TableCollectionRecord<TRow> => {
    const itemIndex = startIndex + offset;
    return { id: getRowId(row, itemIndex), itemIndex, row };
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
  const selectedRow = collectionRecordById(collection, selectedRowId)?.itemIndex;
  if (selectedRow === undefined) return state;
  const scroll = state.scroll === undefined
    ? undefined
    : scrollReducer(state.scroll, { kind: 'itemIntoView', itemIndex: selectedRow });
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
  const selectedRow = collectionRecordById(collection, selectedRowId)?.itemIndex;
  if (selectedRow === undefined) return state;
  const selectedColumnIndex = boundedIndex(column, columnCount);
  const scroll = state.scroll === undefined
    ? undefined
    : scrollReducer(state.scroll, { kind: 'itemIntoView', itemIndex: selectedRow });
  if (state.selectedRowId === selectedRowId
    && state.selectedColumnIndex === selectedColumnIndex
    && state.scroll === scroll) return state;
  return {
    ...state,
    selectedRowId,
    selectedColumnIndex,
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
  const index = cyclicIndex(current + delta, rowIds.length);
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
    compareValues(valueForColumn(left, sort.columnId), valueForColumn(right, sort.columnId)) * direction
  );
}

function nextSort(current: TableSortState | undefined, columnId: string): TableSortState {
  if (current?.columnId !== columnId) return { columnId, direction: 'ascending' };
  return {
    columnId,
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
