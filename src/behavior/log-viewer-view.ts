import { cyclicIndex } from '../foundation/cyclic-index.ts';
import { logViewerLayoutWork, type LogViewerLayout } from './log-viewer-layout.ts';
import type { TextWidthProfile } from '../text/types.ts';
import { defineTextWidthProfile, textWidthProfileKey } from '../text/width-profile.ts';
import { finishWork, prepareWork, stableSortWork, type CooperativeWorkContext } from '../foundation/cooperative-work.ts';
import { sanitizeTerminalTextWork } from '../text/sanitize.ts';
import { compileCollectionQueryWork, sameCollectionQueryRequest, type CollectionQuery, type CompiledCollectionQuery } from '../text/query.ts';
import {
  assertLogHistory, compileLogSearchQuery, logHistoryRecordMatchesWork, logHistorySegments,
  type LogHistory, type LogHistoryRecord, type LogSearchMatch,
} from './log-history.ts';
import { createLogViewerRecordView } from './log-viewer-record.ts';

interface LogViewerSearchInput {
  readonly history: LogHistory;
  readonly query?: CollectionQuery;
  readonly foldedIds?: readonly string[];
}

/** One complete immutable projection shared by log navigation and rendering. */
interface LogViewerSearchResult {
  readonly kind: 'log-viewer-view';
  readonly history: LogHistory;
  readonly query: CompiledCollectionQuery;
  readonly foldedIds: readonly string[];
  readonly matchingEntries: number;
  readonly matches: readonly LogSearchMatch[];
}

const matchPositions = new WeakMap<LogViewerSearchResult, ReadonlyMap<string, number>>();
const queryCache = new WeakMap<LogHistory, Map<string, LogViewerSearchResult | WeakRef<LogViewerSearchResult>>>();
const recordMatches = new WeakMap<LogHistoryRecord, {
  readonly key: string;
  readonly matches: WeakRef<readonly LogSearchMatch[]>;
}>();
// Only a retained query owns its per-record arrays; history alone must not retain
// occurrences beyond the bounded query cache, including many small records.
interface PreparedRecordMatches {
  readonly retained: readonly LogSearchMatch[];
  readonly fields: ReadonlyMap<LogSearchMatch['field'], ReadonlyMap<string | undefined, readonly LogSearchMatch[]>>;
}
const queryRecords = new WeakMap<LogViewerSearchResult, ReadonlyMap<LogHistoryRecord, PreparedRecordMatches>>();

export type LogViewerViewInput = LogViewerSearchInput & (
  | { readonly wrap?: false; readonly width?: never; readonly widthProfile?: never }
  | { readonly wrap: true; readonly width: number; readonly widthProfile: TextWidthProfile }
);

/** Complete query and optional wrapped geometry, published together after preparation. */
export interface LogViewerView extends LogViewerSearchResult {
  readonly wrap: boolean;
  readonly width?: number;
  readonly widthProfile?: TextWidthProfile;
}

const views = new WeakSet<LogViewerView>();
const viewLayouts = new WeakMap<LogViewerView, ReadonlyMap<number, LogViewerLayout>>();
const viewRequests = new WeakMap<LogViewerView, { readonly query: CollectionQuery | undefined; readonly foldedIds: readonly string[] | undefined; readonly foldedCount: number }>();
// A view keeps the weakly cached query alive for geometry-only preparation.
const viewSearches = new WeakMap<LogViewerView, LogViewerSearchResult>();

/** Deliberately synchronous preparation for snapshots or small fixed data. */
export function createLogViewerView(input: LogViewerViewInput): LogViewerView {
  return finishWork(prepareViewWork(input));
}

/** Query and geometry share the existing effect lifetime; resize reuses retained search. */
export function prepareLogViewerView(input: LogViewerViewInput, context: CooperativeWorkContext): Promise<LogViewerView> {
  context.signal.throwIfAborted();
  const base: LogViewerSearchInput = { history: input.history,
    ...(input.query === undefined ? {} : { query: { ...input.query } }),
    ...(input.foldedIds === undefined ? {} : { foldedIds: [...input.foldedIds] }),
  };
  const snapshot: LogViewerViewInput = input.wrap === true
    ? { ...base, wrap: true, width: input.width, widthProfile: defineTextWidthProfile(input.widthProfile) }
    : base;
  return prepareWork(prepareViewWork(snapshot, input.foldedIds), context);
}

