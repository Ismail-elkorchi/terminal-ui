import type { NavigationPolicy } from '../interaction/navigation.ts';
import { defaultNavigationPolicy, navigateIndex } from '../interaction/navigation.ts';
import { applyScrollRequest, scrollReducer } from './scroll.ts';
import type {
  DataGridCell,
  DataGridCellSelection,
  DataGridInteraction,
  DataGridState,
  ScrollableDataGridState,
  DataGridTransition,
  TableCollection,
  TableCollectionRow,
  CompleteTableCollection,
  TableSortState,
  WindowedTableCollection,
  UnscrolledDataGridState,
} from './table.ts';
import {
  collectionIds,
  collectionItemById,
  createCompleteCollection,
  createWindowedCollection,
} from '../collection/snapshot.ts';
import type { CollectionWindow } from '../collection/snapshot.ts';
import { compareCollectionText } from '../text/query.ts';

export interface DataGridReducerOptions<TRow> {
  readonly collection: TableCollection<TRow>;
  readonly columnIds: readonly string[];
  readonly navigation?: NavigationPolicy;
  readonly minColumnWidth?: number;
  readonly pageSize?: number;
}

export type TableCellValueGetter<TRow> = (row: TRow, columnId: string) => unknown;

export function dataGridReducer<TRow>(
  state: ScrollableDataGridState,
  transition: DataGridTransition,
  options: DataGridReducerOptions<TRow>,
): ScrollableDataGridState;
export function dataGridReducer<TRow>(
  state: UnscrolledDataGridState,
  transition: Exclude<DataGridTransition, { readonly kind: 'scroll' }>,
  options: DataGridReducerOptions<TRow>,
): UnscrolledDataGridState;
export function dataGridReducer<TRow>(
  state: DataGridState,
  transition: DataGridTransition,
  options: DataGridReducerOptions<TRow>,
): DataGridState {
  const rowIds = collectionIds(options.collection);
  const navigation = options.navigation ?? defaultNavigationPolicy;
  switch (transition.kind) {
    case 'setActiveRow':
      return rowIds.includes(transition.rowId)
        ? withActiveRow(state, transition.rowId, options)
        : state;
    case 'setActiveCell':
      return validCell(transition.cell, rowIds, options.columnIds)
        ? withActiveCell(state, transition.cell, options)
        : state;
    case 'moveRow':
      return moveRow(state, transition.delta, rowIds, options, navigation);
    case 'moveColumn':
      return moveColumn(state, transition.delta, rowIds, options, navigation);
    case 'page':
      return moveRow(
        state,
        transition.delta * Math.max(1, options.pageSize ?? 1),
        rowIds,
        options,
        navigation,
      );
    case 'firstRow':
      return focusAtRowIndex(state, 0, rowIds, options);
    case 'lastRow':
      return focusAtRowIndex(state, rowIds.length - 1, rowIds, options);
    case 'commit':
      return commitGridSelection(
        state,
        options,
        transition.extendSelection === true,
        transition.toggleSelection === true,
      );
    case 'sortBy':
      return { ...state, sort: nextSort(state.sort, transition.columnId) };
    case 'resizeColumnBy':
      return {
        ...state,
        columnWidths: resizedColumns(
          state.columnWidths,
          transition.columnId,
          transition.delta,
          options.minColumnWidth,
        ),
      };
    case 'setColumnWidth':
      return {
        ...state,
        columnWidths: setColumnWidth(
          state.columnWidths,
          transition.columnId,
          transition.width,
          options.minColumnWidth,
        ),
      };
    case 'scroll':
      if (state.scroll === undefined) return state;
      return withGridScrollState(state, applyScrollRequest(state.scroll, transition.request));
  }
}

export function createTableCollection<TRow>(
  rows: readonly TRow[],
  getRowId: (row: TRow, index: number) => string,
): CompleteTableCollection<TRow>;
export function createTableCollection<TRow>(
  rows: readonly TRow[],
  getRowId: (row: TRow, index: number) => string,
  window: CollectionWindow,
): WindowedTableCollection<TRow>;
export function createTableCollection<TRow>(
  rows: readonly TRow[],
  getRowId: (row: TRow, index: number) => string,
  window?: CollectionWindow,
): TableCollection<TRow> {
  const startIndex = window?.startIndex ?? 0;
  const items = rows.map((row, offset): TableCollectionRow<TRow> => {
    const itemIndex = startIndex + offset;
    return { id: getRowId(row, itemIndex), itemIndex, row };
  });
  return window === undefined
    ? createCompleteCollection(items)
    : createWindowedCollection({ items, window });
}

