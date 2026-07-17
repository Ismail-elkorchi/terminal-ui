import type { RenderNodeOfKind } from '../model/index.ts';
import { measureTextCells, sanitizeTerminalText } from '../../text/index.ts';
import {
  createScrollState, normalizeScrollState, scrollReducer, visibleWindowFromScroll
} from '../../behavior/scroll.ts';
import {
  documentEmptyStyle, documentHighlightSpans, documentSpan, scrollbackSelectedStyle, scrollbackBodyStyle, scrollbackMetadataStyle, scrollbackMetadataSeparatorStyle, scrollbackOmissionStyle, scrollbackTimestampStyle, sourceToken
} from './document-visual.ts';
import { stringify } from './render-node-props.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { TextSelection } from '../../text/index.ts';
import type { ScrollbackItem } from '../../ui-model/documents.ts';
import type { LayoutNode } from '../model/layout.ts';
import { wrapRenderSpans } from '../../visual/render.ts';
import type { RenderBlock, RenderLine, RenderSpan } from '../../visual/render.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import { textOffsetAtVisualColumn } from './text-pointer.ts';
import {
  scrollbackItemLevel,
  scrollbackMetadataEntries,
  scrollbackSelectedBodyRanges,
  scrollbackTimestampText,
  type ScrollbackBodySelection
} from './scrollback/content.ts';
import { extractScrollbackSelectionText } from '../../behavior/scrollback-selection.ts';


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
  readonly window: ScrollbackWindow;
}>();

export function scrollbackWindow(widget: ScrollbackNode, node: Pick<LayoutNode, 'bounds'>): ScrollbackWindow {
  const cached = scrollbackWindowCache.get(widget);
  if (cached?.width === node.bounds.width && cached.height === node.bounds.height) return cached.window;
  const window = projectScrollbackWindow(widget, node);
  scrollbackWindowCache.set(widget, { width: node.bounds.width, height: node.bounds.height, window });
  return window;
}

function projectScrollbackWindow(widget: ScrollbackNode, node: Pick<LayoutNode, 'bounds'>): ScrollbackWindow {
  const items = scrollbackItems(widget);
  const wrap = widget.props.wrap === true;
  const query = searchQueryProp(widget);
  const selectedRange = selectedRangeProp(widget);
  const includeBodyPositions = selectedRange !== undefined || widget.props.toActionMessage !== undefined;
  const itemSelections = scrollbackSelectedBodyRanges(items, selectedRange);
  const bodyOffsets = includeBodyPositions ? scrollbackBodyOffsets(items) : [];
  const expandedRows = wrap || query.length > 0
    ? scrollbackRows(widget, items, node.bounds.width, query, itemSelections, bodyOffsets, wrap, includeBodyPositions)
    : undefined;
  const totalRows = expandedRows?.length ?? items.length;
  const matchIndexes = query.length === 0 ? [] : matchedRowIndexes(expandedRows ?? []);
  const explicitScroll = scrollStateProp(widget);
  const scroll = explicitScroll === undefined
    ? defaultScrollState(totalRows, node.bounds.height, matchIndexes)
    : normalizeScrollState({
        ...explicitScroll,
        contentRows: totalRows,
        viewportRows: node.bounds.height
      });
  const window = visibleWindowFromScroll(scroll);
  const omittedBefore = window.start;
  const omittedAfter = Math.max(0, totalRows - window.end);
  const visibleRows = expandedRows === undefined
    ? items.slice(window.start, window.end).flatMap((item, index) => scrollbackItemRows(
        widget,
        item,
        window.start + index,
        node.bounds.width,
        '',
        itemSelections[window.start + index],
        bodyOffsets[window.start + index] ?? 0,
        false,
        includeBodyPositions
      ))
    : expandedRows.slice(window.start, window.end);
  return {
    rows: totalRows === 0
      ? emptyRows(widget, node.bounds.height)
      : withOmissionMarkers(widget, visibleRows, omittedBefore, omittedAfter, node.bounds.height, scroll.followTail),
    totalRows,
    start: window.start,
    end: window.end,
    omittedBefore,
    omittedAfter,
    matchCount: matchIndexes.length,
    followTail: scroll.followTail,
    ...selectedTextProp(widget, items)
  };
}

