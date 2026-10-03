import { snapshotArray } from '../foundation/array-snapshot.ts';
import { orderedItemByIdWork, createOrderedSourceWork, appendOrderedItemsWork, replaceOrderedItemWork, removeOrderedItemsWork, type OrderedSource } from '../foundation/ordered-source.ts';
import { finishWork, prepareWork, type CooperativeWorkContext } from '../foundation/cooperative-work.ts';
import type { SearchEntry } from '../collection/item.ts';
import type { CollectionInteractionIndex } from '../interaction/collection-interaction.ts';
import { createCollectionInteractionIndexFromSource, collectionInteractionOrderPosition, collectionInteractionIndexStorageBytes } from '../interaction/collection-interaction.ts';
import type {
  CollectionQuery,
  CompiledCollectionQuery,
  QueryMatch,
} from '../text/query.ts';
import {
  compileCollectionQueryWork,
  sameCollectionQueryRequest,
  ownCollectionQueryRequest,
  indexQueryFieldsWork,
  collectionQueryStorageBytes,
  queryIndexedCandidatesWork,
} from '../text/query.ts';
import { sanitizeTerminalTextWork } from '../text/sanitize.ts';

const searchPickerIndexBrand: unique symbol = Symbol('terminal-ui.search-picker-index');
const queryCacheLimit = 8;
const queryCacheByteLimit = 256 * 1024;

export interface SearchPickerIndex<TValue = string> {
  readonly [searchPickerIndexBrand]: TValue;
  readonly kind: 'search-picker-index';
  readonly size: number;
}

export interface SearchPickerQueryResult<TValue = string> {
  readonly kind: 'search-picker-query';
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly query: CompiledCollectionQuery;
  readonly count: number;
  readonly entryAt: (rank: number) => SearchEntry<TValue> | undefined;
  readonly window: (start: number, end: number) => readonly SearchEntry<TValue>[];
  /** Ranked highlights for nonempty queries; empty queries reuse source order without match records. */
  readonly matches: readonly QueryMatch[];
  readonly interactionIndex: CollectionInteractionIndex;
}

interface SearchPickerIndexData<TValue> {
  readonly order: OrderedSource<SearchEntry<TValue>>;
  readonly interactionIndex: CollectionInteractionIndex;
  readonly queryResults: Map<string, SearchPickerQueryResult<TValue>>;
  retainedQueryBytes: number;
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
    const index = finishWork(buildSearchPickerIndexWork(ownEntries(snapshotArray(source).map(toEntry))));
    const cache = byMapper ?? new WeakMap<object, SearchPickerIndex<unknown>>();
    cache.set(toEntry, index);
    if (byMapper === undefined) mappedSourceIndexes.set(source, cache);
    return index;
  }
  const entries = source as readonly SearchEntry<TValue>[];
  const cached = sourceIndexes.get(entries) as SearchPickerIndex<TValue> | undefined;
  if (cached !== undefined) return cached;
  const index = finishWork(buildSearchPickerIndexWork(ownEntries(entries)));
  sourceIndexes.set(entries, index);
  return index;
}

/** A version update preserves unaffected owned entries and their prepared search fields. */
export type SearchPickerIndexChange<TValue = string> =
  | { readonly kind: 'append' | 'replace'; readonly entry: SearchEntry<TValue> }
  | { readonly kind: 'remove'; readonly id: string };

const batchEntryLimit = 256;
const batchKeywordLimit = 1024;

/**
 * Read one bounded batch at a time. Each batch is validated and copied before any
 * yield; later batches are snapshots when consumed, not at this function call.
 * Batches contain at most 256 entries and 1024 keyword references in total.
 * Immutable strings have no length limit and are normalized/indexed cooperatively.
 * Producer callbacks and a single native string/grapheme operation are indivisible.
 */
export function prepareSearchPickerIndex<TValue>(
  batches: Iterable<readonly SearchEntry<TValue>[]>, context: CooperativeWorkContext,
): Promise<SearchPickerIndex<TValue>> {
  return prepareWork(buildSearchPickerIndexWork(ownEntryBatches(batches)), context);
}

export function updateSearchPickerIndex<TValue>(
  index: SearchPickerIndex<TValue>, changes: readonly SearchPickerIndexChange<TValue>[],
): SearchPickerIndex<TValue> {
  if (!Array.isArray(changes)) throw new TypeError('Search picker changes must be an array.');
  return finishWork(updateSearchPickerIndexWork(index, ownChanges(changes)));
}

