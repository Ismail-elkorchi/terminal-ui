import type { RenderNodeOfKind } from '../model/index.ts';
import { isNonArrayObject } from '../../foundation/validation.ts';
import { measureTextCells } from '../../text/index.ts';
import { textWidthProfileKey } from '../../text/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
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
import { interactionVisualState, renderNodeTargetId } from './pointer-interaction.ts';
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

interface TableLayout {
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

const tableLayoutCache = new WeakMap<object, {
  readonly width: number;
  readonly height: number;
  readonly widthProfileKey: string;
  readonly layout: TableLayout;
}>();

export function tableBlock(
  renderNode: TableNode,
  bounds: Rect,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  focused = false
): RenderBlock {
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
  } = tableLayout(renderNode, bounds, widthProfile);
  const lines: RenderLine[] = [];
  if (hasHeader && headerHeight > 0) {
    lines.push(scrolledLine(
      headerLine(renderNode, columns, widths, spacing, widthProfile),
      window.horizontalOffset,
      bounds.width,
      widthProfile
    ));
  }
  if (totalRows === 0 && bodyHeight > 0) {
    lines.push(scrolledLine(emptyLine(renderNode, spacing), window.horizontalOffset, bounds.width, widthProfile));
  } else {
    lines.push(...window.rows.map((record) => {
      return scrolledLine(rowLine(
        renderNode,
        record.row,
        record.itemIndex,
        record.id,
        columns,
        widths,
        record.itemIndex === window.selected,
        selectedCell,
        focused,
        theme,
        spacing,
        widthProfile
      ), window.horizontalOffset, bounds.width, widthProfile);
    }));
  }
  return { lines: lines.slice(0, bounds.height) };
}

