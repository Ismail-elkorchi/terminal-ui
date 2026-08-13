import type { NavigationPolicy } from '../interaction/navigation.ts';
import { defaultNavigationPolicy, navigateIndex } from '../interaction/navigation.ts';
import type { SelectionPolicy } from '../interaction/collection.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
import type {
  DataGridCell,
  DataGridInteraction,
  DataGridPresentation,
  ScrollableDataGridPresentation,
  DataGridTransition,
  TableCollection,
  TableCollectionRecord,
  TableSortState,
  UnscrolledDataGridPresentation,
} from '../ui-model/table.ts';
import {
  collectionIds,
  collectionRecordById,
  completeCollection,
  windowedCollection,
} from '../ui-model/collection.ts';
import type { CollectionWindow } from '../ui-model/collection.ts';

export interface DataGridReducerOptions<TRow> {
  readonly collection: TableCollection<TRow>;
  readonly columnIds: readonly string[];
  readonly selection: SelectionPolicy;
  readonly navigation?: NavigationPolicy;
  readonly minColumnWidth?: number;
  readonly pageSize?: number;
}

export type TableCellValueGetter<TRow> = (row: TRow, columnId: string) => unknown;

export function dataGridReducer<TRow>(
  state: ScrollableDataGridPresentation,
  transition: DataGridTransition,
  options: DataGridReducerOptions<TRow>,
): ScrollableDataGridPresentation;
export function dataGridReducer<TRow>(
  state: UnscrolledDataGridPresentation,
  transition: Exclude<DataGridTransition, { readonly kind: 'scroll' }>,
  options: DataGridReducerOptions<TRow>,
): UnscrolledDataGridPresentation;
export function dataGridReducer<TRow>(
  state: DataGridPresentation,
  transition: DataGridTransition,
  options: DataGridReducerOptions<TRow>,
): DataGridPresentation {
  state = normalizeGridSelectionMode(state, options.selection.mode);
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
      return commitGridSelection(state, options, transition.extend === true, transition.toggle === true);
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
      return state.scroll === undefined
        ? state
        : { ...state, scroll: applyScrollEvent(state.scroll, transition.event) };
  }
}

