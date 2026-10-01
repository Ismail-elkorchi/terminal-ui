import { cyclicIndex } from '../foundation/cyclic-index.ts';
import { logViewerLayoutWork, type LogViewerLayout } from './log-viewer-layout.ts';
import type { TextWidthProfile } from '../text/types.ts';
import { defineTextWidthProfile, textWidthProfileKey } from '../text/width-profile.ts';
import { finishWork, prepareWork, type CooperativeWorkContext } from '../foundation/cooperative-work.ts';
import { sanitizeTerminalText } from '../text/sanitize.ts';
import { compileCollectionQuery, type CollectionQuery, type CompiledCollectionQuery } from '../text/query.ts';
import {
  assertLogHistory, compileLogSearchQuery, logHistoryRecordMatchesCompiled, logHistorySegments,
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
const resultKeys = new WeakMap<LogViewerSearchResult, string>();
const queryCache = new WeakMap<LogHistory, Map<string, LogViewerSearchResult | WeakRef<LogViewerSearchResult>>>();
const recordMatches = new WeakMap<LogHistoryRecord, {
  readonly key: string;
  readonly matches: WeakRef<readonly LogSearchMatch[]>;
}>();
// Only a retained query owns its per-record arrays; history alone must not retain
// occurrences beyond the bounded query cache, including many small records.
const queryRecords = new WeakMap<LogViewerSearchResult, readonly (readonly LogSearchMatch[])[]>();

export type LogViewerViewInput = LogViewerSearchInput & (
  | { readonly wrap?: false; readonly width?: never; readonly widthProfile?: never }
  | { readonly wrap: true; readonly width: number; readonly widthProfile: TextWidthProfile }
);

/** Complete query and optional wrapped geometry, published together after preparation. */
export interface LogViewerView extends LogViewerSearchResult {
  readonly wrap: boolean;
  readonly width?: number;
  readonly widthProfile?: TextWidthProfile;
  readonly layouts: readonly LogViewerLayout[];
}

const views = new WeakSet<LogViewerView>();
// A view keeps the weakly cached query alive for geometry-only preparation.
const viewSearches = new WeakMap<LogViewerView, LogViewerSearchResult>();

/** Deliberately synchronous preparation for snapshots or small fixed data. */
export function createLogViewerView(input: LogViewerViewInput): LogViewerView {
  return finishWork(viewWork(ownViewInput(input)));
}

/** Query and geometry share the existing effect lifetime; resize reuses retained search. */
export function prepareLogViewerView(input: LogViewerViewInput, context: CooperativeWorkContext): Promise<LogViewerView> {
  context.signal.throwIfAborted();
  return prepareWork(viewWork(ownViewInput(input)), context);
}

/** A pending/stale view is never completed synchronously by behavior or rendering. */
export function matchingLogViewerView(input: LogViewerViewInput, view: LogViewerView | null): LogViewerView | undefined {
  if (view === null) return undefined;
  assertLogViewerView(view);
  const owned = ownInput(input);
  if (view.history !== input.history || resultKeys.get(view) !== inputKey(owned)) return undefined;
  if (input.wrap === true && (!view.wrap || view.width !== input.width || view.widthProfile === undefined
    || textWidthProfileKey(view.widthProfile) !== textWidthProfileKey(input.widthProfile))) return undefined;
  return view;
}

export function assertLogViewerView(view: unknown): asserts view is LogViewerView {
  if (!views.has(view as LogViewerView)) throw new TypeError('logViewer view must be prepared by terminal-ui, or null while pending.');
}

type OwnedViewInput = OwnedInput & Pick<LogViewerView, 'wrap' | 'width' | 'widthProfile'>;
function ownViewInput(input: LogViewerViewInput): OwnedViewInput {
  const base = ownInput(input);
  if (input.wrap !== true) return { ...base, wrap: false };
  if (!Number.isSafeInteger(input.width) || input.width < 0) throw new RangeError('Log viewer prepared width must be a non-negative integer.');
  return { ...base, wrap: true, width: input.width, widthProfile: defineTextWidthProfile(input.widthProfile) };
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
    layouts: Object.freeze(layouts),
  });
  views.add(view);
  viewSearches.set(view, search);
  matchPositions.set(view, matchPositions.get(search) ?? new Map());
  resultKeys.set(view, inputKey(input));
  return view;
}

type OwnedInput = Required<LogViewerSearchInput> & { readonly query: CompiledCollectionQuery };
function ownInput(input: LogViewerSearchInput): OwnedInput {
  assertLogHistory(input.history);
  const foldedIds = ownLogViewerFoldedIds(input.foldedIds);
  return { history: input.history, query: compileCollectionQuery(input.query ?? { text: '', mode: 'contains' }), foldedIds };
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
  const records: (readonly LogSearchMatch[])[] = [];
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
          found = logHistoryRecordMatchesCompiled(record, query, fields);
          recordMatches.set(record, { key: recordKey, matches: new WeakRef(found) });
        }
        if (found.length > 0) {
          matchingEntries++;
          records.push(found);
        }
        for (const match of found) {
          positions.set(match.id, matches.length);
          matches.push(match);
          if (++operations % 256 === 0) yield;
        }
        if (++operations % 256 === 0) yield;
      }
    }
  }
  const result: LogViewerSearchResult = Object.freeze({ kind: 'log-viewer-view', ...input, matchingEntries, matches: Object.freeze(matches) });
  queryRecords.set(result, Object.freeze(records));
  matchPositions.set(result, positions);
  resultKeys.set(result, key);
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

export function ownLogViewerFoldedIds(ids: readonly string[] | undefined): readonly string[] {
  if (ids?.some(id => typeof id !== 'string')) throw new TypeError('Log viewer folded IDs must be strings.');
  return Object.freeze([...new Set((ids ?? []).map(id => sanitizeTerminalText(id).text))].sort());
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
