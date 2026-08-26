/* eslint-disable @typescript-eslint/unified-signatures -- passive and scrollable overloads preserve contextual action inference */
import type { AccessibleNode } from '../../accessibility/index.ts';
import {
  createScrollState,
  extractLogViewerSelectionText,
  normalizeScrollState,
  scrollReducer,
  visibleWindowFromScroll,
} from '../../behavior/index.ts';
import {
  componentScrollbarHitTargets,
  defineComponent,
  ignoreMessage,
  paintComponentScrollbar,
  layoutComponentScrollbar,
  decodeComponentScrollbarOptions,
  decodeComponentScrollPolicy,
  decodeComponentScrollState,
  span,
  wrapRenderSpans,
} from '../../component/index.ts';
import type {
  ComponentMessage,
  ComponentAccessibilityInput,
  ComponentInput,
  ComponentInteractionInput,
  ComponentMeasureInput,
  ComponentRenderInput,
  Element,
  HitTarget,
} from '../../component/index.ts';
import { assertRequiredCallback } from '../../foundation/validation.ts';
import type { RoutedPointerEvent } from '../../input/pointer.ts';
import type { ScrollPolicy, ScrollState } from '../../interaction/scroll.ts';
import type { ScrollbarOptions } from '../../interaction/scrollbar.ts';
import {
  createTerminalTextIndex,
  findTextHighlightMatches,
  measureTextCells,
  sanitizeTerminalText,
  textWidthProfileKey,
} from '../../text/index.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import { assertLogHistory, logHistoryRecordById, logHistorySegments } from '../../behavior/log-history.ts';
import type { LogHistory, LogHistoryRecord, LogSearchMatch } from '../../behavior/log-history.ts';
import type {
  LogViewerTransition,
  LogViewerBodyAnchor,
  LogViewerContextMenuEvent,
  LogViewerSelection,
} from '../../behavior/log-viewer.ts';
import type { LogViewerStylePart } from '../style-parts.ts';
import type { FrameCellSource } from '../../visual/frame-source.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import { matchCollectionQuery, compileCollectionQuery } from '../../text/query.ts';
import type { CompiledCollectionQuery } from '../../text/query.ts';
import type {
  LogViewerOptions,
  UnscrolledLogViewerOptions,
  ScrollableLogViewerOptions,
} from '../options/patterns.ts';
import {
  logViewerLayout,
  createLogViewerRecordView,
  logViewerRowForEntry,
  searchLogViewerHistory,
  visibleLogViewerRecords,
} from '../internal/log-viewer-layout.ts';

interface LogViewerModel {
  readonly history: LogHistory;
  readonly wrap: boolean;
  readonly query: CompiledCollectionQuery;
  readonly activeMatchId?: string;
  readonly foldedIds: readonly string[];
  readonly selection?: LogViewerSelection;
  readonly scroll?: ScrollState;
  readonly scrollbar?: ScrollbarOptions;
  readonly scrollPolicy?: ScrollPolicy;
}

type LogViewerComponentOptions = Omit<
  LogViewerOptions<ComponentMessage>,
  'id' | 'onTransition' | 'onContextMenu' | 'styles' | 'meta'
>;

type LogViewerComponentAction = LogViewerTransition | {
  readonly kind: 'contextMenu';
  readonly event: LogViewerContextMenuEvent;
};

interface LogViewerTextSegment extends RenderSpan {
  readonly body?: boolean;
}

interface LogViewerBodyPosition {
  readonly column: number;
  readonly cells: number;
  readonly text: string;
  readonly offset: number;
  readonly entryId: string;
}

interface LogViewerVisibleRow {
  readonly id: string;
  readonly text: string;
  readonly spans: readonly RenderSpan[];
  readonly matched: boolean;
  readonly activeMatch: boolean;
  readonly bodyPositions?: readonly LogViewerBodyPosition[];
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
  readonly scrollbar: ReturnType<typeof layoutComponentScrollbar>;
}

const logViewerWindows = new WeakMap<LogViewerModel, Map<string, LogViewerWindow>>();

const parts = [
  'body',
  'timestamp',
  'metadata',
  'separator',
  'marker',
  'empty',
  'selection',
  'highlight',
  'scrollbarTrack', 'scrollbarThumb',
] as const;

const baseDefinition = {
  name: 'terminal-ui/components/log-viewer' as const,
  identity: 'required' as const,
  structure: 'leaf' as const,
  semantics: 'semantic' as const,
  accessibleRole: 'text' as const,
  metadata: ['focus', 'layer', 'styles'] as const,
  parts,
  visualStates: ['focused', 'hovered', 'active', 'selected', 'disabled'] as const,
  measure: measureLogViewer,
  render: renderLogViewer,
  accessibility: logViewerAccessibility,
};

const passiveLogViewer = defineComponent<
  LogViewerComponentOptions,
  LogViewerModel,
  never,
  LogViewerStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'hovered', 'active', 'selected', 'disabled']
>({ ...baseDefinition, createModel: createLogViewerModel });

const activeLogViewer = defineComponent<
  LogViewerComponentOptions,
  LogViewerModel,
  LogViewerComponentAction,
  LogViewerStylePart,
  readonly [],
  'required',
  readonly ['focus', 'layer', 'styles'],
  readonly ['focused', 'hovered', 'active', 'selected', 'disabled']