export function sortTableRows<TRow>(
  rows: readonly TRow[],
  sort: TableSortState | undefined,
  valueForColumn: TableCellValueGetter<TRow>,
  compare: (left: unknown, right: unknown) => number = compareTableValues,
): readonly TRow[] {
  if (sort === undefined) return rows;
  const direction = sort.direction === 'ascending' ? 1 : -1;
  return [...rows].sort((left, right) =>
    compare(valueForColumn(left, sort.columnId), valueForColumn(right, sort.columnId)) * direction
  );
}

function moveRow<TRow>(
  state: DataGridState,
  delta: number,
  rowIds: readonly string[],
  options: DataGridReducerOptions<TRow>,
  navigation: NavigationPolicy,
): DataGridState {
  if (rowIds.length === 0) return state;
  const activeRowId = state.interaction.kind === 'row'
    ? state.interaction.activeRowId
    : state.interaction.activeCell?.rowId;
  const position = activeRowId === undefined ? -1 : rowIds.indexOf(activeRowId);
  const current = position < 0 ? undefined : position;
  return focusAtRowIndex(state, navigateIndex(current, delta, rowIds.length, navigation), rowIds, options);
}

function moveColumn<TRow>(
  state: DataGridState,
  delta: number,
  rowIds: readonly string[],
  options: DataGridReducerOptions<TRow>,
  navigation: NavigationPolicy,
): DataGridState {
  if (state.interaction.kind !== 'cell' || options.columnIds.length === 0 || rowIds.length === 0) return state;
  const firstRowId = rowIds[0];
  const firstColumnId = options.columnIds[0];
  if (firstRowId === undefined || firstColumnId === undefined) return state;
  const active = state.interaction.activeCell;
  const position = active === undefined ? -1 : options.columnIds.indexOf(active.columnId);
  const current = position < 0 ? undefined : position;
  const columnId = options.columnIds[navigateIndex(current, delta, options.columnIds.length, navigation)];
  if (columnId === undefined) return state;
  return withActiveCell(state, {
    rowId: active?.rowId ?? firstRowId,
    columnId,
  }, options);
}

function focusAtRowIndex<TRow>(
  state: DataGridState,
  index: number,
  rowIds: readonly string[],
  options: DataGridReducerOptions<TRow>,
): DataGridState {
  const rowId = rowIds[index];
  if (rowId === undefined) return state;
  if (state.interaction.kind === 'row') return withActiveRow(state, rowId, options);
  const columnId = state.interaction.activeCell?.columnId ?? options.columnIds[0];
  return columnId === undefined ? state : withActiveCell(state, { rowId, columnId }, options);
}

function withActiveRow<TRow>(
  state: DataGridState,
  rowId: string,
  options: DataGridReducerOptions<TRow>,
): DataGridState {
  if (state.interaction.kind !== 'row') return state;
  const current = state.interaction;
  const selection = current.selection.mode === 'single'
    && current.selection.selectionFollowsActive === true
    ? current.selection.selectedRowId === rowId
      ? current.selection
      : { mode: 'single' as const, selectedRowId: rowId, selectionFollowsActive: true }
    : current.selection;
  const interaction: DataGridInteraction = current.activeRowId === rowId && selection === current.selection
    ? current
    : { ...current, activeRowId: rowId, selection };
  const next = interaction === current ? state : { ...state, interaction };
  return withGridScroll(next, rowId, options.collection, options.pageSize);
}

