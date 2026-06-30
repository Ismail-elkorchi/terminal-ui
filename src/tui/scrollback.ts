import { extractTextSelection, sanitizeTerminalText, wrapTextCells } from '../text/index.ts';
import {
  createScrollState,
  normalizeScrollState,
  scrollReducer,
  visibleWindowFromScroll
} from './scroll.ts';
import { highlightRenderSpans } from './text-highlight.ts';
import { stringify } from './widget-props.ts';
import { themeStyle, widgetStyle } from './widget-style.ts';
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
}

export interface ScrollbackWindow {
  readonly rows: readonly ScrollbackVisibleRow[];
  readonly totalRows: number;
  readonly start: number;
  readonly end: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
  readonly matchCount: number;
  readonly selectedText?: string;
}

export interface ExtractScrollbackSelectionTextInput {
  readonly items: readonly ScrollbackItem[];
  readonly selectedRange?: TextSelection;
}

export function scrollbackWindow(widget: Widget, node: LayoutNode): ScrollbackWindow {
  const items = scrollbackItems(widget);
  const wrap = widget.props['wrap'] === true;
  const query = searchQueryProp(widget);
  const expandedRows = wrap || query.length > 0 ? scrollbackRows(widget, items, node.bounds.width, query) : undefined;
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
        ''
      ))
    : expandedRows.slice(window.start, window.end);
  return {
    rows: withOmissionMarkers(widget, visibleRows, omittedBefore, omittedAfter, node.bounds.height),
    totalRows,
    start: window.start,
    end: window.end,
    omittedBefore,
    omittedAfter,
    matchCount: matchIndexes.length,
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
  if (window.totalRows === 0) return `Showing 0 scrollback rows.${queryText}${selectionText}`;
  return `Showing ${String(window.start + 1)}-${String(window.end)} of ${String(window.totalRows)} scrollback rows. Omitted before: ${String(window.omittedBefore)}. Omitted after: ${String(window.omittedAfter)}.${queryText}${selectionText}`;
}

function scrollbackRows(
  widget: Widget,
  items: readonly ScrollbackItem[],
  width: number,
  query: string
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
      rows.push(scrollbackRow(widget, item, index, lineIndex, line, query));
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
  query: string
): ScrollbackVisibleRow {
  const segments = searchSegments(text, query, item.style);
  return {
    id: `${widget.id ?? 'scrollback'}:item:${String(itemIndex)}:line:${String(lineIndex)}`,
    text,
    segments,
    sourceItemId: item.id,
    sourceItemIndex: itemIndex,
    ...timestampForItem(item),
    ...metadataForItem(item),
    matched: segments.some((segment) => segment.matched === true)
  };
}

function withOmissionMarkers(
  widget: Widget,
  rows: readonly ScrollbackVisibleRow[],
  omittedBefore: number,
  omittedAfter: number,
  height: number
): readonly ScrollbackVisibleRow[] {
  if (height <= 0) return [];
  const result = [...rows];
  if (omittedBefore > 0 && result.length > 0) {
    result[0] = omissionRow(widget, 'before', `... ${String(omittedBefore)} earlier rows omitted ...`);
  }
  if (omittedAfter > 0 && result.length > 1) {
    result[result.length - 1] = omissionRow(widget, 'after', `... ${String(omittedAfter)} later rows omitted ...`);
  }
  return result.slice(0, height);
}

function omissionRow(widget: Widget, position: 'before' | 'after', text: string): ScrollbackVisibleRow {
  return {
    id: `scrollback:omitted-${position}`,
    text,
    segments: [styledSegment(text, widgetStyle(widget, 'placeholder'))]
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

function searchSegments(
  text: string,
  query: string,
  style: RenderSpan['style'] | undefined
): readonly ScrollbackTextSegment[] {
  return highlightRenderSpans(text, query, {
    ...(style === undefined ? {} : { baseStyle: style }),
    matchStyle: themeStyle('menu.match', { underline: true })
  });
}

function styledSegment(text: string, style: RenderSpan['style'] | undefined): ScrollbackTextSegment {
  return style === undefined ? { text } : { text, style };
}
