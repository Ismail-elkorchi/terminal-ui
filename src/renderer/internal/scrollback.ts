import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import {
  createScrollState,
  normalizeScrollState,
  scrollReducer,
  visibleWindowFromScroll
} from '../../behavior/scroll.ts';
import {
  documentEmptyStyle,
  documentHighlightSpans,
  documentSpan,
  scrollbackBodyStyle,
  scrollbackMetadataSeparatorStyle,
  scrollbackMetadataStyle,
  scrollbackOmissionStyle,
  scrollbackSelectedStyle,
  scrollbackTimestampStyle,
  sourceToken
} from './document-visual.ts';
import {
  scrollbackItemLevel,
  scrollbackTimestampText,
  type ScrollbackBodySelection
} from './scrollback/content.ts';
import {
  projectScrollbackLayout,
  projectScrollbackSearch,
  scrollbackRowForItem,
  type ScrollbackLayoutProjection,
  visibleScrollbackRecords
} from './scrollback/projection.ts';
import { extractScrollbackSelectionText } from '../../behavior/scrollback-selection.ts';
import { scrollbackHistoryItemAt } from '../../ui-model/scrollback-history.ts';
import { stringify } from './render-node-props.ts';
import { textOffsetAtVisualColumn } from './text-pointer.ts';
import { wrapRenderSpans } from '../../visual/render.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import type { TextSelection, TextWidthProfile } from '../../text/index.ts';
import type { ScrollbackHistory, ScrollbackHistoryRecord, ScrollbackItem } from '../../ui-model/scrollback-history.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import type { LayoutNode } from '../model/layout.ts';
import type { RenderBlock, RenderLine, RenderSpan } from '../../visual/render.ts';

interface ScrollbackTextSegment extends RenderSpan {
  readonly matched?: boolean;
}

interface ScrollbackVisibleRow {
  readonly id: string;
  readonly text: string;
  readonly segments: readonly ScrollbackTextSegment[];
  readonly sourceItemId?: string;
  readonly sourceItemIndex?: number;
  readonly timestamp?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly matched?: boolean;
  readonly selected?: boolean;
  readonly bodyPositions?: readonly ScrollbackBodyPosition[];
}

interface ScrollbackBodyPosition {
  readonly column: number;
  readonly cells: number;
  readonly text: string;
  readonly offset: number;
}

interface ScrollbackWindow {
  readonly rows: readonly ScrollbackVisibleRow[];
  readonly totalRows: number;
  readonly start: number;
  readonly end: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
  readonly matchCount: number;
  readonly followTail: boolean;
  readonly selectedText?: string;
}

const scrollbackWindowCache = new WeakMap<object, {
  readonly width: number;
  readonly height: number;
  readonly widthProfile: TextWidthProfile;
  readonly window: ScrollbackWindow;
}>();

export function scrollbackWindow(
  widget: ScrollbackNode,
  node: Pick<LayoutNode, 'bounds'>,
  widthProfile: TextWidthProfile
): ScrollbackWindow {
  const cached = scrollbackWindowCache.get(widget);
  if (
    cached?.width === node.bounds.width
    && cached.height === node.bounds.height
    && cached.widthProfile === widthProfile
  ) return cached.window;
  const window = projectScrollbackWindow(widget, node, widthProfile);
  scrollbackWindowCache.set(widget, {
    width: node.bounds.width,
    height: node.bounds.height,
    widthProfile,
    window
  });
  return window;
}

