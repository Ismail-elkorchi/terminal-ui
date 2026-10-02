import { resolveControlKeymap, type ControlKeymap } from '../../interaction/control-keymap.ts';
import { createDataGridKeymap, type DataGridKeyAction } from '../keymaps.ts';
const defaultDataGridKeymap = createDataGridKeymap();
import type {
  DataGridActivateEvent,
  DataGridCell,
  DataGridState,
  DataGridTransition,
  TableState,
} from '../../behavior/table.ts';
import type { CollectionItem, CollectionSnapshot } from '../../collection/snapshot.ts';
import { isCollectionSnapshot } from '../../collection/snapshot.ts';
import type { ComponentMessage } from '../../component/message.ts';
import {
  decodeComponentScrollbarOptions,
  decodeComponentScrollPolicy,
  decodeComponentScrollState,
} from '../../component/scrollbar.ts';
import {
  assertOptionalEnum,
  isNonArrayObject,
  isStringMember,
  nonNegativeSafeInteger as nonNegative,
} from '../../foundation/validation.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import { sanitizeTerminalText } from '../../text/sanitize.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import {
  inlineContentAccessibleText,
  normalizeInlineContent,
  tryNormalizeInlineContent,
} from '../../visual/inline-content.ts';
import { maximumModelDependencySlots, ownModelDependencies } from '../../visual/model-dependencies.ts';
import { sameTerminalStyle, type TerminalStyle } from '../../visual/render-content.ts';
import { decodeTerminalStyle } from '../../visual/terminal-style.ts';
import type { TableColumn, TableColumnWidth } from './column.ts';
import type { DataGridOptions, TableOptions } from './options.ts';


export interface TableColumnModel {
  readonly id: string;
  readonly index: number;
  readonly header: string;
  readonly align: 'start' | 'center' | 'end';
  readonly semantic: 'text' | 'metric' | 'metadata';
  readonly sortable: boolean;
  readonly resizable: boolean;
  readonly width?: TableColumnWidth;
  readonly style?: TerminalStyle;
  readonly headerStyle?: TerminalStyle;
  readonly cell: (row: unknown, rowIndex: number, columnIndex: number) => TableCellModel;
}

interface TableControlModel {
  readonly interactionKind?: 'row' | 'cell';
  readonly selectionMode?: 'none' | 'single' | 'multiple';
  readonly activeRowId?: string;
  readonly activeColumnId?: string;
  readonly selectedRowIds: readonly string[];
  readonly selectedCells: readonly DataGridCell[];
  readonly sort?: { readonly columnId: string; readonly direction: 'ascending' | 'descending' };
  readonly columnWidths: Readonly<Record<string, number>>;
  readonly scroll?: ScrollState;
}

export interface TableRowModel {
  readonly id: string;
  readonly rowIndex: number;
  readonly cells: readonly TableCellModel[];
}

interface TableCellModel {
  readonly content: InlineContent;
  readonly text: string;
}