/** A pending/stale view is never completed synchronously by behavior or rendering. */
export function matchingLogViewerView(input: LogViewerViewInput, view: LogViewerView | null): LogViewerView | undefined {
  if (view === null) return undefined;
  assertLogViewerView(view);
  const request = viewRequests.get(view);
  if (view.history !== input.history || request === undefined
    || !(sameCollectionQueryRequest(request.query, input.query) || sameCollectionQueryRequest(view.query, input.query))
    || !((request.foldedIds === input.foldedIds && (input.foldedIds?.length ?? 0) === request.foldedCount)
      || input.foldedIds === view.foldedIds || (view.foldedIds.length === 0 && (input.foldedIds?.length ?? 0) === 0))) return undefined;
  if (input.wrap === true && (!view.wrap || view.width !== input.width || view.widthProfile === undefined
    || textWidthProfileKey(view.widthProfile) !== textWidthProfileKey(input.widthProfile))) return undefined;
  return view;
}

export function assertLogViewerView(view: unknown): asserts view is LogViewerView {
  if (!views.has(view as LogViewerView)) throw new TypeError('logViewer view must be prepared by terminal-ui, or null while pending.');
}

type OwnedViewInput = OwnedInput & Pick<LogViewerView, 'wrap' | 'width' | 'widthProfile'>;
function* prepareViewWork(input: LogViewerViewInput, foldedIds = input.foldedIds): Generator<void, LogViewerView> {
  const request = { query: input.query === undefined ? undefined : Object.freeze({ ...input.query }), foldedIds, foldedCount: foldedIds?.length ?? 0 };
  const base = yield* ownInputWork(input);
  let owned: OwnedViewInput = { ...base, wrap: false };
  if (input.wrap === true) {
    if (!Number.isSafeInteger(input.width) || input.width < 0) throw new RangeError('Log viewer prepared width must be a non-negative integer.');
    owned = { ...base, wrap: true, width: input.width, widthProfile: defineTextWidthProfile(input.widthProfile) };
  }
  const view = yield* viewWork(owned);
  viewRequests.set(view, request);
  return view;
}

function* viewWork(input: OwnedViewInput): Generator<void, LogViewerView> {
  const search = yield* queryWork(input);
  const layouts: LogViewerLayout[] = [];
  if (input.wrap && input.width !== undefined && input.widthProfile !== undefined) {
    const foldedIds = new Set(input.foldedIds);
    const foldedKey = JSON.stringify(input.foldedIds);
    layouts.push(yield* logViewerLayoutWork(input.history, input.width, input.widthProfile, foldedIds, foldedKey));
    if (input.width > 0) layouts.push(yield* logViewerLayoutWork(input.history, input.width - 1, input.widthProfile, foldedIds, foldedKey));
  }
  const view = Object.freeze({ ...search, wrap: input.wrap,
    ...(input.width === undefined ? {} : { width: input.width }),
    ...(input.widthProfile === undefined ? {} : { widthProfile: input.widthProfile }),
  });
  views.add(view);
  viewLayouts.set(view, new Map(layouts.map(layout => [layout.width, layout])));
  viewSearches.set(view, search);
  matchPositions.set(view, matchPositions.get(search) ?? new Map());
  return view;
}

type OwnedInput = Required<LogViewerSearchInput> & { readonly query: CompiledCollectionQuery };
function* ownInputWork(input: LogViewerSearchInput): Generator<void, OwnedInput> {
  assertLogHistory(input.history);
  const foldedIds = yield* ownLogViewerFoldedIdsWork(input.foldedIds);
  return { history: input.history, query: yield* compileCollectionQueryWork(input.query ?? { text: '', mode: 'contains' }), foldedIds };
}
function inputKey(input: OwnedInput): string {
  return JSON.stringify([input.query.text, input.query.mode, input.query.caseSensitive, input.foldedIds]);
}