function projectScrollbackWindow(
  widget: ScrollbackNode,
  node: Pick<LayoutNode, 'bounds'>,
  widthProfile: TextWidthProfile
): ScrollbackWindow {
  const history = widget.props.history;
  const wrap = widget.props.wrap === true;
  const query = searchQueryProp(widget);
  const selectedRange = selectedRangeProp(widget);
  const includeBodyPositions = widget.props.toActionMessage !== undefined;
  const projection = projectScrollbackLayout(history, node.bounds.width, wrap, widthProfile);
  const search = projectScrollbackSearch(history, query);
  const rowsByRecord = new Map<ScrollbackHistoryRecord, readonly ScrollbackVisibleRow[]>();
  const rowsForRecord = (record: ScrollbackHistoryRecord): readonly ScrollbackVisibleRow[] => {
    const cached = rowsByRecord.get(record);
    if (cached !== undefined) return cached;
    const rows = scrollbackRecordRows(
      widget,
      record,
      node.bounds.width,
      query,
      selectionForRecord(record, selectedRange),
      wrap,
      includeBodyPositions,
      widthProfile
    );
    rowsByRecord.set(record, rows);
    return rows;
  };
  const firstMatchRow = firstMatchingScrollbackRow(
    history,
    projection,
    search.firstItemIndex,
    rowsForRecord
  );
  const explicitScroll = scrollStateProp(widget);
  const scroll = explicitScroll === undefined
    ? defaultScrollState(projection.totalRows, node.bounds.height, firstMatchRow)
    : normalizeScrollState({
        ...explicitScroll,
        contentRows: projection.totalRows,
        viewportRows: node.bounds.height
      });
  const visibleWindow = visibleWindowFromScroll(scroll);
  const omittedBefore = visibleWindow.start;
  const omittedAfter = Math.max(0, projection.totalRows - visibleWindow.end);
  const visibleRows = visibleScrollbackRecords(projection, visibleWindow.start, visibleWindow.end)
    .flatMap(({ record, localStart, localEnd }) => rowsForRecord(record).slice(localStart, localEnd));
  return {
    rows: projection.totalRows === 0
      ? emptyRows(widget, node.bounds.height)
      : withOmissionMarkers(
          widget,
          visibleRows,
          omittedBefore,
          omittedAfter,
          node.bounds.height,
          scroll.followTail
        ),
    totalRows: projection.totalRows,
    start: visibleWindow.start,
    end: visibleWindow.end,
    omittedBefore,
    omittedAfter,
    matchCount: search.matchingItems,
    followTail: scroll.followTail,
    ...selectedTextProp(widget, history)
  };
}

function firstMatchingScrollbackRow(
  history: ScrollbackHistory,
  projection: ScrollbackLayoutProjection,
  firstItemIndex: number | undefined,
  rowsForRecord: (record: ScrollbackHistoryRecord) => readonly ScrollbackVisibleRow[]
): number | undefined {
  if (firstItemIndex === undefined) return undefined;
  const record = scrollbackHistoryItemAt(history, firstItemIndex);
  const itemStartRow = scrollbackRowForItem(projection, firstItemIndex);
  if (record === undefined || itemStartRow === undefined) return undefined;
  const matchedRow = rowsForRecord(record).findIndex((row) => row.matched === true);
  return matchedRow < 0 ? undefined : itemStartRow + matchedRow;
}

export function scrollbackText(widget: ScrollbackNode, node: LayoutNode, widthProfile: TextWidthProfile): string {
  return scrollbackWindow(widget, node, widthProfile).rows.map((row) => row.text).join('\n');
}

export function scrollbackBlock(widget: ScrollbackNode, node: LayoutNode, widthProfile: TextWidthProfile): RenderBlock {
  return {
    lines: scrollbackWindow(widget, node, widthProfile).rows.map((row) => ({ spans: row.segments }))
  };
}

export function scrollbackPointerOffset(
  widget: ScrollbackNode,
  node: Pick<LayoutNode, 'bounds'>,
  event: RoutedPointerEvent,
  widthProfile: TextWidthProfile
): number | undefined {
  const row = scrollbackWindow(widget, node, widthProfile).rows[(event.localRow ?? 0) - 1];
  const positions = row?.bodyPositions;
  if (positions === undefined || positions.length === 0) return undefined;
  const column = Math.max(0, (event.localColumn ?? 1) - 1);
  const containing = positions.find((position) =>
    column >= position.column && column < position.column + position.cells
  );
  if (containing !== undefined) {
    return containing.offset + textOffsetAtVisualColumn(
      containing.text,
      column - containing.column,
      { widthProfile }
    );
  }
  const previous = positions.findLast((position) => column >= position.column + position.cells);
  if (previous !== undefined) return previous.offset + previous.text.length;
  return positions[0]?.offset;
}

export function scrollbackAccessibleBase(
  widget: ScrollbackNode,
  node: LayoutNode,
  id: string,
  widthProfile: TextWidthProfile
): AccessibleNode {
  const window = scrollbackWindow(widget, node, widthProfile);
  return {
    id,
    role: 'text',
    label: id,
    description: scrollbackDescription(widget, window)
  };
}

export function scrollbackAccessibleChildren(
  widget: ScrollbackNode,
  node: LayoutNode,
  widthProfile: TextWidthProfile
): readonly AccessibleNode[] {
  return scrollbackWindow(widget, node, widthProfile).rows.map((row) => ({
    id: row.id,
    role: 'text',
    label: row.text,
    value: row.text,
    ...(row.matched === true ? { description: 'Search match.' } : {})
  }));
}

