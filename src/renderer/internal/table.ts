import type { RenderNodeOfKind } from '../model/index.ts';
import { measureTextCells } from '../../text/index.ts';
import { dataSource, dataSpan, mergeDataStyles, selectionMarkerSpans } from './data-visual.ts';
import { projectedRowWindow, scrollStateFromUnknown } from '../../behavior/data-window.ts';
import { stringify } from './render-node-props.ts';
import { mergeStyles, resolveRenderNodeStyle, themeStyle } from './render-node-style.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { TableColumnAlignment, TableColumnSemantic } from '../../ui-model/content.ts';
import type { TableCollection, TableCollectionRecord, TableControlAction } from '../../ui-model/table.ts';
import { collectionRecordById } from '../../ui-model/collection.ts';
import type { Rect } from '../model/layout.ts';
import { clipRenderSpans } from '../../visual/render.ts';
import type { FrameCellSource, RenderBlock, RenderLine, RenderSpan, TerminalStyle } from '../../visual/render.ts';
import { normalizeInlineContent } from '../../visual/inline-content.ts';
import type { InlineContent, InlineContentSegment } from '../../visual/inline-content.ts';
import type { ScrollState } from '../../interaction/scroll.ts';
import type { HitTarget } from '../model/renderer.ts';
import { ignoreMessage } from '../../interaction/message.ts';
import {
  displayTableValue,
  sanitizeTableText,
  tableColumns,
  tableColumnWidths,
  tableResizeMarker,
  tableSortMarker,
  type NormalizedTableColumn
} from './table/columns.ts';
import { tableColumnTracks, visibleTableTrack } from './table/geometry.ts';
import { tableMetrics, type TableMetrics } from './component-metrics.ts';
import { interactionVisualState, renderNodeTargetId } from './pointer-presentation.ts';
import { renderInlineContent } from './inline-content.ts';

interface TableWindow {
  readonly rows: readonly TableCollectionRecord<unknown>[];
  readonly start: number;
  readonly end: number;
  readonly selected: number;
  readonly horizontalOffset: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
}

interface TableProjection {
  readonly totalRows: number;
  readonly columns: readonly NormalizedTableColumn[];
  readonly spacing: TableMetrics;
  readonly hasHeader: boolean;
  readonly headerHeight: number;
  readonly bodyHeight: number;
  readonly selected: number;
  readonly selectedCell: SelectedTableCell | undefined;
  readonly window: TableWindow;
  readonly widths: readonly number[];
}

interface SelectedTableCell {
  readonly row: number;
  readonly rowId: string;
  readonly column: number;
}

const tableProjectionCache = new WeakMap<object, {
  readonly width: number;
  readonly height: number;
  readonly projection: TableProjection;
}>();

export function tableBlock(widget: TableNode, bounds: Rect, theme: TerminalTheme, focused = false): RenderBlock {
  const {
    totalRows,
    columns,
    spacing,
    hasHeader,
    headerHeight,
    bodyHeight,
    selectedCell,
    window,
    widths
  } = tableProjection(widget, bounds);
  const lines: RenderLine[] = [];
  if (hasHeader && headerHeight > 0) {
    lines.push(scrolledLine(headerLine(widget, columns, widths, spacing), window.horizontalOffset, bounds.width));
  }
  if (totalRows === 0 && bodyHeight > 0) {
    lines.push(scrolledLine(emptyLine(widget, spacing), window.horizontalOffset, bounds.width));
  } else {
    lines.push(...window.rows.map((record) => {
      return scrolledLine(rowLine(
        widget,
        record.row,
        record.index,
        record.id,
        columns,
        widths,
        record.index === window.selected,
        selectedCell,
        focused,
        theme,
        spacing
      ), window.horizontalOffset, bounds.width);
    }));
  }
  return { lines: lines.slice(0, bounds.height) };
}

export function tableAccessibleBase(widget: TableNode, bounds: Rect, id: string, focused: boolean): AccessibleNode {
  const { totalRows, columns, window } = tableProjection(widget, bounds);
  return {
    id,
    role: 'table',
    label: id,
    description: `Showing ${String(window.start + 1)}-${String(window.end)} of ${String(totalRows)} rows.`,
    window: {
      start: window.start,
      end: window.end,
      total: totalRows,
      omittedBefore: window.omittedBefore,
      omittedAfter: window.omittedAfter
    },
    position: {
      rowCount: totalRows,
      columnCount: columns.length
    },
    ...(focused ? { focused } : {})
  };
}

