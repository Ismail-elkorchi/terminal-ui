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
import { projectScrollbackRecord } from './scrollback/record-projection.ts';
import { extractScrollbackSelectionText } from '../../behavior/scrollback-selection.ts';
import { scrollbackHistoryRecordById } from '../../ui-model/scrollback-history.ts';
import { stringify } from './render-node-props.ts';
import { textOffsetAtVisualColumn } from './text-pointer.ts';
import { wrapRenderSpans } from '../../visual/render.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type {
  ScrollbackHistory,
  ScrollbackHistoryRecord,
  ScrollbackItem,
  ScrollbackSearchMatch
} from '../../ui-model/scrollback-history.ts';
import type { ScrollbackBodyAnchor, ScrollbackSelection } from '../../ui-model/scrollback.ts';
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

interface ScrollbackRecordRowProjection {
  readonly rows: readonly ScrollbackVisibleRow[];
  readonly matchStartRows: readonly number[];
}

interface ScrollbackBodyPosition {
  readonly column: number;
  readonly cells: number;
  readonly text: string;
  readonly offset: number;
  readonly itemId: string;
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
  renderNode: ScrollbackNode,
  node: Pick<LayoutNode, 'bounds'>,
  widthProfile: TextWidthProfile
): ScrollbackWindow {
  const cached = scrollbackWindowCache.get(renderNode);
  if (
    cached?.width === node.bounds.width
    && cached.height === node.bounds.height
    && cached.widthProfile === widthProfile
  ) return cached.window;
  const window = projectScrollbackWindow(renderNode, node, widthProfile);
  scrollbackWindowCache.set(renderNode, {
    width: node.bounds.width,
    height: node.bounds.height,
    widthProfile,
    window
  });
  return window;
}

function projectScrollbackWindow(
  renderNode: ScrollbackNode,
  node: Pick<LayoutNode, 'bounds'>,
  widthProfile: TextWidthProfile
): ScrollbackWindow {
  const history = renderNode.props.history;
  const wrap = renderNode.props.wrap === true;
  const query = searchQueryProp(renderNode);
  const selection = selectionProp(renderNode);
  const foldedIds = new Set(renderNode.props.foldedIds ?? []);
  const includeBodyPositions = renderNode.props.toActionMessage !== undefined;
  const projection = projectScrollbackLayout(history, node.bounds.width, wrap, widthProfile, foldedIds);
  const search = projectScrollbackSearch(history, query, foldedIds);
  const rowsByRecord = new Map<ScrollbackHistoryRecord, ScrollbackRecordRowProjection>();
  const projectionForRecord = (record: ScrollbackHistoryRecord): ScrollbackRecordRowProjection => {
    const cached = rowsByRecord.get(record);
    if (cached !== undefined) return cached;
    const rows = scrollbackRecordRowProjection(
      renderNode,
      projectScrollbackRecord(record, foldedIds.has(record.item.id)),
      node.bounds.width,
      query,
      selectionForRecord(history, record, selection),
      wrap,
      includeBodyPositions,
      widthProfile
    );
    rowsByRecord.set(record, rows);
    return rows;
  };
  const rowsForRecord = (record: ScrollbackHistoryRecord): readonly ScrollbackVisibleRow[] => (
    projectionForRecord(record).rows
  );
  const selectedMatch = selectedSearchMatch(renderNode, search.matches);
  const firstMatchRow = matchingScrollbackRow(
    history,
    projection,
    selectedMatch,
    projectionForRecord
  );
  const explicitScroll = scrollStateProp(renderNode);
  const scroll = explicitScroll === undefined
    ? defaultScrollState(projection.totalRows, node.bounds.height, firstMatchRow)
    : normalizeScrollState({
        ...explicitScroll,
        contentRows: projection.totalRows,
        viewportRows: node.bounds.height
      });
  const visibleWindow = visibleWindowFromScroll(scroll);
  const omittedBefore = visibleWindow.startIndex;
  const omittedAfter = Math.max(0, projection.totalRows - visibleWindow.endIndexExclusive);
  const visibleRows = visibleScrollbackRecords(
    projection,
    visibleWindow.startIndex,
    visibleWindow.endIndexExclusive
  )
    .flatMap(({ record, localStart, localEnd }) => rowsForRecord(record).slice(localStart, localEnd));
  return {
    rows: projection.totalRows === 0
      ? emptyRows(renderNode, node.bounds.height)
      : withOmissionMarkers(
          renderNode,
          visibleRows,
          omittedBefore,
          omittedAfter,
          node.bounds.height,
          scroll.followTail
        ),
    totalRows: projection.totalRows,
    start: visibleWindow.startIndex,
    end: visibleWindow.endIndexExclusive,
    omittedBefore,
    omittedAfter,
    matchCount: search.matchingItems,
    followTail: scroll.followTail,
    ...selectedTextProp(renderNode, history)
  };
}