function scrollbackDescription(widget: ScrollbackNode, window: ScrollbackWindow): string {
  const query = stringify(widget.props.searchQuery);
  const queryText = query.length === 0
    ? ''
    : ` Search query: ${query}. Matching items: ${String(window.matchCount)}.`;
  const selectionText = window.selectedText === undefined
    ? ''
    : ` Selection length: ${String(window.selectedText.length)}.`;
  const followTailText = ` Follow tail: ${window.followTail ? 'true' : 'false'}.`;
  if (window.totalRows === 0) return `Showing 0 scrollback rows.${followTailText}${queryText}${selectionText}`;
  return `Showing ${String(window.start + 1)}-${String(window.end)} of ${String(window.totalRows)} scrollback rows. Omitted before: ${String(window.omittedBefore)}. Omitted after: ${String(window.omittedAfter)}.${followTailText}${queryText}${selectionText}`;
}

function scrollbackRecordRows(
  widget: ScrollbackNode,
  record: ScrollbackHistoryRecord,
  width: number,
  query: string,
  selection: ScrollbackBodySelection | undefined,
  wrap: boolean,
  includeBodyPositions: boolean,
  widthProfile: TextWidthProfile
): readonly ScrollbackVisibleRow[] {
  const fullLine = scrollbackFullLineSpans(widget, record, query, selection);
  const lines = wrap && width > 0
    ? wrapRenderSpans(fullLine, width, { widthProfile })
    : [{ spans: fullLine } satisfies RenderLine];
  let bodyCursor = 0;
  return lines.map((renderLine, lineIndex) => {
    const positionProjection = includeBodyPositions
      ? bodyPositionsForLine(
          renderLine.spans,
          record.bodyText,
          record.bodyOffset,
          bodyCursor,
          widthProfile
        )
      : { positions: [], nextBodyCursor: bodyCursor };
    bodyCursor = positionProjection.nextBodyCursor;
    return {
      id: `${widget.id ?? 'scrollback'}:item:${String(record.itemIndex)}:line:${String(lineIndex)}`,
      text: renderLine.spans.map((segment) => segment.text).join(''),
      segments: renderLine.spans,
      sourceItemId: record.item.id,
      sourceItemIndex: record.itemIndex,
      ...timestampForItem(record.item),
      ...metadataForRecord(record),
      matched: renderLine.spans.some((segment) => 'matched' in segment && segment.matched === true),
      ...(selection === undefined ? {} : { selected: true }),
      ...(positionProjection.positions.length === 0
        ? {}
        : { bodyPositions: positionProjection.positions })
    };
  });
}

function selectionForRecord(
  record: ScrollbackHistoryRecord,
  selectedRange: TextSelection | undefined
): ScrollbackBodySelection | undefined {
  if (selectedRange === undefined) return undefined;
  const start = Math.min(selectedRange.start, selectedRange.end);
  const end = Math.max(selectedRange.start, selectedRange.end);
  const recordEnd = record.bodyOffset + record.bodyText.length;
  const rangeStart = Math.max(start, record.bodyOffset);
  const rangeEnd = Math.min(end, recordEnd);
  return rangeStart < rangeEnd
    ? { start: rangeStart - record.bodyOffset, end: rangeEnd - record.bodyOffset }
    : undefined;
}

function withOmissionMarkers(
  widget: ScrollbackNode,
  rows: readonly ScrollbackVisibleRow[],
  omittedBefore: number,
  omittedAfter: number,
  height: number,
  followTail: boolean
): readonly ScrollbackVisibleRow[] {
  if (height <= 0) return [];
  const result = [...rows];
  if (omittedBefore > 0 && result.length > 0) {
    result[0] = omissionRow(widget, 'before', `... ${String(omittedBefore)} earlier rows omitted ...`);
  }
  if (omittedAfter > 0 && result.length > 1) {
    const pausedText = followTail ? '' : ' (paused)';
    result[result.length - 1] = omissionRow(
      widget,
      'after',
      `... ${String(omittedAfter)} later rows omitted${pausedText} ...`
    );
  }
  return result.slice(0, height);
}

function emptyRows(widget: ScrollbackNode, height: number): readonly ScrollbackVisibleRow[] {
  if (height <= 0) return [];
  return [{
    id: `${widget.id ?? 'scrollback'}:empty`,
    text: 'No scrollback rows',
    segments: [documentSpan(
      widget,
      'scrollback',
      'empty',
      'empty',
      'No scrollback rows',
      documentEmptyStyle(widget)
    )]
  }];
}