>({
  ...baseDefinition,
  createModel: createLogViewerModel,
  keys: ({ model }) => {
    const search = searchLogViewerHistory(
      model.history,
      model.query,
      new Set(model.foldedIds),
    );
    return {
      ...(search.matches.length === 0 ? {} : {
        arrowUp: () => ({ kind: 'jumpMatch' as const, direction: -1 as const }),
        arrowDown: () => ({ kind: 'jumpMatch' as const, direction: 1 as const }),
      }),
    };
  },
  focusTargets: (
    input,
  ) => [{ id: 'self', bounds: logViewerWindow(input, false).scrollbar.contentBounds }],
  hitTargets: logViewerHitTargets,
});

export function logViewer<const TMessage extends ComponentMessage = never>(
  options: ScrollableLogViewerOptions<TMessage>,
): Element<TMessage>;
export function logViewer<const TMessage extends ComponentMessage = never>(
  options: UnscrolledLogViewerOptions<TMessage>,
): Element<TMessage>;
export function logViewer<const TMessage extends ComponentMessage = never>(
  options: LogViewerOptions<TMessage>,
): Element<TMessage> {
  if (options.onTransition === undefined) {
    return passiveLogViewer(options);
  }
  assertRequiredCallback(options.onTransition, 'logViewer onTransition');
  if (options.scroll === undefined) {
    const { onTransition, onContextMenu, ...componentOptions } = options;
    return activeLogViewer({
      ...componentOptions,
      onAction: (action) => action.kind === 'contextMenu'
        ? onContextMenu?.(action.event) ?? ignoreMessage()
        : action.kind === 'scroll' ? ignoreMessage() : onTransition(action),
    });
  }
  const { onTransition, onContextMenu, ...componentOptions } = options;
  return activeLogViewer({
    ...componentOptions,
    onAction: (action) => action.kind === 'contextMenu'
      ? onContextMenu?.(action.event) ?? ignoreMessage()
      : onTransition(action),
  });
}

function createLogViewerModel(value: Readonly<LogViewerComponentOptions>): LogViewerModel {
  const history = value.history;
  assertLogHistory(history);
  const wrap = optionalBoolean(value.wrap, 'logViewer wrap') ?? false;
  const query = compileCollectionQuery(value.query ?? { text: '', mode: 'contains' });
  const activeMatchId = value.activeMatchId === undefined
    ? undefined
    : nonEmpty(value.activeMatchId, 'logViewer activeMatchId');
  const foldedIds = ownStringArray(value.foldedIds);
  if (activeMatchId !== undefined) {
    const search = searchLogViewerHistory(history, query, new Set(foldedIds));
    if (!search.matches.some((match) => match.id === activeMatchId)) {
      throw new RangeError('logViewer activeMatchId must identify a match for the current query.');
    }
  }
  const selection = ownLogViewerSelection(value.selection);
  const scroll = decodeComponentScrollState(value.scroll, 'logViewer scroll');
  const scrollbar = decodeComponentScrollbarOptions(value.scrollbar, 'logViewer scrollbar');
  const scrollPolicy = decodeComponentScrollPolicy(
    value.scrollPolicy,
    'logViewer scrollPolicy',
  );
  if (scroll === undefined && (scrollbar !== undefined || scrollPolicy !== undefined)) {
    throw new TypeError('logViewer scrollbar and scrollPolicy require scroll state.');
  }
  return {
    history,
    wrap,
    query,
    foldedIds,
    ...(activeMatchId === undefined ? {} : { activeMatchId }),
    ...(selection === undefined ? {} : { selection }),
    ...(scroll === undefined ? {} : { scroll }),
    ...(scrollbar === undefined ? {} : { scrollbar }),
    ...(scrollPolicy === undefined ? {} : { scrollPolicy }),
  };
}

function measureLogViewer(input: ComponentMeasureInput<LogViewerModel>) {
  let preferredWidth = 1;
  let sampled = 0;
  for (const segment of logHistorySegments(input.model.history)) {
    for (const record of segment.records) {
      preferredWidth = Math.max(
        preferredWidth,
        measureTextCells(record.displayText, {
          widthProfile: input.widthProfile,
        }).cells,
      );
      sampled += 1;
      if (sampled >= 64) break;
    }
    if (sampled >= 64) break;
  }
  return {
    minWidth: 1,
    minHeight: 1,
    preferredWidth,
    preferredHeight: Math.max(1, Math.min(64, input.model.history.entryCount)),
  };
}

function renderLogViewer(input: ComponentRenderInput<LogViewerModel, LogViewerStylePart>): void {
  const window = logViewerWindow(input, true);
  for (const [row, visible] of window.rows.entries()) {
    input.target.write(row, 0, visible.spans);
  }
  paintComponentScrollbar({
    target: input.target,
    plan: window.scrollbar,
    theme: input.theme,
    style: (part, state, base) => input.style({ part, base, ...(state === undefined ? {} : { states: [state] }) }),
    frameSource: (sourceInput) => input.frameSource(sourceInput),
  });
}

