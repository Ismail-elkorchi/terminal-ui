import { clipTextCells, measureTextCells, sanitizeTerminalText } from '../text/index.ts';
import { numberProp, stringify } from './widget-props.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme, ThemeToken } from '../theme/index.ts';
import type {
  TableCellRenderInput,
  TableColumn,
  TableColumnAlignment,
  TableColumnWidth,
  Widget
} from '../widgets/index.ts';
import type { Rect } from './layout.ts';
import type { RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './render-primitives.ts';
import type { ScrollState } from './scroll.ts';

interface NormalizedColumn {
  readonly index: number;
  readonly header?: string;
  readonly width?: TableColumnWidth;
  readonly align: TableColumnAlignment;
  readonly style?: TerminalStyle;
  readonly headerStyle?: TerminalStyle;
  readonly render?: (input: TableCellRenderInput) => string | RenderSpan | readonly RenderSpan[];
  readonly sort?: TableColumn['sort'];
}

interface TableWindow {
  readonly rows: readonly unknown[];
  readonly start: number;
  readonly end: number;
  readonly selected: number;
  readonly horizontalOffset: number;
}

export function tableBlock(widget: Widget, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const rows = tableRows(widget);
  const columns = tableColumns(widget, rows);
  const hasHeader = columns.some((column) => column.header !== undefined);
  const headerHeight = hasHeader && widget.props['stickyHeader'] !== false ? 1 : 0;
  const bodyHeight = Math.max(0, bounds.height - headerHeight);
  const selected = selectedTableRow(widget);
  const window = tableWindow(widget, rows, bodyHeight, selected);
  const widths = columnWidths(columns, rows, Math.max(1, bounds.width - 2));
  const lines: RenderLine[] = [];
  if (hasHeader && headerHeight > 0) {
    lines.push(scrolledLine(headerLine(columns, widths), window.horizontalOffset, bounds.width));
  }
  if (rows.length === 0 && bodyHeight > 0) {
    lines.push(scrolledLine(emptyLine(widget), window.horizontalOffset, bounds.width));
  } else {
    lines.push(...window.rows.map((row, visibleIndex) => {
      const rowIndex = window.start + visibleIndex;
      return scrolledLine(rowLine(row, rowIndex, columns, widths, rowIndex === window.selected, selectedTableCell(widget), theme), window.horizontalOffset, bounds.width);
    }));
  }
  return { lines: lines.slice(0, bounds.height) };
}

export function tableAccessibleBase(widget: Widget, bounds: Rect, id: string, focused: boolean): AccessibleNode {
  const rows = tableRows(widget);
  const columns = tableColumns(widget, rows);
  const hasHeader = columns.some((column) => column.header !== undefined);
  const headerHeight = hasHeader && widget.props['stickyHeader'] !== false ? 1 : 0;
  const bodyHeight = Math.max(0, bounds.height - headerHeight);
  const window = tableWindow(widget, rows, bodyHeight, selectedTableRow(widget));
  return {
    id,
    role: 'table',
    label: id,
    description: `Showing ${String(window.start + 1)}-${String(window.end)} of ${String(rows.length)} rows.`,
    ...(focused ? { focused } : {})
  };
}

export function tableAccessibleChildren(widget: Widget, bounds: Rect): readonly AccessibleNode[] {
  const rows = tableRows(widget);
  const columns = tableColumns(widget, rows);
  const hasHeader = columns.some((column) => column.header !== undefined);
  const headerHeight = hasHeader && widget.props['stickyHeader'] !== false ? 1 : 0;
  const window = tableWindow(widget, rows, Math.max(0, bounds.height - headerHeight), selectedTableRow(widget));
  const selectedCell = selectedTableCell(widget);
  return window.rows.map((row, visibleIndex) => {
    const rowIndex = window.start + visibleIndex;
    return {
      id: `${widget.id ?? 'table'}:row:${String(rowIndex)}`,
      role: 'row',
      selected: rowIndex === window.selected,
      children: columns.map((column, columnIndex) => {
        const value = rowCell(row, column.index);
        return {
          id: `${widget.id ?? 'table'}:row:${String(rowIndex)}:cell:${String(column.index)}`,
          role: 'cell',
          label: displayValue(value),
          value: displayValue(value),
          selected: selectedCell?.row === rowIndex && selectedCell.column === columnIndex
        };
      })
    };
  });
}

function tableWindow(widget: Widget, rows: readonly unknown[], bodyHeight: number, selected: number): TableWindow {
  const scroll = scrollProp(widget);
  if (scroll !== undefined) {
    const start = Math.max(0, Math.min(rows.length, Math.floor(scroll.offsetRow)));
    const end = Math.min(rows.length, start + Math.max(0, bodyHeight));
    return {
      rows: rows.slice(start, end),
      start,
      end,
      selected,
      horizontalOffset: Math.max(0, Math.floor(scroll.offsetColumn))
    };
  }
  const start = Math.min(Math.max(0, selected - Math.floor(bodyHeight / 2)), Math.max(0, rows.length - bodyHeight));
  const end = Math.min(rows.length, start + Math.max(0, bodyHeight));
  return {
    rows: rows.slice(start, end),
    start,
    end,
    selected,
    horizontalOffset: 0
  };
}

function headerLine(columns: readonly NormalizedColumn[], widths: readonly number[]): RenderLine {
  const spans: RenderSpan[] = [{ text: '  ' }];
  columns.forEach((column, index) => {
    if (index > 0) spans.push({ text: '  ' });
    const label = `${column.header ?? ''}${sortMarker(column.sort)}`;
    spans.push(...cellSpans([{ text: label, style: column.headerStyle ?? themeStyle('table.header') }], widths[index] ?? 1, column.align));
  });
  return { spans };
}

function rowLine(
  row: unknown,
  rowIndex: number,
  columns: readonly NormalizedColumn[],
  widths: readonly number[],
  selected: boolean,
  selectedCell: { readonly row: number; readonly column: number } | undefined,
  theme: TerminalTheme
): RenderLine {
  const spans: RenderSpan[] = [{ text: `${selected ? theme.symbols.pointer : theme.symbols.unselected} ` }];
  columns.forEach((column, columnIndex) => {
    if (columnIndex > 0) spans.push({ text: '  ' });
    const rendered = renderCell(row, rowIndex, column, columnIndex);
    const selectedStyle = selectedCell?.row === rowIndex && selectedCell.column === columnIndex ? selectionStyle() : undefined;
    spans.push(...cellSpans(rendered, widths[columnIndex] ?? 1, column.align, selectedStyle));
  });
  return { spans };
}

function emptyLine(widget: Widget): RenderLine {
  const emptyText = clean(stringify(widget.props['emptyText'])) || 'No rows';
  return {
    spans: [
      { text: '  ' },
      { text: emptyText, style: themeStyle('text.muted') }
    ]
  };
}

function renderCell(row: unknown, rowIndex: number, column: NormalizedColumn, columnIndex: number): readonly RenderSpan[] {
  const value = rowCell(row, column.index);
  if (column.render !== undefined) {
    return renderResultToSpans(column.render({ value, row, rowIndex, columnIndex }), column.style);
  }
  return [{ text: displayValue(value), ...(column.style === undefined ? {} : { style: column.style }) }];
}

function renderResultToSpans(result: string | RenderSpan | readonly RenderSpan[], style: TerminalStyle | undefined): readonly RenderSpan[] {
  if (typeof result === 'string') return [{ text: clean(result), ...(style === undefined ? {} : { style }) }];
  if (isRenderSpanArray(result)) return result.map((span) => cleanSpan(span, style));
  return [cleanSpan(result, style)];
}

function cleanSpan(span: RenderSpan, fallbackStyle: TerminalStyle | undefined): RenderSpan {
  return {
    text: clean(span.text),
    ...(span.style === undefined && fallbackStyle !== undefined ? { style: fallbackStyle } : {}),
    ...(span.style === undefined ? {} : { style: span.style }),
    ...(span.link === undefined ? {} : { link: span.link }),
    ...(span.source === undefined ? {} : { source: span.source })
  };
}

function cellSpans(
  spans: readonly RenderSpan[],
  width: number,
  align: TableColumnAlignment,
  overrideStyle?: TerminalStyle
): readonly RenderSpan[] {
  const text = spans.map((span) => span.text).join('');
  const clipped = clipTextCells(text, width, { ellipsis: '…' }).text;
  const cells = measureTextCells(clipped).cells;
  const padding = Math.max(0, width - cells);
  const before = align === 'end' ? padding : align === 'center' ? Math.floor(padding / 2) : 0;
  const after = Math.max(0, padding - before);
  const rendered: RenderSpan[] = [];
  if (before > 0) rendered.push({ text: ' '.repeat(before) });
  rendered.push({ text: clipped, ...(overrideStyle === undefined ? mergedSpanOptions(spans, clipped) : { style: overrideStyle }) });
  if (after > 0) rendered.push({ text: ' '.repeat(after) });
  return rendered;
}

function mergedSpanOptions(spans: readonly RenderSpan[], clipped: string): Omit<RenderSpan, 'text'> {
  if (spans.length !== 1 || clipped.length === 0) return {};
  const span = spans[0];
  if (span === undefined) return {};
  return {
    ...(span.style === undefined ? {} : { style: span.style }),
    ...(span.link === undefined ? {} : { link: span.link }),
    ...(span.source === undefined ? {} : { source: span.source })
  };
}

function scrolledLine(line: RenderLine, offsetCells: number, width: number): RenderLine {
  if (offsetCells <= 0) return line;
  const spans: RenderSpan[] = [];
  let skipped = 0;
  let written = 0;
  for (const span of line.spans) {
    for (const segment of measureTextCells(span.text).graphemes) {
      if (skipped < offsetCells) {
        skipped += segment.cells;
        continue;
      }
      if (written >= width) break;
      spans.push({
        text: segment.text,
        ...(span.style === undefined ? {} : { style: span.style }),
        ...(span.link === undefined ? {} : { link: span.link }),
        ...(span.source === undefined ? {} : { source: span.source })
      });
      written += segment.cells;
    }
    if (written >= width) break;
  }
  return { spans };
}

function columnWidths(columns: readonly NormalizedColumn[], rows: readonly unknown[], availableWidth: number): readonly number[] {
  if (columns.length === 0) return [];
  const separators = Math.max(0, columns.length - 1) * 2;
  const widthBudget = Math.max(columns.length, availableWidth - separators);
  const base = columns.map((column) => intrinsicColumnWidth(column, rows));
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

function intrinsicColumnWidth(column: NormalizedColumn, rows: readonly unknown[]): number {
  const header = `${column.header ?? ''}${sortMarker(column.sort)}`;
  const headerWidth = measureTextCells(header).cells;
  const cellWidth = rows.reduce<number>((max, row) => Math.max(max, measureTextCells(displayValue(rowCell(row, column.index))).cells), 1);
  return Math.max(1, headerWidth, Math.min(cellWidth, 24));
}

function tableRows(widget: Widget): readonly unknown[] {
  return Array.isArray(widget.props['rows']) ? widget.props['rows'] : [];
}

function tableColumns(widget: Widget, rows: readonly unknown[]): readonly NormalizedColumn[] {
  const raw = widget.props['columns'];
  const configured = Array.isArray(raw) ? raw.flatMap((column, index) => normalizeColumn(column, index)) : [];
  if (configured.length > 0) return configured;
  const count = rows.reduce<number>((max, row) => Math.max(max, rowCells(row).length), 0);
  return Array.from({ length: count }, (_value, index) => ({ index, align: 'start' }));
}

function normalizeColumn(column: unknown, index: number): readonly NormalizedColumn[] {
  if (!isRecord(column) || column['hidden'] === true) return [];
  const header = column['header'];
  const align = column['align'];
  const style = column['style'];
  const headerStyle = column['headerStyle'];
  const render = column['render'];
  const sort = column['sort'];
  const width = normalizeWidth(column['width']);
  return [{
    index,
    ...(typeof header === 'string' ? { header: clean(header) } : {}),
    ...(width === undefined ? {} : { width }),
    align: align === 'center' || align === 'end' ? align : 'start',
    ...(isTerminalStyle(style) ? { style } : {}),
    ...(isTerminalStyle(headerStyle) ? { headerStyle } : {}),
    ...(isCellRenderer(render) ? { render } : {}),
    ...(sort === 'ascending' || sort === 'descending' ? { sort } : {})
  }];
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

function rowCell(row: unknown, index: number): unknown {
  return rowCells(row)[index];
}

function selectedTableRow(widget: Widget): number {
  return selectedTableCell(widget)?.row ?? Math.max(0, Math.floor(numberProp(widget, 'selected') ?? 0));
}

function selectedTableCell(widget: Widget): { readonly row: number; readonly column: number } | undefined {
  const selectedCell = widget.props['selectedCell'];
  if (!isRecord(selectedCell)) return undefined;
  const row = selectedCell['row'];
  const column = selectedCell['column'];
  if (typeof row !== 'number') return undefined;
  return {
    row: Math.max(0, Math.floor(row)),
    column: typeof column === 'number' ? Math.max(0, Math.floor(column)) : 0
  };
}

function scrollProp(widget: Widget): ScrollState | undefined {
  const scroll = widget.props['scroll'];
  if (!isRecord(scroll)) return undefined;
  const offsetRow = scroll['offsetRow'];
  const offsetColumn = scroll['offsetColumn'];
  const contentRows = scroll['contentRows'];
  const contentColumns = scroll['contentColumns'];
  const viewportRows = scroll['viewportRows'];
  const viewportColumns = scroll['viewportColumns'];
  const followTail = scroll['followTail'];
  if (
    typeof offsetRow !== 'number'
    || typeof offsetColumn !== 'number'
    || typeof contentRows !== 'number'
    || typeof contentColumns !== 'number'
    || typeof viewportRows !== 'number'
    || typeof viewportColumns !== 'number'
    || typeof followTail !== 'boolean'
  ) return undefined;
  return { offsetRow, offsetColumn, contentRows, contentColumns, viewportRows, viewportColumns, followTail };
}

function sortMarker(sort: TableColumn['sort']): string {
  if (sort === 'ascending') return ' ↑';
  if (sort === 'descending') return ' ↓';
  return '';
}

function selectionStyle(): TerminalStyle {
  return {
    fg: { kind: 'theme', token: 'selection.foreground' },
    bg: { kind: 'theme', token: 'selection.background' }
  };
}

function themeStyle(token: ThemeToken, options: Omit<TerminalStyle, 'fg'> = {}): TerminalStyle {
  return {
    fg: { kind: 'theme', token },
    ...options
  };
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return clean(value);
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value instanceof Date) return value.toISOString();
  const json: unknown = JSON.stringify(value);
  return typeof json === 'string' ? clean(json) : '';
}

function isCellRenderer(value: unknown): value is (input: TableCellRenderInput) => string | RenderSpan | readonly RenderSpan[] {
  return typeof value === 'function';
}

function isRenderSpanArray(value: RenderSpan | readonly RenderSpan[]): value is readonly RenderSpan[] {
  return Array.isArray(value);
}

function isTerminalStyle(value: unknown): value is TerminalStyle {
  return isRecord(value);
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
