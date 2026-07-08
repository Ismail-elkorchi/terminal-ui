import { measureTextCells, sanitizeTerminalText } from '../text/index.ts';
import { dataSource, dataSpan, mergeDataStyles, selectionMarkerSpans } from './data-visual.ts';
import { rowWindow, scrollStateFromUnknown } from './data-window.ts';
import { numberProp, stringify } from './widget-props.ts';
import { mergeStyles, themeStyle, widgetStyle } from './widget-style.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type {
  TableCellRenderInput,
  TableColumn,
  TableColumnAlignment,
  TableColumnSemantic,
  TablePointerSelection,
  TableColumnWidth,
  TableDensity,
  Widget
} from '../widgets/index.ts';
import type { Rect } from './layout.ts';
import { clipRenderSpans } from './render-primitives.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan, TerminalStyle } from './render-primitives.ts';
import type { ScrollState } from './scroll.ts';
import type { HitTarget } from './widget-renderer.ts';

interface NormalizedColumn {
  readonly index: number;
  readonly header?: string;
  readonly width?: TableColumnWidth;
  readonly align: TableColumnAlignment;
  readonly semantic: TableColumnSemantic;
  readonly style?: TerminalStyle;
  readonly headerStyle?: TerminalStyle;
  readonly render?: (input: TableCellRenderInput) => string | RenderSpan | readonly RenderSpan[];
  readonly sort?: TableColumn['sort'];
  readonly resizable?: boolean;
}

interface TableWindow {
  readonly rows: readonly unknown[];
  readonly start: number;
  readonly end: number;
  readonly selected: number;
  readonly horizontalOffset: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
}

interface TableSpacing {
  readonly marker: number;
  readonly separator: number;
}