function logViewerAccessibility(
  input: ComponentAccessibilityInput<LogViewerModel>,
): AccessibleNode {
  const window = logViewerWindow(input, false);
  return {
    id: input.id,
    role: 'text',
    description: logViewerDescription(input.model, window),
    ...(input.focused ? { focused: true } : {}),
    children: window.rows.map((row) => ({
      id: row.id,
      role: 'text' as const,
      label: row.text,
      value: row.text,
      ...(row.activeMatch ? { current: true, description: 'Current search match.' } :
        row.matched ? { description: 'Search match.' } : {}),
    })),
  };
}

function logViewerWindow(
  input:
    | ComponentInput<LogViewerModel>
    | ComponentInteractionInput<LogViewerModel, LogViewerStylePart>,
  styled: boolean,
): LogViewerWindow {
  const key = `${String(input.bounds.width)}:${String(input.bounds.height)}:${
    textWidthProfileKey(input.widthProfile)
  }:${styled ? 'styled' : 'plain'}`;
  const cached = logViewerWindows.get(input.model)?.get(key);
  if (cached !== undefined) return cached;
  const foldedIds = new Set(input.model.foldedIds);
  const initialLayout = logViewerLayout(
    input.model.history,
    input.bounds.width,
    input.model.wrap,
    input.widthProfile,
    foldedIds,
  );
  const search = searchLogViewerHistory(input.model.history, input.model.query, foldedIds);
  const activeMatch = input.model.activeMatchId === undefined
    ? search.matches[0]
    : search.matches.find((match) => match.id === input.model.activeMatchId);
  const firstMatchRow = activeMatch === undefined
    ? undefined
    : matchingLogViewerRow(input, initialLayout, activeMatch, foldedIds);
  const initialScroll = input.model.scroll === undefined
    ? defaultScrollState(initialLayout.totalRows, input.bounds.height, firstMatchRow)
    : normalizeScrollState(input.model.scroll, {
      contentRows: initialLayout.totalRows,
      contentColumns: input.bounds.width,
      viewportRows: input.bounds.height,
      viewportColumns: input.bounds.width,
    });
  let scrollbar = layoutComponentScrollbar({
    bounds: input.bounds,
    scroll: initialScroll,
    contentRows: initialLayout.totalRows,
    contentColumns: input.bounds.width,
    ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
    defaultAxis: 'vertical',
  });
  const layout = scrollbar.contentBounds.width === input.bounds.width
    ? initialLayout
    : logViewerLayout(
      input.model.history,
      scrollbar.contentBounds.width,
      input.model.wrap,
      input.widthProfile,
      foldedIds,
    );
  if (layout !== initialLayout) {
    const scroll = normalizeScrollState(scrollbar.scroll, {
      contentRows: layout.totalRows,
      contentColumns: scrollbar.contentBounds.width,
      viewportRows: scrollbar.contentBounds.height,
      viewportColumns: scrollbar.contentBounds.width,
    });
    scrollbar = layoutComponentScrollbar({
      bounds: input.bounds,
      scroll,
      contentRows: layout.totalRows,
      contentColumns: scrollbar.contentBounds.width,
      ...(input.model.scrollbar === undefined ? {} : { options: input.model.scrollbar }),
      defaultAxis: 'vertical',
    });
  }
  const visible = visibleWindowFromScroll(scrollbar.scroll, scrollbar.geometry);
  const omittedBefore = visible.startIndex;
  const omittedAfter = Math.max(0, layout.totalRows - visible.endIndexExclusive);
  const rows = visibleLogViewerRecords(layout, visible.startIndex, visible.endIndexExclusive)
    .flatMap(({ record, localStart, localEnd }) =>
      recordRows(
        input,
        createLogViewerRecordView(record, foldedIds.has(record.entry.id)),
        input.model.query,
        activeMatch,
        selectionForRecord(input.model.history, record, input.model.selection),
        scrollbar.contentBounds.width,
        styled,
      ).slice(localStart, localEnd)
    );
  const marked = layout.totalRows === 0
    ? scrollbar.contentBounds.height <= 0 ? [] : [emptyRow(input, styled)]
    : withOmissionMarkers(
      input,
      rows,
      omittedBefore,
      omittedAfter,
      scrollbar.contentBounds.height,
      scrollbar.scroll.followTail,
      styled,
    );
  const selectedText = extractLogViewerSelectionText({
    history: input.model.history,
    ...(input.model.selection === undefined ? {} : { selection: input.model.selection }),
  });
  const result = {
    rows: marked,
    totalRows: layout.totalRows,
    start: visible.startIndex,
    end: visible.endIndexExclusive,
    omittedBefore,
    omittedAfter,
    matchCount: search.matchingEntries,
    followTail: scrollbar.scroll.followTail,
    ...(selectedText === undefined ? {} : { selectedText }),
    scrollbar,
  };
  const windows = logViewerWindows.get(input.model) ?? new Map<string, LogViewerWindow>();
  windows.set(key, result);
  logViewerWindows.set(input.model, windows);
  return result;
}