function matchingScrollbackRow(
  history: ScrollbackHistory,
  projection: ScrollbackLayoutProjection,
  match: ScrollbackSearchMatch | undefined,
  projectionForRecord: (record: ScrollbackHistoryRecord) => ScrollbackRecordRowProjection
): number | undefined {
  if (match === undefined) return undefined;
  const record = scrollbackHistoryRecordById(history, match.itemId);
  const itemStartRow = scrollbackRowForItem(projection, match.itemIndex);
  if (record === undefined || itemStartRow === undefined) return undefined;
  const matchedRow = projectionForRecord(record).matchStartRows[match.occurrenceIndex];
  return matchedRow === undefined ? undefined : itemStartRow + matchedRow;
}

export function scrollbackText(renderNode: ScrollbackNode, node: LayoutNode, widthProfile: TextWidthProfile): string {
  return scrollbackWindow(renderNode, node, widthProfile).rows.map((row) => row.text).join('\n');
}

export function scrollbackBlock(renderNode: ScrollbackNode, node: LayoutNode, widthProfile: TextWidthProfile): RenderBlock {
  return {
    lines: scrollbackWindow(renderNode, node, widthProfile).rows.map((row) => ({ spans: row.segments }))
  };
}

export function scrollbackPointerAnchor(
  renderNode: ScrollbackNode,
  node: Pick<LayoutNode, 'bounds'>,
  event: RoutedPointerEvent,
  widthProfile: TextWidthProfile
): ScrollbackBodyAnchor | undefined {
  const row = scrollbackWindow(renderNode, node, widthProfile).rows[(event.localRow ?? 0) - 1];
  const positions = row?.bodyPositions;
  if (positions === undefined || positions.length === 0) return undefined;
  const column = Math.max(0, (event.localColumn ?? 1) - 1);
  const containing = positions.find((position) =>
    column >= position.column && column < position.column + position.cells
  );
  if (containing !== undefined) {
    return {
      itemId: containing.itemId,
      offset: containing.offset + textOffsetAtVisualColumn(
        containing.text,
        column - containing.column,
        { widthProfile }
      )
    };
  }
  const previous = positions.findLast((position) => column >= position.column + position.cells);
  if (previous !== undefined) {
    return { itemId: previous.itemId, offset: previous.offset + previous.text.length };
  }
  const first = positions[0];
  return first === undefined ? undefined : { itemId: first.itemId, offset: first.offset };
}

export function scrollbackAccessibleBase(
  renderNode: ScrollbackNode,
  node: LayoutNode,
  id: string,
  widthProfile: TextWidthProfile
): AccessibleNode {
  const window = scrollbackWindow(renderNode, node, widthProfile);
  return {
    id,
    role: 'text',
    label: id,
    description: scrollbackDescription(renderNode, window)
  };
}

export function scrollbackAccessibleChildren(
  renderNode: ScrollbackNode,
  node: LayoutNode,
  widthProfile: TextWidthProfile
): readonly AccessibleNode[] {
  return scrollbackWindow(renderNode, node, widthProfile).rows.map((row) => ({
    id: row.id,
    role: 'text',
    label: row.text,
    value: row.text,
    ...(row.matched === true ? { description: 'Search match.' } : {})
  }));
}