export interface TableModel {
  readonly keymap: ControlKeymap<DataGridKeyAction>;
  readonly semanticRole: 'table' | 'grid';
  readonly columns: readonly TableColumnModel[];
  readonly hasHeader: boolean;
  readonly source: Readonly<Record<string, never>>;
  readonly startIndex: number;
  readonly totalCount: number;
  readonly interactionKind?: 'row' | 'cell';
  readonly selectionMode?: 'none' | 'single' | 'multiple';
  readonly activeRowId?: string;
  readonly activeColumnId?: string;
  readonly selectedRowIds: readonly string[];
  readonly selectedCells: readonly DataGridCell[];
  readonly sort?: { readonly columnId: string; readonly direction: 'ascending' | 'descending' };
  readonly columnWidths: Readonly<Record<string, number>>;
  readonly density: 'compact' | 'regular';
  readonly stickyHeader: boolean;
  readonly emptyText: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

export interface TableRenderSource {
  readonly rows: readonly unknown[];
  readonly ids: readonly string[];
  readonly indexes: ReadonlyMap<string, number>;
  readonly columns: readonly TableColumnModel[];
  readonly rowModels: Map<number, TableRowModel>;
}

const noSelectedRows: readonly string[] = Object.freeze([]);
const noSelectedCells: readonly DataGridCell[] = Object.freeze([]);
// Selection is decoded once per model. Paint and accessibility share these
// private indexes instead of scanning large selections for every visible row.
const selectedRowsByIds = new WeakMap<readonly string[], ReadonlySet<string>>();
const selectedColumnsByCells = new WeakMap<readonly DataGridCell[], ReadonlyMap<string, ReadonlySet<string>>>();

export function tableRowIsSelected(model: TableModel, rowId: string): boolean {
  return selectedRowsByIds.get(model.selectedRowIds)?.has(rowId) === true;
}

export function tableCellIsSelected(model: TableModel, rowId: string, columnId: string | undefined): boolean {
  return columnId !== undefined && selectedColumnsByCells.get(model.selectedCells)?.get(rowId)?.has(columnId) === true;
}

const tableSources = new WeakMap<object, TableRenderSource>();

const tableCollectionSources = new WeakMap<object, TableSource>();

const latestTableStructures = new WeakMap<object, TableModelResources>();

const inferredTableColumns = new WeakMap<object, readonly TableColumnModel[]>();

interface TableModelResources {
  readonly columns: readonly TableColumnModel[];
  readonly source: Readonly<Record<string, never>>;
}

export function createTableModel<TRow, TMessage extends ComponentMessage>(
  value: Readonly<TableOptions<TRow, TMessage> | DataGridOptions<TRow, ComponentMessage, ComponentMessage>>,
  semanticRole: 'table' | 'grid',
  passiveScroll?: ScrollState,
): TableModel {
  const source = tableSource<TRow, TMessage>(value);
  const structure = createTableStructure(value.columns, source);
  const columns = structure.columns;
  const state = decodeTableState(
    value.state,
    passiveScroll,
    semanticRole === 'grid' ? 'dataGrid' : 'table',
  );
  const scrollbar = decodeComponentScrollbarOptions(value.scrollbar, 'table scrollbar');
  const scrollPolicy = decodeComponentScrollPolicy(value.scrollPolicy, 'table scrollPolicy');
  if (
    state.scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)
  ) throw new TypeError('table scrollbar and scrollPolicy require scroll state.');
  if (semanticRole === 'grid') {
    validateDataGridState(state, columns);
  }
  const density = value.density;
  assertOptionalEnum(density, ['compact', 'regular'], 'table density');
  return {
    keymap: resolveControlKeymap('keymap' in value ? value.keymap : undefined, defaultDataGridKeymap),
    semanticRole,
    columns,
    hasHeader: columns.some((column) => column.header.length > 0),
    source: structure.source,
    startIndex: source.startIndex,
    totalCount: source.totalCount,
    ...(state.interactionKind === undefined ? {} : { interactionKind: state.interactionKind }),
    ...(state.selectionMode === undefined ? {} : { selectionMode: state.selectionMode }),
    ...(state.activeRowId === undefined ? {} : { activeRowId: state.activeRowId }),
    ...(state.activeColumnId === undefined ? {} : { activeColumnId: state.activeColumnId }),
    selectedRowIds: state.selectedRowIds,
    selectedCells: state.selectedCells,
    ...(state.sort === undefined ? {} : { sort: state.sort }),
    columnWidths: state.columnWidths,
    density: density ?? 'regular',
    stickyHeader: value.stickyHeader === undefined
      ? true
      : boolean(value.stickyHeader, 'table stickyHeader'),
    emptyText: text(value.emptyText, 'table emptyText') ?? 'No rows',
    ...(state.scroll === undefined ? {} : { scroll: state.scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
  };
}

const tablePaintDescriptor = Symbol('table paint');

/** Explicit visual slots: interaction callbacks and keymaps stay on the fresh model. */
export function ownTableModel(model: TableModel): Readonly<TableModel> {
  const stateSlots = model.selectedRowIds.length + model.selectedCells.length * 2;
  // The fixed prefix below has 26 slots. Large selections use per-visible-row paint retention.
  if (stateSlots + 26 > maximumModelDependencySlots) return Object.freeze(model);
  const widths: (string | number)[] = [];
  for (const id in model.columnWidths) {
    if (stateSlots + widths.length + 28 > maximumModelDependencySlots) return Object.freeze(model);
    widths.push(id, model.columnWidths[id] ?? 0);
  }
  const visual = [
    tablePaintDescriptor, model.source, model.columns, model.semanticRole, model.hasHeader,
    model.startIndex, model.totalCount, model.interactionKind, model.selectionMode,
    model.activeRowId, model.activeColumnId, model.density, model.stickyHeader, model.emptyText,
    model.sort?.columnId, model.sort?.direction,
    model.scroll !== undefined, model.scroll?.offsetRow, model.scroll?.offsetColumn, model.scroll?.followTail,
    model.scrollbar?.axis, model.scrollbar?.visible, model.scrollbar?.visualState,
    model.selectedRowIds.length, ...model.selectedRowIds,
    model.selectedCells.length, ...model.selectedCells.flatMap(cell => [cell.rowId, cell.columnId]),
    widths.length / 2, ...widths,
  ];
  // Selection and active-row changes affect contents, not allocation or the
  // focus rectangle. Intrinsic size depends on the complete column source.
  const geometry = [model.source, model.columns, model.semanticRole, model.totalCount,
    model.hasHeader, model.density, model.sort?.columnId, model.sort?.direction, ...widths];
  return ownModelDependencies(model, {
    paint: visual, measurement: geometry, layout: geometry, accessibility: visual,
  });
}

function validateDataGridState(
  state: TableControlModel,
  columns: readonly TableColumnModel[],
): void {
  if (state.selectionMode === 'none' &&
    (state.selectedRowIds.length > 0 || state.selectedCells.length > 0)) {
    throw new TypeError('dataGrid selection must be empty when selection mode is none.');
  }
  if (state.selectionMode === 'single' &&
    (state.selectedRowIds.length > 1 || state.selectedCells.length > 1)) {
    throw new TypeError('dataGrid single selection cannot contain multiple targets.');
  }
  const columnIds = new Set(columns.map((column) => column.id));
  if (state.activeColumnId !== undefined && !columnIds.has(state.activeColumnId)) {
    throw new TypeError('dataGrid active column is not present.');
  }
  if (state.selectedCells.some((cell) => !columnIds.has(cell.columnId))) {
    throw new TypeError('dataGrid selected cells must reference present columns.');
  }
}

function createTableStructure<TRow>(
  columns: readonly TableColumn<TRow>[] | undefined,
  source: TableSource<TRow>,
): TableModelResources {
  const columnModels = createTableColumnModels(columns, source);
  const previous = latestTableStructures.get(source);
  if (previous !== undefined && sameTableColumns(previous.columns, columnModels)) return previous;
  const sourceToken = Object.freeze({});
  tableSources.set(sourceToken, {
    rows: source.rows,
    ids: source.ids,
    indexes: source.indexes ?? new Map(
      source.ids.map((id, index) => [id, source.startIndex + index]),
    ),
    columns: columnModels,
    rowModels: new Map(),
  });
  const structure = Object.freeze({ columns: columnModels, source: sourceToken });
  latestTableStructures.set(source, structure);
  return structure;
}

interface TableSource<TRow = unknown> {
  readonly kind: 'raw' | 'complete' | 'window';
  readonly rows: readonly TRow[];
  readonly ids: readonly string[];
  readonly startIndex: number;
  readonly totalCount: number;
  readonly indexes?: ReadonlyMap<string, number>;
  readonly collection?: CollectionSnapshot<CollectionItem>;
}

function tableSource<TRow, TMessage extends ComponentMessage>(
  value: Readonly<TableOptions<TRow, TMessage> | DataGridOptions<TRow, ComponentMessage, ComponentMessage>>,
): TableSource<TRow> {
  if (value.collection !== undefined) {
    const collection = value.collection;
    if (!isCollectionSnapshot(collection)) {
      throw new TypeError('table collection must be model with createTableCollection().');
    }
    const cached = tableCollectionSources.get(collection) as TableSource<TRow> | undefined;
    if (cached !== undefined) return cached;
    const rows = Object.freeze(collection.items.map((item, index) =>
      tableCollectionRow(item, `table collection items[${String(index)}]`)
    ));
    const ids = Object.freeze(collection.items.map((item) => item.id));
    const model = Object.freeze({
      kind: collection.kind,
      rows,
      ids,
      startIndex: collection.startIndex,
      totalCount: collection.totalCount,
      indexes: new Map(ids.map((id, index) => [id, collection.startIndex + index])),
      collection,
    });
    tableCollectionSources.set(collection, model);
    return model;
  }
  const rows = Object.freeze([...value.rows]);
  const getRowId = value.getRowId;
  const ids = rows.map((row, index) =>
    nonEmpty(getRowId(row, index), `table row ${String(index)} id`)
  );
  assertUniqueIds(ids, 'table rows');
  return { kind: 'raw', rows, ids, startIndex: 0, totalCount: rows.length };
}

function tableCollectionRow<TRow>(
  item: CollectionItem & { readonly row: TRow },
  owner: string,
): TRow {
  if (!Object.hasOwn(item, 'row')) {
    throw new TypeError(`${owner} must contain a row.`);
  }
  return item.row;
}

function createTableColumnModels<TRow>(
  value: readonly TableColumn<TRow>[] | undefined,
  source: TableSource<TRow>,
): readonly TableColumnModel[] {
  if (value === undefined) {
    if (source.kind === 'window') {
      throw new TypeError('windowed table collections require explicit columns.');
    }
    const cached = source.collection === undefined
      ? undefined
      : inferredTableColumns.get(source.collection);
    if (cached !== undefined) return cached;
    const count = source.rows.reduce<number>((maximum, row) => Math.max(maximum, rowCells(row).length), 0);
    const columns: readonly TableColumn<TRow>[] = Array.from(
      { length: count },
      (_unused, index) =>
        Object.freeze({
          id: `column-${String(index)}`,
          value: (row: TRow) => rowCells(row)[index],
        }),
    );
    const inferred = Object.freeze(columns.map((column, index): TableColumnModel =>
      Object.freeze({
        id: nonEmpty(column.id, 'inferred table column id'),
        index,
        header: '',
        align: 'start',
        semantic: 'text',
        sortable: false,
        resizable: false,
        cell: compiledTableCell(column),
      })
    ));
    if (source.collection !== undefined) inferredTableColumns.set(source.collection, inferred);
    return inferred;
  }
  const visible = value.flatMap((column, index) =>
    column.hidden === true ? [] : [{ column, index }]
  );
  const models = visible.map(({ column, index }): TableColumnModel => {
    const id = nonEmpty(column.id, `table columns[${String(index)}].id`);
    const header = text(column.header, `table column ${id} header`) ?? '';
    if (typeof column.value !== 'function') {
      throw new TypeError(`table column "${id}" requires value().`);
    }
    if ('renderCell' in column && typeof column.renderCell !== 'function') {
      throw new TypeError(`table column "${id}" renderCell must be a function.`);
    }
    const align = column.align;
    assertOptionalEnum(align, ['start', 'center', 'end'], `table column "${id}" align`);
    const semantic = column.semantic;
    assertOptionalEnum(semantic, ['text', 'metric', 'metadata'], `table column "${id}" semantic`);
    const width = decodeTableColumnWidth(column.width, `table column "${id}" width`);
    return Object.freeze({
      id,
      index,
      header,
      align: align ?? 'start',
      semantic: semantic ?? (align === 'end' ? 'metric' : 'text'),
      sortable: boolean(column.sortable, `table column "${id}" sortable`),
      resizable: boolean(column.resizable, `table column "${id}" resizable`),
      ...(width === undefined ? {} : { width }),
      ...(column.style === undefined
        ? {}
        : { style: decodeTerminalStyle(column.style, `table column "${id}" style`) }),
      ...(column.headerStyle === undefined ? {} : {
        headerStyle: decodeTerminalStyle(
          column.headerStyle,
          `table column "${id}" headerStyle`,
        ),
      }),
      cell: compiledTableCell(column),
    });
  });
  assertUniqueIds(models.map((column) => column.id), 'table columns');
  return Object.freeze(models);
}

function sameTableColumns(a: readonly TableColumnModel[], b: readonly TableColumnModel[]): boolean {
  if (a === b) return true;
  if (a.length !== b.length) return false;
  for (let index = 0; index < a.length; index += 1) {
    const left = a[index];
    const right = b[index];
    if (left === undefined || right === undefined) return false;
    if (left.id !== right.id || left.index !== right.index || left.header !== right.header
      || left.align !== right.align || left.semantic !== right.semantic || left.sortable !== right.sortable
      || left.resizable !== right.resizable || left.cell !== right.cell
      || !sameColumnWidth(left.width, right.width)
      || !sameTerminalStyle(left.style, right.style) || !sameTerminalStyle(left.headerStyle, right.headerStyle)) return false;
  }
  return true;
}

function sameColumnWidth(a: TableColumnWidth | undefined, b: TableColumnWidth | undefined): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a.kind !== b.kind) return false;
  switch (a.kind) {
    case 'fixed': return b.kind === 'fixed' && a.cells === b.cells;
    case 'percent': return b.kind === 'percent' && a.value === b.value;
    case 'fill': return b.kind === 'fill' && a.weight === b.weight;
    case 'content': return b.kind === 'content' && a.min === b.min && a.max === b.max;
  }
}