export function tableBlock(widget: Widget, bounds: Rect, theme: TerminalTheme): RenderBlock {
  const rows = tableRows(widget);
  const columns = tableColumns(widget, rows);
  const spacing = tableSpacing(widget);
  const hasHeader = columns.some((column) => column.header !== undefined);
  const headerHeight = hasHeader && widget.props['stickyHeader'] !== false ? 1 : 0;
  const bodyHeight = Math.max(0, bounds.height - headerHeight);
  const selected = selectedTableRow(widget);
  const window = tableWindow(widget, rows, bodyHeight, selected);
  const widths = columnWidths(columns, rows, Math.max(1, bounds.width - spacing.marker), spacing);
  const lines: RenderLine[] = [];
  if (hasHeader && headerHeight > 0) {
    lines.push(scrolledLine(headerLine(widget, columns, widths, spacing), window.horizontalOffset, bounds.width));
  }
  if (rows.length === 0 && bodyHeight > 0) {
    lines.push(scrolledLine(emptyLine(widget, spacing), window.horizontalOffset, bounds.width));
  } else {
    lines.push(...window.rows.map((row, visibleIndex) => {
      const rowIndex = window.start + visibleIndex;
      return scrolledLine(rowLine(widget, row, rowIndex, columns, widths, rowIndex === window.selected, selectedTableCell(widget), theme, spacing), window.horizontalOffset, bounds.width);
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
    window: {
      start: window.start,
      end: window.end,
      total: rows.length,
      omittedBefore: window.omittedBefore,
      omittedAfter: window.omittedAfter
    },
    position: {
      rowCount: rows.length,
      columnCount: columns.length
    },
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
  const headerRow: AccessibleNode[] = hasHeader
    ? [{
        id: `${widget.id ?? 'table'}:headers`,
        role: 'row',
        position: {
          rowIndex: 0,
          rowCount: rows.length + 1,
          columnCount: columns.length
        },
        children: columns.map((column, columnIndex) => ({
          id: `${widget.id ?? 'table'}:header:${String(column.index)}`,
          role: 'cell',
          label: columnLabel(column, columnIndex),
          value: columnLabel(column, columnIndex),
          position: {
            rowIndex: 0,
            rowCount: rows.length + 1,
            columnIndex,
            columnCount: columns.length,
            columnLabel: columnLabel(column, columnIndex)
          }
        }))
      }]
    : [];
  const bodyRows: AccessibleNode[] = window.rows.map((row, visibleIndex) => {
    const rowIndex = window.start + visibleIndex;
    return {
      id: `${widget.id ?? 'table'}:row:${String(rowIndex)}`,
      role: 'row',
      selected: rowIndex === window.selected,
      position: {
        index: rowIndex,
        count: rows.length,
        rowIndex: hasHeader ? rowIndex + 1 : rowIndex,
        rowCount: hasHeader ? rows.length + 1 : rows.length,
        columnCount: columns.length
      },
      children: columns.map((column, columnIndex) => {
        const value = rowCell(row, column.index);
        const label = columnLabel(column, columnIndex);
        return {
          id: `${widget.id ?? 'table'}:row:${String(rowIndex)}:cell:${String(column.index)}`,
          role: 'cell',
          label: displayValue(value),
          value: displayValue(value),
          position: {
            rowIndex: hasHeader ? rowIndex + 1 : rowIndex,
            rowCount: hasHeader ? rows.length + 1 : rows.length,
            columnIndex,
            columnCount: columns.length,
            columnLabel: label
          },
          selected: selectedCell?.row === rowIndex && selectedCell.column === columnIndex
        };
      })
    };
  });
  return [...headerRow, ...bodyRows];
}

export function tableHitTargets<TMessage>(widget: Widget<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = tableMessageFactory(widget);
  if (toMessage === undefined) return [];
  const rows = tableRows(widget);
  const columns = tableColumns(widget, rows);
  const spacing = tableSpacing(widget);
  const hasHeader = columns.some((column) => column.header !== undefined);
  const headerHeight = hasHeader && widget.props['stickyHeader'] !== false ? 1 : 0;
  const bodyHeight = Math.max(0, bounds.height - headerHeight);
  const selected = selectedTableRow(widget);
  const window = tableWindow(widget, rows, bodyHeight, selected);
  const widths = columnWidths(columns, rows, Math.max(1, bounds.width - spacing.marker), spacing);
  const selectedCell = selectedTableCell(widget);
  return window.rows.flatMap((row, visibleIndex): HitTarget<TMessage>[] => {
    const rowIndex = window.start + visibleIndex;
    const rowBounds = {
      row: bounds.row + headerHeight + visibleIndex,
      column: bounds.column,
      width: bounds.width,
      height: 1
    };
    if (selectedCell !== undefined) {
      return tableCellHitTargets(widget, row, rowIndex, columns, widths, rowBounds, window.horizontalOffset, spacing, toMessage);
    }
    return [{
      id: `${widget.id ?? 'table'}:row:${String(rowIndex)}`,
      bounds: rowBounds,
      message: () => toMessage({ row, rowIndex }),
      cursor: 'pointer'
    }];
  });
}

function tableCellHitTargets<TMessage>(
  widget: Widget<TMessage>,
  row: unknown,
  rowIndex: number,
  columns: readonly NormalizedColumn[],
  widths: readonly number[],
  rowBounds: Rect,
  horizontalOffset: number,
  spacing: TableSpacing,
  toMessage: (selection: TablePointerSelection) => TMessage
): HitTarget<TMessage>[] {
  let lineColumn = spacing.marker;
  return columns.flatMap((column, visibleColumnIndex): HitTarget<TMessage>[] => {
    const separator = visibleColumnIndex === 0 ? 0 : spacing.separator;
    const cellStart = lineColumn + separator;
    const cellWidth = widths[visibleColumnIndex] ?? 1;
    lineColumn = cellStart + cellWidth;
    const visibleStart = Math.max(0, cellStart - horizontalOffset);
    const visibleEnd = Math.min(rowBounds.width, cellStart + cellWidth - horizontalOffset);
    if (visibleEnd <= visibleStart) return [];
    return [{
      id: `${widget.id ?? 'table'}:row:${String(rowIndex)}:cell:${String(column.index)}`,
      bounds: {
        row: rowBounds.row,
        column: rowBounds.column + visibleStart,
        width: visibleEnd - visibleStart,
        height: 1
      },
      message: () => toMessage({
        row,
        rowIndex,
        cell: {
          value: rowCell(row, column.index),
          columnIndex: visibleColumnIndex,
          sourceColumnIndex: column.index,
          columnLabel: columnLabel(column, visibleColumnIndex)
        }
      }),
      cursor: 'pointer'
    }];
  });
}

function columnLabel(column: NormalizedColumn, index: number): string {
  return column.header ?? `Column ${String(index + 1)}`;
}

function tableWindow(widget: Widget, rows: readonly unknown[], bodyHeight: number, selected: number): TableWindow {
  const window = rowWindow(rows, {
    viewportRows: bodyHeight,
    selectedIndex: selected,
    ...scrollInput(widget)
  });
  return {
    rows: window.rows,
    start: window.start,
    end: window.end,
    selected,
    horizontalOffset: window.offsetColumn,
    omittedBefore: window.omittedBefore,
    omittedAfter: window.omittedAfter
  };
}

function headerLine(widget: Widget, columns: readonly NormalizedColumn[], widths: readonly number[], spacing: TableSpacing): RenderLine {
  const decorationStyle = widgetStyle(widget, 'placeholder');
  const spans: RenderSpan[] = [dataSpan(' '.repeat(spacing.marker), decorationStyle, tableSource(widget, 'header.marker', undefined, 'decoration'))];
  columns.forEach((column, index) => {
    if (index > 0) spans.push(dataSpan(' '.repeat(spacing.separator), decorationStyle, tableSource(widget, 'column.separator', undefined, 'separator')));
    const headerStyle = mergeStyles(themeStyle('table.header', { bold: true }), widget.styles?.title, column.headerStyle);
    const headerSourceId = `${widget.id ?? 'table'}:header:${String(column.index)}`;
    const label = column.header ?? '';
    const labelSpans: RenderSpan[] = [
      ...(label.length === 0 ? [] : [dataSpan(label, headerStyle, tableSource(widget, `header.${String(column.index)}.label`, headerSourceId, 'text', {
        partKind: 'header'
      }))])
    ];
    const sort = sortMarker(column.sort);
    if (sort.length > 0) {
      labelSpans.push(dataSpan(sort, headerStyle, tableSource(widget, `header.${String(column.index)}.sort`, headerSourceId, 'decoration', {
        partKind: 'sort'
      })));
    }
    const resize = resizeMarker(column);
    if (resize.length > 0) {
      labelSpans.push(dataSpan(resize, headerStyle, tableSource(widget, `header.${String(column.index)}.resize`, headerSourceId, 'decoration', {
        partKind: 'resize'
      })));
    }
    spans.push(...cellSpans(
      labelSpans,
      widths[index] ?? 1,
      column.align,
      undefined,
      tableSource(widget, `header.${String(column.index)}.padding`, headerSourceId, 'decoration'),
      decorationStyle
    ));
  });
  return { spans };
}

function rowLine(
  widget: Widget,
  row: unknown,
  rowIndex: number,
  columns: readonly NormalizedColumn[],
  widths: readonly number[],
  selected: boolean,
  selectedCell: { readonly row: number; readonly column: number } | undefined,
  theme: TerminalTheme,
  spacing: TableSpacing
): RenderLine {
  const selectedStyle = selected ? widgetStyle(widget, 'value', 'selected') : undefined;
  const decorationStyle = selectedStyle ?? widgetStyle(widget, 'placeholder');
  const rowSourceId = `${widget.id ?? 'table'}:row:${String(rowIndex)}`;
  const spans: RenderSpan[] = [...selectionMarkerSpans(
    widget,
    selected,
    theme,
    selectedStyle,
    tableSource(widget, `row.${String(rowIndex)}.marker`, rowSourceId, 'decoration', {
      partKind: 'marker',
      ...(selected ? { state: 'selected' } : {})
    })
  )];
  columns.forEach((column, columnIndex) => {
    if (columnIndex > 0) spans.push(dataSpan(' '.repeat(spacing.separator), decorationStyle, tableSource(widget, 'column.separator', undefined, 'separator')));
    const cellSourceId = `${widget.id ?? 'table'}:row:${String(rowIndex)}:cell:${String(column.index)}`;
    const rendered = renderCell(
      widget,
      row,
      rowIndex,
      column,
      columnIndex,
      tableSource(widget, `row.${String(rowIndex)}.cell.${String(column.index)}`, cellSourceId, 'text', {
        partKind: column.semantic,
        ...(selected ? { state: 'selected' } : {})
      })
    );
    const cellSelectedStyle = selectedCell?.row === rowIndex && selectedCell.column === columnIndex
      ? mergeDataStyles(selectedStyle, widgetStyle(widget, 'value', 'active'))
      : selectedStyle;
    spans.push(...cellSpans(
      rendered,
      widths[columnIndex] ?? 1,
      column.align,
      cellSelectedStyle,
      tableSource(widget, `row.${String(rowIndex)}.cell.${String(column.index)}.padding`, cellSourceId, 'decoration', {
        partKind: 'padding',
        ...(selected ? { state: 'selected' } : {})
      }),
      cellSelectedStyle ?? widgetStyle(widget, 'placeholder')
    ));
  });
  return { spans };
}

function emptyLine(widget: Widget, spacing: TableSpacing): RenderLine {
  const emptyText = clean(stringify(widget.props['emptyText'])) || 'No rows';
  return {
    spans: [
      dataSpan(' '.repeat(spacing.marker), widgetStyle(widget, 'placeholder'), tableSource(widget, 'empty.marker', undefined, 'decoration')),
      dataSpan(emptyText, widgetStyle(widget, 'placeholder'), tableSource(widget, 'empty'))
    ]
  };
}

function renderCell(
  widget: Widget,
  row: unknown,
  rowIndex: number,
  column: NormalizedColumn,
  columnIndex: number,
  fallbackSource: FrameCellSource
): readonly RenderSpan[] {
  const value = rowCell(row, column.index);
  const fallbackStyle = mergeDataStyles(tableSemanticStyle(widget, column.semantic), column.style);
  if (column.render !== undefined) {
    return renderResultToSpans(column.render({ value, row, rowIndex, columnIndex }), fallbackStyle, fallbackSource);
  }
  return [dataSpan(displayValue(value), fallbackStyle, fallbackSource)];
}

function tableSemanticStyle(widget: Widget, semantic: TableColumnSemantic): TerminalStyle | undefined {
  if (semantic === 'metric') return mergeDataStyles(widgetStyle(widget, 'value'), themeStyle('table.metric'));
  if (semantic === 'metadata') return mergeDataStyles(widgetStyle(widget, 'placeholder'), themeStyle('table.metadata', { dim: true }));
  return widgetStyle(widget, 'value');
}

function renderResultToSpans(
  result: string | RenderSpan | readonly RenderSpan[],
  style: TerminalStyle | undefined,
  fallbackSource: FrameCellSource
): readonly RenderSpan[] {
  if (typeof result === 'string') return [dataSpan(clean(result), style, fallbackSource)];
  if (isRenderSpanArray(result)) return result.map((span) => cleanSpan(span, style, fallbackSource));
  return [cleanSpan(result, style, fallbackSource)];
}

function cleanSpan(span: RenderSpan, fallbackStyle: TerminalStyle | undefined, fallbackSource: FrameCellSource): RenderSpan {
  return {
    text: clean(span.text),
    ...(span.style === undefined && fallbackStyle !== undefined ? { style: fallbackStyle } : {}),
    ...(span.style === undefined ? {} : { style: span.style }),
    ...(span.link === undefined ? {} : { link: span.link }),
    source: span.source ?? fallbackSource
  };
}

function cellSpans(
  spans: readonly RenderSpan[],
  width: number,
  align: TableColumnAlignment,
  overrideStyle?: TerminalStyle,
  paddingSource?: FrameCellSource,
  paddingStyle?: TerminalStyle
): readonly RenderSpan[] {
  const clipped = overrideStyle === undefined
    ? clipRenderSpans(spans, width, { ellipsis: '…' })
    : clipRenderSpans(spans, width, { ellipsis: '…' }).map((currentSpan) => {
        const style = mergeCellOverrideStyle(currentSpan.style, overrideStyle);
        return {
          text: currentSpan.text,
          ...(style === undefined ? {} : { style }),
          ...(currentSpan.link === undefined ? {} : { link: currentSpan.link }),
          ...(currentSpan.source === undefined ? {} : { source: currentSpan.source })
        };
      });
  const cells = clipped.reduce((sum, currentSpan) => sum + measureTextCells(currentSpan.text).cells, 0);
  const padding = Math.max(0, width - cells);
  const before = align === 'end' ? padding : align === 'center' ? Math.floor(padding / 2) : 0;
  const after = Math.max(0, padding - before);
  const rendered: RenderSpan[] = [];
  if (before > 0) rendered.push(dataSpan(' '.repeat(before), paddingStyle, paddingSource));
  rendered.push(...clipped);
  if (after > 0) rendered.push(dataSpan(' '.repeat(after), paddingStyle, paddingSource));
  return rendered;
}

function mergeCellOverrideStyle(cellStyle: TerminalStyle | undefined, overrideStyle: TerminalStyle): TerminalStyle | undefined {
  const style = mergeDataStyles(cellStyle, overrideStyle);
  if (cellStyle?.fg !== undefined && !isNeutralForeground(cellStyle.fg)) {
    return {
      ...(style ?? {}),
      fg: cellStyle.fg
    };
  }
  return style;
}

function isNeutralForeground(color: NonNullable<TerminalStyle['fg']>): boolean {
  return color.kind === 'theme' && color.token === 'text.default';
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

function columnWidths(columns: readonly NormalizedColumn[], rows: readonly unknown[], availableWidth: number, spacing: TableSpacing): readonly number[] {
  if (columns.length === 0) return [];
  const separators = Math.max(0, columns.length - 1) * spacing.separator;
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
  return Array.from({ length: count }, (_value, index) => ({ index, align: 'start', semantic: 'text' }));
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
  const normalizedAlign: TableColumnAlignment = align === 'center' || align === 'end' ? align : 'start';
  const semantic = normalizeColumnSemantic(column['semantic'], normalizedAlign);
  return [{
    index,
    ...(typeof header === 'string' ? { header: clean(header) } : {}),
    ...(width === undefined ? {} : { width }),
    align: normalizedAlign,
    semantic,
    ...(isTerminalStyle(style) ? { style } : {}),
    ...(isTerminalStyle(headerStyle) ? { headerStyle } : {}),
    ...(isCellRenderer(render) ? { render } : {}),
    ...(sort === 'ascending' || sort === 'descending' ? { sort } : {}),
    ...(column['resizable'] === true ? { resizable: true } : {})
  }];
}

function tableSpacing(widget: Widget): TableSpacing {
  return tableDensity(widget.props['density']) === 'dense'
    ? { marker: 2, separator: 1 }
    : { marker: 2, separator: 2 };
}

function tableDensity(value: unknown): TableDensity {
  return value === 'dense' ? 'dense' : 'normal';
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

function scrollInput(widget: Widget): { readonly scroll?: ScrollState } {
  const scroll = scrollStateFromUnknown(widget.props['scroll']);
  return scroll === undefined ? {} : { scroll };
}

function tableMessageFactory<TMessage>(widget: Widget<TMessage>): ((selection: TablePointerSelection) => TMessage) | undefined {
  const toMessage = widget.props['toMessage'];
  return typeof toMessage === 'function'
    ? (selection) => (toMessage as (selection: TablePointerSelection) => TMessage)(selection)
    : undefined;
}

function sortMarker(sort: TableColumn['sort']): string {
  if (sort === 'ascending') return ' ↑';
  if (sort === 'descending') return ' ↓';
  return '';
}

function resizeMarker(column: Pick<NormalizedColumn, 'resizable'>): string {
  return column.resizable === true ? ' ↔' : '';
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

function tableSource(
  widget: Widget,
  label: string,
  id?: string,
  role: FrameCellSource['role'] = 'text',
  options: {
    readonly partKind?: string;
    readonly state?: string;
  } = {}
): FrameCellSource {
  return dataSource(widget, label, {
    ...(id === undefined ? {} : { itemId: id }),
    role,
    ...options
  });
}