function withActiveCell<TRow>(
  state: DataGridState,
  cell: DataGridCell,
  options: DataGridReducerOptions<TRow>,
): DataGridState {
  if (state.interaction.kind !== 'cell') return state;
  const current = state.interaction;
  const activeCell = sameCell(current.activeCell, cell) ? current.activeCell ?? cell : cell;
  const selection = current.selection.mode === 'single'
    && current.selection.selectionFollowsActive === true
    ? sameCell(current.selection.selectedCell, cell)
      ? current.selection
      : { mode: 'single' as const, selectedCell: cell, selectionFollowsActive: true }
    : current.selection;
  const interaction: DataGridInteraction = activeCell === current.activeCell && selection === current.selection
    ? current
    : { ...current, activeCell, selection };
  const next = interaction === current ? state : { ...state, interaction };
  return withGridScroll(next, cell.rowId, options.collection, options.pageSize);
}

function commitGridSelection<TRow>(
  state: DataGridState,
  options: DataGridReducerOptions<TRow>,
  extend: boolean,
  toggle: boolean,
): DataGridState {
  if (state.interaction.kind === 'row') {
    if (state.interaction.selection.mode === 'none') return state;
    const active = state.interaction.activeRowId;
    if (active === undefined) return state;
    const selectedRowIds = selectedIds(
      state.interaction.selection.mode === 'multiple'
        ? state.interaction.selection.selectedRowIds
        : state.interaction.selection.selectedRowId === undefined ? [] : [state.interaction.selection.selectedRowId],
      active,
      state.interaction.selection.mode === 'multiple' ? state.interaction.selection.selectionAnchorId : undefined,
      collectionIds(options.collection),
      state.interaction.selection,
      extend,
      toggle,
    );
    return {
      ...state,
      interaction: {
        ...state.interaction,
        selection: state.interaction.selection.mode === 'single'
          ? {
              mode: 'single',
              ...(selectedRowIds[0] === undefined ? {} : { selectedRowId: selectedRowIds[0] }),
              ...(state.interaction.selection.selectionFollowsActive === undefined
                ? {}
                : { selectionFollowsActive: state.interaction.selection.selectionFollowsActive }),
            }
          : {
              mode: 'multiple',
              selectedRowIds,
              selectionAnchorId: active,
              ...(state.interaction.selection.rangeSelectionEnabled === undefined
                ? {}
                : { rangeSelectionEnabled: state.interaction.selection.rangeSelectionEnabled }),
            },
      },
    };
  }
  if (state.interaction.selection.mode === 'none') return state;
  const active = state.interaction.activeCell;
  if (active === undefined) return state;
  const selectedCells = selectedGridCells(
    state.interaction.selection.mode === 'multiple'
      ? state.interaction.selection.selectedCells
      : state.interaction.selection.selectedCell === undefined ? [] : [state.interaction.selection.selectedCell],
    active,
    state.interaction.selection.mode === 'multiple' ? state.interaction.selection.selectionAnchor : undefined,
    state.interaction.selection,
    options,
    extend,
    toggle,
  );
  return {
    ...state,
    interaction: {
      ...state.interaction,
      selection: state.interaction.selection.mode === 'single'
        ? {
            mode: 'single',
            ...(selectedCells[0] === undefined ? {} : { selectedCell: selectedCells[0] }),
            ...(state.interaction.selection.selectionFollowsActive === undefined
              ? {}
              : { selectionFollowsActive: state.interaction.selection.selectionFollowsActive }),
          }
        : {
            mode: 'multiple',
            selectedCells,
            selectionAnchor: active,
            ...(state.interaction.selection.rangeSelectionEnabled === undefined
              ? {}
              : { rangeSelectionEnabled: state.interaction.selection.rangeSelectionEnabled }),
          },
    },
  };
}

function selectedGridCells<TRow>(
  current: readonly DataGridCell[],
  active: DataGridCell,
  anchor: DataGridCell | undefined,
  selection: Exclude<DataGridCellSelection, { readonly mode: 'none' }>,
  options: DataGridReducerOptions<TRow>,
  extend: boolean,
  toggle: boolean,
): readonly DataGridCell[] {
  if (selection.mode === 'single') return Object.freeze([active]);
  if (extend && selection.rangeSelectionEnabled === true && anchor !== undefined) {
    const rowIds = collectionIds(options.collection);
    const anchorRow = rowIds.indexOf(anchor.rowId);
    const activeRow = rowIds.indexOf(active.rowId);
    const anchorColumn = options.columnIds.indexOf(anchor.columnId);
    const activeColumn = options.columnIds.indexOf(active.columnId);
    if (anchorRow >= 0 && activeRow >= 0 && anchorColumn >= 0 && activeColumn >= 0) {
      const selected: DataGridCell[] = [];
      for (const rowId of rowIds.slice(Math.min(anchorRow, activeRow), Math.max(anchorRow, activeRow) + 1)) {
        for (const columnId of options.columnIds.slice(
          Math.min(anchorColumn, activeColumn),
          Math.max(anchorColumn, activeColumn) + 1,
        )) {
          selected.push({ rowId, columnId });
        }
      }
      return Object.freeze(selected);
    }
  }
  if (!toggle) return Object.freeze([active]);
  const key = cellKey(active);
  const selected = new Map(current.map((cell) => [cellKey(cell), cell]));
  if (selected.has(key)) selected.delete(key);
  else selected.set(key, active);
  return Object.freeze([...selected.values()]);
}