const compiledCells = new WeakMap<object, { plain?: TableColumnModel['cell']; readonly rendered: WeakMap<object, TableColumnModel['cell']> }>();
function compiledTableCell<TRow>(column: TableColumn<TRow>): TableColumnModel['cell'] {
  const value = column.value;
  const renderCell = 'renderCell' in column ? column.renderCell : undefined;
  let byRender = compiledCells.get(value);
  if (byRender === undefined) { byRender = { rendered: new WeakMap() }; compiledCells.set(value, byRender); }
  const previous = renderCell === undefined ? byRender.plain : byRender.rendered.get(renderCell);
  if (previous !== undefined) return previous;
  // Capture callbacks rather than retaining the caller's mutable column wrapper.
  const owned = { value, ...(renderCell === undefined ? {} : { renderCell }) };
  const cell: TableColumnModel['cell'] = (row, rowIndex, columnIndex) => tableCell(owned, row as TRow, rowIndex, columnIndex);
  if (renderCell === undefined) byRender.plain = cell;
  else byRender.rendered.set(renderCell, cell);
  return cell;
}

function decodeTableColumnWidth(
  value: TableColumnWidth | undefined,
  owner: string,
): TableColumnWidth | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return positive(value, owner);
  switch (value.kind) {
    case 'fixed': {
      return Object.freeze({ kind: 'fixed', cells: positive(value.cells, `${owner}.cells`) });
    }
    case 'percent': {
      const percentage = finite(value.value, `${owner}.value`);
      if (percentage <= 0 || percentage > 100) {
        throw new RangeError(`${owner}.value must be greater than zero and at most 100.`);
      }
      return Object.freeze({ kind: 'percent', value: percentage });
    }
    case 'fill': {
      const weight = value.weight === undefined
        ? undefined
        : finite(value.weight, `${owner}.weight`);
      if (weight !== undefined && weight <= 0) {
        throw new RangeError(`${owner}.weight must be positive.`);
      }
      return Object.freeze({ kind: 'fill', ...(weight === undefined ? {} : { weight }) });
    }
    case 'content': {
      const min = value.min === undefined
        ? undefined
        : nonNegative(value.min, `${owner}.min`);
      const max = value.max === undefined
        ? undefined
        : nonNegative(value.max, `${owner}.max`);
      if (min !== undefined && max !== undefined && min > max) {
        throw new RangeError(`${owner}.min must not exceed max.`);
      }
      return Object.freeze({
        kind: 'content',
        ...(min === undefined ? {} : { min }),
        ...(max === undefined ? {} : { max }),
      });
    }
    default:
      throw new TypeError(`${owner}.kind is invalid.`);
  }
}