function scrollbackDescription(renderNode: ScrollbackNode, window: ScrollbackWindow): string {
  const query = stringify(renderNode.props.searchQuery);
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

function scrollbackRecordRowProjection(
  renderNode: ScrollbackNode,
  projected: ReturnType<typeof projectScrollbackRecord>,
  width: number,
  query: string,
  selection: ScrollbackBodySelection | undefined,
  wrap: boolean,
  includeBodyPositions: boolean,
  widthProfile: TextWidthProfile
): ScrollbackRecordRowProjection {
  const record = projected.source;
  const fullLine = scrollbackFullLineSpans(renderNode, projected, query, selection);
  const matchStartRows = wrap
    ? matchRowsForSpans(fullLine, width, widthProfile)
    : fullLine.filter((segment) => segment.matched === true).map(() => 0);
  const lines = wrap && width > 0
    ? wrapRenderSpans(fullLine, width, { widthProfile })
    : [{ spans: fullLine } satisfies RenderLine];
  let bodyCursor = 0;
  const rows = lines.map((renderLine, lineIndex) => {
    const positionProjection = includeBodyPositions
      ? bodyPositionsForLine(
          renderLine.spans,
          projected.bodyText,
          record.item.id,
          bodyCursor,
          widthProfile
        )
      : { positions: [], nextBodyCursor: bodyCursor };
    bodyCursor = positionProjection.nextBodyCursor;
    return {
      id: `${renderNode.id ?? 'scrollback'}:item:${String(record.itemIndex)}:line:${String(lineIndex)}`,
      text: renderLine.spans.map((segment) => segment.text).join(''),
      segments: renderLine.spans,
      sourceItemId: record.item.id,
      sourceItemIndex: record.itemIndex,
      ...timestampForItem(record.item),
      ...metadataForRecord(projected.metadataEntries),
      matched: renderLine.spans.some((segment) => segment.source?.partType === 'match'),
      ...(selection === undefined ? {} : { selected: true }),
      ...(positionProjection.positions.length === 0
        ? {}
        : { bodyPositions: positionProjection.positions })
    };
  });
  return { rows: Object.freeze(rows), matchStartRows: Object.freeze(matchStartRows) };
}

function matchRowsForSpans(
  spans: readonly ScrollbackTextSegment[],
  width: number,
  widthProfile: TextWidthProfile
): readonly number[] {
  if (width <= 0) return [];
  const rows: number[] = [];
  let row = 0;
  let usedCells = 0;
  for (const currentSpan of spans) {
    let recorded = false;
    for (const grapheme of measureTextCells(currentSpan.text, { widthProfile }).graphemes) {
      if (grapheme.text === '\n') {
        row += 1;
        usedCells = 0;
        continue;
      }
      if (usedCells > 0 && usedCells + grapheme.cells > width) {
        row += 1;
        usedCells = 0;
      }
      if (currentSpan.matched === true && !recorded) {
        rows.push(row);
        recorded = true;
      }
      usedCells += grapheme.cells;
    }
  }
  return rows;
}

function selectionForRecord(
  history: ScrollbackHistory,
  record: ScrollbackHistoryRecord,
  selection: ScrollbackSelection | undefined
): ScrollbackBodySelection | undefined {
  if (selection === undefined) return undefined;
  const anchorRecord = scrollbackHistoryRecordById(history, selection.anchor.itemId);
  const focusRecord = scrollbackHistoryRecordById(history, selection.focus.itemId);
  if (anchorRecord === undefined || focusRecord === undefined) return undefined;
  const anchorFirst = anchorRecord.itemIndex < focusRecord.itemIndex
    || anchorRecord.itemIndex === focusRecord.itemIndex
      && selection.anchor.offset <= selection.focus.offset;
  const startRecord = anchorFirst ? anchorRecord : focusRecord;
  const endRecord = anchorFirst ? focusRecord : anchorRecord;
  if (record.itemIndex < startRecord.itemIndex || record.itemIndex > endRecord.itemIndex) return undefined;
  const startAnchor = anchorFirst ? selection.anchor : selection.focus;
  const endAnchor = anchorFirst ? selection.focus : selection.anchor;
  const start = record.item.id === startAnchor.itemId
    ? Math.max(0, Math.min(record.bodyText.length, startAnchor.offset))
    : 0;
  const end = record.item.id === endAnchor.itemId
    ? Math.max(0, Math.min(record.bodyText.length, endAnchor.offset))
    : record.bodyText.length;
  return start < end ? { start, end } : undefined;
}

function withOmissionMarkers(
  renderNode: ScrollbackNode,
  rows: readonly ScrollbackVisibleRow[],
  omittedBefore: number,
  omittedAfter: number,
  height: number,
  followTail: boolean
): readonly ScrollbackVisibleRow[] {
  if (height <= 0) return [];
  const result = [...rows];
  const replaced = new Set<number>();
  if (omittedBefore > 0) {
    const index = result.findIndex((row) => row.matched !== true);
    if (index >= 0) {
      result[index] = omissionRow(renderNode, 'before', `... ${String(omittedBefore)} earlier rows omitted ...`);
      replaced.add(index);
    }
  }
  if (omittedAfter > 0) {
    const index = result.findLastIndex((row, candidate) => (
      row.matched !== true && !replaced.has(candidate)
    ));
    if (index < 0) return result.slice(0, height);
    const pausedText = followTail ? '' : ' (paused)';
    result[index] = omissionRow(
      renderNode,
      'after',
      `... ${String(omittedAfter)} later rows omitted${pausedText} ...`
    );
  }
  return result.slice(0, height);
}

function emptyRows(renderNode: ScrollbackNode, height: number): readonly ScrollbackVisibleRow[] {
  if (height <= 0) return [];
  return [{
    id: `${renderNode.id ?? 'scrollback'}:empty`,
    text: 'No scrollback rows',
    segments: [documentSpan(
      renderNode,
      'scrollback',
      'empty',
      'empty',
      'No scrollback rows',
      documentEmptyStyle(renderNode)
    )]
  }];
}

function omissionRow(
  renderNode: ScrollbackNode,
  position: 'before' | 'after',
  text: string
): ScrollbackVisibleRow {
  return {
    id: `scrollback:omitted-${position}`,
    text,
    segments: [documentSpan(
      renderNode,
      'scrollback',
      'omission',
      `omission.${position}`,
      text,
      scrollbackOmissionStyle(renderNode)
    )]
  };
}

function timestampForItem(item: ScrollbackItem): { readonly timestamp?: string } {
  const [timestamp] = scrollbackTimestampText(item);
  return timestamp === undefined ? {} : { timestamp };
}

function metadataForRecord(entries: readonly (readonly [string, string])[]): { readonly metadata?: Readonly<Record<string, string>> } {
  return entries.length === 0 ? {} : { metadata: Object.fromEntries(entries) };
}

function scrollStateProp(renderNode: ScrollbackNode) {
  return renderNode.props.scroll;
}

function selectedTextProp(
  renderNode: ScrollbackNode,
  history: ScrollbackHistory
): { readonly selectedText?: string } {
  const selection = selectionProp(renderNode);
  const selectedText = extractScrollbackSelectionText({
    history,
    ...(selection === undefined ? {} : { selection })
  });
  return selectedText === undefined ? {} : { selectedText };
}

function selectionProp(renderNode: ScrollbackNode): ScrollbackSelection | undefined {
  return renderNode.props.selection;
}

function selectedSearchMatch(
  renderNode: ScrollbackNode,
  matches: readonly ScrollbackSearchMatch[]
): ScrollbackSearchMatch | undefined {
  const selected = renderNode.props.selectedMatch;
  return selected === undefined
    ? matches[0]
    : matches.find((match) => match.id === selected.id) ?? matches[0];
}

function searchQueryProp(renderNode: ScrollbackNode): string {
  return sanitizeTerminalText(stringify(renderNode.props.searchQuery)).text.trim();
}

function defaultScrollState(
  totalRows: number,
  viewportRows: number,
  firstMatchRow: number | undefined
) {
  if (firstMatchRow !== undefined) {
    return scrollReducer(
      createScrollState({ contentRows: totalRows, viewportRows }),
      { kind: 'itemIntoView', itemIndex: firstMatchRow }
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
  itemId: string,
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
          offset: start,
          itemId
        });
        bodyCursor = start + currentSpan.text.length;
      }
    }
    column += cells;
  }
  return { positions, nextBodyCursor: bodyCursor };
}

