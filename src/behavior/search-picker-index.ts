import { finishWork, prepareWork, type CooperativeWorkContext } from '../foundation/cooperative-work.ts';
import type { SearchEntry } from '../collection/item.ts';
import type { CollectionInteractionIndex } from '../interaction/collection-interaction.ts';
import { createCollectionInteractionIndexWork } from '../interaction/collection-interaction.ts';
import type {
  CollectionQuery,
  CompiledCollectionQuery,
  IndexedQueryCandidate,
  QueryMatch,
} from '../text/query.ts';
import {
  compileCollectionQueryWork,
  sameCollectionQueryRequest,
  indexQueryCandidateWork,
  queryIndexedCandidatesWork,
} from '../text/query.ts';
import { sanitizeTerminalTextWork } from '../text/sanitize.ts';

const searchPickerIndexBrand: unique symbol = Symbol('terminal-ui.search-picker-index');
const queryCacheLimit = 8;
const queryCacheReferenceLimit = 8_192;

export interface SearchPickerIndex<TValue = string> {
  readonly [searchPickerIndexBrand]: TValue;
  readonly kind: 'search-picker-index';
  readonly size: number;
}

export interface SearchPickerQueryResult<TValue = string> {
  readonly kind: 'search-picker-query';
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly query: CompiledCollectionQuery;
  readonly entries: readonly SearchEntry<TValue>[];
  readonly matches: readonly QueryMatch[];
  readonly interactionIndex: CollectionInteractionIndex;
}

interface SearchPickerIndexData<TValue> {
  readonly entries: readonly SearchEntry<TValue>[];
  readonly entriesById: ReadonlyMap<string, SearchEntry<TValue>>;
  readonly candidates: readonly IndexedQueryCandidate[];
  readonly queryResults: Map<string, SearchPickerQueryResult<TValue>>;
  queryEvaluations: number;
  candidateEvaluations: number;
}

const sourceIndexes = new WeakMap<object, SearchPickerIndex<unknown>>();
const mappedSourceIndexes = new WeakMap<object, WeakMap<object, SearchPickerIndex<unknown>>>();
const indexData = new WeakMap<object, SearchPickerIndexData<unknown>>();

export function createSearchPickerIndex<TValue>(
  entries: readonly SearchEntry<TValue>[],
): SearchPickerIndex<TValue>;
export function createSearchPickerIndex<TSource, TValue>(
  source: readonly TSource[],
  toEntry: (value: TSource, index: number) => SearchEntry<TValue>,
): SearchPickerIndex<TValue>;
export function createSearchPickerIndex<TSource, TValue>(
  source: readonly TSource[],
  toEntry?: (value: TSource, index: number) => SearchEntry<TValue>,
): SearchPickerIndex<TValue> {
  if (!Array.isArray(source)) throw new TypeError('Search picker index source must be an array.');
  if (toEntry !== undefined && typeof toEntry !== 'function') {
    throw new TypeError('Search picker index toEntry must be a function.');
  }
  if (toEntry !== undefined) {
    const byMapper = mappedSourceIndexes.get(source);
    const cached = byMapper?.get(toEntry) as SearchPickerIndex<TValue> | undefined;
    if (cached !== undefined) return cached;
    const index = finishWork(buildSearchPickerIndexWork(source.map(toEntry)));
    const cache = byMapper ?? new WeakMap<object, SearchPickerIndex<unknown>>();
    cache.set(toEntry, index);
    if (byMapper === undefined) mappedSourceIndexes.set(source, cache);
    return index;
  }
  const entries = source as readonly SearchEntry<TValue>[];
  const cached = sourceIndexes.get(entries) as SearchPickerIndex<TValue> | undefined;
  if (cached !== undefined) return cached;
  const index = finishWork(buildSearchPickerIndexWork(entries));
  sourceIndexes.set(entries, index);
  return index;
}

/**
 * Adopt raw entry descriptors before yielding. The descriptor/keyword copy is indivisible;
 * strings are immutable and values retain their caller-owned domain identity.
 */
function adoptEntries<TValue>(entries: readonly SearchEntry<TValue>[]): readonly SearchEntry<TValue>[] {
  return entries.map(entry => Object.freeze({ ...entry,
    ...(entry.keywords === undefined ? {} : { keywords: Object.freeze([...entry.keywords]) }),
  }));
}