function matchingLogViewerRow(
  input:
    | ComponentInput<LogViewerModel>
    | ComponentInteractionInput<LogViewerModel, LogViewerStylePart>,
  layout: ReturnType<typeof logViewerLayout>,
  match: LogSearchMatch,
  foldedIds: ReadonlySet<string>,
): number | undefined {
  const record = logHistoryRecordById(input.model.history, match.entryId);
  const entryStart = logViewerRowForEntry(layout, match.entryIndex);
  if (record === undefined || entryStart === undefined) return undefined;
  const recordView = createLogViewerRecordView(record, foldedIds.has(record.entry.id));
  const spans = fullLineSpans(input, recordView, input.model.query, undefined, undefined, false);
  const rows: number[] = [];
  let row = 0;
  let used = 0;
  for (const current of spans) {
    let recorded = false;
    for (
      const grapheme of measureTextCells(current.text, { widthProfile: input.widthProfile })
        .graphemes
    ) {
      if (grapheme.text === '\n') {
        row += 1;
        used = 0;
        continue;
      }
      if (used > 0 && used + grapheme.cells > Math.max(1, input.bounds.width)) {
        row += 1;
        used = 0;
      }
      if (current.source?.partType === 'match' && !recorded) {
        rows.push(row);
        recorded = true;
      }
      used += grapheme.cells;
    }
  }
  const local = rows[match.occurrenceIndex];
  return local === undefined ? entryStart : entryStart + local;
}

function recordRows(
  input:
    | ComponentInput<LogViewerModel>
    | ComponentInteractionInput<LogViewerModel, LogViewerStylePart>,
  record: ReturnType<typeof createLogViewerRecordView>,
  query: CompiledCollectionQuery,
  activeMatch: LogSearchMatch | undefined,
  selection: { readonly start: number; readonly end: number } | undefined,
  width: number,
  styled: boolean,
): readonly LogViewerVisibleRow[] {
  const spans = fullLineSpans(input, record, query, activeMatch, selection, styled);
  const lines = input.model.wrap && width > 0
    ? wrapRenderSpans(spans, width, { widthProfile: input.widthProfile })
    : [{ spans }];
  let bodyCursor = 0;
  return Object.freeze(lines.map((line, index) => {
    const positions = bodyPositionsForLine(
      line.spans,
      record.bodyText,
      record.source.entry.id,
      bodyCursor,
      input.widthProfile,
    );
    bodyCursor = positions.nextBodyCursor;
    return Object.freeze({
      id: `${input.id ?? 'log-viewer'}:entry:${String(record.source.entryIndex)}:line:${
        String(index)
      }`,
      text: line.spans.map((current) => current.text).join(''),
      spans: line.spans,
      matched: line.spans.some((current) => current.source?.partType === 'match'),
      activeMatch: line.spans.some((current) => current.source?.interactionState === 'active'),
      ...(positions.positions.length === 0 ? {} : { bodyPositions: positions.positions }),
    });
  }));
}

function fullLineSpans(
  input:
    | ComponentInput<LogViewerModel>
    | ComponentInteractionInput<LogViewerModel, LogViewerStylePart>,
  record: ReturnType<typeof createLogViewerRecordView>,
  query: CompiledCollectionQuery,
  activeMatch: LogSearchMatch | undefined,
  selection: { readonly start: number; readonly end: number } | undefined,
  styled: boolean,
): readonly LogViewerTextSegment[] {
  const output: LogViewerTextSegment[] = [];
  const entry = record.source.entry;
  if (entry.timestamp !== undefined) {
    appendGap(output, input, styled);
    output.push(
      segment(input, '[', 'separator', 'timestamp.open', 'delimiter', record.source, styled),
    );
    output.push(
      ...highlightSegments(
        input,
        entry.timestamp,
        query,
        'timestamp',
        'timestamp.value',
        record.source,
        styled,
        activeMatch,
        'timestamp',
      ),
    );
    output.push(
      segment(input, ']', 'separator', 'timestamp.close', 'delimiter', record.source, styled),
    );
  }
  for (const [key, value] of record.metadataEntries) {
    appendGap(output, input, styled);
    const token = sourceToken(key);
    output.push(
      ...highlightSegments(
        input,
        key,
        query,
        'metadata',
        `metadata.${token}.key`,
        record.source,
        styled,
        activeMatch,
        'metadataKey',
        key,
      ),
    );
    output.push(
      segment(
        input,
        '=',
        'separator',
        `metadata.${token}.separator`,
        'separator',
        record.source,
        styled,
      ),
    );
    output.push(
      ...highlightSegments(
        input,
        value,
        query,
        'metadata',
        `metadata.${token}.value`,
        record.source,
        styled,
        activeMatch,
        'metadataValue',
        key,
      ),
    );
  }
  appendGap(output, input, styled);
  output.push(...bodySegments(input, record, query, activeMatch, selection, styled));
  return Object.freeze(output.filter((current) => current.text.length > 0));
}

