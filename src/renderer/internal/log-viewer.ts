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
  logViewerBodyStyle,
  logViewerMetadataSeparatorStyle,
  logViewerMetadataStyle,
  logViewerOmissionStyle,
  logViewerSelectedStyle,
  logViewerTimestampStyle,
  sourceToken
} from './document-visual.ts';
import {
  logEntryLevel,
  logEntryTimestampText,
  type LogViewerBodySelection
} from './log-viewer/content.ts';
import {
  logViewerLayout,
  searchLogViewerHistory,
  logViewerRowForEntry,
  type LogViewerLayout,
  visibleLogViewerRecords
} from './log-viewer/prepared-data.ts';
import { logViewerRecordModel } from './log-viewer/record-model.ts';
import { extractLogViewerSelectionText } from '../../behavior/log-viewer-selection.ts';
import { logHistoryRecordById } from '../../ui-model/log-history.ts';
import { stringify } from './render-node-props.ts';
import { textOffsetAtVisualColumn } from './text-pointer.ts';
import { wrapRenderSpans } from '../../visual/render.ts';
import type { AccessibleNode } from '../../accessibility/index.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type {
  LogHistory,
  LogHistoryRecord,
  LogEntry,
  LogSearchMatch
} from '../../ui-model/log-history.ts';
import type { LogViewerBodyAnchor, LogViewerSelection } from '../../ui-model/log-viewer.ts';
import type { RenderNodeOfKind } from '../model/index.ts';
import type { LayoutNode } from '../contracts.ts';
import type { RenderBlock, RenderLine, RenderSpan } from '../../visual/render.ts';

interface LogViewerTextSegment extends RenderSpan {
  readonly matched?: boolean;
}

interface LogViewerVisibleRow {
  readonly id: string;
  readonly text: string;
  readonly segments: readonly LogViewerTextSegment[];
  readonly sourceEntryId?: string;
  readonly sourceEntryIndex?: number;
  readonly timestamp?: string;
  readonly metadata?: Readonly<Record<string, string>>;
  readonly matched?: boolean;
  readonly selected?: boolean;
  readonly bodyPositions?: readonly LogViewerBodyPosition[];
}

interface LogViewerRecordRows {
  readonly rows: readonly LogViewerVisibleRow[];
  readonly matchStartRows: readonly number[];
}

interface LogViewerBodyPosition {
  readonly column: number;
  readonly cells: number;
  readonly text: string;
  readonly offset: number;
  readonly entryId: string;
}

interface LogViewerWindow {
  readonly rows: readonly LogViewerVisibleRow[];
  readonly totalRows: number;
  readonly start: number;
  readonly end: number;
  readonly omittedBefore: number;
  readonly omittedAfter: number;
  readonly matchCount: number;
  readonly followTail: boolean;
  readonly selectedText?: string;
}

const logViewerWindowCache = new WeakMap<object, {
  readonly width: number;
  readonly height: number;
  readonly widthProfile: TextWidthProfile;
  readonly window: LogViewerWindow;
}>();

export function logViewerWindow(
  renderNode: LogViewerNode,
  node: Pick<LayoutNode, 'bounds'>,
  widthProfile: TextWidthProfile
): LogViewerWindow {
  const cached = logViewerWindowCache.get(renderNode);
  if (
    cached?.width === node.bounds.width
    && cached.height === node.bounds.height
    && cached.widthProfile === widthProfile
  ) return cached.window;
  const window = buildLogViewerWindow(renderNode, node, widthProfile);
  logViewerWindowCache.set(renderNode, {
    width: node.bounds.width,
    height: node.bounds.height,
    widthProfile,
    window
  });
  return window;
}