function isBodyTextSpan(currentSpan: RenderSpan): boolean {
  const part = currentSpan.source?.partName;
  return currentSpan.source?.rendererFamily === 'scrollback'
    && (part === 'body' || part?.startsWith('body.') === true);
}

function scrollbackFullLineSpans(
  renderNode: ScrollbackNode,
  projected: ReturnType<typeof projectScrollbackRecord>,
  query: string,
  selection?: ScrollbackBodySelection
): readonly ScrollbackTextSegment[] {
  const record = projected.source;
  const timestampStyle = scrollbackTimestampStyle(renderNode);
  const metadataStyle = scrollbackMetadataStyle(renderNode);
  const separatorStyle = scrollbackMetadataSeparatorStyle(renderNode);
  const spans: ScrollbackTextSegment[] = [];
  for (const timestamp of scrollbackTimestampText(record.item)) {
    appendGap(spans, renderNode);
    spans.push(...timestampSpans(
      renderNode,
      record.item,
      record.itemIndex,
      timestamp,
      query,
      timestampStyle,
      separatorStyle
    ));
  }
  for (const [key, value] of projected.metadataEntries) {
    appendGap(spans, renderNode);
    spans.push(...metadataSpans(
      renderNode,
      record.item,
      record.itemIndex,
      key,
      value,
      query,
      metadataStyle,
      separatorStyle
    ));
  }
  appendGap(spans, renderNode);
  spans.push(...bodySpans(renderNode, record.item, record.itemIndex, projected.bodyText, query, selection));
  return spans.filter((span) => span.text.length > 0);
}