/** Build an owned index cooperatively. Mapper callbacks and input adoption cannot be preempted. */
export function prepareSearchPickerIndex<TValue>(
  entries: readonly SearchEntry<TValue>[], context: CooperativeWorkContext,
): Promise<SearchPickerIndex<TValue>> {
  context.signal.throwIfAborted();
  if (!Array.isArray(entries)) throw new TypeError('Search picker index source must be an array.');
  const owned = adoptEntries<TValue>(entries);
  return prepareWork(buildSearchPickerIndexWork(owned), context);
}

function* buildSearchPickerIndexWork<TValue>(
  entries: readonly SearchEntry<TValue>[],
): Generator<void, SearchPickerIndex<TValue>> {
  const seen = new Set<string>();
  const normalized: SearchEntry<TValue>[] = [];
  const candidates: IndexedQueryCandidate[] = [];
  const entriesById = new Map<string, SearchEntry<TValue>>();
  for (const entry of entries) {
    const id = yield* cleanWork(entry.id);
    if (id.length === 0) throw new TypeError('Search picker entry ids must not be empty.');
    if (seen.has(id)) throw new TypeError(`Search picker entry ids must be unique; duplicate id: ${id}`);
    seen.add(id);
    const keywords: string[] = [];
    for (const keyword of entry.keywords ?? []) keywords.push(yield* cleanWork(keyword));
    const value = Object.freeze({
      id, label: yield* cleanWork(entry.label), value: entry.value,
      ...(entry.description === undefined ? {} : { description: yield* cleanWork(entry.description) }),
      ...(entry.disabled === true ? { disabled: true } : {}),
      ...(entry.group === undefined ? {} : { group: yield* cleanWork(entry.group) }),
      ...(entry.preview === undefined ? {} : { preview: yield* cleanWork(entry.preview) }),
      ...(entry.keywords === undefined ? {} : { keywords: Object.freeze(keywords) }),
    });
    normalized.push(value);
    entriesById.set(id, value);
    const secondary = [id, ...(value.description === undefined ? [] : [value.description]), ...keywords];
    candidates.push(yield* indexQueryCandidateWork({ id, primary: value.label, secondary,
      ...(value.group === undefined ? {} : { group: value.group }),
    }));
    if (normalized.length % 256 === 0) yield;
  }
  const index = Object.freeze<SearchPickerIndex<TValue>>({
    [searchPickerIndexBrand]: undefined as TValue, kind: 'search-picker-index', size: normalized.length,
  });
  indexData.set(index, {
    entries: Object.freeze(normalized), entriesById, candidates: Object.freeze(candidates),
    queryResults: new Map(), queryEvaluations: 0, candidateEvaluations: 0,
  });
  return index;
}

export function searchPickerEntryById<TValue>(
  index: SearchPickerIndex<TValue>,
  id: string,
): SearchEntry<TValue> | undefined {
  return dataFor(index).entriesById.get(id);
}

export function querySearchPickerIndex<TValue>(
  index: SearchPickerIndex<TValue>,
  query: CollectionQuery = { text: '', mode: 'fuzzy' },
): SearchPickerQueryResult<TValue> {
  return finishWork(searchPickerQueryWork(index, query));
}

/** Prepare a query in cancellable chunks, including sorting and navigation indexing. */
export function prepareSearchPickerQuery<TValue>(
  index: SearchPickerIndex<TValue>,
  query: CollectionQuery,
  context: CooperativeWorkContext,
): Promise<SearchPickerQueryResult<TValue>> {
  return prepareWork(searchPickerQueryWork(index, query), context);
}

/** Validate caller-owned results without evaluating a missing query. */
export function matchingSearchPickerQuery<TValue>(
  index: SearchPickerIndex<TValue>,
  query: CollectionQuery,
  result: SearchPickerQueryResult<TValue> | null,
): SearchPickerQueryResult<TValue> | undefined {
  if (result === null) return undefined;
  if (!queryResultIdentities.has(result)) throw new TypeError('Search picker query results must be prepared by terminal-ui.');
  return result.searchPickerIndex === index
    && (sameCollectionQueryRequest(query, queryRequests.get(result))
      || sameCollectionQueryRequest(query, result.query)) ? result : undefined;
}

const queryRequests = new WeakMap<object, CollectionQuery>();
const queryResultIdentities = new WeakSet<object>();
const queryPositions = new WeakMap<object, ReadonlyMap<string, number>>();

export function searchPickerQueryPosition(result: SearchPickerQueryResult<unknown>, id: string): number | undefined {
  return queryPositions.get(result)?.get(id);
}