function bodySegments(
  input:
    | ComponentInput<LogViewerModel>
    | ComponentInteractionInput<LogViewerModel, LogViewerStylePart>,
  record: ReturnType<typeof createLogViewerRecordView>,
  query: CompiledCollectionQuery,
  activeMatch: LogSearchMatch | undefined,
  selection: { readonly start: number; readonly end: number } | undefined,
  styled: boolean,
): readonly LogViewerTextSegment[] {
  const body = record.bodyText;
  if (selection === undefined) {
    return highlightSegments(
      input,
      body,
      query,
      'body',
      'body',
      record.source,
      styled,
      activeMatch,
      'body',
      undefined,
      true,
      0,
    );
  }
  const start = Math.max(0, Math.min(body.length, selection.start));
  const end = Math.max(start, Math.min(body.length, selection.end));
  return [
    ...highlightSegments(
      input,
      body.slice(0, start),
      query,
      'body',
      'body',
      record.source,
      styled,
      activeMatch,
      'body',
      undefined,
      true,
      0,
    ),
    ...highlightSegments(
      input,
      body.slice(start, end),
      query,
      'selection',
      'body.selection',
      record.source,
      styled,
      activeMatch,
      'body',
      undefined,
      true,
      start,
    ),
    ...highlightSegments(
      input,
      body.slice(end),
      query,
      'body',
      'body',
      record.source,
      styled,
      activeMatch,
      'body',
      undefined,
      true,
      end,
    ),
  ];
}

function highlightSegments(
  input:
    | ComponentInput<LogViewerModel>
    | ComponentInteractionInput<LogViewerModel, LogViewerStylePart>,
  text: string,
  query: CompiledCollectionQuery,
  part: LogViewerStylePart,
  partName: string,
  record: LogHistoryRecord,
  styled: boolean,
  activeMatch: LogSearchMatch | undefined,
  field: LogSearchMatch['field'],
  fieldKey?: string,
  body = false,
  sourceOffset = 0,
): readonly LogViewerTextSegment[] {
  const index = createTerminalTextIndex(text, { widthProfile: input.widthProfile });
  const ranges = query.text.length === 0
    ? []
    : query.mode === 'contains'
      ? findTextHighlightMatches(text, query.text, {
          widthProfile: input.widthProfile,
          caseSensitive: query.caseSensitive,
        }).map((match) => ({
          start: index.graphemeIndexToCodeUnitOffset(match.startGraphemeIndex),
          end: index.graphemeIndexToCodeUnitOffset(match.endGraphemeIndexExclusive),
        }))
      : matchCollectionQuery({ id: record.entry.id, primary: text }, query)?.ranges ?? [];
  if (ranges.length === 0) {
    return [segment(input, text, part, partName, part, record, styled, body)];
  }
  const output: LogViewerTextSegment[] = [];
  let cursor = 0;
  for (const match of ranges) {
    const start = match.start;
    const end = match.end;
    if (start > cursor) {
      output.push(
        segment(input, text.slice(cursor, start), part, partName, part, record, styled, body),
      );
    }
    output.push(
      segment(
        input,
        text.slice(start, end),
        'highlight',
        `${partName}.match`,
        'match',
        record,
        styled,
        body,
        true,
        activeMatch?.entryId === record.entry.id &&
          activeMatch.field === field &&
          activeMatch.fieldKey === fieldKey &&
          activeMatch.startOffset === sourceOffset + start &&
          activeMatch.endOffsetExclusive === sourceOffset + end,
      ),
    );
    cursor = end;
  }
  if (cursor < text.length) {
    output.push(segment(input, text.slice(cursor), part, partName, part, record, styled, body));
  }
  return output;
}

function segment(
  input:
    | ComponentInput<LogViewerModel>
    | ComponentInteractionInput<LogViewerModel, LogViewerStylePart>,
  text: string,
  part: LogViewerStylePart,
  partName: string,
  partType: string,
  record: LogHistoryRecord,
  styled: boolean,
  body = false,
  matched = false,
  active = false,
): LogViewerTextSegment {
  const style = styled && 'style' in input
    ? segmentStyle(input, part, record, matched, active)
    : undefined;
  const source = 'frameSource' in input
    ? input.frameSource({
      cellRole: partType === 'delimiter' || part === 'marker' || part === 'empty'
        ? 'decoration'
        : partType === 'separator'
        ? 'separator'
        : 'text',
      partName,
      partType,
      description: partName,
      itemId: record.entry.id,
      itemIndex: record.entryIndex,
      ...(active
        ? { interactionState: 'active' as const }
        : part === 'selection' ? { interactionState: 'selected' as const } : {}),
    })
    : placeholderSource(partName, partType, record, part === 'selection');
  return {
    text,
    ...(style === undefined ? {} : { style }),
    source,
    ...(body ? { body: true } : {}),
  };
}

function segmentStyle(
  input: ComponentInteractionInput<LogViewerModel, LogViewerStylePart>,
  part: LogViewerStylePart,
  record: LogHistoryRecord,
  matched: boolean,
  active: boolean,
): TerminalStyle | undefined {
  const entryStyle = record.entry.style;
  if (matched) {
    return input.style({
      part: 'highlight',
      ...(active ? { states: ['active'] } : {}),
      base: {
        ...(entryStyle ?? {}),
        fg: { kind: 'theme', token: 'menu.match' },
        ...(active ? { bg: { kind: 'theme', token: 'selection.background' as const }, bold: true } : {}),
        underline: true,
      },
    });
  }
  if (part === 'timestamp') {
    return input.style({ part, base: { fg: { kind: 'theme', token: 'log.timestamp' } } });
  }
  if (part === 'metadata') {
    return input.style({ part, base: { fg: { kind: 'theme', token: 'log.metadata' } } });
  }
  if (part === 'selection') {
    return input.style({
      part,
      states: ['selected'],
      base: { ...(entryStyle ?? {}), bg: { kind: 'theme', token: 'selection.background' } },
    });
  }
  if (part === 'body') {
    const token = record.entry.level === 'info'
      ? 'log.info'
      : record.entry.level === 'warning'
      ? 'log.warning'
      : record.entry.level === 'error'
      ? 'log.error'
      : 'text.default';
    return input.style({ part, base: { fg: { kind: 'theme', token }, ...(entryStyle ?? {}) } });
  }
  if (part === 'marker') {
    return input.style({ part, base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true } });
  }
  if (part === 'empty') {
    return input.style({ part, base: { fg: { kind: 'theme', token: 'text.muted' }, dim: true } });
  }
  return input.style({ part });
}

