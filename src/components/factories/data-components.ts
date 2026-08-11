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
import { isNonArrayObject } from '../../foundation/validation.ts';
import { pointerVisualState } from '../../interaction/pointer-interaction.ts';
import type { PointerInteractionState } from '../../interaction/pointer-interaction.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import { terminalStyleHasBackground } from '../../theme/index.ts';
import type { TableAction } from '../../ui-model/table.ts';
import type { TreeInteractionAction } from '../../ui-model/tree.ts';
import type { TreeLazyState, TreeNode, TreeVisibleRow } from '../../ui-model/tree.ts';
import type { TableColumnWidth } from '../../ui-model/content.ts';
import type { TableStylePart, TreeStylePart } from '../../ui-model/style-parts.ts';
import {
  inlineContentAccessibleText,
  inlineSegmentText,
  isInlineContent,
  normalizeInlineContent,
} from '../../visual/inline-content.ts';
import type { InlineContent, InlineContentSegment } from '../../visual/inline-content.ts';
import type { TerminalStyle } from '../../visual/render.ts';
import type {
  PassiveTableOptions,
  PassiveTreeOptions,
  ScrollableTableOptions,
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
}

interface PreparedTableColumns {
  readonly models: readonly PreparedTableColumn[];
  readonly inputs: readonly Readonly<Record<string, unknown>>[];
}

interface PreparedTablePresentation {
  readonly selectedRowId?: string;
  readonly selectedCell?: { readonly rowId: string; readonly columnIndex: number };
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
  readonly columns: readonly PreparedTableColumn[];
  readonly hasHeader: boolean;
  readonly source: Readonly<Record<string, never>>;
  readonly startIndex: number;
  readonly totalCount: number;
  readonly selectedRowId?: string;
  readonly selectedCell?: { readonly rowId: string; readonly columnIndex: number };
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
  readonly columns: readonly Readonly<Record<string, unknown>>[];
  readonly preparedRows: Map<number, PreparedTableRow>;
}

const tableSources = new WeakMap<object, PreparedTableSource>();
const tableCollectionSources = new WeakMap<object, TableSource>();

interface TablePreparation {
  readonly columns: readonly PreparedTableColumn[];
  readonly source: Readonly<Record<string, never>>;
}

interface DynamicTableOptions {
  readonly rows?: unknown;
  readonly getRowId?: unknown;
  readonly collection?: unknown;
  readonly columns?: unknown;
  readonly presentation?: unknown;
  readonly density?: unknown;
  readonly stickyHeader?: unknown;
  readonly emptyText?: unknown;
  readonly scrollbar?: unknown;
  readonly scrollPolicy?: unknown;
  readonly pointerState?: unknown;
}

const tableBase = {
  name: 'terminal-ui/components/table' as const,
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  metadata: ['focus', 'layer', 'styles'] as const,
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
  prepare: prepareTable,
  measure: measureTable,
  render: paintTable,
  accessibility: tableAccessibility,
};

const passiveTable = defineComponent<
  DynamicTableOptions,
  TableModel,
  never,
  TableStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles']
>(tableBase);

const activeTable = defineComponent<
  DynamicTableOptions,
  TableModel,
  TableAction,
  TableStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  ...tableBase,
  keys: ({ model }) => {
    const selected = selectedTablePosition(model);
    const column = model.columns[model.selectedCell?.columnIndex ?? 0];
    return {
      arrowUp: () => ({ kind: 'moveRow', delta: -1 }),
      arrowDown: () => ({ kind: 'moveRow', delta: 1 }),
      arrowLeft: () => ({ kind: 'moveColumn', delta: -1 }),
      arrowRight: () => ({ kind: 'moveColumn', delta: 1 }),
      pageUp: () => ({ kind: 'page', delta: -1 }),
      pageDown: () => ({ kind: 'page', delta: 1 }),
      home: () => ({ kind: 'firstRow' }),
      end: () => ({ kind: 'lastRow' }),
      ...(column?.sortable === true
        ? { space: () => ({ kind: 'sortBy' as const, columnId: column.id }) }
        : {}),
      ...(column?.resizable === true
        ? {
          triggers: [
            {
              trigger: {
                kind: 'key' as const,
                key: 'arrowLeft' as const,
                modifiers: { alt: true },
              },
              onKey: () => ({ kind: 'resizeColumnBy' as const, columnId: column.id, delta: -1 }),
            },
            {
              trigger: {
                kind: 'key' as const,
                key: 'arrowRight' as const,
                modifiers: { alt: true },
              },
              onKey: () => ({ kind: 'resizeColumnBy' as const, columnId: column.id, delta: 1 }),
            },
          ],
        }
        : {}),
      ...(selected === undefined ? {} : {
        enter: () => ({
          kind: 'activate' as const,
          rowId: selected.id,
          rowIndex: selected.rowIndex,
          ...(model.selectedCell === undefined
            ? {}
            : { columnIndex: model.selectedCell.columnIndex }),
        }),
      }),
    };
  },
  pointer: { state: ({ model }) => model.pointerState, onAction: () => ignoreMessage() },
  focusTargets: ({ bounds }) => [{ id: 'self', bounds }],
  hitTargets: tableHitTargets,
});

export function table<TRow, const TMessage extends ComponentMessage = never>(
  options: ScrollableTableOptions<TRow, TMessage>,
): Element<TMessage>;
// The passive overload intentionally exposes TableControlAction instead of the scroll-capable TableAction.
export function table<TRow, const TMessage extends ComponentMessage = never>(
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  options: PassiveTableOptions<TRow, TMessage>,
): Element<TMessage>;
export function table<TRow, const TMessage extends ComponentMessage = never>(
  options: TableOptions<TRow, TMessage>,
): Element<TMessage> {
  const own: DynamicTableOptions = options;
  const onAction = options.onAction;
  if (onAction === undefined) {
    return passiveTable({
      ...own,
      id: options.id,
      ...(options.meta === undefined ? {} : { meta: options.meta }),
    });
  }
  if (!isScrollableTable(options)) {
    return activeTable({
      ...own,
      id: options.id,
      ...(options.meta === undefined ? {} : { meta: options.meta }),
      onAction: (action) =>
        action.kind === 'scroll' ? ignoreMessage() : onAction(action),
    });
  }
  return activeTable({
    ...own,
    id: options.id,
    ...(options.meta === undefined ? {} : { meta: options.meta }),
    onAction: options.onAction,
  });
}