function* searchPickerQueryWork<TValue>(
  index: SearchPickerIndex<TValue>, query: CollectionQuery,
): Generator<void, SearchPickerQueryResult<TValue>> {
  const data = dataFor(index);
  const request = Object.freeze({ ...query });
  const normalizedQuery = yield* compileCollectionQueryWork(request);
  const cacheKey = `${normalizedQuery.mode}:${normalizedQuery.caseSensitive ? '1' : '0'}:${request.text}`;
  const cached = data.queryResults.get(cacheKey);
  if (cached !== undefined) {
    data.queryResults.delete(cacheKey);
    data.queryResults.set(cacheKey, cached);
    return cached;
  }
  data.queryEvaluations += 1;
  data.candidateEvaluations += normalizedQuery.text.length === 0 ? 0 : data.entries.length;
  const matches = yield* queryIndexedCandidatesWork(data.candidates, normalizedQuery);
  const entries: SearchEntry<TValue>[] = [];
  const enabledIds: string[] = [];
  const positions = new Map<string, number>();
  for (let position = 0; position < matches.length; position += 1) {
    const match = matches[position];
    const entry = match === undefined ? undefined : data.entriesById.get(match.id);
    if (entry !== undefined) {
      positions.set(entry.id, entries.length);
      entries.push(entry);
      if (entry.disabled !== true) enabledIds.push(entry.id);
    }
    if ((position + 1) % 256 === 0) yield;
  }
  const interactionIndex = yield* createCollectionInteractionIndexWork(enabledIds);
  const result = Object.freeze({
    kind: 'search-picker-query' as const,
    searchPickerIndex: index,
    query: normalizedQuery,
    entries: normalizedQuery.text.length === 0 ? data.entries : Object.freeze(entries),
    matches,
    interactionIndex,
  });
  queryRequests.set(result, request);
  queryResultIdentities.add(result);
  queryPositions.set(result, positions);
  data.queryResults.set(cacheKey, result);
  let retainedReferences = [...data.queryResults.values()]
    .reduce((total, entry) => total + entry.entries.length, 0);
  while (data.queryResults.size > 1
    && (data.queryResults.size > queryCacheLimit || retainedReferences > queryCacheReferenceLimit)) {
    const oldest = data.queryResults.entries().next().value;
    if (oldest === undefined) break;
    data.queryResults.delete(oldest[0]);
    retainedReferences -= oldest[1].entries.length;
  }
  return result;
}

export function assertSearchPickerIndex(value: unknown): asserts value is SearchPickerIndex<unknown> {
  if (!indexData.has(value as object)) {
    throw new TypeError('Search picker indexes must be created with createSearchPickerIndex().');
  }
}

export function searchPickerIndexStatistics(index: SearchPickerIndex<unknown>): {
  readonly entries: number;
  readonly cachedQueries: number;
  readonly queryEvaluations: number;
  readonly candidateEvaluations: number;
} {
  const data = dataFor(index);
  return Object.freeze({
    entries: data.entries.length,
    cachedQueries: data.queryResults.size,
    queryEvaluations: data.queryEvaluations,
    candidateEvaluations: data.candidateEvaluations
  });
}

function dataFor<TValue>(index: SearchPickerIndex<TValue>): SearchPickerIndexData<TValue> {
  const data = indexData.get(index) as SearchPickerIndexData<TValue> | undefined;
  if (data === undefined) throw new TypeError('Search picker indexes must be created with createSearchPickerIndex().');
  return data;
}

function* cleanWork(value: string): Generator<void, string> {
  const sanitized = yield* sanitizeTerminalTextWork(value);
  const text = sanitized.text;
  const parts: string[] = [];
  let retainedStart = 0;
  let whitespaceStart = -1;
  let newline = false;
  for (let offset = 0; offset <= text.length; offset += 1) {
    const character = text[offset];
    if (character !== undefined && /\s/u.test(character)) {
      if (whitespaceStart < 0) whitespaceStart = offset;
      if (character === '\n') newline = true;
    } else if (whitespaceStart >= 0) {
      if (newline) {
        parts.push(text.slice(retainedStart, whitespaceStart), ' ');
        retainedStart = offset;
      }
      whitespaceStart = -1;
      newline = false;
    }
    if ((offset + 1) % 2048 === 0) yield;
  }
  if (parts.length === 0) return text;
  parts.push(text.slice(retainedStart));
  return parts.join('');
}