function appendGap(
  output: LogViewerTextSegment[],
  input:
    | ComponentInput<LogViewerModel>
    | ComponentInteractionInput<LogViewerModel, LogViewerStylePart>,
  styled: boolean,
): void {
  if (output.length === 0) return;
  output.push(neutralSegment(input, ' ', 'separator', 'separator', 'separator', styled));
}

function emptyRow(
  input:
    | ComponentInput<LogViewerModel>
    | ComponentInteractionInput<LogViewerModel, LogViewerStylePart>,
  styled: boolean,
): LogViewerVisibleRow {
  const current = neutralSegment(input, 'No log entries', 'empty', 'empty', 'empty', styled);
  return {
    id: `${input.id ?? 'log-viewer'}:empty`,
    text: current.text,
    spans: [current],
    matched: false,
    activeMatch: false,
  };
}

function omissionRow(
  input:
    | ComponentInput<LogViewerModel>
    | ComponentInteractionInput<LogViewerModel, LogViewerStylePart>,
  position: 'before' | 'after',
  text: string,
  styled: boolean,
): LogViewerVisibleRow {
  const current = neutralSegment(input, text, 'marker', `omission.${position}`, 'omission', styled);
  return {
    id: `${input.id ?? 'log-viewer'}:omitted-${position}`,
    text,
    spans: [current],
    matched: false,
    activeMatch: false,
  };
}

function neutralSegment(
  input:
    | ComponentInput<LogViewerModel>
    | ComponentInteractionInput<LogViewerModel, LogViewerStylePart>,
  text: string,
  part: LogViewerStylePart,
  partName: string,
  partType: string,
  styled: boolean,
): RenderSpan {
  const style = styled && 'style' in input
    ? input.style({
      part,
      ...(part === 'marker' || part === 'empty'
        ? { base: { fg: { kind: 'theme' as const, token: 'text.muted' as const }, dim: true } }
        : {}),
    })
    : undefined;
  const source = 'frameSource' in input
    ? input.frameSource({
      cellRole: part === 'marker' || part === 'empty' ? 'decoration' : 'separator',
      partName,
      partType,
      description: partName,
    })
    : undefined;
  return span(text, {
    ...(style === undefined ? {} : { style }),
    ...(source === undefined ? {} : { source }),
  });
}

function withOmissionMarkers(
  input:
    | ComponentInput<LogViewerModel>
    | ComponentInteractionInput<LogViewerModel, LogViewerStylePart>,
  rows: readonly LogViewerVisibleRow[],
  omittedBefore: number,
  omittedAfter: number,
  height: number,
  followTail: boolean,
  styled: boolean,
): readonly LogViewerVisibleRow[] {
  if (height <= 0) return [];
  const output = [...rows];
  const replaced = new Set<number>();
  if (omittedBefore > 0) {
    const index = output.findIndex((row) => !row.matched);
    if (index >= 0) {
      output[index] = omissionRow(
        input,
        'before',
        `... ${String(omittedBefore)} earlier rows omitted ...`,
        styled,
      );
      replaced.add(index);
    }
  }
  if (omittedAfter > 0) {
    const index = output.findLastIndex((row, candidate) =>
      !row.matched && !replaced.has(candidate)
    );
    if (index >= 0) {
      output[index] = omissionRow(
        input,
        'after',
        `... ${String(omittedAfter)} later rows omitted${followTail ? '' : ' (paused)'} ...`,
        styled,
      );
    }
  }
  return Object.freeze(output.slice(0, height));
}

function logViewerHitTargets(
  input: ComponentInteractionInput<LogViewerModel, LogViewerStylePart>,
): readonly HitTarget<LogViewerComponentAction>[] {
  const window = logViewerWindow(input, true);
  const textTarget: HitTarget<LogViewerComponentAction> = {
    id: `${input.id ?? 'log-viewer'}:text`,
    bounds: window.scrollbar.contentBounds,
    accepts: ['pointerDown', 'click', 'dragStart', 'drag', 'dragEnd', 'contextMenu'],
    focus: { kind: 'target', targetId: 'self' },
    cursor: 'text',
    message: (event) => pointerAction(input.model, window, event),
  };
  return [
    textTarget,
    ...(input.model.scroll === undefined ? [] : componentScrollbarHitTargets<LogViewerComponentAction>({
      id: input.id ?? 'log-viewer',
      plan: window.scrollbar,
      ...(input.model.scrollPolicy === undefined ? {} : { policy: input.model.scrollPolicy }),
      onScroll: (request) => ({ kind: 'scroll', request }),
    })),
  ];
}