export function prepareTableCollection<TRow>(
  rows: readonly TRow[],
  getRowId: (row: TRow, index: number) => string,
  window?: CollectionWindow,
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

function normalizeGridSelectionMode(
  state: DataGridPresentation,
  mode: DataGridInteraction['selectionMode'],
): DataGridPresentation {
  const interaction = state.interaction;
  if (interaction.kind === 'row') {
    const selectedRowIds = mode === 'none'
      ? interaction.selectedRowIds.length === 0 ? interaction.selectedRowIds : []
      : mode === 'single' && interaction.selectedRowIds.length > 1
      ? interaction.selectedRowIds.slice(0, 1)
      : interaction.selectedRowIds;
    if (interaction.selectionMode === mode && selectedRowIds === interaction.selectedRowIds) return state;
    const { selectionAnchorId, ...base } = interaction;
    return {
      ...state,
      interaction: {
        ...base,
        selectionMode: mode,
        selectedRowIds,
        ...(mode === 'none' || selectionAnchorId === undefined ? {} : { selectionAnchorId }),
      },
    };
  }
  const selectedCells = mode === 'none'
    ? interaction.selectedCells.length === 0 ? interaction.selectedCells : []
    : mode === 'single' && interaction.selectedCells.length > 1
    ? interaction.selectedCells.slice(0, 1)
    : interaction.selectedCells;
  if (interaction.selectionMode === mode && selectedCells === interaction.selectedCells) return state;
  const { selectionAnchor, ...base } = interaction;
  return {
    ...state,
    interaction: {
      ...base,
      selectionMode: mode,
      selectedCells,
      ...(mode === 'none' || selectionAnchor === undefined ? {} : { selectionAnchor }),
    },
  };
}

export function sortTableRows<TRow>(
  rows: readonly TRow[],
  sort: TableSortState | undefined,
  valueForColumn: TableCellValueGetter<TRow>,
): readonly TRow[] {
  if (sort === undefined) return rows;
  const direction = sort.direction === 'ascending' ? 1 : -1;
  return [...rows].sort((left, right) =>
    compareValues(valueForColumn(left, sort.columnId), valueForColumn(right, sort.columnId)) * direction
  );
}

function moveRow<TRow>(
  state: DataGridPresentation,
  delta: number,
  rowIds: readonly string[],
  options: DataGridReducerOptions<TRow>,
  navigation: NavigationPolicy,
): DataGridPresentation {
  if (rowIds.length === 0) return state;
  const activeRowId = state.interaction.kind === 'row'
    ? state.interaction.activeRowId
    : state.interaction.activeCell?.rowId;
  const current = Math.max(0, rowIds.indexOf(activeRowId ?? ''));
  return focusAtRowIndex(state, navigateIndex(current, delta, rowIds.length, navigation), rowIds, options);
}

function moveColumn<TRow>(
  state: DataGridPresentation,
  delta: number,
  rowIds: readonly string[],
  options: DataGridReducerOptions<TRow>,
  navigation: NavigationPolicy,
): DataGridPresentation {
  if (state.interaction.kind !== 'cell' || options.columnIds.length === 0 || rowIds.length === 0) return state;
  const firstRowId = rowIds[0];
  const firstColumnId = options.columnIds[0];
  if (firstRowId === undefined || firstColumnId === undefined) return state;
  const active = state.interaction.activeCell ?? {
    rowId: firstRowId,
    columnId: firstColumnId,
  };
  const current = Math.max(0, options.columnIds.indexOf(active.columnId));
  const columnId = options.columnIds[navigateIndex(current, delta, options.columnIds.length, navigation)];
  if (columnId === undefined) return state;
  return withActiveCell(state, {
    rowId: active.rowId,
    columnId,
  }, options);
}

function focusAtRowIndex<TRow>(
  state: DataGridPresentation,
  index: number,
  rowIds: readonly string[],
  options: DataGridReducerOptions<TRow>,
): DataGridPresentation {
  const rowId = rowIds[index];
  if (rowId === undefined) return state;
  if (state.interaction.kind === 'row') return withActiveRow(state, rowId, options);
  const columnId = state.interaction.activeCell?.columnId ?? options.columnIds[0];
  return columnId === undefined ? state : withActiveCell(state, { rowId, columnId }, options);
}

function withActiveRow<TRow>(
  state: DataGridPresentation,
  rowId: string,
  options: DataGridReducerOptions<TRow>,
): DataGridPresentation {
  if (state.interaction.kind !== 'row') return state;
  const interaction: DataGridInteraction = {
    ...state.interaction,
    activeRowId: rowId,
    ...(options.selection.mode !== 'none' && options.selection.commitment === 'followActive'
      ? { selectedRowIds: [rowId], selectionAnchorId: rowId }
      : {}),
  };
  return withGridScroll({ ...state, interaction }, rowId, options.collection, options.pageSize);
}

function withActiveCell<TRow>(
  state: DataGridPresentation,
  cell: DataGridCell,
  options: DataGridReducerOptions<TRow>,
): DataGridPresentation {
  if (state.interaction.kind !== 'cell') return state;
  const interaction: DataGridInteraction = {
    ...state.interaction,
    activeCell: cell,
    ...(options.selection.mode !== 'none' && options.selection.commitment === 'followActive'
      ? { selectedCells: [cell], selectionAnchor: cell }
      : {}),
  };
  return withGridScroll({ ...state, interaction }, cell.rowId, options.collection, options.pageSize);
}

function commitGridSelection<TRow>(
  state: DataGridPresentation,
  options: DataGridReducerOptions<TRow>,
  extend: boolean,
  toggle: boolean,
): DataGridPresentation {
  if (options.selection.mode === 'none') return state;
  if (state.interaction.kind === 'row') {
    const active = state.interaction.activeRowId;
    if (active === undefined) return state;
    const selectedRowIds = selectedIds(
      state.interaction.selectedRowIds,
      active,
      state.interaction.selectionAnchorId,
      collectionIds(options.collection),
      options.selection,
      extend,
      toggle,
    );
    return {
      ...state,
      interaction: { ...state.interaction, selectedRowIds, selectionAnchorId: active },
    };
  }
  const active = state.interaction.activeCell;
  if (active === undefined) return state;
  const selectedCells = selectedGridCells(
    state.interaction.selectedCells,
    active,
    state.interaction.selectionAnchor,
    options,
    extend,
    toggle,
  );
  return {
    ...state,
    interaction: {
      ...state.interaction,
      selectedCells,
      selectionAnchor: active,
    },
  };
}

function selectedGridCells<TRow>(
  current: readonly DataGridCell[],
  active: DataGridCell,
  anchor: DataGridCell | undefined,
  options: DataGridReducerOptions<TRow>,
  extend: boolean,
  toggle: boolean,
): readonly DataGridCell[] {
  if (options.selection.mode !== 'multiple') return options.selection.mode === 'single' ? [active] : [];
  if (extend && options.selection.range && anchor !== undefined) {
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
  policy: SelectionPolicy,
  extend: boolean,
  toggle: boolean,
): readonly string[] {
  if (policy.mode !== 'multiple') return policy.mode === 'single' ? [active] : [];
  if (extend && policy.range && anchor !== undefined) {
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
  state: DataGridPresentation,
  rowId: string,
  collection: TableCollection<TRow>,
  pageSize: number | undefined,
): DataGridPresentation {
  if (state.scroll === undefined) return state;
  const row = collectionRecordById(collection, rowId);
  if (row === undefined) return state;
  return { ...state, scroll: scrollReducer(
    state.scroll,
    { kind: 'itemIntoView', itemIndex: row.itemIndex, alignment: 'nearest' },
    {
      contentRows: collection.totalCount,
      contentColumns: 0,
      viewportRows: Math.max(1, pageSize ?? 1),
      viewportColumns: 0,
    },
  ) };
}

function validCell(cell: DataGridCell, rowIds: readonly string[], columnIds: readonly string[]): boolean {
  return rowIds.includes(cell.rowId) && columnIds.includes(cell.columnId);
}

function cellKey(cell: DataGridCell): string {
  return `${cell.rowId}\u0000${cell.columnId}`;
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
  return Object.freeze({ ...current, [columnId]: Math.max(minimum, Math.floor(width)) });
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