function omissionRow(
  widget: ScrollbackNode,
  position: 'before' | 'after',
  text: string
): ScrollbackVisibleRow {
  return {
    id: `scrollback:omitted-${position}`,
    text,
    segments: [documentSpan(
      widget,
      'scrollback',
      'omission',
      `omission.${position}`,
      text,
      scrollbackOmissionStyle(widget)
    )]
  };
}

function timestampForItem(item: ScrollbackItem): { readonly timestamp?: string } {
  const [timestamp] = scrollbackTimestampText(item);
  return timestamp === undefined ? {} : { timestamp };
}

function metadataForRecord(record: ScrollbackHistoryRecord): { readonly metadata?: Readonly<Record<string, string>> } {
  return record.metadataEntries.length === 0 ? {} : { metadata: Object.fromEntries(record.metadataEntries) };
}

function scrollStateProp(widget: ScrollbackNode) {
  return widget.props.scroll;
}

function selectedTextProp(
  widget: ScrollbackNode,
  history: ScrollbackHistory
): { readonly selectedText?: string } {
  const selectedRange = selectedRangeProp(widget);
  const selectedText = extractScrollbackSelectionText({
    history,
    ...(selectedRange === undefined ? {} : { selectedRange })
  });
  return selectedText === undefined ? {} : { selectedText };
}

function selectedRangeProp(widget: ScrollbackNode): TextSelection | undefined {
  return widget.props.selectedRange;
}

function searchQueryProp(widget: ScrollbackNode): string {
  return sanitizeTerminalText(stringify(widget.props.searchQuery)).text.trim();
}

function defaultScrollState(
  totalRows: number,
  viewportRows: number,
  firstMatchRow: number | undefined
) {
  if (firstMatchRow !== undefined) {
    return scrollReducer(
      createScrollState({ contentRows: totalRows, viewportRows }),
      { kind: 'itemIntoView', index: firstMatchRow }
    );
  }
  return createScrollState({
    contentRows: totalRows,
    viewportRows,
    followTail: true
  });
}

function bodyPositionsForLine(
  spans: readonly RenderSpan[],
  bodyText: string,
  bodyOffset: number,
  initialBodyCursor: number,
  widthProfile: TextWidthProfile
): { readonly positions: readonly ScrollbackBodyPosition[]; readonly nextBodyCursor: number } {
  const positions: ScrollbackBodyPosition[] = [];
  let column = 0;
  let bodyCursor = initialBodyCursor;
  for (const currentSpan of spans) {
    const cells = measureTextCells(currentSpan.text, { widthProfile }).cells;
    if (isBodyTextSpan(currentSpan) && currentSpan.text.length > 0) {
      const start = bodyText.indexOf(currentSpan.text, bodyCursor);
      if (start >= 0) {
        positions.push({
          column,
          cells,
          text: currentSpan.text,
          offset: bodyOffset + start
        });
        bodyCursor = start + currentSpan.text.length;
      }
    }
    column += cells;
  }
  return { positions, nextBodyCursor: bodyCursor };
}

function isBodyTextSpan(currentSpan: RenderSpan): boolean {
  const part = currentSpan.source?.part;
  return currentSpan.source?.family === 'scrollback'
    && (part === 'body' || part?.startsWith('body.') === true);
}

function scrollbackFullLineSpans(
  widget: ScrollbackNode,
  record: ScrollbackHistoryRecord,
  query: string,
  selection?: ScrollbackBodySelection
): readonly ScrollbackTextSegment[] {
  const timestampStyle = scrollbackTimestampStyle(widget);
  const metadataStyle = scrollbackMetadataStyle(widget);
  const separatorStyle = scrollbackMetadataSeparatorStyle(widget);
  const spans: ScrollbackTextSegment[] = [];
  for (const timestamp of scrollbackTimestampText(record.item)) {
    appendGap(spans, widget);
    spans.push(...timestampSpans(
      widget,
      record.item,
      record.itemIndex,
      timestamp,
      query,
      timestampStyle,
      separatorStyle
    ));
  }
  for (const [key, value] of record.metadataEntries) {
    appendGap(spans, widget);
    spans.push(...metadataSpans(
      widget,
      record.item,
      record.itemIndex,
      key,
      value,
      query,
      metadataStyle,
      separatorStyle
    ));
  }
  appendGap(spans, widget);
  spans.push(...bodySpans(widget, record.item, record.itemIndex, record.bodyText, query, selection));
  return spans.filter((span) => span.text.length > 0);
}