function rowCells(row: unknown): readonly unknown[] {
  return Array.isArray(row) ? row : [row];
}

function tableCell<TRow>(
  column: { readonly value: TableColumn<TRow>['value']; readonly renderCell?: (row: TRow, rowIndex: number, columnIndex: number) => string | import('../../visual/inline-content.ts').InlineContentSegment | InlineContent } | undefined,
  row: TRow,
  rowIndex: number,
  columnIndex: number,
): TableCellModel {
  if (column === undefined || typeof column.value !== 'function') {
    return { content: Object.freeze([]), text: '' };
  }
  let content: InlineContent;
  if ('renderCell' in column && typeof column.renderCell === 'function') {
    const rendered = column.renderCell(row, rowIndex, columnIndex);
    content = typeof rendered === 'string'
      ? normalizeInlineContent([{ kind: 'text', text: rendered }])
      : normalizeInlineContent(Array.isArray(rendered) ? rendered : [rendered]);
    return Object.freeze({ content, text: inlineContentAccessibleText(content) });
  }
  const rendered = column.value(row, rowIndex);
  if (typeof rendered === 'string') {
    content = normalizeInlineContent([{ kind: 'text', text: rendered }]);
  } else if (Array.isArray(rendered)) {
    content = tryNormalizeInlineContent(rendered) ?? Object.freeze([]);
  } else if (typeof rendered === 'object' && rendered !== null) {
    content = tryNormalizeInlineContent([rendered]) ?? Object.freeze([]);
  } else if (
    typeof rendered === 'number' || typeof rendered === 'bigint' || typeof rendered === 'boolean'
  ) {
    content = normalizeInlineContent([{ kind: 'text', text: String(rendered) }]);
  } else {
    content = Object.freeze([]);
  }
  return Object.freeze({ content, text: inlineContentAccessibleText(content) });
}