export function scrollbackText(widget: ScrollbackNode, node: LayoutNode): string {
  return scrollbackWindow(widget, node).rows.map((row) => row.text).join('\n');
}

export function scrollbackBlock(widget: ScrollbackNode, node: LayoutNode): RenderBlock {
  return {
    lines: scrollbackWindow(widget, node).rows.map((row) => ({ spans: row.segments }))
  };
}

export function scrollbackPointerOffset(
  widget: ScrollbackNode,
  node: Pick<LayoutNode, 'bounds'>,
  event: RoutedPointerEvent
): number | undefined {
  const row = scrollbackWindow(widget, node).rows[(event.localRow ?? 0) - 1];
  const positions = row?.bodyPositions;
  if (positions === undefined || positions.length === 0) return undefined;
  const column = Math.max(0, (event.localColumn ?? 1) - 1);
  const containing = positions.find((position) =>
    column >= position.column && column < position.column + position.cells
  );
  if (containing !== undefined) {
    return containing.offset + textOffsetAtVisualColumn(
      containing.text,
      column - containing.column
    );
  }
  const previous = positions.findLast((position) => column >= position.column + position.cells);
  if (previous !== undefined) return previous.offset + previous.text.length;
  return positions[0]?.offset;
}

export function scrollbackAccessibleBase(widget: ScrollbackNode, node: LayoutNode, id: string): AccessibleNode {
  const window = scrollbackWindow(widget, node);
  return {
    id,
    role: 'text',
    label: id,
    description: scrollbackDescription(widget, window)
  };
}