function isScrollableTable<TRow, TMessage extends ComponentMessage>(
  options: TableOptions<TRow, TMessage>,
): options is ScrollableTableOptions<TRow, TMessage> {
  return isNonArrayObject(options.presentation) && 'scroll' in options.presentation;
}

function prepareTable(value: Readonly<Record<string, unknown>>): TableModel {
  assertExactFields(value, [
    'rows', 'getRowId', 'collection', 'columns', 'presentation', 'density', 'stickyHeader',
    'emptyText', 'scrollbar', 'scrollPolicy', 'pointerState',
  ], 'table options');
  const source = tableSource(value);
  const preparation = prepareTableStructure(value['columns'], source);
  const columns = preparation.columns;
  const presentation = prepareTablePresentation(value['presentation']);
  const scrollbar = prepareComponentScrollbarOptions(value['scrollbar'], 'table scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(value['scrollPolicy'], 'table scrollPolicy');
  if (
    presentation.scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)
  ) throw new TypeError('table scrollbar and scrollPolicy require scroll state.');
  const pointerState = preparePointerState(value['pointerState'], 'table');
  const density = value['density'];
  if (density !== undefined && density !== 'compact' && density !== 'regular') {
    throw new TypeError('table density is invalid.');
  }
  return {
    columns,
    hasHeader: columns.some((column) => column.header.length > 0),
    source: preparation.source,
    startIndex: source.startIndex,
    totalCount: source.totalCount,
    ...(presentation.selectedRowId === undefined
      ? {}
      : { selectedRowId: presentation.selectedRowId }),
    ...(presentation.selectedCell === undefined ? {} : { selectedCell: presentation.selectedCell }),
    ...(presentation.sort === undefined ? {} : { sort: presentation.sort }),
    columnWidths: presentation.columnWidths,
    density: density ?? 'regular',
    stickyHeader: value['stickyHeader'] === undefined
      ? true
      : boolean(value['stickyHeader'], 'table stickyHeader'),
    emptyText: text(value['emptyText'], 'table emptyText') ?? 'No rows',
    ...(presentation.scroll === undefined ? {} : { scroll: presentation.scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

interface TableSource {
  readonly rows: readonly unknown[];
  readonly ids: readonly string[];
  readonly startIndex: number;
  readonly totalCount: number;
  readonly indexes?: ReadonlyMap<string, number>;
}

function prepareTableStructure(columns: unknown, source: TableSource): TablePreparation {
  const preparedColumns = prepareTableColumns(columns, source.rows);
  const sourceToken = Object.freeze({});
  tableSources.set(sourceToken, {
    rows: source.rows,
    ids: source.ids,
    indexes: source.indexes ?? new Map(
      source.ids.map((id, index) => [id, source.startIndex + index]),
    ),
    columns: preparedColumns.inputs,
    preparedRows: new Map(),
  });
  return Object.freeze({ columns: preparedColumns.models, source: sourceToken });
}

function tableSource(value: Readonly<Record<string, unknown>>): TableSource {
  if (value['collection'] !== undefined) {
    if (value['rows'] !== undefined || value['getRowId'] !== undefined) {
      throw new TypeError('table accepts rows or collection, not both.');
    }
    const collection = value['collection'];
    if (!isCollectionProjection(collection)) {
      throw new TypeError('table collection must be prepared with prepareTableCollection().');
    }
    const cached = tableCollectionSources.get(collection);
    if (cached !== undefined) return cached;
    const rows = Object.freeze(collection.records.map((record, index) =>
      collectionRow(record, `table collection records[${String(index)}]`)
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
  if (!Array.isArray(value['rows']) || !isUnknownCallback(value['getRowId'])) {
    throw new TypeError('table requires rows and getRowId, or collection.');
  }
  const rows = value['rows'];
  const getRowId = value['getRowId'];
  const ids = rows.map((row, index) =>
    nonEmpty(getRowId(row, index), `table row ${String(index)} id`)
  );
  assertUniqueIds(ids, 'table rows');
  return { rows, ids, startIndex: 0, totalCount: rows.length };
}

function collectionRow(record: CollectionRecord, owner: string): unknown {
  if (!isNonArrayObject(record) || !Object.hasOwn(record, 'row')) {
    throw new TypeError(`${owner} must contain a row.`);
  }
  return record['row'];
}

function prepareTableColumns(value: unknown, rows: readonly unknown[]): PreparedTableColumns {
  if (value === undefined) {
    const count = rows.reduce<number>((maximum, row) => Math.max(maximum, rowCells(row).length), 0);
    const inputs: readonly Readonly<Record<string, unknown>>[] = Array.from(
      { length: count },
      (_unused, index) =>
        Object.freeze({
          id: `column-${String(index)}`,
          value: (row: unknown) => rowCells(row)[index],
        }),
    );
    const models = inputs.map((column): PreparedTableColumn =>
      Object.freeze({
        id: nonEmpty(column['id'], 'inferred table column id'),
        index: Number(String(column['id']).slice('column-'.length)),
        header: '',
        align: 'start',
        semantic: 'text',
        sortable: false,
        resizable: false,
      })
    );
    return { models: Object.freeze(models), inputs: Object.freeze(inputs) };
  }
  const columns = arrayObjects(value, 'table columns');
  const visible = columns.flatMap((column, index) =>
    column['hidden'] === true ? [] : [{ column, index }]
  );
  const inputs = visible.map(({ column }) => column);
  const models = visible.map(({ column, index }): PreparedTableColumn => {
    const unsupported = Object.keys(column).find((field) =>
      field !== 'id' && field !== 'header' && field !== 'value' && field !== 'width' &&
      field !== 'align' && field !== 'semantic' && field !== 'hidden' && field !== 'sortable' &&
      field !== 'resizable' && field !== 'style' && field !== 'headerStyle' &&
      field !== 'renderCell'
    );
    if (unsupported !== undefined) {
      throw new TypeError(
        `table columns[${String(index)}] contains unknown field "${unsupported}".`,
      );
    }
    const id = nonEmpty(column['id'], `table columns[${String(index)}].id`);
    const header = text(column['header'], `table column ${id} header`) ?? '';
    if (typeof column['value'] !== 'function') {
      throw new TypeError(`table column "${id}" requires value().`);
    }
    if (column['renderCell'] !== undefined && typeof column['renderCell'] !== 'function') {
      throw new TypeError(`table column "${id}" renderCell must be a function.`);
    }
    const align = column['align'];
    if (align !== undefined && align !== 'start' && align !== 'center' && align !== 'end') {
      throw new TypeError(`table column "${id}" align is invalid.`);
    }
    const semantic = column['semantic'];
    if (
      semantic !== undefined && semantic !== 'text' && semantic !== 'metric' &&
      semantic !== 'metadata'
    ) throw new TypeError(`table column "${id}" semantic is invalid.`);
    const width = prepareTableColumnWidth(column['width'], `table column "${id}" width`);
    return Object.freeze({
      id,
      index,
      header,
      align: align ?? 'start',
      semantic: semantic ?? (align === 'end' ? 'metric' : 'text'),
      sortable: boolean(column['sortable'], `table column "${id}" sortable`),
      resizable: boolean(column['resizable'], `table column "${id}" resizable`),
      ...(width === undefined ? {} : { width }),
      ...(column['style'] === undefined
        ? {}
        : { style: prepareTerminalStyle(column['style'], `table column "${id}" style`) }),
      ...(column['headerStyle'] === undefined ? {} : {
        headerStyle: prepareTerminalStyle(
          column['headerStyle'],
          `table column "${id}" headerStyle`,
        ),
      }),
    });
  });
  assertUniqueIds(models.map((column) => column.id), 'table columns');
  return { models: Object.freeze(models), inputs: Object.freeze(inputs) };
}

function prepareTableColumnWidth(value: unknown, owner: string): TableColumnWidth | undefined {
  if (value === undefined) return undefined;
  if (typeof value === 'number') return positive(value, owner);
  if (!isNonArrayObject(value) || typeof value['kind'] !== 'string') {
    throw new TypeError(`${owner} is invalid.`);
  }
  switch (value['kind']) {
    case 'fixed': {
      assertExactFields(value, ['kind', 'cells'], owner);
      return Object.freeze({ kind: 'fixed', cells: positive(value['cells'], `${owner}.cells`) });
    }
    case 'percent': {
      assertExactFields(value, ['kind', 'value'], owner);
      const percentage = finite(value['value'], `${owner}.value`);
      if (percentage <= 0 || percentage > 100) {
        throw new RangeError(`${owner}.value must be greater than zero and at most 100.`);
      }
      return Object.freeze({ kind: 'percent', value: percentage });
    }
    case 'fill': {
      assertExactFields(value, ['kind', 'weight'], owner);
      const weight = value['weight'] === undefined
        ? undefined
        : finite(value['weight'], `${owner}.weight`);
      if (weight !== undefined && weight <= 0) {
        throw new RangeError(`${owner}.weight must be positive.`);
      }
      return Object.freeze({ kind: 'fill', ...(weight === undefined ? {} : { weight }) });
    }
    case 'content': {
      assertExactFields(value, ['kind', 'min', 'max'], owner);
      const min = value['min'] === undefined
        ? undefined
        : nonNegative(value['min'], `${owner}.min`);
      const max = value['max'] === undefined
        ? undefined
        : nonNegative(value['max'], `${owner}.max`);
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

function tableCell(
  column: Readonly<Record<string, unknown>> | undefined,
  row: unknown,
  rowIndex: number,
  columnIndex: number,
): PreparedTableCell {
  if (column === undefined || !isUnknownCallback(column['value'])) {
    return { content: Object.freeze([]), text: '' };
  }
  const rendered = isUnknownCallback(column['renderCell'])
    ? column['renderCell'](row, rowIndex, columnIndex)
    : column['value'](row, rowIndex);
  let content: InlineContent;
  if (typeof rendered === 'string') {
    content = normalizeInlineContent([{ kind: 'text', text: rendered }]);
  } else if (isInlineContent(rendered)) {
    content = normalizeInlineContent(rendered);
  } else if (isInlineContentSegment(rendered)) {
    content = normalizeInlineContent([rendered]);
  } else if (
    typeof rendered === 'number' || typeof rendered === 'bigint' || typeof rendered === 'boolean'
  ) {
    content = normalizeInlineContent([{ kind: 'text', text: String(rendered) }]);
  } else {
    content = Object.freeze([]);
  }
  return Object.freeze({ content, text: inlineContentAccessibleText(content) });
}

function isInlineContentSegment(value: unknown): value is InlineContentSegment {
  if (!isNonArrayObject(value)) return false;
  return value['kind'] === 'text'
    ? typeof value['text'] === 'string'
    : value['kind'] === 'symbol' &&
      typeof value['unicode'] === 'string' &&
      typeof value['ascii'] === 'string' &&
      typeof value['accessibleText'] === 'string';
}

function prepareTablePresentation(value: unknown): PreparedTablePresentation {
  if (value === undefined) return { columnWidths: Object.freeze({}) };
  if (!isNonArrayObject(value)) throw new TypeError('table presentation must be an object.');
  const unsupported = Object.keys(value).find((field) =>
    field !== 'selectedRowId' && field !== 'selectedCell' && field !== 'sort' &&
    field !== 'columnWidths' && field !== 'scroll'
  );
  if (unsupported !== undefined) {
    throw new TypeError(`table presentation contains unknown field "${unsupported}".`);
  }
  const selectedRowId = value['selectedRowId'] === undefined
    ? undefined
    : nonEmpty(value['selectedRowId'], 'table selectedRowId');
  let selectedCell: { readonly rowId: string; readonly columnIndex: number } | undefined;
  if (value['selectedCell'] !== undefined) {
    if (
      !isNonArrayObject(value['selectedCell']) ||
      Object.keys(value['selectedCell']).some((field) =>
        field !== 'rowId' && field !== 'columnIndex'
      )
    ) throw new TypeError('table selectedCell is invalid.');
    selectedCell = {
      rowId: nonEmpty(value['selectedCell']['rowId'], 'table selectedCell rowId'),
      columnIndex: nonNegative(
        value['selectedCell']['columnIndex'],
        'table selectedCell columnIndex',
      ),
    };
  }
  let sort:
    | { readonly columnId: string; readonly direction: 'ascending' | 'descending' }
    | undefined;
  if (value['sort'] !== undefined) {
    if (
      !isNonArrayObject(value['sort']) ||
      (value['sort']['direction'] !== 'ascending' && value['sort']['direction'] !== 'descending')
    ) throw new TypeError('table sort is invalid.');
    sort = {
      columnId: nonEmpty(value['sort']['columnId'], 'table sort columnId'),
      direction: value['sort']['direction'],
    };
  }
  const widths = value['columnWidths'];
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
  const scroll = prepareComponentScrollState(value['scroll'], 'table scroll');
  return {
    ...(selectedRowId === undefined ? {} : { selectedRowId }),
    ...(selectedCell === undefined ? {} : { selectedCell }),
    ...(sort === undefined ? {} : { sort }),
    columnWidths,
    ...(scroll === undefined ? {} : { scroll }),
  };
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
  const resize = column.resizable ? ' ↔' : '';
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
  const markerCells = 2;
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
      contentRows: input.model.totalCount,
      contentColumns: input.bounds.width,
      viewportRows: input.bounds.height,
      viewportColumns: input.bounds.width,
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
    scroll: {
      ...baseScroll,
      contentRows: input.model.totalCount,
      contentColumns,
      viewportRows: scrollingBounds.height,
      viewportColumns: scrollingBounds.width,
    },
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
      scroll: {
        ...baseScroll,
        contentRows: input.model.totalCount,
        contentColumns,
        viewportRows: scrollingBounds.height,
        viewportColumns: scrollingBounds.width,
      },
      ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
      defaultAxis: 'vertical',
    });
  }
  const bodyHeight = geometry.contentBounds.height;
  const selectedIndex = selectedTablePosition(input.model)?.rowIndex;
  const requested = dataWindow({
    totalRows: input.model.totalCount,
    viewportRows: bodyHeight,
    ...(selectedIndex === undefined ? {} : { selectedIndex }),
    ...(input.model.scroll === undefined ? {} : {
      scroll: {
        ...input.model.scroll,
        contentRows: input.model.totalCount,
        contentColumns,
        viewportRows: bodyHeight,
        viewportColumns: geometry.contentBounds.width,
      },
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
  const markerCells = 2;
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
  const result: import('../../visual/render.ts').RenderSpan[] = [
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
    if (column.resizable) {
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
  const selected = row.id === (input.model.selectedCell?.rowId ?? input.model.selectedRowId);
  const rowTargetId = `${input.id ?? 'table'}:row:${row.id}`;
  const pointer = pointerVisualState(input.model.pointerState, rowTargetId);
  const rowState = pointer ?? (selected ? 'selected' : undefined);
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
  const result: import('../../visual/render.ts').RenderSpan[] = [
    span(marker, {
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
    }),
  ];
  input.model.columns.forEach((column, visibleIndex) => {
    if (visibleIndex > 0) result.push(tableSeparatorSpan(input, rowStyle));
    const cellSelected = input.model.selectedCell?.rowId === row.id &&
      input.model.selectedCell.columnIndex === visibleIndex;
    const cellTargetId = `${input.id ?? 'table'}:row:${row.id}:cell:${String(column.index)}`;
    const cellPointer = pointerVisualState(input.model.pointerState, cellTargetId);
    const cellState = cellPointer ??
      (cellSelected ? 'selected' : input.model.selectedCell === undefined ? rowState : undefined);
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
  outer: for (const current of spans) {
    for (const grapheme of measureTextCells(current.text, { widthProfile }).graphemes) {
      if (skipped < offsetCells) {
        skipped += grapheme.cells;
        continue;
      }
      if (written + grapheme.cells > width) break outer;
      visible.push({
        text: grapheme.text,
        ...(current.style === undefined ? {} : { style: current.style }),
        ...(current.link === undefined ? {} : { link: current.link }),
        ...(current.source === undefined ? {} : { source: current.source }),
      });
      written += grapheme.cells;
    }
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

function tableHitTargets(input: ComponentInput<TableModel>): readonly HitTarget<TableAction>[] {
  const plan = tablePlan(input);
  const targets: HitTarget<TableAction>[] = [];
  if (plan.headerHeight > 0) {
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
          message: () => ({ kind: 'sortBy', columnId: column.id }),
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
              kind: 'setColumnWidth',
              columnId: column.id,
              width: Math.max(
                1,
                track.width + event.column - (event.pressColumn ?? event.column),
              ),
            }),
        });
      }
    });
  }
  plan.rows.forEach((row, visibleIndex) => {
    const rowBounds = {
      row: plan.headerHeight + visibleIndex,
      column: 0,
      width: plan.geometry.contentBounds.width,
      height: 1,
    };
    if (input.model.selectedCell === undefined) {
      targets.push({
        id: `${input.id ?? 'table'}:row:${row.id}`,
        bounds: rowBounds,
        cursor: 'pointer',
        focus: { kind: 'target', targetId: 'self' },
        message: (event) =>
          event.clickCount === 2
            ? { kind: 'activate', rowId: row.id, rowIndex: row.rowIndex }
            : { kind: 'selectRow', rowId: row.id, rowIndex: row.rowIndex },
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
          event.clickCount === 2
            ? { kind: 'activate', rowId: row.id, rowIndex: row.rowIndex, columnIndex: index }
            : { kind: 'selectCell', rowId: row.id, rowIndex: row.rowIndex, columnIndex: index },
      });
    });
  });
  if (input.model.scroll !== undefined) {
    targets.push(
      ...componentScrollbarHitTargets({
        id: input.id ?? 'table',
        plan: plan.geometry,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (event) => ({ kind: 'scroll' as const, event }),
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
        ...(column.sortable || column.resizable
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
  const selectedRowId = input.model.selectedCell?.rowId ?? input.model.selectedRowId;
  const body = plan.rows.map((row) => ({
    id: `${input.id}:row:${row.id}`,
    role: 'row' as const,
    selected: row.id === selectedRowId,
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
        role: 'gridcell' as const,
        label: cell.text,
        value: cell.text,
        selected: input.model.selectedCell?.rowId === row.id &&
          input.model.selectedCell.columnIndex === index,
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
  return {
    id: input.id,
    role: 'grid' as const,
    label: input.id,
    description: `Showing ${String(plan.startIndex + 1)}-${String(plan.endIndexExclusive)} of ${
      String(input.model.totalCount)
    } rows.`,
    ...(input.focused ? { focused: true } : {}),
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

function selectedTablePosition(
  model: TableModel,
): { readonly id: string; readonly rowIndex: number } | undefined {
  const selectedId = model.selectedCell?.rowId ?? model.selectedRowId;
  if (selectedId === undefined) return undefined;
  const source = tableSourceFor(model);
  const rowIndex = source.indexes.get(selectedId);
  return rowIndex === undefined ? undefined : { id: selectedId, rowIndex };
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
      source.columns.map((column, columnIndex) => tableCell(column, row, rowIndex, columnIndex)),
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
  readonly query: string;
  readonly selected?: string;
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

interface DynamicTreeOptions {
  readonly nodes?: unknown;
  readonly collection?: unknown;
  readonly filterQuery?: unknown;
  readonly selected?: unknown;
  readonly emptyText?: unknown;
  readonly scroll?: unknown;
  readonly scrollbar?: unknown;
  readonly scrollPolicy?: unknown;
  readonly pointerState?: unknown;
}

const treeBase = {
  name: 'terminal-ui/components/tree' as const,
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  metadata: ['focus', 'layer', 'styles'] as const,
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
  prepare: prepareTree,
  measure: measureTree,
  render: paintTree,
  accessibility: treeAccessibility,
};

const passiveTree = defineComponent<
  DynamicTreeOptions,
  TreeModel,
  never,
  TreeStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles']
>(treeBase);
const activeTree = defineComponent<
  DynamicTreeOptions,
  TreeModel,
  TreeInteractionAction,
  TreeStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles']
>({
  ...treeBase,
  keys: ({ model }) => {
    const row = selectedTreeRow(model);
    return {
      arrowUp: () => ({ kind: 'move', delta: -1 }),
      arrowDown: () => ({ kind: 'move', delta: 1 }),
      ...(row === undefined ? {} : {
        ...(row.kind === 'leaf' || row.expanded
          ? {}
          : { arrowRight: () => ({ kind: 'expand' as const, id: row.id }) }),
        ...(row.kind === 'leaf' || !row.expanded
          ? {}
          : { arrowLeft: () => ({ kind: 'collapse' as const, id: row.id }) }),
        enter: () => ({ kind: 'activate' as const, id: row.id }),
      }),
    };
  },
  pointer: { state: ({ model }) => model.pointerState, onAction: () => ignoreMessage() },
  focusTargets(input) {
    const plan = treePlan(input);
    return [{
      id: 'self',
      bounds: input.bounds,
      ...(plan.selectedVisibleIndex === undefined
        ? {}
        : { cursor: { row: plan.selectedVisibleIndex, column: 0 } }),
    }];
  },
  hitTargets: treeHitTargets,
});

export function tree<
  TMetadata extends Readonly<Record<string, unknown>>,
  const TMessage extends ComponentMessage = never,
>(options: ScrollableTreeOptions<TMetadata, TMessage>): Element<TMessage>;
// The passive overload intentionally excludes scroll actions.
export function tree<
  TMetadata extends Readonly<Record<string, unknown>>,
  const TMessage extends ComponentMessage = never,
>(
  // eslint-disable-next-line @typescript-eslint/unified-signatures
  options: PassiveTreeOptions<TMetadata, TMessage>
): Element<TMessage>;
export function tree<
  TMetadata extends Readonly<Record<string, unknown>>,
  const TMessage extends ComponentMessage = never,
>(options: TreeOptions<TMetadata, TMessage>): Element<TMessage> {
  const own: DynamicTreeOptions = options;
  const shared = {
    ...own,
    id: options.id,
    ...(options.meta === undefined ? {} : { meta: options.meta }),
  };
  const onAction = options.onAction;
  if (onAction === undefined) return passiveTree(shared);
  if (options.scroll === undefined) {
    return activeTree({
      ...shared,
      onAction: (action) =>
        action.kind === 'scroll' ? ignoreMessage() : onAction(action),
    });
  }
  return activeTree({ ...shared, onAction: options.onAction });
}

function prepareTree(value: Readonly<Record<string, unknown>>): TreeModel {
  assertExactFields(value, [
    'nodes', 'collection', 'filterQuery', 'selected', 'emptyText', 'scroll', 'scrollbar',
    'scrollPolicy', 'pointerState',
  ], 'tree options');
  const query = (text(value['filterQuery'], 'tree filterQuery') ?? '').trim();
  let collection: CollectionProjection<CollectionRecord>;
  let startIndex: number;
  let totalCount: number;
  if (value['collection'] !== undefined) {
    if (value['nodes'] !== undefined) {
      throw new TypeError('tree accepts nodes or collection, not both.');
    }
    const supplied = value['collection'];
    if (!isCollectionProjection(supplied)) {
      throw new TypeError(
        'tree collection must be prepared with prepareTreeCollection() or prepareTreeRows().',
      );
    }
    collection = supplied;
    startIndex = supplied.startIndex;
    totalCount = supplied.totalCount;
  } else {
    if (!Array.isArray(value['nodes'])) throw new TypeError('tree requires nodes or collection.');
    const nodes = prepareTreeNodes(value['nodes']);
    collection = prepareTreeCollection(nodes, query === '' ? {} : { filterQuery: query });
    startIndex = collection.startIndex;
    totalCount = collection.totalCount;
  }
  const sourceToken = Object.freeze({});
  treeSources.set(sourceToken, preparedTreeSource(collection));
  const scroll = prepareComponentScrollState(value['scroll'], 'tree scroll');
  const scrollbar = prepareComponentScrollbarOptions(value['scrollbar'], 'tree scrollbar');
  const scrollPolicy = prepareComponentScrollPolicy(value['scrollPolicy'], 'tree scrollPolicy');
  if (scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)) {
    throw new TypeError('tree scrollbar and scrollPolicy require scroll state.');
  }
  const selected = value['selected'] === undefined
    ? undefined
    : nonEmpty(value['selected'], 'tree selected');
  const pointerState = preparePointerState(value['pointerState'], 'tree');
  return {
    source: sourceToken,
    startIndex,
    totalCount,
    query,
    ...(selected === undefined ? {} : { selected }),
    emptyText: text(value['emptyText'], 'tree emptyText') ?? 'No items',
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
    ...(pointerState === undefined ? {} : { pointerState }),
  };
}

function preparedTreeSource(
  collection: CollectionProjection<CollectionRecord>,
): PreparedTreeSource {
  const cached = preparedTreeCollections.get(collection);
  if (cached !== undefined) return cached;
  const rows = Object.freeze(collection.records.map((record, index) => {
    const prepared = prepareTreeRecord(
      collectionRow(record, `tree collection records[${String(index)}]`),
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

function prepareTreeNodes(values: readonly unknown[]): readonly TreeNode[] {
  return values.map((value, index) => prepareTreeNode(value, `tree nodes[${String(index)}]`));
}

function prepareTreeNode(value: unknown, owner: string): TreeNode {
  if (!isNonArrayObject(value)) throw new TypeError(`${owner} must be an object.`);
  const kind = value['kind'];
  if (kind !== 'leaf' && kind !== 'branch' && kind !== 'lazy') {
    throw new TypeError(`${owner}.kind is invalid.`);
  }
  const allowed = new Set([
    'id',
    'label',
    'kind',
    'description',
    'disabled',
    'icon',
    'metadata',
    ...(kind === 'branch'
      ? ['expanded', 'children']
      : kind === 'lazy'
      ? ['expanded', 'loading']
      : []),
  ]);
  const unsupported = Object.keys(value).find((field) => !allowed.has(field));
  if (unsupported !== undefined) {
    throw new TypeError(`${owner} contains unknown field "${unsupported}".`);
  }
  const base = {
    id: nonEmpty(value['id'], `${owner}.id`),
    label: text(value['label'], `${owner}.label`) ?? '',
    ...(value['description'] === undefined
      ? {}
      : { description: text(value['description'], `${owner}.description`) ?? '' }),
    ...(value['disabled'] === undefined
      ? {}
      : { disabled: boolean(value['disabled'], `${owner}.disabled`) }),
    ...(value['icon'] === undefined ? {} : { icon: text(value['icon'], `${owner}.icon`) ?? '' }),
    ...(value['metadata'] === undefined
      ? {}
      : { metadata: plainObject(value['metadata'], `${owner}.metadata`) }),
  };
  if (kind === 'leaf') return { ...base, kind };
  const expanded = boolean(value['expanded'], `${owner}.expanded`);
  if (kind === 'branch') {
    if (!Array.isArray(value['children'])) {
      throw new TypeError(`${owner}.children must be an array.`);
    }
    return { ...base, kind, expanded, children: prepareTreeNodes(value['children']) };
  }
  const loading = value['loading'];
  if (!isNonArrayObject(loading)) throw new TypeError(`${owner}.loading must be an object.`);
  const loadingKind = loading['kind'];
  if (
    loadingKind !== 'idle' && loadingKind !== 'pending' && loadingKind !== 'error' &&
    loadingKind !== 'empty'
  ) throw new TypeError(`${owner}.loading.kind is invalid.`);
  const loadingUnsupported = Object.keys(loading).find((field) =>
    field !== 'kind' && field !== 'message'
  );
  if (loadingUnsupported !== undefined) {
    throw new TypeError(`${owner}.loading contains unknown field "${loadingUnsupported}".`);
  }
  const message = loading['message'] === undefined
    ? undefined
    : text(loading['message'], `${owner}.loading.message`);
  if (loadingKind === 'error' && message === undefined) {
    throw new TypeError(`${owner}.loading.message is required for errors.`);
  }
  return { ...base, kind, expanded, loading: preparedTreeLoading(loadingKind, message) };
}

function plainObject(value: unknown, owner: string): Readonly<Record<string, unknown>> {
  if (!isNonArrayObject(value)) throw new TypeError(`${owner} must be a plain object.`);
  return value;
}

function prepareTreeRecord(value: unknown, itemIndex: number): TreeRow {
  if (!isNonArrayObject(value)) throw new TypeError('tree collection row is invalid.');
  assertExactFields(value, ['node', 'depth', 'path', 'lazyPlaceholder'], 'tree collection row');
  const node = prepareVisibleTreeNode(value['node'], 'tree collection row.node');
  const depth = nonNegative(value['depth'], 'tree row depth');
  const path = value['path'];
  if (!Array.isArray(path) || path.some((part) => typeof part !== 'string')) {
    throw new TypeError('tree row path must be a string array.');
  }
  const lazyPlaceholder = value['lazyPlaceholder'];
  if (lazyPlaceholder !== undefined && typeof lazyPlaceholder !== 'boolean') {
    throw new TypeError('tree row lazyPlaceholder must be a boolean.');
  }
  return treeRow({
    node,
    depth,
    path: path.map((part) => sanitizeTerminalText(part as string).text),
    ...(lazyPlaceholder === true ? { lazyPlaceholder: true } : {}),
  }, itemIndex);
}

function prepareVisibleTreeNode(value: unknown, owner: string): TreeNode {
  if (!isNonArrayObject(value)) throw new TypeError(`${owner} must be an object.`);
  const kind = value['kind'];
  if (kind !== 'leaf' && kind !== 'branch' && kind !== 'lazy') {
    throw new TypeError(`${owner}.kind is invalid.`);
  }
  assertExactFields(value, [
    'id',
    'label',
    'kind',
    'description',
    'disabled',
    'icon',
    'metadata',
    ...(kind === 'branch'
      ? ['expanded', 'children']
      : kind === 'lazy'
      ? ['expanded', 'loading']
      : []),
  ], owner);
  const base = {
    id: nonEmpty(value['id'], `${owner}.id`),
    label: text(value['label'], `${owner}.label`) ?? '',
    ...(value['description'] === undefined
      ? {}
      : { description: text(value['description'], `${owner}.description`) ?? '' }),
    ...(value['disabled'] === undefined
      ? {}
      : { disabled: boolean(value['disabled'], `${owner}.disabled`) }),
    ...(value['icon'] === undefined ? {} : { icon: text(value['icon'], `${owner}.icon`) ?? '' }),
  };
  if (kind === 'leaf') return { ...base, kind };
  const expanded = boolean(value['expanded'], `${owner}.expanded`);
  if (kind === 'branch') {
    if (!Array.isArray(value['children'])) {
      throw new TypeError(`${owner}.children must be an array.`);
    }
    return { ...base, kind, expanded, children: [] };
  }
  const loading = value['loading'];
  if (!isNonArrayObject(loading)) throw new TypeError(`${owner}.loading must be an object.`);
  assertExactFields(loading, ['kind', 'message'], `${owner}.loading`);
  const loadingKind = loading['kind'];
  if (
    loadingKind !== 'idle' && loadingKind !== 'pending' && loadingKind !== 'error' &&
    loadingKind !== 'empty'
  ) throw new TypeError(`${owner}.loading.kind is invalid.`);
  const message = loading['message'] === undefined
    ? undefined
    : text(loading['message'], `${owner}.loading.message`);
  if (loadingKind === 'error' && message === undefined) {
    throw new TypeError(`${owner}.loading.message is required for errors.`);
  }
  return { ...base, kind, expanded, loading: preparedTreeLoading(loadingKind, message) };
}

function preparedTreeLoading(
  kind: TreeLazyState['kind'],
  message: string | undefined,
): TreeLazyState {
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
    expanded: value.node.kind !== 'leaf' && value.node.expanded,
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
      contentRows: input.model.totalCount,
      contentColumns: input.bounds.width,
      viewportRows: input.bounds.height,
      viewportColumns: input.bounds.width,
      followTail: false,
    };
  return prepareComponentScrollbar({
    bounds: input.bounds,
    scroll: {
      ...scroll,
      contentRows: input.model.totalCount,
      viewportRows: input.bounds.height,
      viewportColumns: input.bounds.width,
    },
    ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
    defaultAxis: 'vertical',
  });
}

function treePlan(input: ComponentInput<TreeModel>) {
  const source = treeSourceFor(input.model);
  const geometry = treeGeometry(input);
  const selectedIndex = input.model.selected === undefined
    ? undefined
    : source.indexes.get(input.model.selected);
  const requested = dataWindow({
    totalRows: input.model.totalCount,
    viewportRows: geometry.contentBounds.height,
    ...(selectedIndex === undefined ? {} : { selectedIndex }),
    ...(input.model.scroll === undefined ? {} : {
      scroll: {
        ...input.model.scroll,
        contentRows: input.model.totalCount,
        viewportRows: geometry.contentBounds.height,
        viewportColumns: geometry.contentBounds.width,
      },
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
  const selectedVisibleIndex = selectedIndex === undefined || selectedIndex < startIndex ||
      selectedIndex >= startIndex + rows.length
    ? undefined
    : selectedIndex - startIndex;
  return {
    geometry,
    rows,
    startIndex,
    endIndexExclusive: startIndex + rows.length,
    selectedVisibleIndex,
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

function selectedTreeRow(model: TreeModel): TreeRow | undefined {
  if (model.selected === undefined) return undefined;
  const source = treeSourceFor(model);
  const itemIndex = source.indexes.get(model.selected);
  if (itemIndex === undefined) return undefined;
  return preparedTreeRow(model, itemIndex - model.startIndex);
}

function paintTreeRow(
  input: ComponentRenderInput<TreeModel, TreeStylePart>,
  row: TreeRow,
  visibleIndex: number,
  width: number,
): void {
  const selected = row.id === input.model.selected;
  const bodyId = `${input.id ?? 'tree'}:${row.id}:body`;
  const disclosureId = `${input.id ?? 'tree'}:${row.id}:disclosure`;
  const pointer = pointerVisualState(input.model.pointerState, bodyId);
  const state: 'disabled' | 'hovered' | 'pressed' | 'selected' | 'focused' | undefined =
    row.disabled || row.lazyPlaceholder ? 'disabled' : pointer ??
      (input.focus === 'self' && selected ? 'focused' : selected ? 'selected' : undefined);
  const disclosurePointer = pointerVisualState(input.model.pointerState, disclosureId);
  const disclosureState: typeof state = row.disabled || row.lazyPlaceholder
    ? 'disabled'
    : disclosurePointer ?? state;
  const markerStyle = input.style({ part: 'marker', ...(state === undefined ? {} : { state }) });
  const marker = selected && !terminalStyleHasBackground(markerStyle, input.theme)
    ? input.theme.tokens.symbols.selected
    : input.theme.tokens.symbols.unselected;
  const labelStyle = input.style({
    part: row.lazyPlaceholder ? 'placeholder' : 'label',
    base: { fg: { kind: 'theme', token: 'text.default' } },
    ...(state === undefined ? {} : { state }),
  });
  const disclosureStyle = input.style({
    part: row.lazyPlaceholder ? 'placeholder' : 'disclosure',
    base: { fg: { kind: 'theme', token: 'tree.branch' } },
    ...(disclosureState === undefined ? {} : { state: disclosureState }),
  });
  const indentStyle = input.style({
    part: 'indent',
    base: { fg: { kind: 'theme', token: 'tree.branch' } },
    ...(state === undefined ? {} : { state }),
  });
  const iconStyle = input.style({ part: 'icon', ...(state === undefined ? {} : { state }) });
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
  const query = input.model.query.toLocaleLowerCase();
  const index = query === '' ? -1 : row.label.toLocaleLowerCase().indexOf(query);
  if (index < 0) {
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
    ...(index === 0 ? [] : [
      span(row.label.slice(0, index), {
        ...(labelStyle === undefined ? {} : { style: labelStyle }),
        source: source(`node.${row.id}.label`, 'label', 'text'),
      }),
    ]),
    span(row.label.slice(index, index + query.length), {
      ...(matchStyle === undefined ? {} : { style: matchStyle }),
      source: source(`node.${row.id}.match`, 'match', 'text'),
    }),
    ...(index + query.length >= row.label.length ? [] : [
      span(row.label.slice(index + query.length), {
        ...(labelStyle === undefined ? {} : { style: labelStyle }),
        source: source(`node.${row.id}.label`, 'label', 'text'),
      }),
    ]),
  ];
}

function treeHitTargets(input: ComponentInput<TreeModel>) {
  const plan = treePlan(input);
  const targets = plan.rows.flatMap((row, index): HitTarget<TreeInteractionAction>[] => {
    if (row.disabled || row.lazyPlaceholder) return [];
    const result: HitTarget<TreeInteractionAction>[] = [];
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
        message: () => ({ kind: 'toggle', id: row.id }),
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
            ? { kind: 'activate', id: row.id }
            : { kind: 'select', id: row.id },
      });
    }
    return result;
  });
  if (input.model.scroll !== undefined) {
    return [
      ...targets,
      ...componentScrollbarHitTargets<TreeInteractionAction>({
        id: input.id ?? 'tree',
        plan: plan.geometry,
        ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
        onScroll: (event) => ({ kind: 'scroll', event }),
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
      selected: row.id === input.model.selected,
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

function preparePointerState(value: unknown, owner: string): PointerInteractionState | undefined {
  if (value === undefined) return undefined;
  if (!isNonArrayObject(value)) throw new TypeError(`${owner} pointerState must be an object.`);
  const unsupported = Object.keys(value).find((field) =>
    field !== 'hoveredTargetId' && field !== 'pressedTargetId'
  );
  if (unsupported !== undefined) {
    throw new TypeError(`${owner} pointerState contains unknown field "${unsupported}".`);
  }
  const hoveredTargetId = value['hoveredTargetId'];
  const pressedTargetId = value['pressedTargetId'];
  if (hoveredTargetId !== undefined && typeof hoveredTargetId !== 'string') {
    throw new TypeError(`${owner} hoveredTargetId must be a string.`);
  }
  if (pressedTargetId !== undefined && typeof pressedTargetId !== 'string') {
    throw new TypeError(`${owner} pressedTargetId must be a string.`);
  }
  return {
    ...(hoveredTargetId === undefined ? {} : { hoveredTargetId }),
    ...(pressedTargetId === undefined ? {} : { pressedTargetId }),
  };
}
function arrayObjects(value: unknown, owner: string): readonly Readonly<Record<string, unknown>>[] {
  if (!Array.isArray(value)) throw new TypeError(`${owner} must be an array.`);
  return value.map((entry, index) => {
    if (!isNonArrayObject(entry)) {
      throw new TypeError(`${owner}[${String(index)}] must be an object.`);
    }
    return entry;
  });
}
function isUnknownCallback(value: unknown): value is (...arguments_: unknown[]) => unknown {
  return typeof value === 'function';
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
function assertExactFields(
  value: Readonly<Record<string, unknown>>,
  allowed: readonly string[],
  owner: string,
): void {
  const unsupported = Object.keys(value).find((field) => !allowed.includes(field));
  if (unsupported !== undefined) {
    throw new TypeError(`${owner} contains unknown field "${unsupported}".`);
  }
}
function assertUniqueIds(ids: readonly string[], owner: string): void {
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) throw new TypeError(`${owner} contains duplicate id "${id}".`);
    seen.add(id);
  }
}