function decodeTableState(
  value: TableState | DataGridState | null | undefined,
  tableScroll?: ScrollState,
  owner: 'table' | 'dataGrid' = 'table',
): TableControlModel {
  if (value === undefined) {
    const scroll = decodeComponentScrollState(tableScroll, 'table scroll');
    return {
      selectedRowIds: noSelectedRows,
      selectedCells: noSelectedCells,
      columnWidths: Object.freeze({}),
      ...(scroll === undefined ? {} : { scroll }),
    };
  }
  if (value === null) throw new TypeError(`${owner} state must be an object.`);
  const grid = 'interaction' in value ? value : undefined;
  const interaction = decodeTableInteraction(grid?.interaction);
  const sort = decodeTableSort(value.sort);
  const columnWidths = decodeTableColumnWidths(value.columnWidths);
  const scroll = decodeComponentScrollState(grid?.scroll ?? tableScroll, 'table scroll');
  return {
    ...interaction,
    ...(sort === undefined ? {} : { sort }),
    columnWidths,
    ...(scroll === undefined ? {} : { scroll }),
  };
}

function decodeTableInteraction(
  interaction: DataGridState['interaction'] | undefined,
): Pick<
  TableControlModel,
  'interactionKind' | 'selectionMode' | 'activeRowId' | 'activeColumnId' | 'selectedRowIds' | 'selectedCells'