function pointerAction(
  model: LogViewerModel,
  window: LogViewerWindow,
  event: RoutedPointerEvent,
): ReturnType<HitTarget<LogViewerComponentAction>['message']> {
  const position = pointerAnchor(window.rows, event);
  if (position === undefined) return ignoreMessage();
  if (event.kind === 'contextMenu') {
    return {
      kind: 'contextMenu',
      event: {
        kind: 'contextMenu',
        position,
        ...(model.selection === undefined ? {} : { selection: model.selection }),
        row: event.row,
        column: event.column,
        modifiers: event.modifiers,
      },
    };
  }
  if (event.button !== 'left') return ignoreMessage();
  if (event.kind === 'pointerDown') {
    return logViewerPointerMessage(model, window, event, { kind: 'placeCaret', position });
  }
  if (event.kind === 'click') {
    if (event.clickCount !== 2) return ignoreMessage();
    const record = logHistoryRecordById(model.history, position.entryId);
    if (record === undefined) return ignoreMessage();
    const word = createTerminalTextIndex(record.bodyText).wordSelectionAt(position.offset);
    return logViewerPointerMessage(model, window, event, {
        kind: 'endSelection',
        anchor: { entryId: position.entryId, offset: word.startOffset },
        position: { entryId: position.entryId, offset: word.endOffsetExclusive },
    });
  }
  if (event.kind !== 'dragStart' && event.kind !== 'drag' && event.kind !== 'dragEnd') {
    return ignoreMessage();
  }
  const anchor = pointerAnchor(window.rows, {
    ...event,
    ...(event.pressLocalRow === undefined ? {} : { localRow: event.pressLocalRow }),
    ...(event.pressLocalColumn === undefined ? {} : { localColumn: event.pressLocalColumn }),
  }) ?? position;
  return logViewerPointerMessage(model, window, event, {
      kind: event.kind === 'dragEnd' ? 'endSelection' : 'extendSelection',
      anchor,
      position,
  });
}

function logViewerPointerMessage(
  model: LogViewerModel,
  window: LogViewerWindow,
  event: RoutedPointerEvent,
  transition: import('../../interaction/text-pointer.ts').PointerSelectionTransition<LogViewerBodyAnchor>,
): Extract<LogViewerComponentAction, { readonly kind: 'pointer' }> {
  const scrollRequest = logViewerDragScrollRequest(model, window, transition, event);
  return {
    kind: 'pointer',
    transition,
    ...(scrollRequest === undefined ? {} : { scrollRequest }),
  };
}

function logViewerDragScrollRequest(
  model: LogViewerModel,
  window: LogViewerWindow,
  transition: import('../../interaction/text-pointer.ts').PointerSelectionTransition<LogViewerBodyAnchor>,
  event: RoutedPointerEvent,
): import('../../interaction/scroll.ts').ScrollRequest | undefined {
  if (model.scroll === undefined || transition.kind !== 'extendSelection') return undefined;
  const localRow = event.localRow ?? event.row - window.scrollbar.contentBounds.row + 1;
  const rows = localRow < 1
    ? -1
    : localRow > window.scrollbar.contentBounds.height
    ? 1
    : 0;
  if (rows === 0) return undefined;
  const nextState = scrollReducer(
    window.scrollbar.scroll,
    { kind: 'scrollLines', rows },
    window.scrollbar.geometry,
  );
  return nextState === window.scrollbar.scroll
    ? undefined
    : { nextState, source: 'drag', target: 'content' };
}

function pointerAnchor(
  rows: readonly LogViewerVisibleRow[],
  event: RoutedPointerEvent,
): LogViewerBodyAnchor | undefined {
  if (rows.length === 0) return undefined;
  const requested = Math.max(0, Math.min(rows.length - 1, (event.localRow ?? 1) - 1));
  const row = rows[requested];
  const positions = row?.bodyPositions
    ?? nearestBodyPositions(rows, requested);
  if (positions === undefined || positions.length === 0) return undefined;
  const column = Math.max(0, (event.localColumn ?? 1) - 1);
  const containing = positions.find((position) =>
    column >= position.column && column < position.column + position.cells
  );
  if (containing !== undefined) {
    const index = createTerminalTextIndex(containing.text);
    return {
      entryId: containing.entryId,
      offset: containing.offset + index.graphemeIndexToCodeUnitOffset(
        index.visualColumnToGraphemeIndex(column - containing.column),
      ),
    };
  }
  const previous = positions.findLast((position) => column >= position.column + position.cells);
  if (previous !== undefined) {
    return { entryId: previous.entryId, offset: previous.offset + previous.text.length };
  }
  const first = positions[0];
  return first === undefined ? undefined : { entryId: first.entryId, offset: first.offset };
}

function nearestBodyPositions(
  rows: readonly LogViewerVisibleRow[],
  requested: number,
): readonly LogViewerBodyPosition[] | undefined {
  for (let distance = 1; distance < rows.length; distance += 1) {
    const before = rows[requested - distance]?.bodyPositions;
    if (before !== undefined && before.length > 0) return before;
    const after = rows[requested + distance]?.bodyPositions;
    if (after !== undefined && after.length > 0) return after;
  }
  return undefined;
}