function appendGap(spans: ScrollbackTextSegment[], renderNode: ScrollbackNode): void {
  if (spans.length === 0) return;
  spans.push(documentSpan(
    renderNode,
    'scrollback',
    'separator',
    'separator',
    ' ',
    scrollbackMetadataSeparatorStyle(renderNode)
  ));
}

function timestampSpans(
  renderNode: ScrollbackNode,
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
      renderNode,
      'scrollback',
      'chrome',
      'timestamp.open',
      '[',
      separatorStyle,
      sourceOptionsForItem(item, itemIndex)
    ),
    ...documentHighlightSpans({
      renderNode,
      kind: 'scrollback',
      visual: 'metadata',
      label: 'timestamp.value',
      text: value,
      query,
      baseStyle: style,
      sourceOptions: sourceOptionsForItem(item, itemIndex)
    }),
    documentSpan(
      renderNode,
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
  renderNode: ScrollbackNode,
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
      renderNode,
      kind: 'scrollback',
      visual: 'metadata',
      label: `metadata.${token}.key`,
      text: key,
      query,
      baseStyle: style,
      sourceOptions: sourceOptionsForItem(item, itemIndex)
    }),
    documentSpan(
      renderNode,
      'scrollback',
      'separator',
      `metadata.${token}.separator`,
      '=',
      separatorStyle,
      sourceOptionsForItem(item, itemIndex)
    ),
    ...documentHighlightSpans({
      renderNode,
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
  renderNode: ScrollbackNode,
  item: ScrollbackItem,
  itemIndex: number,
  text: string,
  query: string,
  selection: ScrollbackBodySelection | undefined
): readonly ScrollbackTextSegment[] {
  const itemStyle = scrollbackBodyStyle(renderNode, item.style, scrollbackItemLevel(item));
  if (selection === undefined) {
    return documentHighlightSpans({
      renderNode,
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
      renderNode,
      kind: 'scrollback',
      visual: 'body',
      label: 'body',
      text: before,
      query,
      baseStyle: itemStyle,
      sourceOptions: sourceOptionsForItem(item, itemIndex)
    }),
    ...documentHighlightSpans({
      renderNode,
      kind: 'scrollback',
      visual: 'body',
      label: 'body.selection',
      text: selected,
      query,
      baseStyle: scrollbackSelectedStyle(renderNode),
      sourceOptions: sourceOptionsForItem(item, itemIndex, 'selected')
    }),
    ...documentHighlightSpans({
      renderNode,
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

function sourceOptionsForItem(
  item: ScrollbackItem,
  itemIndex: number,
  state?: import('../../visual/source.ts').FrameCellSource['interactionState']
) {
  return {
    itemId: item.id,
    itemIndex,
    ...(state === undefined ? {} : { state })
  };
}

type ScrollbackNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'scrollback'>;