> {
  if (interaction === undefined) {
    return { selectedRowIds: noSelectedRows, selectedCells: noSelectedCells };
  }
  const selectionMode = interaction.selection.mode;
  if (!isStringMember(selectionMode, ['none', 'single', 'multiple'])) {
    throw new TypeError('dataGrid selectionMode is invalid.');
  }
  const active = decodeTableActiveItem(interaction);
  const selection = decodeTableSelection(interaction);
  return { interactionKind: interaction.kind, selectionMode, ...active, ...selection };
}

function decodeTableActiveItem(
  interaction: DataGridState['interaction'],
): Pick<TableControlModel, 'activeRowId' | 'activeColumnId'> {
  if (interaction.kind === 'row') {
    const activeRowId = decodeOptionalId(interaction.activeRowId, 'dataGrid activeRowId');
    return activeRowId === undefined ? {} : { activeRowId };
  }
  if (interaction.activeCell === undefined) return {};
  return {
    activeRowId: nonEmpty(interaction.activeCell.rowId, 'dataGrid activeCell.rowId'),
    activeColumnId: nonEmpty(interaction.activeCell.columnId, 'dataGrid activeCell.columnId'),
  };
}

function decodeTableSelection(
  interaction: DataGridState['interaction'],
): Pick<TableControlModel, 'selectedRowIds' | 'selectedCells'> {
  if (interaction.kind === 'row') {
    return {
      selectedRowIds: decodeRowSelection(interaction.selection),
      selectedCells: noSelectedCells,
    };
  }
  return {
    selectedRowIds: noSelectedRows,
    selectedCells: decodeCellSelection(interaction.selection),
  };
}

