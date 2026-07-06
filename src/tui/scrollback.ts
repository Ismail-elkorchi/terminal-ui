import { extractTextSelection, sanitizeTerminalText, wrapTextCells } from '../text/index.ts';
import {
  createScrollState,
  normalizeScrollState,
  scrollReducer,
  visibleWindowFromScroll
} from './scroll.ts';
import {
  documentEmptyStyle,
  documentHighlightSpans,
  documentSpan,
  scrollbackSelectedStyle,
  scrollbackBodyStyle,
  scrollbackMetadataStyle,
  scrollbackOmissionStyle,
  sourceToken
} from './document-visual.ts';
import { stringify } from './widget-props.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TextSelection } from '../text/index.ts';
import type { ScrollbackItem, Widget } from '../widgets/index.ts';
import type { LayoutNode } from './layout.ts';
import type { RenderBlock, RenderSpan } from './render-primitives.ts';

export interface ScrollbackTextSegment extends RenderSpan {
  readonly matched?: boolean;
}

export interface ScrollbackVisibleRow {
  readonly id: string;
  readonly text: string;
  readonly segments: readonly ScrollbackTextSegment[];
  readonly sourceItemId?: string;
  readonly sourceItemIndex?: number;
  readonly timestamp?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly matched?: boolean;
  readonly selected?: boolean;
}