function* queryWork(input: OwnedInput): Generator<void, LogViewerSearchResult> {
  const key = inputKey(input);
  const cache = queryCache.get(input.history) ?? new Map<string, LogViewerSearchResult | WeakRef<LogViewerSearchResult>>();
  queryCache.set(input.history, cache);
  const cached = cache.get(key);
  const retained = cached instanceof WeakRef ? cached.deref() : cached;
  if (retained !== undefined) {
    cache.delete(key);
    cache.set(key, retained.matches.length > 8192 ? new WeakRef(retained) : retained);
    return retained;
  }
  const matches: LogSearchMatch[] = [];
  const records = new Map<LogHistoryRecord, PreparedRecordMatches>();
  const positions = new Map<string, number>();
  let matchingEntries = 0;
  let operations = 0;
  if (input.query.text.length > 0) {
    const query = compileLogSearchQuery(input.query);
    const folded = new Set(input.foldedIds);
    const searchKey = JSON.stringify([input.query.text, input.query.mode, input.query.caseSensitive]);
    for (const segment of logHistorySegments(input.history)) {
      for (const record of segment.records) {
        const isFolded = folded.has(record.entry.id);
        const recordKey = `${searchKey}:${String(isFolded)}`;
        const cachedRecord = recordMatches.get(record);
        let found = cachedRecord?.key === recordKey ? cachedRecord.matches.deref() : undefined;
        if (found === undefined) {
          const fields = isFolded ? createLogViewerRecordView(record, true).searchFields : record.searchFields;
          found = yield* logHistoryRecordMatchesWork(record, query, fields);
          recordMatches.set(record, { key: recordKey, matches: new WeakRef(found) });
        }
        if (found.length > 0) {
          matchingEntries++;

        }
        const fields = new Map<LogSearchMatch['field'], Map<string | undefined, LogSearchMatch[]>>();
        for (const match of found) {
          const byKey = fields.get(match.field) ?? new Map<string | undefined, LogSearchMatch[]>();
          const ranges = byKey.get(match.fieldKey) ?? [];
          ranges.push(match);
          byKey.set(match.fieldKey, ranges);
          fields.set(match.field, byKey);
          positions.set(match.id, matches.length);
          matches.push(match);
          if (++operations % 256 === 0) yield;
        }
        if (found.length > 0) records.set(record, { retained: found, fields });
        if (++operations % 256 === 0) yield;
      }
    }
  }
  const result: LogViewerSearchResult = Object.freeze({ kind: 'log-viewer-view', ...input, matchingEntries, matches: Object.freeze(matches) });
  queryRecords.set(result, records);
  matchPositions.set(result, positions);
  cache.delete(key);
  cache.set(key, matches.length > 8192 ? new WeakRef(result) : result);
  let retainedMatches = [...cache.values()].reduce((total, value) => total + (value instanceof WeakRef ? 0 : value.matches.length), 0);
  while (cache.size > 4 || retainedMatches > 8192) {
    const oldest = cache.entries().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest[0]);
    if (!(oldest[1] instanceof WeakRef)) retainedMatches -= oldest[1].matches.length;
  }
  return result;
}

function* ownLogViewerFoldedIdsWork(ids: readonly string[] | undefined): Generator<void, readonly string[]> {
  const unique = new Set<string>();
  let operations = 0;
  for (const id of ids ?? []) {
    if (typeof id !== 'string') throw new TypeError('Log viewer folded IDs must be strings.');
    unique.add((yield* sanitizeTerminalTextWork(id)).text);
    if (++operations % 256 === 0) yield;
  }
  return Object.freeze(yield* stableSortWork(unique, (left, right) => left < right ? -1 : left > right ? 1 : 0));
}

/** Resolve one accepted occurrence without scanning the complete result set. */
export function logViewerMatchById(view: LogViewerView, id: string): LogSearchMatch | undefined {
  assertLogViewerView(view);
  const position = matchPositions.get(view)?.get(id);
  return position === undefined ? undefined : view.matches[position];
}

/** Navigate the same prepared occurrence domain used by the component. */
export function nextLogViewerMatch(view: LogViewerView, activeId: string | undefined, direction: 1 | -1): LogSearchMatch | undefined {
  assertLogViewerView(view);
  if (view.matches.length === 0) return undefined;
  const position = activeId === undefined ? direction > 0 ? -1 : 0 : matchPositions.get(view)?.get(activeId) ?? -1;
  return view.matches[cyclicIndex(position + direction, view.matches.length)];
}

/** Private accepted-field lookup; painting never indexes source text. */
export function preparedLogFieldMatches(view: LogViewerView, record: LogHistoryRecord, field: LogSearchMatch['field'], key?: string): readonly LogSearchMatch[] {
  const search = viewSearches.get(view);
  return search === undefined ? noFieldMatches : queryRecords.get(search)?.get(record)?.fields.get(field)?.get(key) ?? noFieldMatches;
}
const noFieldMatches: readonly LogSearchMatch[] = Object.freeze([]);

/** Private geometry access for component adaptation; prepared handles expose no index tables. */
export function preparedLogLayout(view: LogViewerView, width: number): LogViewerLayout | undefined {
  return viewLayouts.get(view)?.get(width);
}