export function tableAccessibleChildren(widget: TableNode, bounds: Rect): readonly AccessibleNode[] {
  const { totalRows, columns, hasHeader, window, selectedCell } = tableProjection(widget, bounds);
  const headerRow: AccessibleNode[] = hasHeader
    ? [{
        id: `${widget.id ?? 'table'}:headers`,
        role: 'row',
        position: {
          rowIndex: 0,
          rowCount: totalRows + 1,
          columnCount: columns.length
        },
        children: columns.map((column, columnIndex) => ({
          id: `${widget.id ?? 'table'}:header:${String(column.index)}`,
          role: 'cell',
          label: columnLabel(column, columnIndex),
          value: columnLabel(column, columnIndex),
          ...(column.sortable === true || column.resizable === true ? {
            description: [
              ...(column.sortable === true ? ['sortable'] : []),
              ...(column.resizable === true ? ['resizable'] : []),
              ...(column.sort === undefined ? [] : [`sorted ${column.sort}`])
            ].join(', ')
          } : {}),
          position: {
            rowIndex: 0,
            rowCount: totalRows + 1,
            columnIndex,
            columnCount: columns.length,
            columnLabel: columnLabel(column, columnIndex)
          }
        }))
      }]
    : [];
  const bodyRows: AccessibleNode[] = window.rows.map((record) => {
    const rowIndex = record.index;
    return {
      id: tableRowTargetId(widget, record.id),
      role: 'row',
      selected: rowIndex === window.selected,
      position: {
        index: rowIndex,
        count: totalRows,
        rowIndex: hasHeader ? rowIndex + 1 : rowIndex,
        rowCount: hasHeader ? totalRows + 1 : totalRows,
        columnCount: columns.length
      },
      children: columns.map((column, columnIndex) => {
        const value = column.value(record.row, rowIndex);
        const label = columnLabel(column, columnIndex);
        return {
          id: tableCellTargetId(widget, record.id, column.index),
          role: 'cell',
          label: displayTableValue(value),
          value: displayTableValue(value),
          position: {
            rowIndex: hasHeader ? rowIndex + 1 : rowIndex,
            rowCount: hasHeader ? totalRows + 1 : totalRows,
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

export function tableHitTargets<TMessage>(widget: TableNode<TMessage>, bounds: Rect): readonly HitTarget<TMessage>[] {
  const toMessage = tableActionMessageFactory(widget);
  if (toMessage === undefined) return [];
  const { columns, spacing, headerHeight, window, widths, selectedCell } = tableProjection(widget, bounds);
  const headerTargets = headerHeight <= 0
    ? []
    : tableHeaderHitTargets(widget, columns, widths, bounds, window.horizontalOffset, spacing, toMessage);
  const bodyTargets = window.rows.flatMap((record, visibleIndex): HitTarget<TMessage>[] => {
    const rowIndex = record.index;
    const rowId = record.id;
    const rowBounds = {
      row: bounds.row + headerHeight + visibleIndex,
      column: bounds.column,
      width: bounds.width,
      height: 1
    };
    if (selectedCell !== undefined) {
      return tableCellHitTargets(widget, rowId, rowIndex, columns, widths, rowBounds, window.horizontalOffset, spacing, toMessage);
    }
    return [{
      id: tableRowTargetId(widget, rowId),
      bounds: rowBounds,
      message: (event) => toMessage(event.clickCount === 2
        ? { kind: 'activate', rowId, rowIndex }
        : { kind: 'selectRow', rowId, rowIndex }),
      cursor: 'pointer'
    }];
  });
  return [...headerTargets, ...bodyTargets];
}

function tableHeaderHitTargets<TMessage>(
  widget: TableNode<TMessage>,
  columns: readonly NormalizedTableColumn[],
  widths: readonly number[],
  bounds: Rect,
  horizontalOffset: number,
  spacing: TableMetrics,
  toMessage: (action: TableControlAction) => TMessage
): HitTarget<TMessage>[] {
  const tracks = tableColumnTracks(widths, spacing.markerCells, spacing.separatorCells);
  return columns.flatMap((column, index): HitTarget<TMessage>[] => {
    const track = tracks[index];
    if (track === undefined) return [];
    const visible = visibleTableTrack(track, horizontalOffset, bounds.width);
    if (visible === undefined) return [];
    const targets: HitTarget<TMessage>[] = [];
    if (column.sortable === true) {
      targets.push({
        id: renderNodeTargetId(widget, 'header', column.id, 'sort'),
        bounds: {
          row: bounds.row,
          column: bounds.column + visible.start,
          width: visible.end - visible.start,
          height: 1
        },
        accepts: ['click'],
        message: () => toMessage({ kind: 'sortBy', column: column.id }),
        cursor: 'pointer'
      });
    }
    if (column.resizable === true) {
      targets.push({
        id: renderNodeTargetId(widget, 'header', column.id, 'resize'),
        bounds: {
          row: bounds.row,
          column: bounds.column + visible.end - 1,
          width: 1,
          height: 1
        },
        accepts: ['pointerDown', 'dragStart', 'drag'],
        message: (event) => event.button !== 'left'
          ? ignoreMessage()
          : toMessage({
              kind: 'setColumnWidth',
              column: column.id,
              width: track.width + event.column - (event.pressColumn ?? event.column)
            }),
        cursor: 'pointer'
      });
    }
    return targets;
  });
}

function tableCellHitTargets<TMessage>(
  widget: TableNode<TMessage>,
  rowId: string,
  rowIndex: number,
  columns: readonly NormalizedTableColumn[],
  widths: readonly number[],
  rowBounds: Rect,
  horizontalOffset: number,
  spacing: TableMetrics,
  toMessage: (action: TableControlAction) => TMessage
): HitTarget<TMessage>[] {
  const tracks = tableColumnTracks(widths, spacing.markerCells, spacing.separatorCells);
  return columns.flatMap((column, visibleColumnIndex): HitTarget<TMessage>[] => {
    const track = tracks[visibleColumnIndex];
    if (track === undefined) return [];
    const visible = visibleTableTrack(track, horizontalOffset, rowBounds.width);
    if (visible === undefined) return [];
    return [{
      id: tableCellTargetId(widget, rowId, column.index),
      bounds: {
        row: rowBounds.row,
        column: rowBounds.column + visible.start,
        width: visible.end - visible.start,
        height: 1
      },
      message: (event) => toMessage(event.clickCount === 2
        ? { kind: 'activate', rowId, rowIndex, column: visibleColumnIndex }
        : { kind: 'selectCell', rowId, rowIndex, column: visibleColumnIndex }),
      cursor: 'pointer'
    }];
  });
}

function columnLabel(column: NormalizedTableColumn, index: number): string {
  return column.header ?? `Column ${String(index + 1)}`;
}

function tableWindow(widget: TableNode, bodyHeight: number, selected: number): TableWindow {
  const window = projectedRowWindow(widget.props.collection, {
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

function tableProjection(widget: TableNode, bounds: Rect): TableProjection {
  const cached = tableProjectionCache.get(widget);
  if (cached?.width === bounds.width && cached.height === bounds.height) return cached.projection;
  const collection = widget.props.collection;
  const selected = selectedTableRow(widget, collection);
  const selectedCell = selectedTableCell(widget, collection);
  const columns = tableColumns(widget, tableRowSample(collection, selected));
  const spacing = tableSpacing(widget);
  const hasHeader = columns.some((column) => column.header !== undefined);
  const headerHeight = hasHeader && widget.props.stickyHeader !== false ? 1 : 0;
  const bodyHeight = Math.max(0, bounds.height - headerHeight);
  const window = tableWindow(widget, bodyHeight, selected);
  const projection: TableProjection = {
    totalRows: collection.total,
    columns,
    spacing,
    hasHeader,
    headerHeight,
    bodyHeight,
    selected,
    selectedCell,
    window,
    widths: tableColumnWidths(
      columns,
      window.rows.map((record) => record.row),
      Math.max(1, bounds.width - spacing.markerCells),
      spacing.separatorCells
    )
  };
  tableProjectionCache.set(widget, { width: bounds.width, height: bounds.height, projection });
  return projection;
}

function tableRowSample(
  collection: TableCollection<unknown>,
  selected: number,
  limit = 64
): readonly unknown[] {
  const recordCount = collection.records.length;
  if (recordCount <= limit) return collection.records.map((record) => record.row);
  const selectedOffset = selected - collection.start;
  const anchor = selectedOffset < 0 || selectedOffset >= recordCount ? 0 : selectedOffset;
  const start = Math.max(0, Math.min(recordCount - limit, anchor - Math.floor(limit / 2)));
  return collection.records.slice(start, start + limit).map((record) => record.row);
}

function headerLine(widget: TableNode, columns: readonly NormalizedTableColumn[], widths: readonly number[], spacing: TableMetrics): RenderLine {
  const decorationStyle = resolveRenderNodeStyle(widget, { part: 'header', base: themeStyle('table.header', { bold: true }) });
  const spans: RenderSpan[] = [dataSpan(' '.repeat(spacing.markerCells), decorationStyle, tableSource(widget, 'header.marker', undefined, 'decoration'))];
  columns.forEach((column, index) => {
    if (index > 0) spans.push(dataSpan(' '.repeat(spacing.separatorCells), decorationStyle, tableSource(widget, 'column.separator', undefined, 'separator')));
    const headerStyle = mergeStyles(
      resolveRenderNodeStyle(widget, { part: 'headerCell', base: themeStyle('table.header', { bold: true }) }),
      column.headerStyle
    );
    const headerSourceId = `${widget.id ?? 'table'}:header:${String(column.index)}`;
    const label = column.header ?? '';
    const labelSpans: RenderSpan[] = [
      ...(label.length === 0 ? [] : [dataSpan(label, headerStyle, tableSource(widget, `header.${String(column.index)}.label`, headerSourceId, 'text', {
        partKind: 'header'
      }))])
    ];
    const sort = tableSortMarker(column.sort);
    if (sort.length > 0) {
      labelSpans.push(dataSpan(sort, resolveRenderNodeStyle(widget, {
        part: 'sortIndicator',
        ...(headerStyle === undefined ? {} : { base: headerStyle })
      }), tableSource(widget, `header.${String(column.index)}.sort`, headerSourceId, 'decoration', {
        partKind: 'sort'
      })));
    }
    const resize = tableResizeMarker(column);
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
  widget: TableNode,
  row: unknown,
  rowIndex: number,
  rowId: string,
  columns: readonly NormalizedTableColumn[],
  widths: readonly number[],
  selected: boolean,
  selectedCell: SelectedTableCell | undefined,
  focused: boolean,
  theme: TerminalTheme,
  spacing: TableMetrics
): RenderLine {
  const rowState = interactionVisualState(widget, tableRowTargetId(widget, rowId), {
    selected,
    focused: focused && selected
  });
  const rowStyle = resolveRenderNodeStyle(widget, {
    part: 'row',
    ...(rowState === undefined ? {} : { state: rowState })
  });
  const selectedStyle = rowState === undefined ? undefined : rowStyle;
  const decorationStyle = rowStyle;
  const spans: RenderSpan[] = [...selectionMarkerSpans(
    widget,
    selected,
    theme,
    selectedStyle,
    tableSource(widget, `row.${rowId}.marker`, rowId, 'decoration', {
      partKind: 'marker',
      ...(rowState === undefined ? {} : { state: rowState })
    })
  )];
  columns.forEach((column, columnIndex) => {
    if (columnIndex > 0) spans.push(dataSpan(' '.repeat(spacing.separatorCells), decorationStyle, tableSource(widget, 'column.separator', undefined, 'separator')));
    const rendered = renderCell(
      widget,
      row,
      rowIndex,
      column,
      columnIndex,
      theme,
      tableSource(widget, `row.${rowId}.cell.${String(column.index)}`, rowId, 'text', {
        partKind: column.semantic,
        ...(rowState === undefined ? {} : { state: rowState })
      })
    );
    const cellSelected = selectedCell?.row === rowIndex && selectedCell.column === columnIndex;
    const cellState = selectedCell === undefined
      ? rowState
      : interactionVisualState(widget, tableCellTargetId(widget, rowId, column.index), {
          selected: cellSelected,
          focused: focused && cellSelected
        });
    const cellSelectedStyle = mergeDataStyles(
      selectedStyle,
      cellState === undefined ? undefined : resolveRenderNodeStyle(widget, { part: 'cell', state: cellState }),
      cellSelected ? resolveRenderNodeStyle(widget, { part: 'cell', state: 'active' }) : undefined
    );
    spans.push(...cellSpans(
      rendered,
      widths[columnIndex] ?? 1,
      column.align,
      cellSelectedStyle,
      tableSource(widget, `row.${rowId}.cell.${String(column.index)}.padding`, rowId, 'decoration', {
        partKind: 'padding',
        ...(cellState === undefined ? {} : { state: cellState })
      }),
      cellSelectedStyle ?? resolveRenderNodeStyle(widget, { part: 'cell' })
    ));
  });
  return { spans };
}

function emptyLine(widget: TableNode, spacing: TableMetrics): RenderLine {
  const emptyText = sanitizeTableText(stringify(widget.props.emptyText)) || 'No rows';
  return {
    spans: [
      dataSpan(' '.repeat(spacing.markerCells), resolveRenderNodeStyle(widget, { part: 'marker' }), tableSource(widget, 'empty.marker', undefined, 'decoration')),
      dataSpan(emptyText, resolveRenderNodeStyle(widget, { part: 'empty', base: themeStyle('text.muted', { dim: true }) }), tableSource(widget, 'empty'))
    ]
  };
}

function renderCell(
  widget: TableNode,
  row: unknown,
  rowIndex: number,
  column: NormalizedTableColumn,
  columnIndex: number,
  theme: TerminalTheme,
  fallbackSource: FrameCellSource
): readonly RenderSpan[] {
  const fallbackStyle = mergeDataStyles(tableSemanticStyle(widget, column.semantic), column.style);
  if (column.renderCell !== undefined) {
    return renderResultToSpans(
      column.renderCell(row, rowIndex, columnIndex),
      fallbackStyle,
      fallbackSource,
      theme
    );
  }
  const value = column.value(row, rowIndex);
  return [dataSpan(displayTableValue(value), fallbackStyle, fallbackSource)];
}

function tableSemanticStyle(widget: TableNode, semantic: TableColumnSemantic): TerminalStyle | undefined {
  if (semantic === 'metric') return resolveRenderNodeStyle(widget, { part: 'metric', base: themeStyle('table.metric') });
  if (semantic === 'metadata') return resolveRenderNodeStyle(widget, { part: 'metadata', base: themeStyle('table.metadata', { dim: true }) });
  return resolveRenderNodeStyle(widget, { part: 'cell', base: themeStyle('text.default') });
}

function renderResultToSpans(
  result: string | InlineContentSegment | InlineContent,
  style: TerminalStyle | undefined,
  fallbackSource: FrameCellSource,
  theme: TerminalTheme
): readonly RenderSpan[] {
  if (typeof result === 'string') return [dataSpan(sanitizeTableText(result), style, fallbackSource)];
  const content = normalizeInlineContent(Array.isArray(result) ? result : [result]);
  return renderInlineContent(content, {
    theme,
    ...(style === undefined ? {} : { baseStyle: style }),
    source: () => fallbackSource
  });
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

function tableSpacing(widget: TableNode): TableMetrics {
  return tableMetrics(widget.props.density);
}


function selectedTableRow(
  widget: TableNode,
  collection: TableCollection<unknown>
): number {
  const selectedCell = selectedTableCell(widget, collection);
  if (selectedCell !== undefined) return selectedCell.row;
  const selectedRowId = stringify(widget.props.selectedRowId);
  return selectedRowId.length === 0 ? -1 : collectionRecordById(collection, selectedRowId)?.index ?? -1;
}

function selectedTableCell(
  widget: TableNode,
  collection: TableCollection<unknown>
): SelectedTableCell | undefined {
  const selectedCell = widget.props.selectedCell;
  if (!isRecord(selectedCell)) return undefined;
  const rowId = selectedCell.rowId;
  const column = selectedCell.column;
  if (typeof rowId !== 'string') return undefined;
  const row = collectionRecordById(collection, rowId)?.index;
  if (row === undefined) return undefined;
  return {
    row,
    rowId,
    column: typeof column === 'number' ? Math.max(0, Math.floor(column)) : 0
  };
}

function scrollInput(widget: TableNode): { readonly scroll?: ScrollState } {
  const scroll = scrollStateFromUnknown(widget.props.scroll);
  return scroll === undefined ? {} : { scroll };
}

function tableActionMessageFactory<TMessage>(widget: TableNode<TMessage>): ((action: TableControlAction) => TMessage) | undefined {
  return widget.props.toActionMessage;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function tableSource(
  widget: TableNode,
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

function tableRowTargetId(widget: TableNode, rowId: string): string {
  return renderNodeTargetId(widget, 'row', rowId);
}

function tableCellTargetId(widget: TableNode, rowId: string, column: number): string {
  return renderNodeTargetId(widget, 'row', rowId, 'cell', String(column));
}
type TableNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'table'>;