function bodyPositionsForLine(
  spans: readonly RenderSpan[],
  bodyText: string,
  entryId: string,
  initialCursor: number,
  widthProfile: TextWidthProfile,
): { readonly positions: readonly LogViewerBodyPosition[]; readonly nextBodyCursor: number } {
  const positions: LogViewerBodyPosition[] = [];
  let column = 0;
  let cursor = initialCursor;
  for (const current of spans) {
    const cells = measureTextCells(current.text, { widthProfile }).cells;
    if (
      (current.source?.partName === 'body' ||
        current.source?.partName?.startsWith('body.') === true) &&
      current.text.length > 0
    ) {
      const start = bodyText.indexOf(current.text, cursor);
      if (start >= 0) {
        positions.push({ column, cells, text: current.text, offset: start, entryId });
        cursor = start + current.text.length;
      }
    }
    column += cells;
  }
  return { positions: Object.freeze(positions), nextBodyCursor: cursor };
}

function selectionForRecord(
  history: LogHistory,
  record: LogHistoryRecord,
  selection: LogViewerSelection | undefined,
): { readonly start: number; readonly end: number } | undefined {
  if (selection === undefined) return undefined;
  const anchorRecord = logHistoryRecordById(history, selection.anchor.entryId);
  const focusRecord = logHistoryRecordById(history, selection.focus.entryId);
  if (anchorRecord === undefined || focusRecord === undefined) return undefined;
  const anchorFirst = anchorRecord.entryIndex < focusRecord.entryIndex ||
    anchorRecord.entryIndex === focusRecord.entryIndex &&
      selection.anchor.offset <= selection.focus.offset;
  const startRecord = anchorFirst ? anchorRecord : focusRecord;
  const endRecord = anchorFirst ? focusRecord : anchorRecord;
  if (record.entryIndex < startRecord.entryIndex || record.entryIndex > endRecord.entryIndex) {
    return undefined;
  }
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

function defaultScrollState(
  totalRows: number,
  viewportRows: number,
  firstMatchRow: number | undefined,
): ScrollState {
  if (firstMatchRow !== undefined) {
    return scrollReducer(
      createScrollState(),
      { kind: 'itemIntoView', itemIndex: firstMatchRow, alignment: 'center' },
      { contentRows: totalRows, contentColumns: 0, viewportRows, viewportColumns: 0 },
    );
  }
  return scrollReducer(
    createScrollState({ followTail: true }),
    { kind: 'bottom' },
    { contentRows: totalRows, contentColumns: 0, viewportRows, viewportColumns: 0 },
  );
}

function logViewerDescription(model: LogViewerModel, window: LogViewerWindow): string {
  const query = model.query.text.length === 0
    ? ''
    : ` Search query: ${model.query.text}. Matching entries: ${String(window.matchCount)}.`;
  const selection = window.selectedText === undefined
    ? ''
    : ` Selection length: ${String(window.selectedText.length)}.`;
  const followTail = ` Follow tail: ${window.followTail ? 'true' : 'false'}.`;
  if (window.totalRows === 0) return `Showing 0 log rows.${followTail}${query}${selection}`;
  return `Showing ${String(window.start + 1)}-${String(window.end)} of ${
    String(window.totalRows)
  } log rows. Omitted before: ${String(window.omittedBefore)}. Omitted after: ${
    String(window.omittedAfter)
  }.${followTail}${query}${selection}`;
}

function ownLogViewerSelection(value: LogViewerSelection | undefined): LogViewerSelection | undefined {
  if (value === undefined) return undefined;
  return {
    anchor: decodeLogViewerAnchor(value.anchor, 'logViewer selection anchor'),
    focus: decodeLogViewerAnchor(value.focus, 'logViewer selection focus'),
  };
}

function decodeLogViewerAnchor(value: LogViewerBodyAnchor, subject: string): LogViewerBodyAnchor {
  return {
    entryId: nonEmpty(value.entryId, `${subject} entryId`),
    offset: nonNegativeInteger(value.offset, `${subject} offset`),
  };
}


function ownStringArray(value: readonly string[] | undefined): readonly string[] {
  if (value === undefined) return [];
  return value.map((entry) => sanitizeTerminalText(entry).text);
}

function optionalBoolean(value: unknown, subject: string): boolean | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new TypeError(`${subject} must be a boolean.`);
  return value;
}

function cleanLine(value: unknown, subject: string): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new TypeError(`${subject} must be a string.`);
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}

function nonEmpty(value: unknown, subject: string): string {
  const result = cleanLine(value, subject);
  if (result === undefined || result.trim() === '') {
    throw new TypeError(`${subject} must be non-empty.`);
  }
  return result;
}

function nonNegativeInteger(value: unknown, subject: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${subject} must be a non-negative safe integer.`);
  }
  return value;
}

function sourceToken(value: string): string {
  const token = value.trim().toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
  return token.length === 0 ? 'value' : token;
}

function placeholderSource(
  partName: string,
  partType: string,
  record: LogHistoryRecord,
  selected: boolean,
): FrameCellSource {
  return {
    elementKind: 'terminal-ui/components/log-viewer',
    rendererFamily: 'component',
    cellRole: 'text',
    partName,
    partType,
    description: partName,
    itemId: record.entry.id,
    itemIndex: record.entryIndex,
    ...(selected ? { interactionState: 'selected' } : {}),
  };
}