function selectedIds(
  current: readonly string[],
  active: string,
  anchor: string | undefined,
  ordered: readonly string[],
  selection: Exclude<import('../behavior/table.ts').DataGridRowSelection, { readonly mode: 'none' }>,
  extend: boolean,
  toggle: boolean,
): readonly string[] {
  if (selection.mode !== 'multiple') return [active];
  if (extend && selection.rangeSelectionEnabled === true && anchor !== undefined) {
    const start = ordered.indexOf(anchor);
    const end = ordered.indexOf(active);
    if (start >= 0 && end >= 0) return ordered.slice(Math.min(start, end), Math.max(start, end) + 1);
  }
  if (!toggle) return [active];
  const selected = new Set(current);
  if (selected.has(active)) selected.delete(active);
  else selected.add(active);
  return ordered.filter((id) => selected.has(id));
}

function withGridScroll<TRow>(
  state: DataGridState,
  rowId: string,
  collection: TableCollection<TRow>,
  pageSize: number | undefined,
): DataGridState {
  if (state.scroll === undefined) return state;
  const row = collectionItemById(collection, rowId);
  if (row === undefined) return state;
  return withGridScrollState(state, scrollReducer(
    state.scroll,
    { kind: 'itemIntoView', itemIndex: row.itemIndex, alignment: 'nearest' },
    {
      contentRows: collection.totalCount,
      contentColumns: 0,
      viewportRows: Math.max(1, pageSize ?? 1),
      viewportColumns: 0,
    },
  ));
}

function withGridScrollState(
  state: DataGridState,
  scroll: NonNullable<DataGridState['scroll']>,
): DataGridState {
  return state.scroll === scroll ? state : { ...state, scroll };
}

function validCell(cell: DataGridCell, rowIds: readonly string[], columnIds: readonly string[]): boolean {
  return rowIds.includes(cell.rowId) && columnIds.includes(cell.columnId);
}

function cellKey(cell: DataGridCell): string {
  return `${cell.rowId}\u0000${cell.columnId}`;
}

function sameCell(left: DataGridCell | undefined, right: DataGridCell | undefined): boolean {
  return left === right
    || left?.rowId === right?.rowId && left?.columnId === right?.columnId;
}

function nextSort(current: TableSortState | undefined, columnId: string): TableSortState {
  return {
    columnId,
    direction: current?.columnId === columnId && current.direction === 'ascending'
      ? 'descending'
      : 'ascending',
  };
}

function resizedColumns(
  current: Readonly<Record<string, number>> | undefined,
  columnId: string,
  delta: number,
  minimum = 1,
): Readonly<Record<string, number>> {
  return setColumnWidth(current, columnId, (current?.[columnId] ?? minimum) + delta, minimum);
}

function setColumnWidth(
  current: Readonly<Record<string, number>> | undefined,
  columnId: string,
  width: number,
  minimum = 1,
): Readonly<Record<string, number>> {
  const next = Math.max(minimum, Math.floor(width));
  return current?.[columnId] === next
    ? current
    : Object.freeze({ ...current, [columnId]: next });
}

function compareTableValues(left: unknown, right: unknown): number {
  if (typeof left === 'number' && typeof right === 'number') return left - right;
  return compareCollectionText(comparableText(left), comparableText(right), { numeric: true });
}

function comparableText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (typeof value === 'function' || typeof value === 'symbol') return '';
  return JSON.stringify(value);
}
