import {
  clipRenderSpans,
  componentScrollbarHitTargets,
  defineComponent,
  ignoreMessage,
  measureRenderSpans,
  paintComponentScrollbar,
  prepareComponentScrollbar,
  prepareComponentScrollbarOptions,
  prepareComponentScrollPolicy,
  prepareComponentScrollState,
  prepareTerminalStyle,
  span,
} from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentInput,
  ComponentMeasureInput,
  ComponentRenderInput,
} from '../../component/index.ts';
import type { HitTarget } from '../../component/index.ts';
import type { Element } from '../../element/index.ts';
import { dataWindow, isCollectionProjection, prepareTreeCollection } from '../../behavior/index.ts';
import type { CollectionProjection, CollectionRecord } from '../../behavior/index.ts';
import {
  assertOptionalCallback,
  assertOptionalEnum,
  assertRequiredCallback,
  isNonArrayObject,
  isStringMember,
} from '../../foundation/validation.ts';
import {
  pointerVisualState,
  preparePointerInteractionState,
  type PointerInteractionState,
} from '../../interaction/pointer-interaction.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import { terminalStyleHasBackground } from '../../theme/index.ts';
import type {
  DataGridActivateEvent,
  DataGridCell,
  DataGridPresentation,
  DataGridTransition,
  TablePresentation,
} from '../../ui-model/table.ts';
import type {
  TreeActivateEvent,
  TreeTransition,
} from '../../ui-model/tree.ts';
import type {
  TreeCollectionRecord,
  TreeLoadState,
  TreeNode,
  TreeVisibleRow,
} from '../../ui-model/tree.ts';
import { ownSelectionState, type SelectionState } from '../../interaction/collection.ts';
import type { PointerInteractionAction } from '../../interaction/pointer-interaction.ts';
import type { TableColumn, TableColumnWidth } from '../../ui-model/content.ts';
import type { TableStylePart, TreeStylePart } from '../../ui-model/style-parts.ts';
import { matchNormalizedCollectionQuery, normalizeCollectionQuery } from '../../ui-model/query.ts';
import {
  inlineContentAccessibleText,
  inlineSegmentText,
  normalizeInlineContent,
  tryNormalizeInlineContent,
} from '../../visual/inline-content.ts';
import type { InlineContent } from '../../visual/inline-content.ts';
import type { TerminalStyle } from '../../visual/render.ts';
import type {
  DataGridOptions,
  UnscrolledDataGridOptions,
  ScrollableDataGridOptions,
  UnscrolledTreeOptions,
  ScrollableTreeOptions,
  TableOptions,
  TreeOptions,
} from '../options/content.ts';

interface PreparedTableColumn {
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
  readonly cell: (row: unknown, rowIndex: number, columnIndex: number) => PreparedTableCell;
}

interface PreparedTablePresentation {
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

interface PreparedTableRow {
  readonly id: string;
  readonly rowIndex: number;
  readonly cells: readonly PreparedTableCell[];
}

interface PreparedTableCell {
  readonly content: InlineContent;
  readonly text: string;
}

interface TableModel {
  readonly semanticRole: 'table' | 'grid';
  readonly columns: readonly PreparedTableColumn[];
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
  readonly pointerState?: PointerInteractionState;
}

interface PreparedTableSource {
  readonly rows: readonly unknown[];
  readonly ids: readonly string[];
  readonly indexes: ReadonlyMap<string, number>;
  readonly columns: readonly PreparedTableColumn[];
  readonly preparedRows: Map<number, PreparedTableRow>;
}

const tableSources = new WeakMap<object, PreparedTableSource>();
const tableCollectionSources = new WeakMap<object, TableSource>();

interface TablePreparation {
  readonly columns: readonly PreparedTableColumn[];
  readonly source: Readonly<Record<string, never>>;
}

const tableBase = {
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  accessibleRole: 'table' as const,
  metadata: ['layer', 'styles'] as const,
  parts: [
    'header',
    'headerCell',
    'sortIndicator',
    'marker',
    'row',
    'cell',
    'metric',
    'metadata',
    'empty',
    'scrollbar',
  ] as const,
  measure: measureTable,
  render: paintTable,
  accessibility: tableAccessibility,
};

const passiveTable = defineComponent<
  TableModel,
  TableModel,
  never,
  TableStylePart,
  readonly [],
  'required',
  readonly ['layer', 'styles']
>({ ...tableBase, name: 'terminal-ui/components/table' });

type DataGridComponentAction =
  | { readonly kind: 'transition'; readonly transition: DataGridTransition }
  | { readonly kind: 'activate'; readonly event: DataGridActivateEvent }
  | { readonly kind: 'pointer'; readonly action: PointerInteractionAction };

const scrollableTable = defineComponent<
  TableModel,
  TableModel,
  { readonly kind: 'scroll'; readonly event: import('../../interaction/scroll.ts').ScrollEvent },
  TableStylePart,
  readonly [],
  'required',
  readonly ['layer', 'styles']
>({
  ...tableBase,
  name: 'terminal-ui/components/table',
  hitTargets: tableScrollHitTargets,
});

const activeDataGrid = defineComponent<
  TableModel,
  TableModel,
  DataGridComponentAction,
  TableStylePart,
  readonly ['disabled', 'busy', 'readOnly', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  ...tableBase,
  name: 'terminal-ui/components/data-grid',
  accessibleRole: 'grid',
  metadata: ['focus', 'layer', 'styles'],
  states: ['disabled', 'busy', 'readOnly', 'inert'],
  keys: ({ model, busy, readOnly }) => {
    if (busy) return {};
    const active = activeTablePosition(model);
    const column = model.columns.find((candidate) => candidate.id === model.activeColumnId);
    const transition = (value: DataGridTransition): DataGridComponentAction => ({
      kind: 'transition',
      transition: value,
    });
    return {
      arrowUp: () => transition({ kind: 'moveRow', delta: -1 }),
      arrowDown: () => transition({ kind: 'moveRow', delta: 1 }),
      ...(model.interactionKind === 'cell'
        ? {
          arrowLeft: () => transition({ kind: 'moveColumn', delta: -1 }),
          arrowRight: () => transition({ kind: 'moveColumn', delta: 1 }),
        }
        : {}),
      pageUp: () => transition({ kind: 'page', delta: -1 }),
      pageDown: () => transition({ kind: 'page', delta: 1 }),
      home: () => transition({ kind: 'firstRow' }),
      end: () => transition({ kind: 'lastRow' }),
      ...(readOnly ? {} : { space: () => transition({ kind: 'commit' }) }),
      ...(readOnly || (column?.sortable !== true && column?.resizable !== true)
        ? {}
        : { triggers: [
          ...(column.sortable ? [{
            trigger: { kind: 'key' as const, key: 's' as const, modifiers: { alt: true } },
            onKey: () => transition({ kind: 'sortBy', columnId: column.id }),
          }] : []),
          ...(column.resizable ? [
            {
              trigger: {
                kind: 'key' as const,
                key: 'arrowLeft' as const,
                modifiers: { alt: true },
              },
              onKey: () => transition({ kind: 'resizeColumnBy', columnId: column.id, delta: -1 }),
            },
            {
              trigger: {
                kind: 'key' as const,
                key: 'arrowRight' as const,
                modifiers: { alt: true },
              },
              onKey: () => transition({ kind: 'resizeColumnBy', columnId: column.id, delta: 1 }),
            },
          ] : []),
        ] }),
      ...(readOnly || active === undefined ? {} : {
        enter: () => ({
          kind: 'activate' as const,
          event: model.interactionKind === 'cell' && model.activeColumnId !== undefined
            ? { kind: 'activate', target: { kind: 'cell', cell: { rowId: active.id, columnId: model.activeColumnId } } }
            : { kind: 'activate', target: { kind: 'row', rowId: active.id } },
        }),
      }),
    };
  },
  pointer: { state: ({ model }) => model.pointerState, onAction: (action) => ({ kind: 'pointer', action }) },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: tableHitTargets,
});