export function scrollbackAccessibleChildren(widget: ScrollbackNode, node: LayoutNode): readonly AccessibleNode[] {
  return scrollbackWindow(widget, node).rows.map((row) => ({
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
    : ` Search query: ${query}. Matches in rows: ${String(window.matchCount)}.`;
  const selectionText = window.selectedText === undefined
    ? ''
    : ` Selection length: ${String(window.selectedText.length)}.`;
  const followTailText = ` Follow tail: ${window.followTail ? 'true' : 'false'}.`;
  if (window.totalRows === 0) return `Showing 0 scrollback rows.${followTailText}${queryText}${selectionText}`;
  return `Showing ${String(window.start + 1)}-${String(window.end)} of ${String(window.totalRows)} scrollback rows. Omitted before: ${String(window.omittedBefore)}. Omitted after: ${String(window.omittedAfter)}.${followTailText}${queryText}${selectionText}`;
}

function scrollbackRows(
  widget: ScrollbackNode,
  items: readonly ScrollbackItem[],
  width: number,
  query: string,
  itemSelections: readonly (ScrollbackBodySelection | undefined)[],
  bodyOffsets: readonly number[],
  wrap: boolean,
  includeBodyPositions: boolean
): readonly ScrollbackVisibleRow[] {
  const rows: ScrollbackVisibleRow[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) continue;
    rows.push(...scrollbackItemRows(
      widget,
      item,
      index,
      width,
      query,
      itemSelections[index],
      bodyOffsets[index] ?? 0,
      wrap,
      includeBodyPositions
    ));
  }
  return rows;
}

function scrollbackItemRows(
  widget: ScrollbackNode,
  item: ScrollbackItem,
  itemIndex: number,
  width: number,
  query: string,
  selection: ScrollbackBodySelection | undefined,
  bodyOffset: number,
  wrap: boolean,
  includeBodyPositions: boolean
): readonly ScrollbackVisibleRow[] {
  const fullLine = scrollbackFullLineSpans(widget, item, itemIndex, query, selection);
  const lines = wrap && width > 0
    ? wrapRenderSpans(fullLine, width)
    : [{ spans: fullLine } satisfies RenderLine];
  const bodyText = sanitizeTerminalText(item.text).text;
  let bodyCursor = 0;
  return lines.map((renderLine, lineIndex) => {
    const positionProjection = includeBodyPositions
      ? bodyPositionsForLine(renderLine.spans, bodyText, bodyOffset, bodyCursor)
      : { positions: [], nextBodyCursor: bodyCursor };
    bodyCursor = positionProjection.nextBodyCursor;
    return {
      id: `${widget.id ?? 'scrollback'}:item:${String(itemIndex)}:line:${String(lineIndex)}`,
      text: renderLine.spans.map((segment) => segment.text).join(''),
      segments: renderLine.spans,
      sourceItemId: item.id,
      sourceItemIndex: itemIndex,
      ...timestampForItem(item),
      ...metadataForItem(item),
      matched: renderLine.spans.some((segment) => 'matched' in segment && segment.matched === true),
      ...(selection === undefined ? {} : { selected: true }),
      ...(positionProjection.positions.length === 0
        ? {}
        : { bodyPositions: positionProjection.positions })
    };
  });
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
    result[result.length - 1] = omissionRow(widget, 'after', `... ${String(omittedAfter)} later rows omitted${pausedText} ...`);
  }
  return result.slice(0, height);
}

function emptyRows(widget: ScrollbackNode, height: number): readonly ScrollbackVisibleRow[] {
  if (height <= 0) return [];
  return [{
    id: `${widget.id ?? 'scrollback'}:empty`,
    text: 'No scrollback rows',
    segments: [documentSpan(widget, 'scrollback', 'empty', 'empty', 'No scrollback rows', documentEmptyStyle(widget))]
  }];
}

function omissionRow(widget: ScrollbackNode, position: 'before' | 'after', text: string): ScrollbackVisibleRow {
  return {
    id: `scrollback:omitted-${position}`,
    text,
    segments: [documentSpan(widget, 'scrollback', 'omission', `omission.${position}`, text, scrollbackOmissionStyle(widget))]
  };
}

function scrollbackItems(widget: ScrollbackNode): readonly ScrollbackItem[] {
  return widget.props.items;
}

function timestampForItem(item: ScrollbackItem): { readonly timestamp?: string } {
  const [timestamp] = scrollbackTimestampText(item);
  return timestamp === undefined ? {} : { timestamp };
}

function metadataForItem(item: ScrollbackItem): { readonly metadata?: Readonly<Record<string, string>> } {
  const entries = scrollbackMetadataEntries(item.metadata);
  return entries.length === 0 ? {} : { metadata: Object.fromEntries(entries) };
}

function scrollStateProp(widget: ScrollbackNode) {
  return widget.props.scroll;
}

function selectedTextProp(
  widget: ScrollbackNode,
  items: readonly ScrollbackItem[]
): { readonly selectedText?: string } {
  const selectedRange = selectedRangeProp(widget);
  const selectedText = extractScrollbackSelectionText({ items, ...(selectedRange === undefined ? {} : { selectedRange }) });
  return selectedText === undefined ? {} : { selectedText };
}

function selectedRangeProp(widget: ScrollbackNode): TextSelection | undefined {
  return widget.props.selectedRange;
}

function searchQueryProp(widget: ScrollbackNode): string {
  return sanitizeTerminalText(stringify(widget.props.searchQuery)).text.trim();
}

function defaultScrollState(totalRows: number, viewportRows: number, matchIndexes: readonly number[]) {
  if (matchIndexes[0] !== undefined) {
    return scrollReducer(
      createScrollState({ contentRows: totalRows, viewportRows }),
      { kind: 'itemIntoView', index: matchIndexes[0] }
    );
  }
  return createScrollState({
    contentRows: totalRows,
    viewportRows,
    followTail: true
  });
}

function matchedRowIndexes(rows: readonly ScrollbackVisibleRow[]): readonly number[] {
  const indexes: number[] = [];
  for (let index = 0; index < rows.length; index += 1) {
    if (rows[index]?.matched === true) indexes.push(index);
  }
  return indexes;
}

function scrollbackBodyOffsets(items: readonly ScrollbackItem[]): readonly number[] {
  const offsets: number[] = [];
  let offset = 0;
  for (const item of items) {
    offsets.push(offset);
    offset += sanitizeTerminalText(item.text).text.length + 1;
  }
  return offsets;
}

function bodyPositionsForLine(
  spans: readonly RenderSpan[],
  bodyText: string,
  bodyOffset: number,
  initialBodyCursor: number
): { readonly positions: readonly ScrollbackBodyPosition[]; readonly nextBodyCursor: number } {
  const positions: ScrollbackBodyPosition[] = [];
  let column = 0;
  let bodyCursor = initialBodyCursor;
  for (const currentSpan of spans) {
    const cells = measureTextCells(currentSpan.text).cells;
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
  item: ScrollbackItem,
  itemIndex: number,
  query: string,
  selection?: ScrollbackBodySelection
): readonly ScrollbackTextSegment[] {
  const timestampStyle = scrollbackTimestampStyle(widget);
  const metadataStyle = scrollbackMetadataStyle(widget);
  const separatorStyle = scrollbackMetadataSeparatorStyle(widget);
  const spans: ScrollbackTextSegment[] = [];
  for (const timestamp of scrollbackTimestampText(item)) {
    appendGap(spans, widget);
    spans.push(...timestampSpans(widget, item, itemIndex, timestamp, query, timestampStyle, separatorStyle));
  }
  for (const [key, value] of scrollbackMetadataEntries(item.metadata)) {
    appendGap(spans, widget);
    spans.push(...metadataSpans(widget, item, itemIndex, key, value, query, metadataStyle, separatorStyle));
  }
  appendGap(spans, widget);
  spans.push(...bodySpans(widget, item, itemIndex, sanitizeTerminalText(item.text).text, query, selection));
  return spans.filter((span) => span.text.length > 0);
}

function appendGap(spans: ScrollbackTextSegment[], widget: ScrollbackNode): void {
  if (spans.length === 0) return;
  spans.push(documentSpan(widget, 'scrollback', 'separator', 'separator', ' ', scrollbackMetadataSeparatorStyle(widget)));
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
    documentSpan(widget, 'scrollback', 'chrome', 'timestamp.open', '[', separatorStyle, sourceOptionsForItem(item, itemIndex)),
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
    documentSpan(widget, 'scrollback', 'chrome', 'timestamp.close', ']', separatorStyle, sourceOptionsForItem(item, itemIndex))
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
    documentSpan(widget, 'scrollback', 'separator', `metadata.${token}.separator`, '=', separatorStyle, sourceOptionsForItem(item, itemIndex)),
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
  if (start === end) {
    return documentHighlightSpans({
      widget,
      kind: 'scrollback',
      visual: 'body',
      label: 'body',
      text,
      query,
      baseStyle: itemStyle
    });
  }
  const before = text.slice(0, start);
  const selected = text.slice(start, end);
  const after = text.slice(end);
  const selectedStyle = scrollbackSelectedStyle(widget);
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
    documentSpan(widget, 'scrollback', 'marker', 'selection.open', '[', selectedStyle, sourceOptionsForItem(item, itemIndex, 'selected')),
    ...documentHighlightSpans({
      widget,
      kind: 'scrollback',
      visual: 'body',
      label: 'body.selection',
      text: selected,
      query,
      baseStyle: scrollbackBodyStyle(widget, item.style, scrollbackItemLevel(item), true),
      sourceOptions: sourceOptionsForItem(item, itemIndex, 'selected')
    }),
    documentSpan(widget, 'scrollback', 'marker', 'selection.close', ']', selectedStyle, sourceOptionsForItem(item, itemIndex, 'selected')),
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