export interface ScrollbackWindow {
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

export interface ExtractScrollbackSelectionTextInput {
  readonly items: readonly ScrollbackItem[];
  readonly selectedRange?: TextSelection;
}

export function scrollbackWindow(widget: Widget, node: Pick<LayoutNode, 'bounds'>): ScrollbackWindow {
  const items = scrollbackItems(widget);
  const wrap = widget.props['wrap'] === true;
  const query = searchQueryProp(widget);
  const selectedRange = selectedRangeProp(widget);
  const itemSelections = selectedBodyRanges(items, selectedRange);
  const expandedRows = wrap || query.length > 0 ? scrollbackRows(widget, items, node.bounds.width, query, itemSelections) : undefined;
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
    ? items.slice(window.start, window.end).map((item, index) => scrollbackRow(
        widget,
        item,
        window.start + index,
        0,
        displayTextForItem(item),
        '',
        itemSelections[window.start + index]
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

export function scrollbackText(widget: Widget, node: LayoutNode): string {
  return scrollbackWindow(widget, node).rows.map((row) => row.text).join('\n');
}

export function scrollbackBlock(widget: Widget, node: LayoutNode): RenderBlock {
  return {
    lines: scrollbackWindow(widget, node).rows.map((row) => ({ spans: row.segments }))
  };
}

export function scrollbackAccessibleBase(widget: Widget, node: LayoutNode, id: string): AccessibleNode {
  const window = scrollbackWindow(widget, node);
  return {
    id,
    role: 'text',
    label: id,
    description: scrollbackDescription(widget, window)
  };
}

export function scrollbackAccessibleChildren(widget: Widget, node: LayoutNode): readonly AccessibleNode[] {
  return scrollbackWindow(widget, node).rows.map((row) => ({
    id: row.id,
    role: 'text',
    label: row.text,
    value: row.text,
    ...(row.matched === true ? { description: 'Search match.' } : {})
  }));
}

export function extractScrollbackSelectionText(input: ExtractScrollbackSelectionTextInput): string | undefined {
  if (input.selectedRange === undefined) return undefined;
  const content = input.items.map((item) => sanitizeTerminalText(item.text).text).join('\n');
  return extractTextSelection({ text: content, selection: input.selectedRange, sanitize: false });
}

function scrollbackDescription(widget: Widget, window: ScrollbackWindow): string {
  const query = stringify(widget.props['searchQuery']);
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
  widget: Widget,
  items: readonly ScrollbackItem[],
  width: number,
  query: string,
  itemSelections: readonly (BodySelection | undefined)[]
): readonly ScrollbackVisibleRow[] {
  const wrap = widget.props['wrap'] === true;
  const rows: ScrollbackVisibleRow[] = [];
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item === undefined) continue;
    const text = displayTextForItem(item);
    const lines = wrap && width > 0 ? wrapTextCells(text, width).map((line) => line.text) : [text];
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex += 1) {
      const line = lines[lineIndex] ?? '';
      rows.push(scrollbackRow(widget, item, index, lineIndex, line, query, itemSelections[index]));
    }
  }
  return rows;
}

function scrollbackRow(
  widget: Widget,
  item: ScrollbackItem,
  itemIndex: number,
  lineIndex: number,
  text: string,
  query: string,
  selection?: BodySelection
): ScrollbackVisibleRow {
  const segments = scrollbackLineSpans(widget, item, lineIndex, text, query, selection);
  return {
    id: `${widget.id ?? 'scrollback'}:item:${String(itemIndex)}:line:${String(lineIndex)}`,
    text: segments.map((segment) => segment.text).join(''),
    segments,
    sourceItemId: item.id,
    sourceItemIndex: itemIndex,
    ...timestampForItem(item),
    ...metadataForItem(item),
    matched: segments.some((segment) => segment.matched === true),
    ...(selection === undefined ? {} : { selected: true })
  };
}

function withOmissionMarkers(
  widget: Widget,
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

function emptyRows(widget: Widget, height: number): readonly ScrollbackVisibleRow[] {
  if (height <= 0) return [];
  return [{
    id: `${widget.id ?? 'scrollback'}:empty`,
    text: 'No scrollback rows',
    segments: [documentSpan(widget, 'scrollback', 'empty', 'empty', 'No scrollback rows', documentEmptyStyle(widget))]
  }];
}

function omissionRow(widget: Widget, position: 'before' | 'after', text: string): ScrollbackVisibleRow {
  return {
    id: `scrollback:omitted-${position}`,
    text,
    segments: [documentSpan(widget, 'scrollback', 'omission', `omission.${position}`, text, scrollbackOmissionStyle(widget))]
  };
}

function scrollbackItems(widget: Widget): readonly ScrollbackItem[] {
  return Array.isArray(widget.props['items'])
    ? widget.props['items'].filter(isScrollbackItem)
    : [];
}

function isScrollbackItem(value: unknown): value is ScrollbackItem {
  return typeof value === 'object'
    && value !== null
    && 'id' in value
    && 'text' in value
    && typeof value.id === 'string'
    && typeof value.text === 'string';
}

function displayTextForItem(item: ScrollbackItem): string {
  const text = sanitizeTerminalText(item.text).text;
  const prefix = [
    ...timestampText(item),
    ...metadataText(item)
  ];
  return prefix.length === 0 ? text : `${prefix.join(' ')} ${text}`;
}

function timestampForItem(item: ScrollbackItem): { readonly timestamp?: string } {
  const [timestamp] = timestampText(item);
  return timestamp === undefined ? {} : { timestamp };
}

function timestampText(item: ScrollbackItem): readonly string[] {
  return typeof item.timestamp === 'string'
    ? [`[${sanitizeTerminalText(item.timestamp).text}]`]
    : [];
}

function metadataForItem(item: ScrollbackItem): { readonly metadata?: Readonly<Record<string, string>> } {
  const entries = metadataEntries(item.metadata);
  return entries.length === 0 ? {} : { metadata: Object.fromEntries(entries) };
}

function metadataText(item: ScrollbackItem): readonly string[] {
  return metadataEntries(item.metadata).map(([key, value]) => `${key}=${value}`);
}

function metadataEntries(value: unknown): readonly (readonly [string, string])[] {
  if (!isRecord(value)) return [];
  return Object.entries(value)
    .flatMap(([key, rawValue]): (readonly [string, string])[] => {
      if (typeof rawValue !== 'string') return [];
      return [[sanitizeTerminalText(key).text, sanitizeTerminalText(rawValue).text]];
    })
    .sort(([left], [right]) => left.localeCompare(right));
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function scrollStateProp(widget: Widget) {
  const value = widget.props['scroll'];
  if (typeof value !== 'object' || value === null) return undefined;
  return value as Parameters<typeof normalizeScrollState>[0];
}

function selectedTextProp(
  widget: Widget,
  items: readonly ScrollbackItem[]
): { readonly selectedText?: string } {
  const selectedRange = selectedRangeProp(widget);
  const selectedText = extractScrollbackSelectionText({ items, ...(selectedRange === undefined ? {} : { selectedRange }) });
  return selectedText === undefined ? {} : { selectedText };
}

function selectedRangeProp(widget: Widget): TextSelection | undefined {
  const value = widget.props['selectedRange'];
  if (typeof value !== 'object' || value === null) return undefined;
  if (!('start' in value) || !('end' in value)) return undefined;
  if (typeof value.start !== 'number' || typeof value.end !== 'number') return undefined;
  return { start: value.start, end: value.end };
}

interface BodySelection {
  readonly start: number;
  readonly end: number;
}

function selectedBodyRanges(
  items: readonly ScrollbackItem[],
  selectedRange: TextSelection | undefined
): readonly (BodySelection | undefined)[] {
  if (selectedRange === undefined) return [];
  const start = Math.min(selectedRange.start, selectedRange.end);
  const end = Math.max(selectedRange.start, selectedRange.end);
  if (start === end) return [];
  const ranges: (BodySelection | undefined)[] = [];
  let offset = 0;
  for (const item of items) {
    const text = sanitizeTerminalText(item.text).text;
    const itemStart = offset;
    const itemEnd = itemStart + text.length;
    const rangeStart = Math.max(start, itemStart);
    const rangeEnd = Math.min(end, itemEnd);
    ranges.push(rangeStart < rangeEnd
      ? { start: rangeStart - itemStart, end: rangeEnd - itemStart }
      : undefined);
    offset = itemEnd + 1;
  }
  return ranges;
}

function searchQueryProp(widget: Widget): string {
  return sanitizeTerminalText(stringify(widget.props['searchQuery'])).text.trim();
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

function scrollbackLineSpans(
  widget: Widget,
  item: ScrollbackItem,
  lineIndex: number,
  text: string,
  query: string,
  selection?: BodySelection
): readonly ScrollbackTextSegment[] {
  return lineIndex === 0 && text === displayTextForItem(item)
    ? scrollbackFullLineSpans(widget, item, query, selection)
    : documentHighlightSpans({
        widget,
        kind: 'scrollback',
        visual: 'body',
        label: 'body',
        text,
        query,
        baseStyle: scrollbackBodyStyle(widget, item.style, scrollbackLevel(item))
      });
}

function scrollbackFullLineSpans(
  widget: Widget,
  item: ScrollbackItem,
  query: string,
  selection?: BodySelection
): readonly ScrollbackTextSegment[] {
  const metadataStyle = scrollbackMetadataStyle(widget);
  const spans: ScrollbackTextSegment[] = [];
  for (const timestamp of timestampText(item)) {
    appendGap(spans, widget);
    spans.push(...timestampSpans(widget, timestamp, query, metadataStyle));
  }
  for (const [key, value] of metadataEntries(item.metadata)) {
    appendGap(spans, widget);
    spans.push(...metadataSpans(widget, key, value, query, metadataStyle));
  }
  appendGap(spans, widget);
  spans.push(...bodySpans(widget, item, sanitizeTerminalText(item.text).text, query, selection));
  return spans.filter((span) => span.text.length > 0);
}

function appendGap(spans: ScrollbackTextSegment[], widget: Widget): void {
  if (spans.length === 0) return;
  spans.push(documentSpan(widget, 'scrollback', 'separator', 'separator', ' ', scrollbackMetadataStyle(widget)));
}

function timestampSpans(
  widget: Widget,
  timestamp: string,
  query: string,
  style: ReturnType<typeof scrollbackMetadataStyle>
): readonly ScrollbackTextSegment[] {
  const value = timestamp.startsWith('[') && timestamp.endsWith(']')
    ? timestamp.slice(1, -1)
    : timestamp;
  return [
    documentSpan(widget, 'scrollback', 'chrome', 'timestamp.open', '[', style),
    ...documentHighlightSpans({
      widget,
      kind: 'scrollback',
      visual: 'metadata',
      label: 'timestamp.value',
      text: value,
      query,
      baseStyle: style
    }),
    documentSpan(widget, 'scrollback', 'chrome', 'timestamp.close', ']', style)
  ];
}

function metadataSpans(
  widget: Widget,
  key: string,
  value: string,
  query: string,
  style: ReturnType<typeof scrollbackMetadataStyle>
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
      baseStyle: style
    }),
    documentSpan(widget, 'scrollback', 'separator', `metadata.${token}.separator`, '=', style),
    ...documentHighlightSpans({
      widget,
      kind: 'scrollback',
      visual: 'metadata',
      label: `metadata.${token}.value`,
      text: value,
      query,
      baseStyle: style
    })
  ];
}

function bodySpans(
  widget: Widget,
  item: ScrollbackItem,
  text: string,
  query: string,
  selection: BodySelection | undefined
): readonly ScrollbackTextSegment[] {
  const itemStyle = scrollbackBodyStyle(widget, item.style, scrollbackLevel(item));
  if (selection === undefined) {
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
      baseStyle: itemStyle
    }),
    documentSpan(widget, 'scrollback', 'marker', 'selection.open', '[', selectedStyle),
    ...documentHighlightSpans({
      widget,
      kind: 'scrollback',
      visual: 'body',
      label: 'body.selection',
      text: selected,
      query,
      baseStyle: scrollbackBodyStyle(widget, item.style, scrollbackLevel(item), true)
    }),
    documentSpan(widget, 'scrollback', 'marker', 'selection.close', ']', selectedStyle),
    ...documentHighlightSpans({
      widget,
      kind: 'scrollback',
      visual: 'body',
      label: 'body',
      text: after,
      query,
      baseStyle: itemStyle
    })
  ];
}

function scrollbackLevel(item: ScrollbackItem): ScrollbackItem['level'] {
  switch (item.level) {
    case 'info':
    case 'warning':
    case 'error':
      return item.level;
    default:
      return undefined;
  }
}