function appendGap(spans: ScrollbackTextSegment[], widget: ScrollbackNode): void {
  if (spans.length === 0) return;
  spans.push(documentSpan(
    widget,
    'scrollback',
    'separator',
    'separator',
    ' ',
    scrollbackMetadataSeparatorStyle(widget)
  ));
}

function timestampSpans(
  widget: ScrollbackNode,
  item: ScrollbackItem,
  itemIndex: number,
  timestamp: string,
  query: string,
  style: ReturnType<typeof scrollbackMetadataStyle>,
  separatorStyle: ReturnType<typeof scrollbackMetadataSeparatorStyle>
): readonly ScrollbackTextSegment[] {
  const value = timestamp.startsWith('[') && timestamp.endsWith(']')
    ? timestamp.slice(1, -1)
    : timestamp;
  return [
    documentSpan(
      widget,
      'scrollback',
      'chrome',
      'timestamp.open',
      '[',
      separatorStyle,
      sourceOptionsForItem(item, itemIndex)
    ),
    ...documentHighlightSpans({
      widget,
      kind: 'scrollback',
      visual: 'metadata',
      label: 'timestamp.value',
      text: value,
      query,
      baseStyle: style,
      sourceOptions: sourceOptionsForItem(item, itemIndex)
    }),
    documentSpan(
      widget,
      'scrollback',
      'chrome',
      'timestamp.close',
      ']',
      separatorStyle,
      sourceOptionsForItem(item, itemIndex)
    )
  ];
}

function metadataSpans(
  widget: ScrollbackNode,
  item: ScrollbackItem,
  itemIndex: number,
  key: string,
  value: string,
  query: string,
  style: ReturnType<typeof scrollbackMetadataStyle>,
  separatorStyle: ReturnType<typeof scrollbackMetadataSeparatorStyle>
): readonly ScrollbackTextSegment[] {
  const token = sourceToken(key);
  return [
    ...documentHighlightSpans({
      widget,
      kind: 'scrollback',
      visual: 'metadata',
      label: `metadata.${token}.key`,
      text: key,
      query,
      baseStyle: style,
      sourceOptions: sourceOptionsForItem(item, itemIndex)
    }),
    documentSpan(
      widget,
      'scrollback',
      'separator',
      `metadata.${token}.separator`,
      '=',
      separatorStyle,
      sourceOptionsForItem(item, itemIndex)
    ),
    ...documentHighlightSpans({
      widget,
      kind: 'scrollback',
      visual: 'metadata',
      label: `metadata.${token}.value`,
      text: value,
      query,
      baseStyle: style,
      sourceOptions: sourceOptionsForItem(item, itemIndex)
    })
  ];
}

function bodySpans(
  widget: ScrollbackNode,
  item: ScrollbackItem,
  itemIndex: number,
  text: string,
  query: string,
  selection: ScrollbackBodySelection | undefined
): readonly ScrollbackTextSegment[] {
  const itemStyle = scrollbackBodyStyle(widget, item.style, scrollbackItemLevel(item));
  if (selection === undefined) {
    return documentHighlightSpans({
      widget,
      kind: 'scrollback',
      visual: 'body',
      label: 'body',
      text,
      query,
      baseStyle: itemStyle,
      sourceOptions: sourceOptionsForItem(item, itemIndex)
    });
  }
  const start = Math.max(0, Math.min(text.length, selection.start));
  const end = Math.max(start, Math.min(text.length, selection.end));
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  return [
    ...documentHighlightSpans({
      widget,
      kind: 'scrollback',
      visual: 'body',
      label: 'body',
      text: before,
      query,
      baseStyle: itemStyle,
      sourceOptions: sourceOptionsForItem(item, itemIndex)
    }),
    ...documentHighlightSpans({
      widget,
      kind: 'scrollback',
      visual: 'body',
      label: 'body.selection',
      text: selected,
      query,
      baseStyle: scrollbackSelectedStyle(widget),
      sourceOptions: sourceOptionsForItem(item, itemIndex, 'selected')
    }),
    ...documentHighlightSpans({
      widget,
      kind: 'scrollback',
      visual: 'body',
      label: 'body',
      text: after,
      query,
      baseStyle: itemStyle,
      sourceOptions: sourceOptionsForItem(item, itemIndex)
    })
  ];
}

function sourceOptionsForItem(item: ScrollbackItem, itemIndex: number, state?: string) {
  return {
    itemId: item.id,
    itemIndex,
    ...(state === undefined ? {} : { state })
  };
}

type ScrollbackNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'scrollback'>;
