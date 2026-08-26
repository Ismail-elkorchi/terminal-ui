import { sanitizeTerminalText } from '../text/index.ts';
import type { SearchEntry } from '../collection/item.ts';
import { compileCollectionQuery, indexQueryCandidate, queryIndexedCandidates } from '../text/query.ts';
import { createCollectionInteractionIndex } from '../interaction/collection-interaction.ts';
import type { CollectionInteractionIndex } from '../interaction/collection-interaction.ts';
import type { CollectionQuery, CompiledCollectionQuery, IndexedQueryCandidate, QueryMatch } from '../text/query.ts';

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
    const index = buildSearchPickerIndex(source.map(toEntry));
    const cache = byMapper ?? new WeakMap<object, SearchPickerIndex<unknown>>();
    cache.set(toEntry, index);
    if (byMapper === undefined) mappedSourceIndexes.set(source, cache);
    return index;
  }
  const entries = source as readonly SearchEntry<TValue>[];
  const cached = sourceIndexes.get(entries) as SearchPickerIndex<TValue> | undefined;
  if (cached !== undefined) return cached;
  const index = buildSearchPickerIndex(entries);
  sourceIndexes.set(entries, index);
  return index;
}

function buildSearchPickerIndex<TValue>(
  entries: readonly SearchEntry<TValue>[],
): SearchPickerIndex<TValue> {
  const seen = new Set<string>();
  const normalized = Object.freeze(entries.map((entry): SearchEntry<TValue> => {
    const id = clean(entry.id);
    if (id.length === 0) throw new TypeError('Search picker entry ids must not be empty.');
    if (seen.has(id)) throw new TypeError(`Search picker entry ids must be unique; duplicate id: ${id}`);
    seen.add(id);
    return Object.freeze({
      id,
      label: clean(entry.label),
      value: entry.value,
      ...(entry.description === undefined ? {} : { description: clean(entry.description) }),
      ...(entry.disabled === true ? { disabled: true } : {}),
      ...(entry.group === undefined ? {} : { group: clean(entry.group) }),
      ...(entry.preview === undefined ? {} : { preview: clean(entry.preview) }),
      ...(entry.keywords === undefined ? {} : { keywords: Object.freeze(entry.keywords.map(clean)) })
    });
  }));
  const index = Object.freeze<SearchPickerIndex<TValue>>({
    [searchPickerIndexBrand]: undefined as TValue,
    kind: 'search-picker-index',
    size: normalized.length
  });
  const candidates = Object.freeze(normalized.map((entry) => indexQueryCandidate({
    id: entry.id,
    primary: entry.label,
    secondary: Object.freeze([
      entry.id,
      entry.description,
      ...(entry.keywords ?? []),
    ].filter((value): value is string => value !== undefined)),
    ...(entry.group === undefined ? {} : { group: entry.group }),
  })));
  const entriesById = new Map(normalized.map((entry) => [entry.id, entry] as const));
  indexData.set(index, {
    entries: normalized,
    entriesById,
    candidates,
    queryResults: new Map(),
    queryEvaluations: 0,
    candidateEvaluations: 0
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
  const data = dataFor(index);
  const normalizedQuery = compileCollectionQuery(query);
  const cacheKey = `${normalizedQuery.mode}:${normalizedQuery.caseSensitive ? '1' : '0'}:${normalizedQuery.text}`;
  const cached = data.queryResults.get(cacheKey);
  if (cached !== undefined) {
    data.queryResults.delete(cacheKey);
    data.queryResults.set(cacheKey, cached);
    return cached;
  }
  data.queryEvaluations += 1;
  data.candidateEvaluations += normalizedQuery.text.length === 0 ? 0 : data.entries.length;
  const matches = queryIndexedCandidates(data.candidates, normalizedQuery);
  const entries = normalizedQuery.text.length === 0
    ? data.entries
    : Object.freeze(matches.flatMap((match) => {
        const entry = data.entriesById.get(match.id);
        return entry === undefined ? [] : [entry];
      }));
  const result = Object.freeze({
    kind: 'search-picker-query' as const,
    searchPickerIndex: index,
    query: normalizedQuery,
    entries,
    matches,
    interactionIndex: createCollectionInteractionIndex(entries
      .filter((entry) => entry.disabled !== true)
      .map((entry) => entry.id)),
  });
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

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}