export function table<TRow, const TMessage extends ComponentMessage = never>(
  options: TableOptions<TRow, TMessage>,
): Element<TMessage> {
  const prepared = prepareTable(options, 'table', options.scroll?.state, false);
  const componentOptions = {
    ...prepared,
    id: options.id,
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  const scroll = options.scroll;
  if (scroll !== undefined) {
    assertRequiredCallback(scroll.onTransition, 'table scroll.onTransition');
  }
  return scroll === undefined
    ? passiveTable(componentOptions)
    : scrollableTable({
      ...componentOptions,
      onAction: (action) => scroll.onTransition(action.event),
    });
}

/* eslint-disable @typescript-eslint/unified-signatures -- overloads preserve the unscrolled transition union */
export function dataGrid<
  TRow,
  const TTransitionMessage extends ComponentMessage = never,
  const TActivateMessage extends ComponentMessage = never,
  const TPointerMessage extends ComponentMessage = never,
>(options: ScrollableDataGridOptions<TRow, TTransitionMessage, TActivateMessage, TPointerMessage>): Element<TTransitionMessage | TActivateMessage | TPointerMessage>;
export function dataGrid<
  TRow,
  const TTransitionMessage extends ComponentMessage = never,
  const TActivateMessage extends ComponentMessage = never,
  const TPointerMessage extends ComponentMessage = never,
>(options: UnscrolledDataGridOptions<TRow, TTransitionMessage, TActivateMessage, TPointerMessage>): Element<TTransitionMessage | TActivateMessage | TPointerMessage>;
/* eslint-enable @typescript-eslint/unified-signatures */
export function dataGrid<
  TRow,
  const TTransitionMessage extends ComponentMessage = never,
  const TActivateMessage extends ComponentMessage = never,
  const TPointerMessage extends ComponentMessage = never,
>(
  options: DataGridOptions<TRow, TTransitionMessage, TActivateMessage, TPointerMessage>,
): Element<TTransitionMessage | TActivateMessage | TPointerMessage> {
  const prepared = prepareTable(
    options,
    'grid',
    undefined,
    options.disabled !== true && options.inert !== true,
  );
  const shared = {
    ...prepared,
    id: options.id,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  if (options.disabled === true) return activeDataGrid({
    ...shared,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
  });
  if (options.inert === true) return activeDataGrid({ ...shared, inert: true });
  assertRequiredCallback(options.onTransition, 'dataGrid onTransition');
  assertOptionalCallback(options.onActivate, 'dataGrid onActivate');
  assertOptionalCallback(options.onPointerAction, 'dataGrid onPointerAction');
  const onTransition = isScrollableDataGrid(options)
    ? (transition: DataGridTransition) => options.onTransition(transition)
    : (transition: DataGridTransition) => transition.kind === 'scroll'
      ? ignoreMessage()
      : options.onTransition(transition);
  return activeDataGrid({
    ...shared,
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    onAction: (action) => {
      if (action.kind === 'transition') return onTransition(action.transition);
      if (action.kind === 'activate') return options.onActivate?.(action.event) ?? ignoreMessage();
      return options.onPointerAction?.(action.action) ?? ignoreMessage();
    },
  });
}

function isScrollableDataGrid<
  TRow,
  TTransitionMessage extends ComponentMessage,
  TActivateMessage extends ComponentMessage,
  TPointerMessage extends ComponentMessage,
>(
  options: DataGridOptions<TRow, TTransitionMessage, TActivateMessage, TPointerMessage>,
): options is ScrollableDataGridOptions<TRow, TTransitionMessage, TActivateMessage, TPointerMessage> {
  return options.presentation.scroll !== undefined;
}

function prepareTable<TRow, TMessage extends ComponentMessage>(
  value: Readonly<TableOptions<TRow, TMessage> | DataGridOptions<TRow, ComponentMessage, ComponentMessage, ComponentMessage>>,
  semanticRole: 'table' | 'grid',
  passiveScroll?: ScrollState,
  pointerAvailable = true,
): TableModel {
  const source = tableSource(value);
  const preparation = prepareTableStructure(value.columns, source);
  const columns = preparation.columns;
  const presentation = prepareTablePresentation(
    value.presentation,
    passiveScroll,
    semanticRole === 'grid' ? 'dataGrid' : 'table',
  );
  const scrollbar = prepareComponentScrollbarOptions(value.scrollbar, 'table scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(value.scrollPolicy, 'table scrollPolicy');
  if (
    presentation.scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)
  ) throw new TypeError('table scrollbar and scrollPolicy require scroll state.');
  const pointerState = preparePointerInteractionState(
    'pointerState' in value ? value.pointerState : undefined,
    'dataGrid pointerState',
    pointerAvailable,
  );
  if (semanticRole === 'grid') {
    validateDataGridPresentation(presentation, columns);
  }
  const density = value.density;
  assertOptionalEnum(density, ['compact', 'regular'], 'table density');
  return {
    semanticRole,
    columns,
    hasHeader: columns.some((column) => column.header.length > 0),
    source: preparation.source,
    startIndex: source.startIndex,
    totalCount: source.totalCount,
    ...(presentation.interactionKind === undefined ? {} : { interactionKind: presentation.interactionKind }),
    ...(presentation.selectionMode === undefined ? {} : { selectionMode: presentation.selectionMode }),
    ...(presentation.activeRowId === undefined ? {} : { activeRowId: presentation.activeRowId }),
    ...(presentation.activeColumnId === undefined ? {} : { activeColumnId: presentation.activeColumnId }),
    selectedRowIds: presentation.selectedRowIds,
    selectedCells: presentation.selectedCells,
    ...(presentation.sort === undefined ? {} : { sort: presentation.sort }),
    columnWidths: presentation.columnWidths,
    density: density ?? 'regular',
    stickyHeader: value.stickyHeader === undefined
      ? true
      : boolean(value.stickyHeader, 'table stickyHeader'),
    emptyText: text(value.emptyText, 'table emptyText') ?? 'No rows',
    ...(presentation.scroll === undefined ? {} : { scroll: presentation.scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function validateDataGridPresentation(
  presentation: PreparedTablePresentation,
  columns: readonly PreparedTableColumn[],
): void {
  if (presentation.selectionMode === 'none' &&
    (presentation.selectedRowIds.length > 0 || presentation.selectedCells.length > 0)) {
    throw new TypeError('dataGrid selection must be empty when selection mode is none.');
  }
  if (presentation.selectionMode === 'single' &&
    (presentation.selectedRowIds.length > 1 || presentation.selectedCells.length > 1)) {
    throw new TypeError('dataGrid single selection cannot contain multiple targets.');
  }
  const columnIds = new Set(columns.map((column) => column.id));
  if (presentation.activeColumnId !== undefined && !columnIds.has(presentation.activeColumnId)) {
    throw new TypeError('dataGrid active column is not present.');
  }
  if (presentation.selectedCells.some((cell) => !columnIds.has(cell.columnId))) {
    throw new TypeError('dataGrid selected cells must reference present columns.');
  }
}

function prepareTableStructure<TRow>(
  columns: readonly TableColumn<TRow>[] | undefined,
  source: TableSource<TRow>,
): TablePreparation {
  const preparedColumns = prepareTableColumns(columns, source.rows);
  const sourceToken = Object.freeze({});
  tableSources.set(sourceToken, {
    rows: source.rows,
    ids: source.ids,
    indexes: source.indexes ?? new Map(
      source.ids.map((id, index) => [id, source.startIndex + index]),
    ),
    columns: preparedColumns,
    preparedRows: new Map(),
  });
  return Object.freeze({ columns: preparedColumns, source: sourceToken });
}

interface TableSource<TRow = unknown> {
  readonly rows: readonly TRow[];
  readonly ids: readonly string[];
  readonly startIndex: number;
  readonly totalCount: number;
  readonly indexes?: ReadonlyMap<string, number>;
}

function tableSource<TRow, TMessage extends ComponentMessage>(
  value: Readonly<TableOptions<TRow, TMessage> | DataGridOptions<TRow, ComponentMessage, ComponentMessage, ComponentMessage>>,
): TableSource<TRow> {
  if (value.collection !== undefined) {
    const collection = value.collection;
    if (!isCollectionProjection(collection)) {
      throw new TypeError('table collection must be prepared with prepareTableCollection().');
    }
    const cached = tableCollectionSources.get(collection) as TableSource<TRow> | undefined;
    if (cached !== undefined) return cached;
    const rows = Object.freeze(collection.records.map((record, index) =>
      tableCollectionRow(record, `table collection records[${String(index)}]`)
    ));
    const ids = Object.freeze(collection.records.map((record) => record.id));
    const prepared = Object.freeze({
      rows,
      ids,
      startIndex: collection.startIndex,
      totalCount: collection.totalCount,
      indexes: new Map(ids.map((id, index) => [id, collection.startIndex + index])),
    });
    tableCollectionSources.set(collection, prepared);
    return prepared;
  }
  const rows = Object.freeze([...value.rows]);
  const getRowId = value.getRowId;
  const ids = rows.map((row, index) =>
    nonEmpty(getRowId(row, index), `table row ${String(index)} id`)
  );
  assertUniqueIds(ids, 'table rows');
  return { rows, ids, startIndex: 0, totalCount: rows.length };
}

function tableCollectionRow<TRow>(
  record: CollectionRecord & { readonly row: TRow },
  owner: string,
): TRow {
  if (!Object.hasOwn(record, 'row')) {
    throw new TypeError(`${owner} must contain a row.`);
  }
  return record.row;
}

function prepareTableColumns<TRow>(
  value: readonly TableColumn<TRow>[] | undefined,
  rows: readonly TRow[],
): readonly PreparedTableColumn[] {
  if (value === undefined) {
    const count = rows.reduce<number>((maximum, row) => Math.max(maximum, rowCells(row).length), 0);
    const columns: readonly TableColumn<TRow>[] = Array.from(
      { length: count },
      (_unused, index) =>
        Object.freeze({
          id: `column-${String(index)}`,
          value: (row: TRow) => rowCells(row)[index],
        }),
    );
    return Object.freeze(columns.map((column, index): PreparedTableColumn =>
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
  }
  const visible = value.flatMap((column, index) =>
    column.hidden === true ? [] : [{ column, index }]
  );
  const models = visible.map(({ column, index }): PreparedTableColumn => {
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
    const width = prepareTableColumnWidth(column.width, `table column "${id}" width`);
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
        : { style: prepareTerminalStyle(column.style, `table column "${id}" style`) }),
      ...(column.headerStyle === undefined ? {} : {
        headerStyle: prepareTerminalStyle(
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

function compiledTableCell<TRow>(
  column: TableColumn<TRow>,
): (row: unknown, rowIndex: number, columnIndex: number) => PreparedTableCell {
  return (row, rowIndex, columnIndex) =>
    tableCell(column, row as TRow, rowIndex, columnIndex);
}

function prepareTableColumnWidth(
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
  column: TableColumn<TRow> | undefined,
  row: TRow,
  rowIndex: number,
  columnIndex: number,
): PreparedTableCell {
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

function prepareTablePresentation(
  value: TablePresentation | DataGridPresentation | null | undefined,
  tableScroll?: ScrollState,
  owner: 'table' | 'dataGrid' = 'table',
): PreparedTablePresentation {
  if (value === undefined) {
    const scroll = prepareComponentScrollState(tableScroll, 'table scroll');
    return {
      selectedRowIds: Object.freeze([]),
      selectedCells: Object.freeze([]),
      columnWidths: Object.freeze({}),
      ...(scroll === undefined ? {} : { scroll }),
    };
  }
  if (value === null) throw new TypeError(`${owner} presentation must be an object.`);
  const grid = 'interaction' in value ? value : undefined;
  const interaction = grid?.interaction;
  const selectionMode = interaction === undefined
    ? undefined
    : isStringMember(interaction.selectionMode, ['none', 'single', 'multiple'])
    ? interaction.selectionMode
    : (() => { throw new TypeError('dataGrid selectionMode is invalid.'); })();
  const activeRowId = interaction?.kind === 'row'
    ? prepareOptionalId(interaction.activeRowId, 'dataGrid activeRowId')
    : interaction?.activeCell === undefined
    ? undefined
    : nonEmpty(interaction.activeCell.rowId, 'dataGrid activeCell.rowId');
  const activeColumnId = interaction?.kind === 'cell' && interaction.activeCell !== undefined
    ? nonEmpty(interaction.activeCell.columnId, 'dataGrid activeCell.columnId')
    : undefined;
  const selectedRowIds = interaction?.kind === 'row'
    ? prepareUniqueIds(interaction.selectedRowIds, 'dataGrid selectedRowIds')
    : Object.freeze([]);
  const selectedCells = interaction?.kind === 'cell'
    ? prepareGridCells(interaction.selectedCells, 'dataGrid selectedCells')
    : Object.freeze([]);
  let sort:
    | { readonly columnId: string; readonly direction: 'ascending' | 'descending' }
    | undefined;
  if (value.sort !== undefined) {
    if (
      !isNonArrayObject(value.sort) ||
      !isStringMember(value.sort.direction, ['ascending', 'descending'])
    ) throw new TypeError('table sort is invalid.');
    sort = {
      columnId: nonEmpty(value.sort.columnId, 'table sort columnId'),
      direction: value.sort.direction,
    };
  }
  const widths = value.columnWidths;
  if (widths !== undefined && !isNonArrayObject(widths)) {
    throw new TypeError('table columnWidths must be an object.');
  }
  const columnWidths = Object.freeze(
    Object.fromEntries(
      Object.entries(widths ?? {}).map((
        [id, width],
      ) => [nonEmpty(id, 'table columnWidths id'), positive(width, `table columnWidths.${id}`)]),
    ),
  );
  const scroll = prepareComponentScrollState(grid?.scroll ?? tableScroll, 'table scroll');
  return {
    ...(interaction === undefined ? {} : { interactionKind: interaction.kind }),
    ...(selectionMode === undefined ? {} : { selectionMode }),
    ...(activeRowId === undefined ? {} : { activeRowId }),
    ...(activeColumnId === undefined ? {} : { activeColumnId }),
    selectedRowIds,
    selectedCells,
    ...(sort === undefined ? {} : { sort }),
    columnWidths,
    ...(scroll === undefined ? {} : { scroll }),
  };
}

function prepareOptionalId(value: string | undefined, owner: string): string | undefined {
  return value === undefined ? undefined : nonEmpty(value, owner);
}

function prepareUniqueIds(value: readonly string[], owner: string): readonly string[] {
  if (!Array.isArray(value)) throw new TypeError(`${owner} must be an array.`);
  const ids = Object.freeze(value.map((id, index) => nonEmpty(id, `${owner}[${String(index)}]`)));
  if (new Set(ids).size !== ids.length) throw new TypeError(`${owner} must contain unique ids.`);
  return ids;
}

function prepareGridCells(value: readonly DataGridCell[], owner: string): readonly DataGridCell[] {
  if (!Array.isArray(value)) throw new TypeError(`${owner} must be an array.`);
  const keys = new Set<string>();
  return Object.freeze(value.map((cell, index) => {
    if (!isNonArrayObject(cell)) throw new TypeError(`${owner}[${String(index)}] must be an object.`);
    const prepared = Object.freeze({
      rowId: nonEmpty(cell['rowId'], `${owner}[${String(index)}].rowId`),
      columnId: nonEmpty(cell['columnId'], `${owner}[${String(index)}].columnId`),
    });
    const key = `${prepared.rowId}\u0000${prepared.columnId}`;
    if (keys.has(key)) throw new TypeError(`${owner} must contain unique cells.`);
    keys.add(key);
    return prepared;
  }));
}

interface TableColumnTrack {
  readonly index: number;
  readonly start: number;
  readonly width: number;
  readonly end: number;
}

interface TablePlan {
  readonly geometry: ReturnType<typeof prepareComponentScrollbar>;
  readonly widths: readonly number[];
  readonly tracks: readonly TableColumnTrack[];
  readonly markerCells: number;
  readonly separatorCells: number;
  readonly headerHeight: number;
  readonly rows: readonly PreparedTableRow[];
  readonly startIndex: number;
  readonly endIndexExclusive: number;
  readonly horizontalOffset: number;
}

function tableColumnWidths(
  model: TableModel,
  availableWidth: number,
  widthProfile: ComponentInput<TableModel>['widthProfile'],
): readonly number[] {
  if (model.columns.length === 0) return Object.freeze([]);
  const separatorCells = tableSeparatorCells(model);
  const separators = Math.max(0, model.columns.length - 1) * separatorCells;
  const widthBudget = Math.max(model.columns.length, availableWidth - separators);
  const intrinsic = model.columns.map((column, index) =>
    tableColumnUsesContent(column.width)
      ? tableIntrinsicColumnWidth(model, column, index, widthProfile)
      : tableHeaderWidth(model, column, widthProfile)
  );
  const explicit = model.columns.map((column, index) =>
    explicitTableColumnWidth(
      model.columnWidths[column.id] ?? column.width,
      widthBudget,
      intrinsic[index] ?? 1,
    )
  );
  const used = explicit.reduce<number>((sum, width) => sum + (width ?? 0), 0);
  const remaining = Math.max(0, widthBudget - used);
  const totalWeight = model.columns.reduce<number>(
    (sum, column, index) =>
      explicit[index] === undefined ? sum + tableFillWeight(column.width) : sum,
    0,
  );
  return Object.freeze(
    model.columns.map((column, index) =>
      explicit[index] ??
        Math.max(
          1,
          Math.floor(remaining * (tableFillWeight(column.width) / Math.max(1, totalWeight))),
        )
    ),
  );
}

function tableColumnUsesContent(width: TableColumnWidth | undefined): boolean {
  return width === undefined || (typeof width === 'object' && width.kind === 'content');
}

function tableHeaderWidth(
  model: TableModel,
  column: PreparedTableColumn,
  widthProfile: ComponentInput<TableModel>['widthProfile'],
): number {
  const sort = model.sort?.columnId === column.id ? tableSortMarker(model.sort.direction) : '';
  const resize = model.semanticRole === 'grid' && column.resizable ? ' ↔' : '';
  return Math.max(1, measureTextCells(`${column.header}${sort}${resize}`, { widthProfile }).cells);
}

function tableIntrinsicColumnWidth(
  model: TableModel,
  column: PreparedTableColumn,
  index: number,
  widthProfile: ComponentInput<TableModel>['widthProfile'],
): number {
  const headerWidth = tableHeaderWidth(model, column, widthProfile);
  const source = tableSourceFor(model);
  const sampleSize = Math.min(64, source.rows.length);
  let cellWidth = 1;
  for (let localIndex = 0; localIndex < sampleSize; localIndex += 1) {
    const row = preparedTableRow(model, localIndex);
    cellWidth = Math.max(
      cellWidth,
      measureTextCells(row.cells[index]?.text ?? '', { widthProfile }).cells,
    );
  }
  return Math.max(1, headerWidth, Math.min(cellWidth, 24));
}

function explicitTableColumnWidth(
  width: TableColumnWidth | undefined,
  availableWidth: number,
  intrinsic: number,
): number | undefined {
  if (typeof width === 'number') return width;
  if (width === undefined) return intrinsic;
  switch (width.kind) {
    case 'fixed':
      return width.cells;
    case 'percent':
      return Math.max(1, Math.floor(availableWidth * width.value / 100));
    case 'content':
      return Math.max(width.min ?? 1, Math.min(width.max ?? intrinsic, intrinsic));
    case 'fill':
      return undefined;
  }
}

function tableFillWeight(width: TableColumnWidth | undefined): number {
  return typeof width === 'object' && width.kind === 'fill' ? width.weight ?? 1 : 1;
}

function tableSeparatorCells(model: TableModel): number {
  return model.density === 'compact' ? 1 : 2;
}

function tableTracks(
  widths: readonly number[],
  markerCells: number,
  separatorCells: number,
): readonly TableColumnTrack[] {
  let cursor = markerCells;
  return Object.freeze(widths.map((width, index) => {
    if (index > 0) cursor += separatorCells;
    const track = Object.freeze({ index, start: cursor, width, end: cursor + width });
    cursor = track.end;
    return track;
  }));
}

function tableContentWidth(
  widths: readonly number[],
  markerCells: number,
  separatorCells: number,
): number {
  return markerCells + widths.reduce((sum, width) => sum + width, 0) +
    Math.max(0, widths.length - 1) * separatorCells;
}

function tablePlan(input: ComponentInput<TableModel>): TablePlan {
  const source = tableSourceFor(input.model);
  const markerCells = input.model.semanticRole === 'grid' ? 2 : 0;
  const separatorCells = tableSeparatorCells(input.model);
  const headerHeight = input.model.hasHeader && input.model.stickyHeader ? 1 : 0;
  const scrollingBounds = headerHeight === 0 ? input.bounds : {
    ...input.bounds,
    row: input.bounds.row + headerHeight,
    height: Math.max(0, input.bounds.height - headerHeight),
  };
  const baseScroll = input.model.scroll ??
    Object.freeze({
      offsetRow: 0,
      offsetColumn: 0,
      followTail: false,
    });
  let widths = tableColumnWidths(
    input.model,
    Math.max(1, input.bounds.width - markerCells),
    input.widthProfile,
  );
  let contentColumns = tableContentWidth(widths, markerCells, separatorCells);
  let geometry = prepareComponentScrollbar({
    bounds: scrollingBounds,
    scroll: baseScroll,
    contentRows: input.model.totalCount,
    contentColumns,
    ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
    defaultAxis: 'vertical',
  });
  for (let attempt = 0; attempt < 2; attempt += 1) {
    widths = tableColumnWidths(
      input.model,
      Math.max(1, geometry.contentBounds.width - markerCells),
      input.widthProfile,
    );
    contentColumns = tableContentWidth(widths, markerCells, separatorCells);
    geometry = prepareComponentScrollbar({
      bounds: scrollingBounds,
      scroll: baseScroll,
      contentRows: input.model.totalCount,
      contentColumns,
      ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
      defaultAxis: 'vertical',
    });
  }
  const bodyHeight = geometry.contentBounds.height;
  const activeIndex = activeTablePosition(input.model)?.rowIndex;
  const requested = dataWindow({
    totalRows: input.model.totalCount,
    viewportRows: bodyHeight,
    ...(activeIndex === undefined ? {} : { activeIndex }),
    ...(input.model.scroll === undefined ? {} : {
      scroll: input.model.scroll,
    }),
    contentColumns,
    viewportColumns: geometry.contentBounds.width,
  });
  const availableEnd = input.model.startIndex + source.rows.length;
  const lastStart = Math.max(
    input.model.startIndex,
    availableEnd - Math.min(bodyHeight, source.rows.length),
  );
  const startIndex = Math.max(input.model.startIndex, Math.min(lastStart, requested.startIndex));
  const localStart = startIndex - input.model.startIndex;
  const rows = Object.freeze(Array.from(
    { length: Math.min(bodyHeight, source.rows.length - localStart) },
    (_unused, offset) => preparedTableRow(input.model, localStart + offset),
  ));
  return Object.freeze({
    geometry,
    widths,
    tracks: tableTracks(widths, markerCells, separatorCells),
    markerCells,
    separatorCells,
    headerHeight,
    rows,
    startIndex,
    endIndexExclusive: startIndex + rows.length,
    horizontalOffset: requested.offsetColumn,
  });
}

function measureTable(input: ComponentMeasureInput<TableModel>) {
  const markerCells = input.model.semanticRole === 'grid' ? 2 : 0;
  const widths = input.model.columns.map((column, index) => {
    const controlled = input.model.columnWidths[column.id];
    if (controlled !== undefined) return controlled;
    if (typeof column.width === 'number') return column.width;
    if (column.width?.kind === 'fixed') return column.width.cells;
    return tableColumnUsesContent(column.width)
      ? tableIntrinsicColumnWidth(input.model, column, index, input.widthProfile)
      : tableHeaderWidth(input.model, column, input.widthProfile);
  });
  return {
    minWidth: Math.max(1, markerCells + input.model.columns.length),
    minHeight: 1,
    preferredWidth: boundedTableContentWidth(widths, markerCells, tableSeparatorCells(input.model)),
    preferredHeight: Math.max(
      1,
      Math.min(Number.MAX_SAFE_INTEGER, input.model.totalCount + (input.model.hasHeader ? 1 : 0)),
    ),
  };
}

function boundedTableContentWidth(
  widths: readonly number[],
  markerCells: number,
  separatorCells: number,
): number {
  let result = markerCells + Math.max(0, widths.length - 1) * separatorCells;
  for (const width of widths) result = Math.min(Number.MAX_SAFE_INTEGER, result + width);
  return result;
}

function paintTable(input: ComponentRenderInput<TableModel, TableStylePart>): void {
  const plan = tablePlan(input);
  if (plan.headerHeight > 0) {
    input.target.write(
      0,
      0,
      scrollTableSpans(
        tableHeaderSpans(input, plan),
        plan.horizontalOffset,
        plan.geometry.contentBounds.width,
        input.widthProfile,
      ),
    );
  }
  if (input.model.totalCount === 0 && plan.geometry.contentBounds.height > 0) {
    input.target.write(
      plan.headerHeight,
      0,
      scrollTableSpans(
        tableEmptySpans(input, plan),
        plan.horizontalOffset,
        plan.geometry.contentBounds.width,
        input.widthProfile,
      ),
    );
  } else {
    plan.rows.forEach((row, visibleIndex) => {
      input.target.write(
        plan.headerHeight + visibleIndex,
        0,
        scrollTableSpans(
          tableRowSpans(input, row, plan),
          plan.horizontalOffset,
          plan.geometry.contentBounds.width,
          input.widthProfile,
        ),
      );
    });
  }
  paintComponentScrollbar({
    target: input.target,
    plan: plan.geometry,
    theme: input.theme,
    source: (sourceInput) => input.source(sourceInput),
  });
}

function tableHeaderSpans(
  input: ComponentRenderInput<TableModel, TableStylePart>,
  plan: TablePlan,
): readonly import('../../visual/render.ts').RenderSpan[] {
  const headerStyle = input.style({
    part: 'header',
    base: { fg: { kind: 'theme', token: 'table.header' }, bold: true },
  });
  const result: import('../../visual/render.ts').RenderSpan[] = input.model.semanticRole === 'table'
    ? []
    : [
    span(' '.repeat(plan.markerCells), {
      ...(headerStyle === undefined ? {} : { style: headerStyle }),
      source: tableFrameSource(input, 'header.marker', 'header', 'decoration'),
    }),
    ];
  input.model.columns.forEach((column, visibleIndex) => {
    if (visibleIndex > 0) result.push(tableSeparatorSpan(input, headerStyle));
    const width = plan.widths[visibleIndex] ?? 1;
    const sourceId = `${input.id ?? 'table'}:header:${String(column.index)}`;
    const cellStyle = input.style({
      part: 'headerCell',
      base: {
        fg: { kind: 'theme', token: 'table.header' },
        bold: true,
        ...(column.headerStyle ?? {}),
      },
    });
    const labelSpans: import('../../visual/render.ts').RenderSpan[] = [];
    if (column.header !== '') {
      labelSpans.push(
        span(column.header, {
          ...(cellStyle === undefined ? {} : { style: cellStyle }),
          source: tableFrameSource(
            input,
            `header.${String(column.index)}.label`,
            'header',
            'text',
            sourceId,
          ),
        }),
      );
    }
    const sort = input.model.sort?.columnId === column.id
      ? tableSortMarker(input.model.sort.direction)
      : '';
    if (sort !== '') {
      const sortStyle = input.style({
        part: 'sortIndicator',
        ...(cellStyle === undefined ? {} : { base: cellStyle }),
      });
      labelSpans.push(
        span(sort, {
          ...(sortStyle === undefined ? {} : { style: sortStyle }),
          source: tableFrameSource(
            input,
            `header.${String(column.index)}.sort`,
            'sort',
            'decoration',
            sourceId,
          ),
        }),
      );
    }
    if (input.model.semanticRole === 'grid' && column.resizable) {
      labelSpans.push(
        span(' ↔', {
          ...(cellStyle === undefined ? {} : { style: cellStyle }),
          source: tableFrameSource(
            input,
            `header.${String(column.index)}.resize`,
            'resize',
            'decoration',
            sourceId,
          ),
        }),
      );
    }
    result.push(
      ...tableSizedSpans(
        labelSpans,
        width,
        column.align,
        input.widthProfile,
        cellStyle,
        tableFrameSource(
          input,
          `header.${String(column.index)}.padding`,
          'padding',
          'decoration',
          sourceId,
        ),
      ),
    );
  });
  return result;
}

function tableRowSpans(
  input: ComponentRenderInput<TableModel, TableStylePart>,
  row: PreparedTableRow,
  plan: TablePlan,
): readonly import('../../visual/render.ts').RenderSpan[] {
  const selected = input.model.selectedRowIds.includes(row.id);
  const active = input.model.activeRowId === row.id;
  const rowTargetId = `${input.id ?? 'table'}:row:${row.id}`;
  const pointer = pointerVisualState(input.model.pointerState, rowTargetId);
  const rowState = pointer ?? (selected ? 'selected' : active ? 'active' : undefined);
  const rowStyle = input.style({
    part: 'row',
    ...(rowState === undefined ? {} : { state: rowState }),
  });
  const markerStyle = input.style({
    part: 'marker',
    ...(rowStyle === undefined ? {} : { base: rowStyle }),
    ...(rowState === undefined ? {} : { state: rowState }),
  });
  const marker = selected && !terminalStyleHasBackground(markerStyle, input.theme)
    ? input.theme.tokens.symbols.selected
    : input.theme.tokens.symbols.unselected;
  const result: import('../../visual/render.ts').RenderSpan[] = input.model.semanticRole === 'table'
    ? []
    : [span(marker, {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: tableFrameSource(
        input,
        `row.${row.id}.marker`,
        'marker',
        'decoration',
        row.id,
        row.rowIndex,
        rowState,
      ),
    }),
    span(' ', {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: tableFrameSource(
        input,
        `row.${row.id}.marker.gap`,
        'marker',
        'decoration',
        row.id,
        row.rowIndex,
        rowState,
      ),
    })];
  input.model.columns.forEach((column, visibleIndex) => {
    if (visibleIndex > 0) result.push(tableSeparatorSpan(input, rowStyle));
    const cellSelected = input.model.selectedCells.some((cell) =>
      cell.rowId === row.id && cell.columnId === column.id
    );
    const cellActive = input.model.interactionKind === 'cell' && input.model.activeRowId === row.id &&
      input.model.activeColumnId === column.id;
    const cellTargetId = `${input.id ?? 'table'}:row:${row.id}:cell:${String(column.index)}`;
    const cellPointer = pointerVisualState(input.model.pointerState, cellTargetId);
    const cellState = cellPointer ??
      (cellSelected ? 'selected' : cellActive ? 'active' : input.model.interactionKind === 'row' ? rowState : undefined);
    result.push(
      ...tableCellSpans(
        input,
        row,
        visibleIndex,
        plan.widths[visibleIndex] ?? 1,
        column,
        rowStyle,
        cellState,
      ),
    );
  });
  return result;
}

function tableCellSpans(
  input: ComponentRenderInput<TableModel, TableStylePart>,
  row: PreparedTableRow,
  columnIndex: number,
  width: number,
  column: PreparedTableColumn,
  rowStyle: TerminalStyle | undefined,
  state: 'active' | 'disabled' | 'focused' | 'hovered' | 'pressed' | 'selected' | undefined,
): readonly import('../../visual/render.ts').RenderSpan[] {
  const cell = row.cells[columnIndex] ?? { content: Object.freeze([]), text: '' };
  const part: TableStylePart = column.semantic === 'metric'
    ? 'metric'
    : column.semantic === 'metadata'
    ? 'metadata'
    : 'cell';
  const semanticStyle: TerminalStyle = column.semantic === 'metric'
    ? { fg: { kind: 'theme', token: 'table.metric' } }
    : column.semantic === 'metadata'
    ? { fg: { kind: 'theme', token: 'table.metadata' }, dim: true }
    : { fg: { kind: 'theme', token: 'text.default' } };
  const partName = `row.${row.id}.cell.${String(column.index)}`;
  const source = tableFrameSource(
    input,
    partName,
    column.semantic,
    column.semantic === 'metric' ? 'content' : 'text',
    row.id,
    row.rowIndex,
    state,
  );
  const rendered = cell.content.map((segment) => {
    const explicit = { ...semanticStyle, ...column.style, ...segment.style };
    const style = preserveExplicitTableForeground(
      input.style({
        part,
        base: { ...(rowStyle ?? {}), ...semanticStyle, ...explicit },
        ...(state === undefined ? {} : { state }),
      }),
      explicit,
    );
    return span(inlineSegmentText(segment, input.theme.tokens.symbols.mode), {
      ...(style === undefined ? {} : { style }),
      ...(segment.link === undefined ? {} : { link: segment.link }),
      source,
    });
  });
  const paddingStyle = input.style({
    part,
    base: { ...(rowStyle ?? {}), ...semanticStyle, ...(column.style ?? {}) },
    ...(state === undefined ? {} : { state }),
  });
  return tableSizedSpans(
    rendered,
    width,
    column.align,
    input.widthProfile,
    paddingStyle,
    tableFrameSource(
      input,
      `${partName}.padding`,
      'padding',
      'decoration',
      row.id,
      row.rowIndex,
      state,
    ),
  );
}

function preserveExplicitTableForeground(
  style: TerminalStyle | undefined,
  explicit: TerminalStyle,
): TerminalStyle | undefined {
  const foreground = explicit.fg;
  if (
    foreground === undefined || (foreground.kind === 'theme' && foreground.token === 'text.default')
  ) return style;
  return { ...(style ?? {}), fg: foreground };
}

function tableSizedSpans(
  spans: readonly import('../../visual/render.ts').RenderSpan[],
  width: number,
  alignment: PreparedTableColumn['align'],
  widthProfile: ComponentInput<TableModel>['widthProfile'],
  paddingStyle: TerminalStyle | undefined,
  paddingSource: import('../../visual/source.ts').FrameCellSource,
): readonly import('../../visual/render.ts').RenderSpan[] {
  const clipped = clipRenderSpans(spans, width, { ellipsis: '…', widthProfile });
  const remaining = Math.max(0, width - measureRenderSpans(clipped, { widthProfile }));
  const before = alignment === 'end'
    ? remaining
    : alignment === 'center'
    ? Math.floor(remaining / 2)
    : 0;
  const after = remaining - before;
  return [
    ...(before === 0 ? [] : [
      span(' '.repeat(before), {
        ...(paddingStyle === undefined ? {} : { style: paddingStyle }),
        source: paddingSource,
      }),
    ]),
    ...clipped,
    ...(after === 0 ? [] : [
      span(' '.repeat(after), {
        ...(paddingStyle === undefined ? {} : { style: paddingStyle }),
        source: paddingSource,
      }),
    ]),
  ];
}

function tableEmptySpans(
  input: ComponentRenderInput<TableModel, TableStylePart>,
  plan: TablePlan,
): readonly import('../../visual/render.ts').RenderSpan[] {
  const markerStyle = input.style({ part: 'marker' });
  const emptyStyle = input.style({
    part: 'empty',
    base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true },
  });
  return [
    span(' '.repeat(plan.markerCells), {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: tableFrameSource(input, 'empty.marker', 'marker', 'decoration'),
    }),
    span(input.model.emptyText, {
      ...(emptyStyle === undefined ? {} : { style: emptyStyle }),
      source: tableFrameSource(input, 'empty', 'empty', 'text'),
    }),
  ];
}

function tableSeparatorSpan(
  input: ComponentRenderInput<TableModel, TableStylePart>,
  style: TerminalStyle | undefined,
): import('../../visual/render.ts').RenderSpan {
  return span(' '.repeat(tableSeparatorCells(input.model)), {
    ...(style === undefined ? {} : { style }),
    source: tableFrameSource(input, 'column.separator', 'separator', 'separator'),
  });
}

function scrollTableSpans(
  spans: readonly import('../../visual/render.ts').RenderSpan[],
  offsetCells: number,
  width: number,
  widthProfile: ComponentInput<TableModel>['widthProfile'],
): readonly import('../../visual/render.ts').RenderSpan[] {
  const visible: import('../../visual/render.ts').RenderSpan[] = [];
  let skipped = 0;
  let written = 0;
  for (const current of spans) {
    let visibleText = '';
    let exhausted = false;
    for (const grapheme of measureTextCells(current.text, { widthProfile }).graphemes) {
      if (skipped < offsetCells) {
        skipped += grapheme.cells;
        continue;
      }
      if (written + grapheme.cells > width) {
        exhausted = true;
        break;
      }
      visibleText += grapheme.text;
      written += grapheme.cells;
    }
    if (visibleText.length > 0) {
      visible.push({
        text: visibleText,
        ...(current.style === undefined ? {} : { style: current.style }),
        ...(current.link === undefined ? {} : { link: current.link }),
        ...(current.source === undefined ? {} : { source: current.source }),
      });
    }
    if (exhausted) break;
  }
  return visible;
}

function tableSortMarker(direction: 'ascending' | 'descending'): string {
  return direction === 'ascending' ? ' ↑' : ' ↓';
}

function visibleTableTrack(
  track: TableColumnTrack,
  horizontalOffset: number,
  viewportWidth: number,
): { readonly start: number; readonly end: number } | undefined {
  const start = Math.max(0, track.start - horizontalOffset);
  const end = Math.min(viewportWidth, track.end - horizontalOffset);
  return end <= start ? undefined : { start, end };
}

function tableScrollHitTargets(
  input: ComponentInput<TableModel>,
): readonly HitTarget<{ readonly kind: 'scroll'; readonly event: import('../../interaction/scroll.ts').ScrollEvent }>[] {
  if (input.model.scroll === undefined) return Object.freeze([]);
  const plan = tablePlan(input);
  return componentScrollbarHitTargets({
    id: input.id ?? 'table',
    plan: plan.geometry,
    ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
    onScroll: (event) => ({ kind: 'scroll' as const, event }),
  });
}

function tableHitTargets(
  input: ComponentInput<TableModel>,
): readonly HitTarget<DataGridComponentAction>[] {
  const plan = tablePlan(input);
  const targets: HitTarget<DataGridComponentAction>[] = [];
  if (input.model.semanticRole === 'grid' && !input.readOnly && plan.headerHeight > 0) {
    input.model.columns.forEach((column, index) => {
      const track = plan.tracks[index];
      if (track === undefined) return;
      const visible = visibleTableTrack(
        track,
        plan.horizontalOffset,
        plan.geometry.contentBounds.width,
      );
      if (visible === undefined) return;
      if (column.sortable) {
        targets.push({
          id: `${input.id ?? 'table'}:header:${column.id}:sort`,
          bounds: { row: 0, column: visible.start, width: visible.end - visible.start, height: 1 },
          accepts: ['click'],
          cursor: 'pointer',
          focus: { kind: 'target', targetId: 'self' },
          message: () => ({
            kind: 'transition',
            transition: { kind: 'sortBy', columnId: column.id },
          }),
        });
      }
      if (column.resizable) {
        targets.push({
          id: `${input.id ?? 'table'}:header:${column.id}:resize`,
          bounds: { row: 0, column: visible.end - 1, width: 1, height: 1 },
          accepts: ['pointerDown', 'dragStart', 'drag'],
          cursor: 'pointer',
          focus: { kind: 'target', targetId: 'self' },
          message: (event) =>
            event.button !== 'left' ? ignoreMessage() : ({
              kind: 'transition',
              transition: {
                kind: 'setColumnWidth',
                columnId: column.id,
                width: Math.max(1, track.width + event.column - (event.pressColumn ?? event.column)),
              },
            }),
        });
      }
    });
  }
  if (input.model.semanticRole === 'grid') plan.rows.forEach((row, visibleIndex) => {
    const rowBounds = {
      row: plan.headerHeight + visibleIndex,
      column: 0,
      width: plan.geometry.contentBounds.width,
      height: 1,
    };
    if (input.model.interactionKind === 'row') {
      targets.push({
        id: `${input.id ?? 'table'}:row:${row.id}`,
        bounds: rowBounds,
        cursor: 'pointer',
        focus: { kind: 'target', targetId: 'self' },
        message: (event) =>
          event.clickCount === 2 && !input.readOnly
            ? { kind: 'activate', event: { kind: 'activate', target: { kind: 'row', rowId: row.id } } }
            : { kind: 'transition', transition: { kind: 'setActiveRow', rowId: row.id } },
      });
      return;
    }
    input.model.columns.forEach((column, index) => {
      const track = plan.tracks[index];
      if (track === undefined) return;
      const visible = visibleTableTrack(
        track,
        plan.horizontalOffset,
        plan.geometry.contentBounds.width,
      );
      if (visible === undefined) return;
      targets.push({
        id: `${input.id ?? 'table'}:row:${row.id}:cell:${String(column.index)}`,
        bounds: {
          row: rowBounds.row,
          column: visible.start,
          width: visible.end - visible.start,
          height: 1,
        },
        cursor: 'pointer',
        focus: { kind: 'target', targetId: 'self' },
        message: (event) =>
          event.clickCount === 2 && !input.readOnly
            ? {
              kind: 'activate',
              event: { kind: 'activate', target: { kind: 'cell', cell: { rowId: row.id, columnId: column.id } } },
            }
            : {
              kind: 'transition',
              transition: { kind: 'setActiveCell', cell: { rowId: row.id, columnId: column.id } },
            },
      });
    });
  });
  if (input.model.scroll !== undefined) {
    targets.push(
      ...componentScrollbarHitTargets({
        id: input.id ?? 'table',
        plan: plan.geometry,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (event) => ({
          kind: 'transition' as const,
          transition: { kind: 'scroll' as const, event },
        }),
      }),
    );
  }
  return Object.freeze(targets);
}

function tableAccessibility(
  input: import('../../component/index.ts').ComponentAccessibilityInput<TableModel>,
) {
  const plan = tablePlan(input);
  const rowCount = input.model.totalCount + (input.model.hasHeader ? 1 : 0);
  const header = input.model.hasHeader
    ? [{
      id: `${input.id}:headers`,
      role: 'row' as const,
      position: { rowIndex: 1, rowCount, columnCount: input.model.columns.length },
      children: input.model.columns.map((column, index) => ({
        id: `${input.id}:header:${String(column.index)}`,
        role: 'columnheader' as const,
        label: column.header || `Column ${String(index + 1)}`,
        value: column.header || `Column ${String(index + 1)}`,
        ...(input.model.semanticRole === 'grid' && (column.sortable || column.resizable)
          ? {
            description: [
              ...(column.sortable ? ['sortable'] : []),
              ...(column.resizable ? ['resizable'] : []),
              ...(input.model.sort?.columnId === column.id
                ? [`sorted ${input.model.sort.direction}`]
                : []),
            ].join(', '),
          }
          : {}),
        position: {
          rowIndex: 1,
          rowCount,
          columnIndex: index + 1,
          columnCount: input.model.columns.length,
          columnLabel: column.header || `Column ${String(index + 1)}`,
        },
      })),
    }]
    : [];
  const body = plan.rows.map((row) => ({
    id: `${input.id}:row:${row.id}`,
    role: 'row' as const,
    ...(input.model.semanticRole === 'grid'
      ? { selected: input.model.selectedRowIds.includes(row.id) }
      : {}),
    position: {
      positionInSet: row.rowIndex + 1,
      setSize: input.model.totalCount,
      rowIndex: row.rowIndex + (input.model.hasHeader ? 2 : 1),
      rowCount,
      ...(input.model.columns.length === 0 ? {} : { columnCount: input.model.columns.length }),
    },
    children: row.cells.map((cell, index) => {
      const column = input.model.columns[index];
      const label = column?.header ?? `Column ${String(index + 1)}`;
      return {
        id: `${input.id}:row:${row.id}:cell:${String(column?.index ?? index)}`,
        role: input.model.semanticRole === 'grid' ? 'gridcell' as const : 'cell' as const,
        label: cell.text,
        value: cell.text,
        ...(input.model.semanticRole === 'grid'
          ? {
            selected: input.model.selectedCells.some((selected) =>
              selected.rowId === row.id && selected.columnId === column?.id
            ),
          }
          : {}),
        position: {
          rowIndex: row.rowIndex + (input.model.hasHeader ? 2 : 1),
          rowCount,
          columnIndex: index + 1,
          columnCount: input.model.columns.length,
          columnLabel: label,
        },
      };
    }),
  }));
  const activeRowVisible = input.model.activeRowId !== undefined &&
    plan.rows.some((row) => row.id === input.model.activeRowId);
  return {
    id: input.id,
    role: input.model.semanticRole,
    label: input.id,
    description: `Showing ${String(plan.startIndex + 1)}-${String(plan.endIndexExclusive)} of ${
      String(input.model.totalCount)
    } rows.`,
    ...(input.focused ? { focused: true } : {}),
    ...(input.model.semanticRole === 'grid' && input.model.selectionMode === 'multiple'
      ? { multiSelectable: true }
      : {}),
    ...(input.model.semanticRole === 'grid' && activeRowVisible
      ? {
        activeDescendant: input.model.interactionKind === 'cell' && input.model.activeColumnId !== undefined
          ? `${input.id}:row:${input.model.activeRowId}:cell:${String(
            input.model.columns.find((column) => column.id === input.model.activeColumnId)?.index ?? 0
          )}`
          : `${input.id}:row:${input.model.activeRowId}`,
      }
      : {}),
    ...(rowCount === 0 && input.model.columns.length === 0 ? {} : {
      position: {
        ...(rowCount === 0 ? {} : { rowCount }),
        ...(input.model.columns.length === 0 ? {} : { columnCount: input.model.columns.length }),
      },
    }),
    window: {
      startIndex: plan.startIndex,
      endIndexExclusive: plan.endIndexExclusive,
      totalCount: input.model.totalCount,
      omittedBefore: plan.startIndex,
      omittedAfter: Math.max(0, input.model.totalCount - plan.endIndexExclusive),
    },
    children: [...header, ...body],
  };
}

function tableFrameSource(
  input: ComponentRenderInput<TableModel, TableStylePart>,
  partName: string,
  partType: string,
  cellRole: import('../../visual/source.ts').FrameCellRole,
  itemId?: string,
  itemIndex?: number,
  interactionState?: Exclude<import('../../element/metadata.ts').ElementVisualState, 'default'>,
) {
  return input.source({
    partName,
    partType,
    cellRole,
    description: partName,
    ...(itemId === undefined ? {} : { itemId }),
    ...(itemIndex === undefined ? {} : { itemIndex }),
    ...(interactionState === undefined ? {} : { interactionState }),
  });
}

function activeTablePosition(
  model: TableModel,
): { readonly id: string; readonly rowIndex: number } | undefined {
  if (model.activeRowId === undefined) return undefined;
  const source = tableSourceFor(model);
  const rowIndex = source.indexes.get(model.activeRowId);
  return rowIndex === undefined ? undefined : { id: model.activeRowId, rowIndex };
}

function tableSourceFor(model: TableModel): PreparedTableSource {
  const source = tableSources.get(model.source);
  if (source === undefined) throw new TypeError('table prepared source is unavailable.');
  return source;
}

function preparedTableRow(model: TableModel, localIndex: number): PreparedTableRow {
  const source = tableSourceFor(model);
  const cached = source.preparedRows.get(localIndex);
  if (cached !== undefined) return cached;
  const row = source.rows[localIndex];
  const id = source.ids[localIndex];
  if (row === undefined || id === undefined) {
    throw new RangeError('table row index is outside the prepared source.');
  }
  const rowIndex = model.startIndex + localIndex;
  const prepared = Object.freeze({
    id,
    rowIndex,
    cells: Object.freeze(
      source.columns.map((column, columnIndex) => column.cell(row, rowIndex, columnIndex)),
    ),
  });
  source.preparedRows.set(localIndex, prepared);
  return prepared;
}

interface TreeRow {
  readonly id: string;
  readonly itemIndex: number;
  readonly label: string;
  readonly depth: number;
  readonly path: readonly string[];
  readonly kind: 'leaf' | 'branch' | 'lazy';
  readonly expanded: boolean;
  readonly disabled: boolean;
  readonly lazyPlaceholder: boolean;
  readonly description?: string;
  readonly icon?: string;
}

interface TreeModel {
  readonly source: Readonly<Record<string, never>>;
  readonly startIndex: number;
  readonly totalCount: number;
  readonly query: Required<import('../../ui-model/query.ts').CollectionQuery>;
  readonly activeId?: string;
  readonly selection: SelectionState;
  readonly emptyText: string;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
  readonly pointerState?: PointerInteractionState;
}

interface PreparedTreeSource {
  readonly rows: readonly TreeRow[];
  readonly indexes: ReadonlyMap<string, number>;
}

const treeSources = new WeakMap<object, PreparedTreeSource>();
const preparedTreeCollections = new WeakMap<object, PreparedTreeSource>();

const treeBase = {
  name: 'terminal-ui/components/tree' as const,
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  accessibleRole: 'tree' as const,
  metadata: ['focus', 'layer', 'styles'] as const,
  states: ['disabled', 'busy', 'readOnly', 'inert'] as const,
  parts: [
    'marker',
    'indent',
    'disclosure',
    'icon',
    'label',
    'metadata',
    'match',
    'placeholder',
    'empty',
    'scrollbar',
  ] as const,
  measure: measureTree,
  render: paintTree,
  accessibility: treeAccessibility,
};

type TreeComponentAction =
  | { readonly kind: 'transition'; readonly action: TreeTransition }
  | { readonly kind: 'activate'; readonly event: TreeActivateEvent }
  | { readonly kind: 'pointer'; readonly action: PointerInteractionAction };

const activeTree = defineComponent<
  TreeModel,
  TreeModel,
  TreeComponentAction,
  TreeStylePart,
  readonly ['disabled', 'busy', 'readOnly', 'inert'],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  ...treeBase,
  keys: ({ model, busy, readOnly }) => {
    if (busy) return {};
    const row = activeTreeRow(model);
    return {
      arrowUp: () => treeTransition({ kind: 'moveActive', delta: -1 }),
      arrowDown: () => treeTransition({ kind: 'moveActive', delta: 1 }),
      ...(row === undefined ? {} : {
        ...(row.kind === 'leaf' || row.expanded
          ? {}
          : { arrowRight: () => treeTransition({ kind: 'expand', id: row.id }) }),
        ...(row.kind === 'leaf' || !row.expanded
          ? {}
          : { arrowLeft: () => treeTransition({ kind: 'collapse', id: row.id }) }),
        ...(readOnly ? {} : {
          space: () => treeTransition({ kind: 'commitActive' }),
          enter: () => ({ kind: 'activate' as const, event: { kind: 'activate' as const, id: row.id } }),
        }),
      }),
    };
  },
  pointer: {
    state: ({ model }) => model.pointerState,
    onAction: (action) => ({ kind: 'pointer', action }),
  },
  focusTargets(input) {
    const plan = treePlan(input);
    return [{
      id: 'self',
      bounds: input.bounds,
      ...(plan.activeVisibleIndex === undefined
        ? {}
        : { cursor: { row: plan.activeVisibleIndex, column: 0 } }),
    }];
  },
  hitTargets: treeHitTargets,
});

export function tree<
  TMetadata extends Readonly<Record<string, unknown>>,
  const TTransitionMessage extends ComponentMessage = never,
  const TActivateMessage extends ComponentMessage = never,
  const TPointerMessage extends ComponentMessage = never,
>(options: ScrollableTreeOptions<TMetadata, TTransitionMessage, TActivateMessage, TPointerMessage>): Element<TTransitionMessage | TActivateMessage | TPointerMessage>;
// The passive overload intentionally excludes scroll actions.
export function tree<
  TMetadata extends Readonly<Record<string, unknown>>,
  const TTransitionMessage extends ComponentMessage = never,
  const TActivateMessage extends ComponentMessage = never,
  const TPointerMessage extends ComponentMessage = never,
>(
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  options: UnscrolledTreeOptions<TMetadata, TTransitionMessage, TActivateMessage, TPointerMessage>
): Element<TTransitionMessage | TActivateMessage | TPointerMessage>;
export function tree<
  TMetadata extends Readonly<Record<string, unknown>>,
  const TTransitionMessage extends ComponentMessage = never,
  const TActivateMessage extends ComponentMessage = never,
  const TPointerMessage extends ComponentMessage = never,
>(options: TreeOptions<TMetadata, TTransitionMessage, TActivateMessage, TPointerMessage>): Element<TTransitionMessage | TActivateMessage | TPointerMessage> {
  const prepared = prepareTree(
    options,
    options.disabled !== true && options.inert !== true,
  );
  const shared = {
    ...prepared,
    id: options.id,
    ...(options.busy === undefined ? {} : { busy: options.busy }),
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  if (options.disabled === true) return activeTree({
    ...shared,
    disabled: true,
    ...(options.inert === undefined ? {} : { inert: options.inert }),
  });
  if (options.inert === true) return activeTree({ ...shared, inert: true });
  assertRequiredCallback(options.onTransition, 'tree onTransition');
  assertOptionalCallback(options.onActivate, 'tree onActivate');
  assertOptionalCallback(options.onPointerAction, 'tree onPointerAction');
  return activeTree({
    ...shared,
    ...(options.readOnly === undefined ? {} : { readOnly: options.readOnly }),
    onAction: (action) => {
      if (action.kind === 'activate') return options.onActivate?.(action.event) ?? ignoreMessage();
      if (action.kind === 'pointer') return options.onPointerAction?.(action.action) ?? ignoreMessage();
      if (isScrollableTreeOptions(options)) return options.onTransition(action.action);
      return action.action.kind === 'scroll'
        ? ignoreMessage()
        : options.onTransition(action.action);
    },
  });
}

function prepareTree<
  TMetadata extends Readonly<Record<string, unknown>>,
  TTransitionMessage extends ComponentMessage,
  TActivateMessage extends ComponentMessage,
  TPointerMessage extends ComponentMessage,
>(
  value: Readonly<TreeOptions<TMetadata, TTransitionMessage, TActivateMessage, TPointerMessage>>,
  pointerAvailable: boolean,
): TreeModel {
  const query = normalizeCollectionQuery(
    value.presentation.query ?? { text: '', mode: 'contains' },
  );
  let collection: CollectionProjection<TreeCollectionRecord<TMetadata>>;
  let startIndex: number;
  let totalCount: number;
  if (value.collection !== undefined) {
    const supplied = value.collection;
    if (!isCollectionProjection(supplied)) {
      throw new TypeError(
        'tree collection must be prepared with prepareTreeCollection() or prepareTreeRows().',
      );
    }
    collection = supplied;
    startIndex = supplied.startIndex;
    totalCount = supplied.totalCount;
  } else {
    const nodes = prepareTreeNodes<TMetadata>(value.nodes);
    collection = prepareTreeCollection<TMetadata>(
      nodes,
      value.presentation,
    );
    startIndex = collection.startIndex;
    totalCount = collection.totalCount;
  }
  const sourceToken = Object.freeze({});
  treeSources.set(sourceToken, preparedTreeSource(collection));
  const scroll = prepareComponentScrollState(value.presentation.scroll, 'tree scroll');
  const scrollbar = prepareComponentScrollbarOptions(value.scrollbar, 'tree scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(value.scrollPolicy, 'tree scrollPolicy');
  if (scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)) {
    throw new TypeError('tree scrollbar and scrollPolicy require scroll state.');
  }
  const activeId = value.presentation.activeId === undefined
    ? undefined
    : nonEmpty(value.presentation.activeId, 'tree activeId');
  const pointerState = preparePointerInteractionState(
    value.pointerState,
    'tree pointerState',
    pointerAvailable,
  );
  return {
    source: sourceToken,
    startIndex,
    totalCount,
    query,
    ...(activeId === undefined ? {} : { activeId }),
    selection: ownSelectionState(value.presentation.selection, 'tree selection'),
    emptyText: text(value.emptyText, 'tree emptyText') ?? 'No items',
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function isScrollableTreeOptions<
  TMetadata extends Readonly<Record<string, unknown>>,
  TTransitionMessage extends ComponentMessage,
  TActivateMessage extends ComponentMessage,
  TPointerMessage extends ComponentMessage,
>(
  options: TreeOptions<TMetadata, TTransitionMessage, TActivateMessage, TPointerMessage>,
): options is ScrollableTreeOptions<TMetadata, TTransitionMessage, TActivateMessage, TPointerMessage> {
  return options.presentation.scroll !== undefined;
}

function preparedTreeSource<
  TMetadata extends Readonly<Record<string, unknown>>,
>(
  collection: CollectionProjection<TreeCollectionRecord<TMetadata>>,
): PreparedTreeSource {
  const cached = preparedTreeCollections.get(collection);
  if (cached !== undefined) return cached;
  const rows = Object.freeze(collection.records.map((record, index) => {
    const prepared = prepareTreeRecord(
      record.row,
      record.itemIndex,
    );
    if (prepared.id !== record.id) {
      throw new TypeError(`tree collection record ${String(index)} id does not match its row.`);
    }
    return prepared;
  }));
  const source = Object.freeze({
    rows,
    indexes: new Map(rows.map((row) => [row.id, row.itemIndex])),
  });
  preparedTreeCollections.set(collection, source);
  return source;
}

function prepareTreeNodes<
  TMetadata extends Readonly<Record<string, unknown>>,
>(values: readonly TreeNode<TMetadata>[]): readonly TreeNode<TMetadata>[] {
  return values.map((value, index) => prepareTreeNode(value, `tree nodes[${String(index)}]`));
}

function prepareTreeNode<
  TMetadata extends Readonly<Record<string, unknown>>,
>(value: TreeNode<TMetadata>, owner: string): TreeNode<TMetadata> {
  if (!isNonArrayObject(value)) throw new TypeError(`${owner} must be an object.`);
  const kind = value.kind;
  if (!isStringMember(kind, ['leaf', 'branch', 'lazy'])) {
    throw new TypeError(`${owner}.kind is invalid.`);
  }
  const base = {
    id: nonEmpty(value.id, `${owner}.id`),
    label: text(value.label, `${owner}.label`) ?? '',
    ...(value.description === undefined
      ? {}
      : { description: text(value.description, `${owner}.description`) ?? '' }),
    ...(value.disabled === undefined
      ? {}
      : { disabled: boolean(value.disabled, `${owner}.disabled`) }),
    ...(value.icon === undefined ? {} : { icon: text(value.icon, `${owner}.icon`) ?? '' }),
    ...(value.metadata === undefined
      ? {}
      : { metadata: plainObject(value.metadata, `${owner}.metadata`) }),
  };
  if (kind === 'leaf') return { ...base, kind };
  if (kind === 'branch') {
    if (!Array.isArray(value.children)) {
      throw new TypeError(`${owner}.children must be an array.`);
    }
    return { ...base, kind, children: prepareTreeNodes(value.children) };
  }
  return { ...base, kind };
}

function plainObject<TValue extends Readonly<Record<string, unknown>>>(
  value: TValue,
  owner: string,
): TValue {
  if (!isNonArrayObject(value)) throw new TypeError(`${owner} must be a plain object.`);
  return Object.freeze({ ...value });
}

function prepareTreeRecord<
  TMetadata extends Readonly<Record<string, unknown>>,
>(value: TreeVisibleRow<TMetadata>, itemIndex: number): TreeRow {
  if (!isNonArrayObject(value)) throw new TypeError('tree collection row is invalid.');
  const node = prepareVisibleTreeNode(value.node, 'tree collection row.node');
  const depth = nonNegative(value.depth, 'tree row depth');
  const path = value.path;
  if (!Array.isArray(path) || path.some((part) => typeof part !== 'string')) {
    throw new TypeError('tree row path must be a string array.');
  }
  const lazyPlaceholder = value.lazyPlaceholder;
  if (lazyPlaceholder !== undefined && typeof lazyPlaceholder !== 'boolean') {
    throw new TypeError('tree row lazyPlaceholder must be a boolean.');
  }
  return treeRow({
    node,
    depth,
    path: path.map((part) => sanitizeTerminalText(part as string).text),
    expanded: boolean(value.expanded, 'tree row expanded'),
    ...(value.loadState === undefined ? {} : { loadState: prepareTreeLoadState(value.loadState) }),
    ...(lazyPlaceholder === true ? { lazyPlaceholder: true } : {}),
  }, itemIndex);
}

function prepareVisibleTreeNode(value: TreeNode, owner: string): TreeNode {
  if (!isNonArrayObject(value)) throw new TypeError(`${owner} must be an object.`);
  const kind = value.kind;
  if (!isStringMember(kind, ['leaf', 'branch', 'lazy'])) {
    throw new TypeError(`${owner}.kind is invalid.`);
  }
  const base = {
    id: nonEmpty(value.id, `${owner}.id`),
    label: text(value.label, `${owner}.label`) ?? '',
    ...(value.description === undefined
      ? {}
      : { description: text(value.description, `${owner}.description`) ?? '' }),
    ...(value.disabled === undefined
      ? {}
      : { disabled: boolean(value.disabled, `${owner}.disabled`) }),
    ...(value.icon === undefined ? {} : { icon: text(value.icon, `${owner}.icon`) ?? '' }),
  };
  if (kind === 'leaf') return { ...base, kind };
  if (kind === 'branch') {
    if (!Array.isArray(value.children)) {
      throw new TypeError(`${owner}.children must be an array.`);
    }
    return { ...base, kind, children: [] };
  }
  return { ...base, kind };
}

function prepareTreeLoadState(value: TreeLoadState): TreeLoadState {
  if (!isNonArrayObject(value) || !isStringMember(value.kind, ['idle', 'pending', 'error', 'empty'])) {
    throw new TypeError('tree load state is invalid.');
  }
  const kind = value.kind;
  const message = 'message' in value ? text(value.message, 'tree load state message') : undefined;
  switch (kind) {
    case 'idle': {
      if (message !== undefined) {
        throw new TypeError('tree lazy idle state cannot define a message.');
      }
      return { kind };
    }
    case 'pending':
      return { kind, ...(message === undefined ? {} : { message }) };
    case 'error': {
      if (message === undefined) throw new TypeError('tree lazy error requires a message.');
      return { kind, message };
    }
    case 'empty':
      return { kind, ...(message === undefined ? {} : { message }) };
  }
}

function treeRow(value: TreeVisibleRow, itemIndex: number): TreeRow {
  return {
    id: value.node.id,
    itemIndex,
    label: value.node.label,
    depth: value.depth,
    path: value.path,
    kind: value.node.kind,
    expanded: value.expanded,
    disabled: value.node.disabled === true,
    lazyPlaceholder: value.lazyPlaceholder === true,
    ...(value.node.description === undefined ? {} : { description: value.node.description }),
    ...(value.node.icon === undefined ? {} : { icon: value.node.icon }),
  };
}

function treeGeometry(input: ComponentInput<TreeModel>) {
  const scroll = input.model.scroll ??
    {
      offsetRow: 0,
      offsetColumn: 0,
      followTail: false,
    };
  return prepareComponentScrollbar({
    bounds: input.bounds,
    scroll,
    contentRows: input.model.totalCount,
    contentColumns: input.bounds.width,
    ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
    defaultAxis: 'vertical',
  });
}

function treePlan(input: ComponentInput<TreeModel>) {
  const source = treeSourceFor(input.model);
  const geometry = treeGeometry(input);
  const activeIndex = input.model.activeId === undefined
    ? undefined
    : source.indexes.get(input.model.activeId);
  const requested = dataWindow({
    totalRows: input.model.totalCount,
    viewportRows: geometry.contentBounds.height,
    ...(activeIndex === undefined ? {} : { activeIndex }),
    ...(input.model.scroll === undefined ? {} : {
      scroll: input.model.scroll,
    }),
  });
  const availableEnd = input.model.startIndex + source.rows.length;
  const lastStart = Math.max(
    input.model.startIndex,
    availableEnd - Math.min(geometry.contentBounds.height, source.rows.length),
  );
  const startIndex = Math.max(input.model.startIndex, Math.min(lastStart, requested.startIndex));
  const localStart = startIndex - input.model.startIndex;
  const rows = Array.from(
    { length: Math.min(geometry.contentBounds.height, source.rows.length - localStart) },
    (_unused, offset) => preparedTreeRow(input.model, localStart + offset),
  );
  const activeVisibleIndex = activeIndex === undefined || activeIndex < startIndex ||
      activeIndex >= startIndex + rows.length
    ? undefined
    : activeIndex - startIndex;
  return {
    geometry,
    rows,
    startIndex,
    endIndexExclusive: startIndex + rows.length,
    activeVisibleIndex,
  };
}

function measureTree(input: ComponentMeasureInput<TreeModel>) {
  const source = treeSourceFor(input.model);
  const sampleSize = Math.min(64, source.rows.length);
  let preferredWidth = 1;
  for (let localIndex = 0; localIndex < sampleSize; localIndex += 1) {
    const row = preparedTreeRow(input.model, localIndex);
    preferredWidth = Math.max(
      preferredWidth,
      4 + row.depth * 2 +
        measureTextCells(`${row.icon === undefined ? '' : `${row.icon} `}${row.label}`, {
          widthProfile: input.widthProfile,
        }).cells,
    );
  }
  return {
    minWidth: 1,
    minHeight: 1,
    preferredWidth,
    preferredHeight: Math.max(1, input.model.totalCount),
  };
}

function paintTree(input: ComponentRenderInput<TreeModel, TreeStylePart>) {
  const plan = treePlan(input);
  if (treeSourceFor(input.model).rows.length === 0) {
    const style = input.style({
      part: 'empty',
      base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true },
    });
    input.target.write(0, 0, [
      span(input.model.emptyText, {
        ...(style === undefined ? {} : { style }),
        source: input.source({
          partName: 'empty',
          partType: 'empty',
          description: 'empty',
          cellRole: 'text',
        }),
      }),
    ]);
    return;
  }
  plan.rows.forEach((row, visibleIndex) => {
    paintTreeRow(input, row, visibleIndex, plan.geometry.contentBounds.width);
  });
  paintComponentScrollbar({
    target: input.target,
    plan: plan.geometry,
    theme: input.theme,
    source: (sourceInput) => input.source(sourceInput),
  });
}

function treeSourceFor(model: TreeModel): PreparedTreeSource {
  const source = treeSources.get(model.source);
  if (source === undefined) throw new TypeError('tree prepared source is unavailable.');
  return source;
}

function preparedTreeRow(model: TreeModel, localIndex: number): TreeRow {
  const source = treeSourceFor(model);
  const row = source.rows[localIndex];
  if (row === undefined) throw new RangeError('tree row index is outside the prepared source.');
  return row;
}

function activeTreeRow(model: TreeModel): TreeRow | undefined {
  if (model.activeId === undefined) return undefined;
  const source = treeSourceFor(model);
  const itemIndex = source.indexes.get(model.activeId);
  if (itemIndex === undefined) return undefined;
  return preparedTreeRow(model, itemIndex - model.startIndex);
}

function paintTreeRow(
  input: ComponentRenderInput<TreeModel, TreeStylePart>,
  row: TreeRow,
  visibleIndex: number,
  width: number,
): void {
  const selected = treeSelectionContains(input.model.selection, row.id);
  const active = row.id === input.model.activeId;
  const bodyId = `${input.id ?? 'tree'}:${row.id}:body`;
  const disclosureId = `${input.id ?? 'tree'}:${row.id}:disclosure`;
  const pointer = pointerVisualState(input.model.pointerState, bodyId);
  const state: 'disabled' | 'hovered' | 'pressed' | 'selected' | 'focused' | 'active' | undefined =
    row.disabled || row.lazyPlaceholder ? 'disabled' : pointer ??
      (input.focus === 'self' && active ? 'focused' : selected ? 'selected' : active ? 'active' : undefined);
  const disclosurePointer = pointerVisualState(input.model.pointerState, disclosureId);
  const disclosureState: typeof state = row.disabled || row.lazyPlaceholder
    ? 'disabled'
    : disclosurePointer ?? state;
  const selectionBase: TerminalStyle | undefined = selected
    ? {
      fg: { kind: 'theme', token: 'selection.foreground' },
      bg: { kind: 'theme', token: 'selection.background' },
    }
    : undefined;
  const markerStyle = input.style({
    part: 'marker',
    ...(selectionBase === undefined ? {} : { base: selectionBase }),
    ...(state === undefined ? {} : { state }),
  });
  const marker = selected && !terminalStyleHasBackground(markerStyle, input.theme)
    ? input.theme.tokens.symbols.selected
    : input.theme.tokens.symbols.unselected;
  const labelStyle = input.style({
    part: row.lazyPlaceholder ? 'placeholder' : 'label',
    base: selectionBase ?? { fg: { kind: 'theme', token: 'text.default' } },
    ...(state === undefined ? {} : { state }),
  });
  const disclosureStyle = input.style({
    part: row.lazyPlaceholder ? 'placeholder' : 'disclosure',
    base: { ...selectionBase, fg: { kind: 'theme', token: 'tree.branch' } },
    ...(disclosureState === undefined ? {} : { state: disclosureState }),
  });
  const indentStyle = input.style({
    part: 'indent',
    base: { ...selectionBase, fg: { kind: 'theme', token: 'tree.branch' } },
    ...(state === undefined ? {} : { state }),
  });
  const iconStyle = input.style({
    part: 'icon',
    ...(selectionBase === undefined ? {} : { base: selectionBase }),
    ...(state === undefined ? {} : { state }),
  });
  const itemId = `${input.id ?? 'tree'}:${row.id}`;
  const source = (
    description: string,
    partType: string,
    cellRole: import('../../visual/source.ts').FrameCellRole,
    interactionState = state,
  ) =>
    input.source({
      partName: description,
      partType,
      description,
      cellRole,
      itemId,
      itemIndex: row.itemIndex,
      ...(interactionState === undefined ? {} : { interactionState }),
    });
  const disclosure = row.lazyPlaceholder
    ? input.theme.tokens.symbols.unselected
    : row.kind === 'leaf'
    ? input.theme.tokens.symbols.unselected
    : row.expanded
    ? input.theme.tokens.symbols.treeExpanded
    : input.theme.tokens.symbols.treeCollapsed;
  const spans: import('../../visual/render.ts').RenderSpan[] = [
    span(marker, {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: source(`node.${row.id}.marker`, 'selection-marker', 'decoration'),
    }),
    span(' ', {
      ...(markerStyle === undefined ? {} : { style: markerStyle }),
      source: source(`node.${row.id}.marker.gap`, 'selection-marker', 'decoration'),
    }),
    ...(row.depth === 0 ? [] : [
      span('  '.repeat(row.depth), {
        ...(indentStyle === undefined ? {} : { style: indentStyle }),
        source: source(`node.${row.id}.indent`, 'indent', 'decoration'),
      }),
    ]),
    span(disclosure, {
      ...(disclosureStyle === undefined ? {} : { style: disclosureStyle }),
      source: source(`node.${row.id}.disclosure`, 'disclosure', 'decoration', disclosureState),
    }),
    span(' ', {
      ...(disclosureStyle === undefined ? {} : { style: disclosureStyle }),
      source: source(`node.${row.id}.disclosure.gap`, 'gap', 'decoration', disclosureState),
    }),
    ...(row.icon === undefined || row.icon === '' ? [] : [
      span(`${row.icon} `, {
        ...(iconStyle === undefined ? {} : { style: iconStyle }),
        source: source(`node.${row.id}.icon`, 'icon', 'decoration'),
      }),
    ]),
    ...treeLabelSpans(input, row, labelStyle, source),
  ];
  const clipped = [
    ...clipRenderSpans(spans, width, { ellipsis: '…', widthProfile: input.widthProfile }),
  ];
  const used = measureRenderSpans(clipped, { widthProfile: input.widthProfile });
  if (used < width) {
    clipped.push(
      span(' '.repeat(width - used), {
        ...(labelStyle === undefined ? {} : { style: labelStyle }),
        source: source(`node.${row.id}.padding`, 'padding', 'decoration'),
      }),
    );
  }
  input.target.write(visibleIndex, 0, clipped);
}

function treeLabelSpans(
  input: ComponentRenderInput<TreeModel, TreeStylePart>,
  row: TreeRow,
  labelStyle: TerminalStyle | undefined,
  source: (
    description: string,
    partType: string,
    cellRole: import('../../visual/source.ts').FrameCellRole,
  ) => import('../../visual/source.ts').FrameCellSource,
): readonly import('../../visual/render.ts').RenderSpan[] {
  const match = matchNormalizedCollectionQuery({ id: row.id, primary: row.label }, input.model.query)
    ?.ranges.find((range) => range.field === 'primary');
  if (match === undefined) {
    return [
      span(row.label, {
        ...(labelStyle === undefined ? {} : { style: labelStyle }),
        source: source(`node.${row.id}.label`, 'label', 'text'),
      }),
    ];
  }
  const matchStyle = input.style({
    part: 'match',
    base: { ...(labelStyle ?? {}), fg: { kind: 'theme', token: 'menu.match' }, underline: true },
  });
  return [
    ...(match.start === 0 ? [] : [
      span(row.label.slice(0, match.start), {
        ...(labelStyle === undefined ? {} : { style: labelStyle }),
        source: source(`node.${row.id}.label`, 'label', 'text'),
      }),
    ]),
    span(row.label.slice(match.start, match.end), {
      ...(matchStyle === undefined ? {} : { style: matchStyle }),
      source: source(`node.${row.id}.match`, 'match', 'text'),
    }),
    ...(match.end >= row.label.length ? [] : [
      span(row.label.slice(match.end), {
        ...(labelStyle === undefined ? {} : { style: labelStyle }),
        source: source(`node.${row.id}.label`, 'label', 'text'),
      }),
    ]),
  ];
}

function treeHitTargets(input: ComponentInput<TreeModel>) {
  if (input.busy) return [];
  const plan = treePlan(input);
  const targets = plan.rows.flatMap((row, index): HitTarget<TreeComponentAction>[] => {
    if (row.disabled || row.lazyPlaceholder) return [];
    const result: HitTarget<TreeComponentAction>[] = [];
    const disclosureColumn = 2 + row.depth * 2;
    if (row.kind !== 'leaf' && disclosureColumn < plan.geometry.contentBounds.width) {
      result.push({
        id: `${input.id ?? 'tree'}:${row.id}:disclosure`,
        bounds: {
          row: index,
          column: disclosureColumn,
          width: Math.min(2, plan.geometry.contentBounds.width - disclosureColumn),
          height: 1,
        },
        cursor: 'pointer',
        focus: { kind: 'target', targetId: 'self' },
        message: () => treeTransition({ kind: 'toggle', id: row.id }),
      });
    }
    const bodyColumn = row.kind === 'leaf'
      ? 0
      : Math.min(plan.geometry.contentBounds.width, disclosureColumn + 2);
    if (bodyColumn < plan.geometry.contentBounds.width) {
      result.push({
        id: `${input.id ?? 'tree'}:${row.id}:body`,
        bounds: {
          row: index,
          column: bodyColumn,
          width: plan.geometry.contentBounds.width - bodyColumn,
          height: 1,
        },
        cursor: 'pointer',
        focus: { kind: 'target', targetId: 'self' },
        message: (event) =>
          event.clickCount === 2
            ? { kind: 'activate', event: { kind: 'activate', id: row.id } }
            : treeTransition({ kind: 'setActive', id: row.id }),
      });
    }
    return result;
  });
  if (input.model.scroll !== undefined) {
    return [
      ...targets,
      ...componentScrollbarHitTargets<TreeComponentAction>({
        id: input.id ?? 'tree',
        plan: plan.geometry,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (event) => treeTransition({ kind: 'scroll', event }),
      }),
    ];
  }
  return targets;
}

function treeAccessibility(
  input: import('../../component/index.ts').ComponentAccessibilityInput<TreeModel>,
) {
  const plan = treePlan(input);
  return {
    id: input.id,
    role: 'tree' as const,
    label: input.id,
    description: `Showing ${String(plan.startIndex + 1)}-${String(plan.endIndexExclusive)} of ${
      String(input.model.totalCount)
    } tree rows.`,
    ...(input.focused ? { focused: true } : {}),
    ...(input.model.activeId === undefined
      ? {}
      : { activeDescendant: `${input.id}:${input.model.activeId}` }),
    ...(input.model.selection.mode === 'multiple' ? { multiSelectable: true } : {}),
    window: {
      startIndex: plan.startIndex,
      endIndexExclusive: plan.endIndexExclusive,
      totalCount: input.model.totalCount,
      omittedBefore: plan.startIndex,
      omittedAfter: Math.max(0, input.model.totalCount - plan.endIndexExclusive),
    },
    children: plan.rows.map((row, index) => ({
      id: `${input.id}:${row.id}`,
      role: 'treeitem' as const,
      label: row.label,
      ...(row.description === undefined ? {} : { description: row.description }),
      selected: treeSelectionContains(input.model.selection, row.id),
      disabled: row.disabled || row.lazyPlaceholder,
      ...(row.kind === 'leaf' ? {} : { expanded: row.expanded }),
      position: {
        positionInSet: plan.startIndex + index + 1,
        setSize: input.model.totalCount,
        level: row.depth + 1,
      },
      value: row.path.join('/'),
    })),
  };
}

function treeSelectionContains(selection: SelectionState, id: string): boolean {
  return selection.mode === 'single'
    ? selection.selectedId === id
    : selection.mode === 'multiple' && selection.selectedIds.includes(id);
}

function treeTransition(action: TreeTransition): TreeComponentAction {
  return { kind: 'transition', action };
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
function nonNegative(value: unknown, owner: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${owner} must be a non-negative safe integer.`);
  }
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