/** Same immutable-version computation, with per-batch ownership and cancellation. */
export function prepareSearchPickerIndexUpdate<TValue>(
  index: SearchPickerIndex<TValue>,
  batches: Iterable<readonly SearchPickerIndexChange<TValue>[]>,
  context: CooperativeWorkContext,
): Promise<SearchPickerIndex<TValue>> {
  return prepareWork(updateSearchPickerIndexWork(index, ownChangeBatches(batches)), context);
}

function* ownEntries<TValue>(entries: readonly SearchEntry<TValue>[]): Generator<SearchEntry<TValue>> {
  for (const entry of snapshotArray(entries)) yield ownEntry(entry);
}

function* ownEntryBatches<TValue>(batches: Iterable<readonly SearchEntry<TValue>[]>): Generator<SearchEntry<TValue> | undefined> {
  for (const batch of batches) {
    const length = batchLength(batch);
    const budget = { keywords: 0 };
    const owned = snapshotArray(batch, length).map(entry => ownEntry<TValue>(entry, budget));
    yield* owned;
    yield undefined;
  }
}

function batchLength(batch: readonly unknown[]): number {
  if (!Array.isArray(batch)) throw new TypeError('Search picker batches must be arrays of at most 256 entries or changes.');
  const length = batch.length;
  if (length > batchEntryLimit) throw new TypeError('Search picker batches must be arrays of at most 256 entries or changes.');
  return length;
}

function ownEntry<TValue>(input: unknown, budget?: { keywords: number }): SearchEntry<TValue> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new TypeError('Search picker entry must be an object.');
  }
  const { id, label, value, description, disabled, group, preview, keywords } = input as Record<string, unknown>;
  if (typeof id !== 'string' || typeof label !== 'string') throw new TypeError('Search picker id and label must be strings.');
  for (const text of [description, group, preview]) {
    if (text !== undefined && typeof text !== 'string') throw new TypeError('Search picker text fields must be strings.');
  }
  if (disabled !== undefined && typeof disabled !== 'boolean') throw new TypeError('Search picker disabled must be a boolean.');
  let ownedKeywords: readonly string[] | undefined;
  if (keywords !== undefined) {
    if (!Array.isArray(keywords)) throw new TypeError('Search picker keywords must be an array of strings.');
    const length = keywords.length;
    if (budget !== undefined) {
      budget.keywords += length;
      if (budget.keywords > batchKeywordLimit) throw new TypeError('Search picker batches must contain at most 1024 keyword references; use smaller batches or fewer keyword fields.');
    }
    const copy: string[] = [];
    for (const keyword of snapshotArray(keywords, length)) {
      if (typeof keyword !== 'string') throw new TypeError('Search picker keywords must be strings.');
      copy.push(keyword);
    }
    ownedKeywords = Object.freeze(copy);
  }
  return Object.freeze({ id, label, value: value as TValue,
    ...(description === undefined ? {} : { description: description as string }),
    ...(disabled === undefined ? {} : { disabled }),
    ...(group === undefined ? {} : { group: group as string }),
    ...(preview === undefined ? {} : { preview: preview as string }),
    ...(ownedKeywords === undefined ? {} : { keywords: ownedKeywords }),
  });
}

function* ownChanges<TValue>(changes: readonly SearchPickerIndexChange<TValue>[]): Generator<SearchPickerIndexChange<TValue>> {
  for (const change of snapshotArray(changes)) yield ownChange(change);
}

function ownChange<TValue>(input: unknown, budget?: { keywords: number }): SearchPickerIndexChange<TValue> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) throw new TypeError('Search picker change must be an object.');
  const change = input as Record<string, unknown>;
  const kind = change['kind'];
  if (kind === 'append' || kind === 'replace') return Object.freeze({ kind, entry: ownEntry<TValue>(change['entry'], budget) });
  if (kind !== 'remove' || typeof change['id'] !== 'string') throw new TypeError('Search picker change must append, replace or remove an entry.');
  return Object.freeze({ kind, id: change['id'] });
}

function* ownChangeBatches<TValue>(batches: Iterable<readonly SearchPickerIndexChange<TValue>[]>): Generator<SearchPickerIndexChange<TValue> | undefined> {
  for (const batch of batches) {
    const length = batchLength(batch);
    const budget = { keywords: 0 };
    const owned = snapshotArray(batch, length).map(change => ownChange<TValue>(change, budget));
    yield* owned;
    yield undefined;
  }
}

