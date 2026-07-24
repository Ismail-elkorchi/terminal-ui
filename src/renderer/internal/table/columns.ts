import type { RenderNodeOfKind } from '../../model/index.ts';
import { measureTextCells, sanitizeTerminalText } from '../../../text/index.ts';
import type { TextWidthProfile } from '../../../text/index.ts';
import type {
  TableColumnAlignment,
  TableColumnSemantic,
  TableColumnWidth
} from '../../../ui-model/content.ts';
import type { TableRenderColumn } from '../../model/props/content.ts';
import type { TableSortDirection, TableSortState } from '../../../ui-model/table.ts';
import type { InlineContent, InlineContentSegment } from '../../../visual/inline-content.ts';
import type { TerminalStyle } from '../../../visual/render.ts';

export interface NormalizedTableColumn {
  readonly id: string;
  readonly index: number;
  readonly header?: string;
  readonly width?: TableColumnWidth;
  readonly align: TableColumnAlignment;
  readonly semantic: TableColumnSemantic;
  readonly style?: TerminalStyle;
  readonly headerStyle?: TerminalStyle;
  readonly renderCell?: (
    row: unknown,
    rowIndex: number,
    columnIndex: number
  ) => string | InlineContentSegment | InlineContent;
  readonly value: (row: unknown, rowIndex: number) => unknown;
  readonly sort?: TableSortDirection;
  readonly sortable?: boolean;
  readonly resizable?: boolean;
}

export function tableColumns(renderNode: TableNode, rows: readonly unknown[]): readonly NormalizedTableColumn[] {
  const raw = renderNode.props.columns;
  const configured = raw?.flatMap((column, index) => normalizeColumn(column, index)) ?? [];
  const columns = configured.length > 0 ? configured : Array.from({
    length: rows.reduce<number>((max, row) => Math.max(max, rowCells(row).length), 0)
  }, (_value, index): NormalizedTableColumn => ({
    id: `column-${String(index)}`,
    index,
    align: 'start',
    semantic: 'text',
    value: (row: unknown) => rowCells(row)[index]
  }));
  const sort = tableSort(renderNode.props.sort);
  const widths = tableColumnWidthOverrides(renderNode.props.columnWidths);
  return columns.map((column) => ({
    ...column,
    ...(widths[column.id] === undefined ? {} : { width: widths[column.id] }),
    ...(sort?.columnId === column.id ? { sort: sort.direction } : {})
  }));
}

export function tableColumnWidths(
  columns: readonly NormalizedTableColumn[],
  rows: readonly unknown[],
  availableWidth: number,
  separatorWidth: number,
  widthProfile: TextWidthProfile
): readonly number[] {
  if (columns.length === 0) return [];
  const separators = Math.max(0, columns.length - 1) * separatorWidth;
  const widthBudget = Math.max(columns.length, availableWidth - separators);
  const base = columns.map((column) => requiresIntrinsicWidth(column.width)
    ? intrinsicColumnWidth(column, rows, widthProfile)
    : 1
  );
  const fixed = columns.map((column, index) => explicitWidth(column.width, widthBudget, base[index] ?? 1));
  const used = fixed.reduce<number>((sum, width) => sum + (width ?? 0), 0);
  const fillColumns = columns.flatMap((column, index) => fixed[index] === undefined ? [{ column, index }] : []);
  const remaining = Math.max(0, widthBudget - used);
  const fillWeight = fillColumns.reduce<number>((sum, item) => sum + fillWeightFor(item.column.width), 0);
  return columns.map((column, index) => {
    const explicit = fixed[index];
    if (explicit !== undefined) return explicit;
    const weight = fillWeightFor(column.width);
    return Math.max(1, Math.floor(remaining * (weight / Math.max(1, fillWeight))));
  });
}

export function tableIntrinsicSize(
  renderNode: TableNode,
  widthProfile: TextWidthProfile
): { readonly width: number; readonly height: number } {
  const rows = renderNode.props.collection.records.slice(0, 64).map((record) => record.row);
  const columns = tableColumns(renderNode, rows);
  const widths = columns.map((column) => {
    if (typeof column.width === 'number') return Math.max(1, Math.floor(column.width));
    if (column.width?.kind === 'fixed') return Math.max(1, Math.floor(column.width.cells));
    return intrinsicColumnWidth(column, rows, widthProfile);
  });
  const width = widths.reduce((sum, columnWidth, index) => sum + columnWidth + (index === 0 ? 2 : 4), 0);
  const hasHeader = columns.some((column) => (column.header?.length ?? 0) > 0);
  return {
    width,
    height: renderNode.props.collection.totalCount + (hasHeader ? 1 : 0)
  };
}

export function tableSortMarker(sort: TableSortDirection | undefined): string {
  if (sort === 'ascending') return ' ↑';
  if (sort === 'descending') return ' ↓';
  return '';
}

export function tableResizeMarker(column: Pick<NormalizedTableColumn, 'resizable'>): string {
  return column.resizable === true ? ' ↔' : '';
}

export function sanitizeTableText(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

export function displayTableValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return sanitizeTableText(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value instanceof Date) return value.toISOString();
  const json: unknown = JSON.stringify(value);
  return typeof json === 'string' ? sanitizeTableText(json) : '';
}