function decodeRowSelection(
  selection: Extract<DataGridState['interaction'], { readonly kind: 'row' }>['selection'],
): readonly string[] {
  if (selection.mode === 'multiple') return decodeUniqueIds(selection.selectedRowIds, 'dataGrid selectedRowIds');
  if (selection.mode === 'single' && selection.selectedRowId !== undefined) {
    const ids = Object.freeze([nonEmpty(selection.selectedRowId, 'dataGrid selectedRowId')]);
    selectedRowsByIds.set(ids, new Set(ids));
    return ids;
  }
  return noSelectedRows;
}

function decodeCellSelection(
  selection: Extract<DataGridState['interaction'], { readonly kind: 'cell' }>['selection'],
): readonly DataGridCell[] {
  if (selection.mode === 'multiple') return decodeGridCells(selection.selectedCells, 'dataGrid selectedCells');
  if (selection.mode === 'single' && selection.selectedCell !== undefined) {
    return decodeGridCells([selection.selectedCell], 'dataGrid selectedCell');
  }
  return noSelectedCells;
}

function decodeTableSort(value: TableState['sort']): TableControlModel['sort'] {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value) || !isStringMember(value.direction, ['ascending', 'descending'])) {
    throw new TypeError('table sort is invalid.');
  }
  return {
    columnId: nonEmpty(value.columnId, 'table sort columnId'),
    direction: value.direction,
  };
}

function decodeTableColumnWidths(value: TableState['columnWidths']): Readonly<Record<string, number>> {
  if (value !== undefined && !isNonArrayObject(value)) {
    throw new TypeError('table columnWidths must be an object.');
  }
  return Object.freeze(Object.fromEntries(Object.entries(value ?? {}).map(([id, width]) => [
    nonEmpty(id, 'table columnWidths id'),
    positive(width, `table columnWidths.${id}`),
  ])));
}

function decodeOptionalId(value: string | undefined, owner: string): string | undefined {
  return value === undefined ? undefined : nonEmpty(value, owner);
}