function* normalizeEntryWork<TValue>(entry: SearchEntry<TValue>): Generator<number, SearchEntry<TValue>> {
  const id = yield* cleanWork(entry.id);
  if (id.trim().length === 0) throw new TypeError('Search picker entry ids must not be empty.');
  const keywords: string[] = [];
  for (const keyword of entry.keywords ?? []) {
    keywords.push(yield* cleanWork(keyword));
    yield 1;
  }
  const value = Object.freeze({
    id, label: yield* cleanWork(entry.label), value: entry.value,
    ...(entry.description === undefined ? {} : { description: yield* cleanWork(entry.description) }),
    ...(entry.disabled === true ? { disabled: true } : {}),
    ...(entry.group === undefined ? {} : { group: yield* cleanWork(entry.group) }),
    ...(entry.preview === undefined ? {} : { preview: yield* cleanWork(entry.preview) }),
    ...(entry.keywords === undefined ? {} : { keywords: Object.freeze(keywords) }),
  });
  yield* indexQueryFieldsWork(value, entryFields(value));
  return value;
}

function* buildSearchPickerIndexWork<TValue>(
  entries: Iterable<SearchEntry<TValue> | undefined>,
): Generator<number, SearchPickerIndex<TValue>> {
  function* events() {
    for (const entry of entries) {
      if (entry === undefined) { yield 1; continue; }
      const value = yield* normalizeEntryWork(entry);
      yield { id: value.id, value, disabled: value.disabled === true };
      yield 1;
    }
  }
  return registerIndex(yield* createOrderedSourceWork(events()));
}

function registerIndex<TValue>(order: OrderedSource<SearchEntry<TValue>>): SearchPickerIndex<TValue> {
  const index = Object.freeze<SearchPickerIndex<TValue>>({
    [searchPickerIndexBrand]: undefined as TValue, kind: 'search-picker-index', size: order.count,
  });
  indexData.set(index, {
    order, interactionIndex: createCollectionInteractionIndexFromSource(order),
    queryResults: new Map(), retainedQueryBytes: 0, queryEvaluations: 0, candidateEvaluations: 0,
  });
  return index;
}

function* updateSearchPickerIndexWork<TValue>(
  index: SearchPickerIndex<TValue>, changes: Iterable<SearchPickerIndexChange<TValue> | undefined>,
): Generator<number, SearchPickerIndex<TValue>> {
  let order = dataFor(index).order;
  const previous = order;
  for (const change of changes) {
    if (change === undefined) { yield 1; continue; }
    const entry = change.kind === 'remove' ? undefined : yield* normalizeEntryWork(change.entry);
    const id = entry?.id ?? (yield* cleanWork((change as { readonly id: string }).id));
    const prior = yield* orderedItemByIdWork(order, id);
    if (change.kind === 'append' ? prior !== undefined : prior === undefined) {
      throw new TypeError(change.kind === 'append'
        ? `Search picker entry ids must be unique; duplicate id: ${id}`
        : `Search picker ${change.kind} id must identify an existing entry: ${id}`);
    }
    if (entry === undefined) order = yield* removeOrderedItemsWork(order, [id]);
    else if (change.kind === 'append') order = yield* appendOrderedItemsWork(order, [{ id, value: entry, disabled: entry.disabled === true }]);
    else order = yield* replaceOrderedItemWork(order, { id, value: entry, disabled: entry.disabled === true });
    yield 1;
  }
  return order === previous ? index : registerIndex(order);
}

function* entryFields(entry: SearchEntry<unknown>): Generator<string> {
  yield entry.label;
  yield entry.id;
  if (entry.description !== undefined) yield entry.description;
  yield* entry.keywords ?? [];
}

