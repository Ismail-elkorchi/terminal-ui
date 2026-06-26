import { sanitizeTerminalText, wrapTextCells } from '../text/index.ts';
import {
  createScrollState,
  normalizeScrollState,
  scrollReducer,
  visibleWindowFromScroll
} from './scroll.ts';
import { stringify } from './widget-props.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { TextSelection } from '../text/index.ts';
import type { StyledText } from '../theme/index.ts';
import type { ScrollbackItem, Widget } from '../widgets/index.ts';
import type { LayoutNode } from './layout.ts';

export interface ScrollbackTextSegment extends StyledText {
  readonly matched?: boolean;
}

export interface ScrollbackVisibleRow {
  readonly id: string;
  readonly text: string;
  readonly segments: readonly ScrollbackTextSegment[];
  readonly sourceItemId?: string;
  readonly sourceItemIndex?: number;
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
        sanitizeTerminalText(item.text).text,
        ''
      ))
    : expandedRows.slice(window.start, window.end);
  return {
    rows: withOmissionMarkers(visibleRows, omittedBefore, omittedAfter, node.bounds.height),
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
  const start = clampSelectionOffset(input.selectedRange.start, content.length);
  const end = clampSelectionOffset(input.selectedRange.end, content.length);
  if (start === end) return '';
  return content.slice(Math.min(start, end), Math.max(start, end));
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
    const text = sanitizeTerminalText(item.text).text;
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
  const segments = searchSegments(text, query);
  return {
    id: `${widget.id ?? 'scrollback'}:item:${String(itemIndex)}:line:${String(lineIndex)}`,
    text,
    segments,
    sourceItemId: item.id,
    sourceItemIndex: itemIndex,
    matched: segments.some((segment) => segment.matched === true)
  };
}

function withOmissionMarkers(
  rows: readonly ScrollbackVisibleRow[],
  omittedBefore: number,
  omittedAfter: number,
  height: number
): readonly ScrollbackVisibleRow[] {
  if (height <= 0) return [];
  const result = [...rows];
  if (omittedBefore > 0 && result.length > 0) {
    result[0] = omissionRow('before', `... ${String(omittedBefore)} earlier rows omitted ...`);
  }
  if (omittedAfter > 0 && result.length > 1) {
    result[result.length - 1] = omissionRow('after', `... ${String(omittedAfter)} later rows omitted ...`);
  }
  return result.slice(0, height);
}

function omissionRow(position: 'before' | 'after', text: string): ScrollbackVisibleRow {
  return {
    id: `scrollback:omitted-${position}`,
    text,
    segments: [{ text }]
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

function searchSegments(text: string, query: string): readonly ScrollbackTextSegment[] {
  if (query.length === 0) return [{ text }];
  const lowerText = text.toLocaleLowerCase();
  const lowerQuery = query.toLocaleLowerCase();
  const segments: ScrollbackTextSegment[] = [];
  let cursor = 0;
  for (;;) {
    const matchIndex = lowerText.indexOf(lowerQuery, cursor);
    if (matchIndex === -1) break;
    if (matchIndex > cursor) segments.push({ text: text.slice(cursor, matchIndex) });
    const end = matchIndex + query.length;
    segments.push({ text: text.slice(matchIndex, end), tone: 'accent', emphasis: 'underline', matched: true });
    cursor = end;
  }
  if (cursor < text.length) segments.push({ text: text.slice(cursor) });
  return segments.length === 0 ? [{ text }] : segments;
}

function clampSelectionOffset(value: number, length: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(length, Math.floor(value)));
}