function decodeUniqueIds(value: readonly string[], owner: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${owner} must be an array.`);
  if (value.length === 0) return noSelectedRows;
  const ids = Object.freeze(value.map((id, index) => nonEmpty(id, `${owner}[${String(index)}]`)));
  const selected = new Set(ids);
  if (selected.size !== ids.length) throw new TypeError(`${owner} must contain unique ids.`);
  selectedRowsByIds.set(ids, selected);
  return ids;
}

function decodeGridCells(value: readonly DataGridCell[], owner: string): readonly DataGridCell[] {
  if (!Array.isArray(value)) throw new TypeError(`${owner} must be an array.`);
  if (value.length === 0) return noSelectedCells;
  const keys = new Set<string>();
  const columnsByRow = new Map<string, Set<string>>();
  const cells = Object.freeze(value.map((cell, index) => {
    if (!isNonArrayObject(cell)) throw new TypeError(`${owner}[${String(index)}] must be an object.`);
    const model = Object.freeze({
      rowId: nonEmpty(cell['rowId'], `${owner}[${String(index)}].rowId`),
      columnId: nonEmpty(cell['columnId'], `${owner}[${String(index)}].columnId`),
    });
    const key = `${model.rowId}\u0000${model.columnId}`;
    if (keys.has(key)) throw new TypeError(`${owner} must contain unique cells.`);
    keys.add(key);
    const columns = columnsByRow.get(model.rowId) ?? new Set<string>();
    columns.add(model.columnId);
    columnsByRow.set(model.rowId, columns);
    return model;
  }));
  selectedColumnsByCells.set(cells, columnsByRow);
  return cells;
}

export function activeTablePosition(
  model: TableModel,
): { readonly id: string; readonly rowIndex: number } | undefined {
  if (model.activeRowId === undefined) return undefined;
  const source = tableSourceFor(model);
  const rowIndex = source.indexes.get(model.activeRowId);
  return rowIndex === undefined ? undefined : { id: model.activeRowId, rowIndex };
}

export function tableSourceFor(model: TableModel): TableRenderSource {
  const source = tableSources.get(model.source);
  if (source === undefined) throw new TypeError('table render source is unavailable.');
  return source;
}

export function tableRowModel(model: TableModel, localIndex: number): TableRowModel {
  const source = tableSourceFor(model);
  const cached = source.rowModels.get(localIndex);
  if (cached !== undefined) return cached;
  const row = source.rows[localIndex];
  const id = source.ids[localIndex];
  if (row === undefined || id === undefined) {
    throw new RangeError('table row index is outside the table source.');
  }
  const rowIndex = model.startIndex + localIndex;
  const rowModel = Object.freeze({
    id,
    rowIndex,
    cells: Object.freeze(
      source.columns.map((column, columnIndex) => column.cell(row, rowIndex, columnIndex)),
    ),
  });
  source.rowModels.set(localIndex, rowModel);
  return rowModel;
}

function text(value: unknown, owner: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${owner} must be a string.`);
  return sanitizeTerminalText(value).text;
}

function nonEmpty(value: unknown, owner: string): string {
  const result = text(value, owner);
  if (result === undefined || result.trim() === '') {
    throw new TypeError(`${owner} must be non-empty.`);
  }
  return result;
}

function boolean(value: unknown, owner: string): boolean {
  if (value === undefined) return false;
  if (typeof value !== 'boolean') throw new TypeError(`${owner} must be a boolean.`);
  return value;
}

function positive(value: unknown, owner: string): number {
  const number = nonNegative(value, owner);
  if (number < 1) throw new RangeError(`${owner} must be positive.`);
  return number;
}

function finite(value: unknown, owner: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new RangeError(`${owner} must be finite.`);
  }
  return value;
}

function assertUniqueIds(ids: readonly string[], owner: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new TypeError(`${owner} contains duplicate id "${id}".`);
    seen.add(id);
  }
}

export type DataGridComponentAction =
  | { readonly kind: 'transition'; readonly transition: DataGridTransition }
  | { readonly kind: 'activate'; readonly event: DataGridActivateEvent };