function normalizeColumn(column: TableRenderColumn, index: number): readonly NormalizedTableColumn[] {
  if (column.hidden === true) return [];
  const id = column.id;
  const value = column.value;
  if (typeof id !== 'string' || id.trim().length === 0) {
    throw new TypeError(`Table column ${String(index)} must define a non-empty id.`);
  }
  if (typeof value !== 'function') {
    throw new TypeError(`Table column "${id}" must define a value(row, rowIndex) accessor.`);
  }
  const header = column.header;
  const align = column.align;
  const style = column.style;
  const headerStyle = column.headerStyle;
  const renderCell = column.renderCell;
  const width = normalizeWidth(column.width);
  const normalizedAlign: TableColumnAlignment = align === 'center' || align === 'end' ? align : 'start';
  const semantic = normalizeColumnSemantic(column.semantic, normalizedAlign);
  return [{
    id: sanitizeTableText(id),
    index,
    ...(typeof header === 'string' ? { header: sanitizeTableText(header) } : {}),
    ...(width === undefined ? {} : { width }),
    align: normalizedAlign,
    semantic,
    value,
    ...(isTerminalStyle(style) ? { style } : {}),
    ...(isTerminalStyle(headerStyle) ? { headerStyle } : {}),
    ...(typeof renderCell === 'function' ? { renderCell } : {}),
    ...(column.sortable === true ? { sortable: true } : {}),
    ...(column.resizable === true ? { resizable: true } : {})
  }];
}

function requiresIntrinsicWidth(width: TableColumnWidth | undefined): boolean {
  return width === undefined || (typeof width === 'object' && width.kind === 'content');
}

function explicitWidth(width: TableColumnWidth | undefined, availableWidth: number, intrinsic: number): number | undefined {
  if (typeof width === 'number') return Math.max(1, Math.floor(width));
  if (width === undefined) return intrinsic;
  switch (width.kind) {
    case 'fixed':
      return Math.max(1, Math.floor(width.cells));
    case 'percent':
      return Math.max(1, Math.floor(availableWidth * (width.value / 100)));
    case 'content':
      return Math.max(width.min ?? 1, Math.min(width.max ?? intrinsic, intrinsic));
    case 'fill':
      return undefined;
  }
}

function fillWeightFor(width: TableColumnWidth | undefined): number {
  return typeof width === 'object' && width.kind === 'fill' ? Math.max(1, width.weight ?? 1) : 1;
}

function intrinsicColumnWidth(
  column: NormalizedTableColumn,
  rows: readonly unknown[],
  widthProfile: TextWidthProfile
): number {
  const header = `${column.header ?? ''}${tableSortMarker(column.sort)}`;
  const headerWidth = measureTextCells(header, { widthProfile }).cells;
  const cellWidth = rows.reduce<number>((max, row, rowIndex) => Math.max(
    max,
    measureTextCells(displayTableValue(column.value(row, rowIndex)), { widthProfile }).cells
  ), 1);
  return Math.max(1, headerWidth, Math.min(cellWidth, 24));
}

function tableSort(value: unknown): TableSortState | undefined {
  if (!isRecord(value)) return undefined;
  const columnId = value['columnId'];
  const direction = value['direction'];
  return typeof columnId === 'string' && (direction === 'ascending' || direction === 'descending')
    ? { columnId, direction }
    : undefined;
}

function tableColumnWidthOverrides(value: unknown): Readonly<Record<string, number>> {
  if (!isRecord(value)) return {};
  return Object.fromEntries(Object.entries(value).flatMap(([id, width]) =>
    typeof width === 'number' && Number.isFinite(width)
      ? [[id, Math.max(1, Math.floor(width))] as const]
      : []
  ));
}

function normalizeColumnSemantic(value: unknown, align: TableColumnAlignment): TableColumnSemantic {
  if (value === 'metric' || value === 'metadata' || value === 'text') return value;
  return align === 'end' ? 'metric' : 'text';
}

function normalizeWidth(value: unknown): TableColumnWidth | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.max(1, Math.floor(value));
  if (!isRecord(value)) return undefined;
  const kind = value['kind'];
  if (kind === 'fixed' && typeof value['cells'] === 'number') return { kind, cells: Math.max(1, Math.floor(value['cells'])) };
  if (kind === 'percent' && typeof value['value'] === 'number') return { kind, value: Math.max(0, value['value']) };
  if (kind === 'fill') return { kind, ...(typeof value['weight'] === 'number' ? { weight: Math.max(1, value['weight']) } : {}) };
  if (kind === 'content') {
    return {
      kind,
      ...(typeof value['min'] === 'number' ? { min: Math.max(1, Math.floor(value['min'])) } : {}),
      ...(typeof value['max'] === 'number' ? { max: Math.max(1, Math.floor(value['max'])) } : {})
    };
  }
  return undefined;
}

function rowCells(row: unknown): readonly unknown[] {
  return Array.isArray(row) ? row : [row];
}

function isTerminalStyle(value: unknown): value is TerminalStyle {
  return isRecord(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type TableNode = RenderNodeOfKind<unknown, 'table'>;