export function tableAccessibleBase(
  renderNode: TableNode,
  bounds: Rect,
  id: string,
  focused: boolean,
  widthProfile: TextWidthProfile
): AccessibleNode {
  const { totalRows, columns, window } = tableLayout(renderNode, bounds, widthProfile);
  return {
    id,
    role: 'grid',
    label: id,
    description: `Showing ${String(window.start + 1)}-${String(window.end)} of ${String(totalRows)} rows.`,
    window: {
      startIndex: window.start,
      endIndexExclusive: window.end,
      totalCount: totalRows,
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

export function tableAccessibleChildren(
  renderNode: TableNode,
  bounds: Rect,
  widthProfile: TextWidthProfile
): readonly AccessibleNode[] {
  const { totalRows, columns, hasHeader, window, selectedCell } = tableLayout(renderNode, bounds, widthProfile);
  const headerRow: AccessibleNode[] = hasHeader
    ? [{
        id: `${renderNode.id ?? 'table'}:headers`,
        role: 'row',
        position: {
          rowIndex: 1,
          rowCount: totalRows + 1,
          columnCount: columns.length
        },
        children: columns.map((column, columnIndex) => ({
          id: `${renderNode.id ?? 'table'}:header:${String(column.index)}`,
          role: 'columnheader',
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
            rowIndex: 1,
            rowCount: totalRows + 1,
            columnIndex: columnIndex + 1,
            columnCount: columns.length,
            columnLabel: columnLabel(column, columnIndex)
          }
        }))
      }]
    : [];
  const bodyRows: AccessibleNode[] = window.rows.map((record) => {
    const rowIndex = record.itemIndex;
    return {
      id: tableRowTargetId(renderNode, record.id),
      role: 'row',
      selected: rowIndex === window.selected,
      position: {
        positionInSet: rowIndex + 1,
        setSize: totalRows,
        rowIndex: hasHeader ? rowIndex + 2 : rowIndex + 1,
        rowCount: hasHeader ? totalRows + 1 : totalRows,
        columnCount: columns.length
      },
      children: columns.map((column, columnIndex) => {
        const value = column.value(record.row, rowIndex);
        const label = columnLabel(column, columnIndex);
        return {
          id: tableCellTargetId(renderNode, record.id, column.index),
          role: 'gridcell',
          label: displayTableValue(value),
          value: displayTableValue(value),
          position: {
            rowIndex: hasHeader ? rowIndex + 2 : rowIndex + 1,
            rowCount: hasHeader ? totalRows + 1 : totalRows,
            columnIndex: columnIndex + 1,
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

export function tableHitTargets<TMessage>(
  renderNode: TableNode<TMessage>,
  bounds: Rect,
  widthProfile: TextWidthProfile
): readonly HitTarget<TMessage>[] {
  const toMessage = tableActionMessageFactory(renderNode);
  if (toMessage === undefined) return [];
  const { columns, spacing, headerHeight, window, widths, selectedCell } = tableLayout(renderNode, bounds, widthProfile);
  const headerTargets = headerHeight <= 0
    ? []
    : tableHeaderHitTargets(renderNode, columns, widths, bounds, window.horizontalOffset, spacing, toMessage);
  const bodyTargets = window.rows.flatMap((record, visibleIndex): HitTarget<TMessage>[] => {
    const rowIndex = record.itemIndex;
    const rowId = record.id;
    const rowBounds = {
      row: bounds.row + headerHeight + visibleIndex,
      column: bounds.column,
      width: bounds.width,
      height: 1
    };
    if (selectedCell !== undefined) {
      return tableCellHitTargets(renderNode, rowId, rowIndex, columns, widths, rowBounds, window.horizontalOffset, spacing, toMessage);
    }
    return [{
      id: tableRowTargetId(renderNode, rowId),
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
  renderNode: TableNode<TMessage>,
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
        id: renderNodeTargetId(renderNode, 'header', column.id, 'sort'),
        bounds: {
          row: bounds.row,
          column: bounds.column + visible.start,
          width: visible.end - visible.start,
          height: 1
        },
        accepts: ['click'],
        message: () => toMessage({ kind: 'sortBy', columnId: column.id }),
        cursor: 'pointer'
      });
    }
    if (column.resizable === true) {
      targets.push({
        id: renderNodeTargetId(renderNode, 'header', column.id, 'resize'),
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
              columnId: column.id,
              width: track.width + event.column - (event.pressColumn ?? event.column)
            }),
        cursor: 'pointer'
      });
    }
    return targets;
  });
}

function tableCellHitTargets<TMessage>(
  renderNode: TableNode<TMessage>,
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
      id: tableCellTargetId(renderNode, rowId, column.index),
      bounds: {
        row: rowBounds.row,
        column: rowBounds.column + visible.start,
        width: visible.end - visible.start,
        height: 1
      },
      message: (event) => toMessage(event.clickCount === 2
        ? { kind: 'activate', rowId, rowIndex, columnIndex: visibleColumnIndex }
        : { kind: 'selectCell', rowId, rowIndex, columnIndex: visibleColumnIndex }),
      cursor: 'pointer'
    }];
  });
}

function columnLabel(column: NormalizedTableColumn, index: number): string {
  return column.header ?? `Column ${String(index + 1)}`;
}

function tableWindow(renderNode: TableNode, bodyHeight: number, selected: number): TableWindow {
  const window = projectedRowWindow(renderNode.props.collection, {
    viewportRows: bodyHeight,
    selectedIndex: selected,
    ...scrollInput(renderNode)
  });
  return {
    rows: window.rows,
    start: window.startIndex,
    end: window.endIndexExclusive,
    selected,
    horizontalOffset: window.offsetColumn,
    omittedBefore: window.omittedBefore,
    omittedAfter: window.omittedAfter
  };
}

function tableLayout(renderNode: TableNode, bounds: Rect, widthProfile: TextWidthProfile): TableLayout {
  const cached = tableLayoutCache.get(renderNode);
  const profileKey = textWidthProfileKey(widthProfile);
  if (
    cached?.width === bounds.width
    && cached.height === bounds.height
    && cached.widthProfileKey === profileKey
  ) return cached.layout;
  const collection = renderNode.props.collection;
  const selected = selectedTableRow(renderNode, collection);
  const selectedCell = selectedTableCell(renderNode, collection);
  const columns = tableColumns(renderNode, tableRowSample(collection, selected));
  const spacing = tableSpacing(renderNode);
  const hasHeader = columns.some((column) => column.header !== undefined);
  const headerHeight = hasHeader && renderNode.props.stickyHeader !== false ? 1 : 0;
  const bodyHeight = Math.max(0, bounds.height - headerHeight);
  const window = tableWindow(renderNode, bodyHeight, selected);
  const layout: TableLayout = {
    totalRows: collection.totalCount,
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
      spacing.separatorCells,
      widthProfile
    )
  };
  tableLayoutCache.set(renderNode, {
    width: bounds.width,
    height: bounds.height,
    widthProfileKey: profileKey,
    layout
  });
  return layout;
}

function tableRowSample(
  collection: TableCollection<unknown>,
  selected: number,
  limit = 64
): readonly unknown[] {
  const recordCount = collection.records.length;
  if (recordCount <= limit) return collection.records.map((record) => record.row);
  const selectedOffset = selected - collection.startIndex;
  const anchor = selectedOffset < 0 || selectedOffset >= recordCount ? 0 : selectedOffset;
  const start = Math.max(0, Math.min(recordCount - limit, anchor - Math.floor(limit / 2)));
  return collection.records.slice(start, start + limit).map((record) => record.row);
}

function headerLine(
  renderNode: TableNode,
  columns: readonly NormalizedTableColumn[],
  widths: readonly number[],
  spacing: TableMetrics,
  widthProfile: TextWidthProfile
): RenderLine {
  const decorationStyle = resolveRenderNodeStyle(renderNode, { part: 'header', base: themeStyle('table.header', { bold: true }) });
  const spans: RenderSpan[] = [dataSpan(' '.repeat(spacing.markerCells), decorationStyle, tableSource(renderNode, 'header.marker', undefined, 'decoration'))];
  columns.forEach((column, index) => {
    if (index > 0) spans.push(dataSpan(' '.repeat(spacing.separatorCells), decorationStyle, tableSource(renderNode, 'column.separator', undefined, 'separator')));
    const headerStyle = mergeStyles(
      resolveRenderNodeStyle(renderNode, { part: 'headerCell', base: themeStyle('table.header', { bold: true }) }),
      column.headerStyle
    );
    const headerSourceId = `${renderNode.id ?? 'table'}:header:${String(column.index)}`;
    const label = column.header ?? '';
    const labelSpans: RenderSpan[] = [
      ...(label.length === 0 ? [] : [dataSpan(label, headerStyle, tableSource(renderNode, `header.${String(column.index)}.label`, headerSourceId, 'text', {
        partType: 'header'
      }))])
    ];
    const sort = tableSortMarker(column.sort);
    if (sort.length > 0) {
      labelSpans.push(dataSpan(sort, resolveRenderNodeStyle(renderNode, {
        part: 'sortIndicator',
        ...(headerStyle === undefined ? {} : { base: headerStyle })
      }), tableSource(renderNode, `header.${String(column.index)}.sort`, headerSourceId, 'decoration', {
        partType: 'sort'
      })));
    }
    const resize = tableResizeMarker(column);
    if (resize.length > 0) {
      labelSpans.push(dataSpan(resize, headerStyle, tableSource(renderNode, `header.${String(column.index)}.resize`, headerSourceId, 'decoration', {
        partType: 'resize'
      })));
    }
    spans.push(...cellSpans(
      labelSpans,
      widths[index] ?? 1,
      column.align,
      widthProfile,
      undefined,
      tableSource(renderNode, `header.${String(column.index)}.padding`, headerSourceId, 'decoration'),
      decorationStyle
    ));
  });
  return { spans };
}

function rowLine(
  renderNode: TableNode,
  row: unknown,
  rowIndex: number,
  rowId: string,
  columns: readonly NormalizedTableColumn[],
  widths: readonly number[],
  selected: boolean,
  selectedCell: SelectedTableCell | undefined,
  focused: boolean,
  theme: TerminalTheme,
  spacing: TableMetrics,
  widthProfile: TextWidthProfile
): RenderLine {
  const rowState = interactionVisualState(renderNode, tableRowTargetId(renderNode, rowId), {
    selected,
    focused: focused && selected
  });
  const rowStyle = resolveRenderNodeStyle(renderNode, {
    part: 'row',
    ...(rowState === undefined ? {} : { state: rowState })
  });
  const selectedStyle = rowState === undefined ? undefined : rowStyle;
  const decorationStyle = rowStyle;
  const spans: RenderSpan[] = [...selectionMarkerSpans(
    renderNode,
    selected,
    theme,
    selectedStyle,
    tableSource(renderNode, `row.${rowId}.marker`, rowId, 'decoration', {
      partType: 'marker',
      ...(rowState === undefined ? {} : { state: rowState })
    })
  )];
  columns.forEach((column, columnIndex) => {
    if (columnIndex > 0) spans.push(dataSpan(' '.repeat(spacing.separatorCells), decorationStyle, tableSource(renderNode, 'column.separator', undefined, 'separator')));
    const rendered = renderCell(
      renderNode,
      row,
      rowIndex,
      column,
      columnIndex,
      theme,
      tableSource(renderNode, `row.${rowId}.cell.${String(column.index)}`, rowId, 'text', {
        partType: column.semantic,
        ...(rowState === undefined ? {} : { state: rowState })
      })
    );
    const cellSelected = selectedCell?.row === rowIndex
      && selectedCell.column === columnIndex;
    const cellState = selectedCell === undefined
      ? rowState
      : interactionVisualState(renderNode, tableCellTargetId(renderNode, rowId, column.index), {
          selected: cellSelected,
          focused: focused && cellSelected
        });
    const cellSelectedStyle = mergeDataStyles(
      selectedStyle,
      cellState === undefined ? undefined : resolveRenderNodeStyle(renderNode, { part: 'cell', state: cellState }),
      cellSelected ? resolveRenderNodeStyle(renderNode, { part: 'cell', state: 'active' }) : undefined
    );
    spans.push(...cellSpans(
      rendered,
      widths[columnIndex] ?? 1,
      column.align,
      widthProfile,
      cellSelectedStyle,
      tableSource(renderNode, `row.${rowId}.cell.${String(column.index)}.padding`, rowId, 'decoration', {
        partType: 'padding',
        ...(cellState === undefined ? {} : { state: cellState })
      }),
      cellSelectedStyle ?? resolveRenderNodeStyle(renderNode, { part: 'cell' })
    ));
  });
  return { spans };
}

function emptyLine(renderNode: TableNode, spacing: TableMetrics): RenderLine {
  const emptyText = sanitizeTableText(stringify(renderNode.props.emptyText)) || 'No rows';
  return {
    spans: [
      dataSpan(' '.repeat(spacing.markerCells), resolveRenderNodeStyle(renderNode, { part: 'marker' }), tableSource(renderNode, 'empty.marker', undefined, 'decoration')),
      dataSpan(emptyText, resolveRenderNodeStyle(renderNode, { part: 'empty', base: themeStyle('text.muted', { dim: true }) }), tableSource(renderNode, 'empty'))
    ]
  };
}

function renderCell(
  renderNode: TableNode,
  row: unknown,
  rowIndex: number,
  column: NormalizedTableColumn,
  columnIndex: number,
  theme: TerminalTheme,
  fallbackSource: FrameCellSource
): readonly RenderSpan[] {
  const fallbackStyle = mergeDataStyles(tableSemanticStyle(renderNode, column.semantic), column.style);
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

function tableSemanticStyle(renderNode: TableNode, semantic: TableColumnSemantic): TerminalStyle | undefined {
  if (semantic === 'metric') return resolveRenderNodeStyle(renderNode, { part: 'metric', base: themeStyle('table.metric') });
  if (semantic === 'metadata') return resolveRenderNodeStyle(renderNode, { part: 'metadata', base: themeStyle('table.metadata', { dim: true }) });
  return resolveRenderNodeStyle(renderNode, { part: 'cell', base: themeStyle('text.default') });
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
  widthProfile: TextWidthProfile,
  overrideStyle?: TerminalStyle,
  paddingSource?: FrameCellSource,
  paddingStyle?: TerminalStyle
): readonly RenderSpan[] {
  const clipped = overrideStyle === undefined
    ? clipRenderSpans(spans, width, { ellipsis: '…', widthProfile })
    : clipRenderSpans(spans, width, { ellipsis: '…', widthProfile }).map((currentSpan) => {
        const style = mergeCellOverrideStyle(currentSpan.style, overrideStyle);
        return {
          text: currentSpan.text,
          ...(style === undefined ? {} : { style }),
          ...(currentSpan.link === undefined ? {} : { link: currentSpan.link }),
          ...(currentSpan.source === undefined ? {} : { source: currentSpan.source })
        };
      });
  const cells = clipped.reduce(
    (sum, currentSpan) => sum + measureTextCells(currentSpan.text, { widthProfile }).cells,
    0
  );
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

function scrolledLine(
  line: RenderLine,
  offsetCells: number,
  width: number,
  widthProfile: TextWidthProfile
): RenderLine {
  if (offsetCells <= 0) return line;
  const spans: RenderSpan[] = [];
  let skipped = 0;
  let written = 0;
  for (const span of line.spans) {
    for (const segment of measureTextCells(span.text, { widthProfile }).graphemes) {
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

function tableSpacing(renderNode: TableNode): TableMetrics {
  return tableMetrics(renderNode.props.density);
}


function selectedTableRow(
  renderNode: TableNode,
  collection: TableCollection<unknown>
): number {
  const selectedCell = selectedTableCell(renderNode, collection);
  if (selectedCell !== undefined) return selectedCell.row;
  const selectedRowId = stringify(renderNode.props.selectedRowId);
  return selectedRowId.length === 0
    ? -1
    : collectionRecordById(collection, selectedRowId)?.itemIndex ?? -1;
}

function selectedTableCell(
  renderNode: TableNode,
  collection: TableCollection<unknown>
): SelectedTableCell | undefined {
  const selectedCell = renderNode.props.selectedCell;
  if (!isNonArrayObject(selectedCell)) return undefined;
  const rowId = selectedCell.rowId;
  const columnIndex = selectedCell.columnIndex;
  if (typeof rowId !== 'string') return undefined;
  const row = collectionRecordById(collection, rowId)?.itemIndex;
  if (row === undefined) return undefined;
  return {
    row,
    rowId,
    column: typeof columnIndex === 'number' ? Math.max(0, Math.floor(columnIndex)) : 0
  };
}

function scrollInput(renderNode: TableNode): { readonly scroll?: ScrollState } {
  const scroll = scrollStateFromUnknown(renderNode.props.scroll);
  return scroll === undefined ? {} : { scroll };
}

function tableActionMessageFactory<TMessage>(renderNode: TableNode<TMessage>): ((action: TableControlAction) => TMessage) | undefined {
  return renderNode.props.toActionMessage;
}


function tableSource(
  renderNode: TableNode,
  label: string,
  id?: string,
  role: FrameCellSource['cellRole'] = 'text',
  options: {
    readonly partType?: string;
    readonly state?: import('../../element/metadata.ts').ElementVisualState;
  } = {}
): FrameCellSource {
  return dataSource(renderNode, label, {
    ...(id === undefined ? {} : { itemId: id }),
    role,
    ...options
  });
}

function tableRowTargetId(renderNode: TableNode, rowId: string): string {
  return renderNodeTargetId(renderNode, 'row', rowId);
}

function tableCellTargetId(renderNode: TableNode, rowId: string, column: number): string {
  return renderNodeTargetId(renderNode, 'row', rowId, 'cell', String(column));
}
type TableNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'table'>;