export function searchPickerEntryById<TValue>(
  index: SearchPickerIndex<TValue>,
  id: string,
): SearchEntry<TValue> | undefined {
  return dataFor(index).order.itemById(id);
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
const queryStorage = new WeakMap<object, number>();
const emptyMatches: readonly QueryMatch[] = Object.freeze([]);

export function searchPickerQueryPosition(result: SearchPickerQueryResult<unknown>, id: string): number | undefined {
  return collectionInteractionOrderPosition(result.interactionIndex, id);
}

function* searchPickerQueryWork<TValue>(
  index: SearchPickerIndex<TValue>, query: CollectionQuery,
): Generator<number, SearchPickerQueryResult<TValue>> {
  const data = dataFor(index);
  const request = ownCollectionQueryRequest(query);
  const normalizedQuery = yield* compileCollectionQueryWork(request);
  const cacheKey = `${normalizedQuery.mode}:${normalizedQuery.caseSensitive ? '1' : '0'}:${request.text}`;
  const cached = data.queryResults.get(cacheKey);
  if (cached !== undefined) {
    data.queryResults.delete(cacheKey);
    data.queryResults.set(cacheKey, cached);
    return cached;
  }
  data.queryEvaluations += 1;
  data.candidateEvaluations += normalizedQuery.text.length === 0 ? 0 : data.order.count;
  const empty = normalizedQuery.text.length === 0;
  const matches = empty ? emptyMatches : yield* queryIndexedCandidatesWork(data.order.values(), normalizedQuery);
  let order = data.order;
  let interactionIndex = data.interactionIndex;
  let storageBytes = cacheKey.length * 2 + request.text.length * 2 + collectionQueryStorageBytes(normalizedQuery) + 128;
  if (!empty) {
    function* rankedItems() {
      for (const match of matches) {
        const entry = yield* orderedItemByIdWork(data.order, match.id);
        if (entry !== undefined) yield { id: entry.id, value: entry, disabled: entry.disabled === true };
        storageBytes += 48 + match.ranges.length * 48;
        yield 1;
      }
    }
    order = yield* createOrderedSourceWork(rankedItems());
    interactionIndex = createCollectionInteractionIndexFromSource(order);
    storageBytes += collectionInteractionIndexStorageBytes(interactionIndex);
  }
  // Matching and order construction yield; a concurrent reader can have
  // admitted this same immutable result since our initial cache lookup.
  const admitted = data.queryResults.get(cacheKey);
  if (admitted !== undefined) {
    data.queryResults.delete(cacheKey);
    data.queryResults.set(cacheKey, admitted);
    return admitted;
  }
  const result = Object.freeze({
    kind: 'search-picker-query' as const,
    searchPickerIndex: index,
    query: normalizedQuery,
    count: order.count, entryAt: order.itemAt, window: order.window,
    matches,
    interactionIndex,
  });
  queryRequests.set(result, request);
  queryResultIdentities.add(result);
  if (storageBytes <= queryCacheByteLimit) {
    queryStorage.set(result, storageBytes);
    data.queryResults.set(cacheKey, result);
    data.retainedQueryBytes += storageBytes;
    while (data.queryResults.size > queryCacheLimit || data.retainedQueryBytes > queryCacheByteLimit) {
      const oldest = data.queryResults.entries().next().value;
      if (oldest === undefined) break;
      data.queryResults.delete(oldest[0]);
      data.retainedQueryBytes -= queryStorage.get(oldest[1]) ?? 0;
    }
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
  readonly retainedQueryBytes: number;
  readonly queryCacheByteLimit: number;
  readonly queryEvaluations: number;
  readonly candidateEvaluations: number;
} {
  const data = dataFor(index);
  return Object.freeze({
    entries: data.order.count,
    cachedQueries: data.queryResults.size,
    retainedQueryBytes: data.retainedQueryBytes,
    queryCacheByteLimit,
    queryEvaluations: data.queryEvaluations,
    candidateEvaluations: data.candidateEvaluations
  });
}

function dataFor<TValue>(index: SearchPickerIndex<TValue>): SearchPickerIndexData<TValue> {
  const data = indexData.get(index) as SearchPickerIndexData<TValue> | undefined;
  if (data === undefined) throw new TypeError('Search picker indexes must be created with createSearchPickerIndex().');
  return data;
}

const whitespaceCharacter = /\s/u;

function* cleanWork(value: string): Generator<number, string> {
  const sanitized = yield* sanitizeTerminalTextWork(value);
  const text = sanitized.text;
  const parts: string[] = [];
  let retainedStart = 0;
  let whitespaceStart = -1;
  let newline = false;
  for (let offset = 0; offset <= text.length; offset += 1) {
    const character = text[offset];
    if (character !== undefined && whitespaceCharacter.test(character)) {
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
    if ((offset + 1) % 256 === 0) yield 256;
  }
  yield (text.length + 1) % 256;
  if (parts.length === 0) return text;
  parts.push(text.slice(retainedStart));
  return parts.join('');
}

/** Explicit O(result count) materialization for exports and deliberate eager consumers. */
export function searchPickerQueryEntries<T>(result: SearchPickerQueryResult<T>): readonly SearchEntry<T>[] {
  return result.window(0, result.count);
}