function buildLogViewerWindow(
  renderNode: LogViewerNode,
  node: Pick<LayoutNode, 'bounds'>,
  widthProfile: TextWidthProfile
): LogViewerWindow {
  const history = renderNode.props.history;
  const wrap = renderNode.props.wrap === true;
  const query = searchQueryProp(renderNode);
  const selection = selectionProp(renderNode);
  const foldedIds = new Set(renderNode.props.foldedIds ?? []);
  const includeBodyPositions = renderNode.props.toActionMessage !== undefined;
  const layout = logViewerLayout(history, node.bounds.width, wrap, widthProfile, foldedIds);
  const search = searchLogViewerHistory(history, query, foldedIds);
  const rowsByRecord = new Map<LogHistoryRecord, LogViewerRecordRows>();
  const rowsForRecordModel = (record: LogHistoryRecord): LogViewerRecordRows => {
    const cached = rowsByRecord.get(record);
    if (cached !== undefined) return cached;
    const rows = logViewerRecordRows(
      renderNode,
      logViewerRecordModel(record, foldedIds.has(record.entry.id)),
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
  const rowsForRecord = (record: LogHistoryRecord): readonly LogViewerVisibleRow[] => (
    rowsForRecordModel(record).rows
  );
  const selectedMatch = selectedSearchMatch(renderNode, search.matches);
  const firstMatchRow = matchingLogViewerRow(
    history,
    layout,
    selectedMatch,
    rowsForRecordModel
  );
  const explicitScroll = scrollStateProp(renderNode);
  const scroll = explicitScroll === undefined
    ? defaultScrollState(layout.totalRows, node.bounds.height, firstMatchRow)
    : normalizeScrollState({
        ...explicitScroll,
        contentRows: layout.totalRows,
        viewportRows: node.bounds.height
      });
  const visibleWindow = visibleWindowFromScroll(scroll);
  const omittedBefore = visibleWindow.startIndex;
  const omittedAfter = Math.max(0, layout.totalRows - visibleWindow.endIndexExclusive);
  const visibleRows = visibleLogViewerRecords(
    layout,
    visibleWindow.startIndex,
    visibleWindow.endIndexExclusive
  )
    .flatMap(({ record, localStart, localEnd }) => rowsForRecord(record).slice(localStart, localEnd));
  return {
    rows: layout.totalRows === 0
      ? emptyRows(renderNode, node.bounds.height)
      : withOmissionMarkers(
          renderNode,
          visibleRows,
          omittedBefore,
          omittedAfter,
          node.bounds.height,
          scroll.followTail
        ),
    totalRows: layout.totalRows,
    start: visibleWindow.startIndex,
    end: visibleWindow.endIndexExclusive,
    omittedBefore,
    omittedAfter,
    matchCount: search.matchingEntries,
    followTail: scroll.followTail,
    ...selectedTextProp(renderNode, history)
  };
}

function matchingLogViewerRow(
  history: LogHistory,
  layout: LogViewerLayout,
  match: LogSearchMatch | undefined,
  rowsForRecord: (record: LogHistoryRecord) => LogViewerRecordRows
): number | undefined {
  if (match === undefined) return undefined;
  const record = logHistoryRecordById(history, match.entryId);
  const entryStartRow = logViewerRowForEntry(layout, match.entryIndex);
  if (record === undefined || entryStartRow === undefined) return undefined;
  const matchedRow = rowsForRecord(record).matchStartRows[match.occurrenceIndex];
  return matchedRow === undefined ? undefined : entryStartRow + matchedRow;
}

export function logViewerText(renderNode: LogViewerNode, node: LayoutNode, widthProfile: TextWidthProfile): string {
  return logViewerWindow(renderNode, node, widthProfile).rows.map((row) => row.text).join('\n');
}

export function logViewerBlock(renderNode: LogViewerNode, node: LayoutNode, widthProfile: TextWidthProfile): RenderBlock {
  return {
    lines: logViewerWindow(renderNode, node, widthProfile).rows.map((row) => ({ spans: row.segments }))
  };
}

export function logViewerPointerAnchor(
  renderNode: LogViewerNode,
  node: Pick<LayoutNode, 'bounds'>,
  event: RoutedPointerEvent,
  widthProfile: TextWidthProfile
): LogViewerBodyAnchor | undefined {
  const row = logViewerWindow(renderNode, node, widthProfile).rows[(event.localRow ?? 0) - 1];
  const positions = row?.bodyPositions;
  if (positions === undefined || positions.length === 0) return undefined;
  const column = Math.max(0, (event.localColumn ?? 1) - 1);
  const containing = positions.find((position) =>
    column >= position.column && column < position.column + position.cells
  );
  if (containing !== undefined) {
    return {
      entryId: containing.entryId,
      offset: containing.offset + textOffsetAtVisualColumn(
        containing.text,
        column - containing.column,
        { widthProfile }
      )
    };
  }
  const previous = positions.findLast((position) => column >= position.column + position.cells);
  if (previous !== undefined) {
    return { entryId: previous.entryId, offset: previous.offset + previous.text.length };
  }
  const first = positions[0];
  return first === undefined ? undefined : { entryId: first.entryId, offset: first.offset };
}

export function logViewerAccessibleBase(
  renderNode: LogViewerNode,
  node: LayoutNode,
  id: string,
  focused: boolean,
  widthProfile: TextWidthProfile
): AccessibleNode {
  const window = logViewerWindow(renderNode, node, widthProfile);
  return {
    id,
    role: 'text',
    label: id,
    description: logViewerDescription(renderNode, window),
    ...(focused ? { focused: true } : {})
  };
}

export function logViewerAccessibleChildren(
  renderNode: LogViewerNode,
  node: LayoutNode,
  widthProfile: TextWidthProfile
): readonly AccessibleNode[] {
  return logViewerWindow(renderNode, node, widthProfile).rows.map((row) => ({
    id: row.id,
    role: 'text',
    label: row.text,
    value: row.text,
    ...(row.matched === true ? { description: 'Search match.' } : {})
  }));
}

function logViewerDescription(renderNode: LogViewerNode, window: LogViewerWindow): string {
  const query = stringify(renderNode.props.searchQuery);
  const queryText = query.length === 0
    ? ''
    : ` Search query: ${query}. Matching entries: ${String(window.matchCount)}.`;
  const selectionText = window.selectedText === undefined
    ? ''
    : ` Selection length: ${String(window.selectedText.length)}.`;
  const followTailText = ` Follow tail: ${window.followTail ? 'true' : 'false'}.`;
  if (window.totalRows === 0) return `Showing 0 log rows.${followTailText}${queryText}${selectionText}`;
  return `Showing ${String(window.start + 1)}-${String(window.end)} of ${String(window.totalRows)} log rows. Omitted before: ${String(window.omittedBefore)}. Omitted after: ${String(window.omittedAfter)}.${followTailText}${queryText}${selectionText}`;
}

function logViewerRecordRows(
  renderNode: LogViewerNode,
  recordModel: ReturnType<typeof logViewerRecordModel>,
  width: number,
  query: string,
  selection: LogViewerBodySelection | undefined,
  wrap: boolean,
  includeBodyPositions: boolean,
  widthProfile: TextWidthProfile
): LogViewerRecordRows {
  const record = recordModel.source;
  const fullLine = logViewerFullLineSpans(renderNode, recordModel, query, selection);
  const matchStartRows = wrap
    ? matchRowsForSpans(fullLine, width, widthProfile)
    : fullLine.filter((segment) => segment.matched === true).map(() => 0);
  const lines = wrap && width > 0
    ? wrapRenderSpans(fullLine, width, { widthProfile })
    : [{ spans: fullLine } satisfies RenderLine];
  let bodyCursor = 0;
  const rows = lines.map((renderLine, lineIndex) => {
    const bodyPositions = includeBodyPositions
      ? bodyPositionsForLine(
          renderLine.spans,
          recordModel.bodyText,
          record.entry.id,
          bodyCursor,
          widthProfile
        )
      : { positions: [], nextBodyCursor: bodyCursor };
    bodyCursor = bodyPositions.nextBodyCursor;
    return {
      id: `${renderNode.id ?? 'logViewer'}:entry:${String(record.entryIndex)}:line:${String(lineIndex)}`,
      text: renderLine.spans.map((segment) => segment.text).join(''),
      segments: renderLine.spans,
      sourceEntryId: record.entry.id,
      sourceEntryIndex: record.entryIndex,
      ...timestampForEntry(record.entry),
      ...metadataForRecord(recordModel.metadataEntries),
      matched: renderLine.spans.some((segment) => segment.source?.partType === 'match'),
      ...(selection === undefined ? {} : { selected: true }),
      ...(bodyPositions.positions.length === 0
        ? {}
        : { bodyPositions: bodyPositions.positions })
    };
  });
  return { rows: Object.freeze(rows), matchStartRows: Object.freeze(matchStartRows) };
}

function matchRowsForSpans(
  spans: readonly LogViewerTextSegment[],
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
  history: LogHistory,
  record: LogHistoryRecord,
  selection: LogViewerSelection | undefined
): LogViewerBodySelection | undefined {
  if (selection === undefined) return undefined;
  const anchorRecord = logHistoryRecordById(history, selection.anchor.entryId);
  const focusRecord = logHistoryRecordById(history, selection.focus.entryId);
  if (anchorRecord === undefined || focusRecord === undefined) return undefined;
  const anchorFirst = anchorRecord.entryIndex < focusRecord.entryIndex
    || anchorRecord.entryIndex === focusRecord.entryIndex
      && selection.anchor.offset <= selection.focus.offset;
  const startRecord = anchorFirst ? anchorRecord : focusRecord;
  const endRecord = anchorFirst ? focusRecord : anchorRecord;
  if (record.entryIndex < startRecord.entryIndex || record.entryIndex > endRecord.entryIndex) return undefined;
  const startAnchor = anchorFirst ? selection.anchor : selection.focus;
  const endAnchor = anchorFirst ? selection.focus : selection.anchor;
  const start = record.entry.id === startAnchor.entryId
    ? Math.max(0, Math.min(record.bodyText.length, startAnchor.offset))
    : 0;
  const end = record.entry.id === endAnchor.entryId
    ? Math.max(0, Math.min(record.bodyText.length, endAnchor.offset))
    : record.bodyText.length;
  return start < end ? { start, end } : undefined;
}

function withOmissionMarkers(
  renderNode: LogViewerNode,
  rows: readonly LogViewerVisibleRow[],
  omittedBefore: number,
  omittedAfter: number,
  height: number,
  followTail: boolean
): readonly LogViewerVisibleRow[] {
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

function emptyRows(renderNode: LogViewerNode, height: number): readonly LogViewerVisibleRow[] {
  if (height <= 0) return [];
  return [{
    id: `${renderNode.id ?? 'logViewer'}:empty`,
    text: 'No log entries',
    segments: [documentSpan(
      renderNode,
      'logViewer',
      'empty',
      'empty',
      'No log entries',
      documentEmptyStyle(renderNode)
    )]
  }];
}

function omissionRow(
  renderNode: LogViewerNode,
  position: 'before' | 'after',
  text: string
): LogViewerVisibleRow {
  return {
    id: `logViewer:omitted-${position}`,
    text,
    segments: [documentSpan(
      renderNode,
      'logViewer',
      'omission',
      `omission.${position}`,
      text,
      logViewerOmissionStyle(renderNode)
    )]
  };
}

function timestampForEntry(entry: LogEntry): { readonly timestamp?: string } {
  const [timestamp] = logEntryTimestampText(entry);
  return timestamp === undefined ? {} : { timestamp };
}

function metadataForRecord(entries: readonly (readonly [string, string])[]): { readonly metadata?: Readonly<Record<string, string>> } {
  return entries.length === 0 ? {} : { metadata: Object.fromEntries(entries) };
}

function scrollStateProp(renderNode: LogViewerNode) {
  return renderNode.props.scroll;
}

function selectedTextProp(
  renderNode: LogViewerNode,
  history: LogHistory
): { readonly selectedText?: string } {
  const selection = selectionProp(renderNode);
  const selectedText = extractLogViewerSelectionText({
    history,
    ...(selection === undefined ? {} : { selection })
  });
  return selectedText === undefined ? {} : { selectedText };
}

function selectionProp(renderNode: LogViewerNode): LogViewerSelection | undefined {
  return renderNode.props.selection;
}

function selectedSearchMatch(
  renderNode: LogViewerNode,
  matches: readonly LogSearchMatch[]
): LogSearchMatch | undefined {
  const selected = renderNode.props.selectedMatch;
  return selected === undefined
    ? matches[0]
    : matches.find((match) => match.id === selected.id) ?? matches[0];
}

function searchQueryProp(renderNode: LogViewerNode): string {
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
  entryId: string,
  initialBodyCursor: number,
  widthProfile: TextWidthProfile
): { readonly positions: readonly LogViewerBodyPosition[]; readonly nextBodyCursor: number } {
  const positions: LogViewerBodyPosition[] = [];
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
          entryId
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
  return currentSpan.source?.rendererFamily === 'logViewer'
    && (part === 'body' || part?.startsWith('body.') === true);
}

function logViewerFullLineSpans(
  renderNode: LogViewerNode,
  recordModel: ReturnType<typeof logViewerRecordModel>,
  query: string,
  selection?: LogViewerBodySelection
): readonly LogViewerTextSegment[] {
  const record = recordModel.source;
  const timestampStyle = logViewerTimestampStyle(renderNode);
  const metadataStyle = logViewerMetadataStyle(renderNode);
  const separatorStyle = logViewerMetadataSeparatorStyle(renderNode);
  const spans: LogViewerTextSegment[] = [];
  for (const timestamp of logEntryTimestampText(record.entry)) {
    appendGap(spans, renderNode);
    spans.push(...timestampSpans(
      renderNode,
      record.entry,
      record.entryIndex,
      timestamp,
      query,
      timestampStyle,
      separatorStyle
    ));
  }
  for (const [key, value] of recordModel.metadataEntries) {
    appendGap(spans, renderNode);
    spans.push(...metadataSpans(
      renderNode,
      record.entry,
      record.entryIndex,
      key,
      value,
      query,
      metadataStyle,
      separatorStyle
    ));
  }
  appendGap(spans, renderNode);
  spans.push(...bodySpans(renderNode, record.entry, record.entryIndex, recordModel.bodyText, query, selection));
  return spans.filter((span) => span.text.length > 0);
}

function appendGap(spans: LogViewerTextSegment[], renderNode: LogViewerNode): void {
  if (spans.length === 0) return;
  spans.push(documentSpan(
    renderNode,
    'logViewer',
    'separator',
    'separator',
    ' ',
    logViewerMetadataSeparatorStyle(renderNode)
  ));
}

function timestampSpans(
  renderNode: LogViewerNode,
  entry: LogEntry,
  entryIndex: number,
  timestamp: string,
  query: string,
  style: ReturnType<typeof logViewerMetadataStyle>,
  separatorStyle: ReturnType<typeof logViewerMetadataSeparatorStyle>
): readonly LogViewerTextSegment[] {
  const value = timestamp.startsWith('[') && timestamp.endsWith(']')
    ? timestamp.slice(1, -1)
    : timestamp;
  return [
    documentSpan(
      renderNode,
      'logViewer',
      'delimiter',
      'timestamp.open',
      '[',
      separatorStyle,
      sourceOptionsForEntry(entry, entryIndex)
    ),
    ...documentHighlightSpans({
      renderNode,
      kind: 'logViewer',
      visual: 'metadata',
      label: 'timestamp.value',
      text: value,
      query,
      baseStyle: style,
      sourceOptions: sourceOptionsForEntry(entry, entryIndex)
    }),
    documentSpan(
      renderNode,
      'logViewer',
      'delimiter',
      'timestamp.close',
      ']',
      separatorStyle,
      sourceOptionsForEntry(entry, entryIndex)
    )
  ];
}

function metadataSpans(
  renderNode: LogViewerNode,
  entry: LogEntry,
  entryIndex: number,
  key: string,
  value: string,
  query: string,
  style: ReturnType<typeof logViewerMetadataStyle>,
  separatorStyle: ReturnType<typeof logViewerMetadataSeparatorStyle>
): readonly LogViewerTextSegment[] {
  const token = sourceToken(key);
  return [
    ...documentHighlightSpans({
      renderNode,
      kind: 'logViewer',
      visual: 'metadata',
      label: `metadata.${token}.key`,
      text: key,
      query,
      baseStyle: style,
      sourceOptions: sourceOptionsForEntry(entry, entryIndex)
    }),
    documentSpan(
      renderNode,
      'logViewer',
      'separator',
      `metadata.${token}.separator`,
      '=',
      separatorStyle,
      sourceOptionsForEntry(entry, entryIndex)
    ),
    ...documentHighlightSpans({
      renderNode,
      kind: 'logViewer',
      visual: 'metadata',
      label: `metadata.${token}.value`,
      text: value,
      query,
      baseStyle: style,
      sourceOptions: sourceOptionsForEntry(entry, entryIndex)
    })
  ];
}

function bodySpans(
  renderNode: LogViewerNode,
  entry: LogEntry,
  entryIndex: number,
  text: string,
  query: string,
  selection: LogViewerBodySelection | undefined
): readonly LogViewerTextSegment[] {
  const entryStyle = logViewerBodyStyle(renderNode, entry.style, logEntryLevel(entry));
  if (selection === undefined) {
    return documentHighlightSpans({
      renderNode,
      kind: 'logViewer',
      visual: 'body',
      label: 'body',
      text,
      query,
      baseStyle: entryStyle,
      sourceOptions: sourceOptionsForEntry(entry, entryIndex)
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
      kind: 'logViewer',
      visual: 'body',
      label: 'body',
      text: before,
      query,
      baseStyle: entryStyle,
      sourceOptions: sourceOptionsForEntry(entry, entryIndex)
    }),
    ...documentHighlightSpans({
      renderNode,
      kind: 'logViewer',
      visual: 'body',
      label: 'body.selection',
      text: selected,
      query,
      baseStyle: logViewerSelectedStyle(renderNode),
      sourceOptions: sourceOptionsForEntry(entry, entryIndex, 'selected')
    }),
    ...documentHighlightSpans({
      renderNode,
      kind: 'logViewer',
      visual: 'body',
      label: 'body',
      text: after,
      query,
      baseStyle: entryStyle,
      sourceOptions: sourceOptionsForEntry(entry, entryIndex)
    })
  ];
}

function sourceOptionsForEntry(
  entry: LogEntry,
  entryIndex: number,
  state?: import('../../visual/source.ts').FrameCellSource['interactionState']
) {
  return {
    itemId: entry.id,
    itemIndex: entryIndex,
    ...(state === undefined ? {} : { state })
  };
}

type LogViewerNode<TMessage = unknown> = RenderNodeOfKind<TMessage, 'logViewer'>;
