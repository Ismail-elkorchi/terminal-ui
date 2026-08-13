import { sanitizeTerminalText } from '../text/index.ts';
import type { SearchEntry } from './contracts.ts';
import { normalizeCollectionQuery, queryNormalizedCandidates } from './query.ts';
import type { CollectionQuery, QueryMatch } from './query.ts';

const searchPickerIndexBrand: unique symbol = Symbol('terminal-ui.search-picker-index');
const queryCacheLimit = 32;

export interface SearchPickerIndex<TValue = string> {
  readonly [searchPickerIndexBrand]: TValue;
  readonly kind: 'search-picker-index';
  readonly size: number;
}

export interface SearchPickerQueryResult<TValue = string> {
  readonly kind: 'search-picker-query';
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly query: Required<CollectionQuery>;
  readonly entries: readonly SearchEntry<TValue>[];
  readonly matches: readonly QueryMatch[];
}

interface SearchPickerIndexData<TValue> {
  readonly entries: readonly SearchEntry<TValue>[];
  readonly candidates: readonly import('./query.ts').QueryCandidate[];
  readonly queryResults: Map<string, SearchPickerQueryResult<TValue>>;
  queryEvaluations: number;
  candidateEvaluations: number;
}

const sourceIndexes = new WeakMap<object, SearchPickerIndex<unknown>>();
const indexData = new WeakMap<object, SearchPickerIndexData<unknown>>();

export function prepareSearchPickerIndex<TValue>(entries: readonly SearchEntry<TValue>[]): SearchPickerIndex<TValue> {
  const cached = sourceIndexes.get(entries) as SearchPickerIndex<TValue> | undefined;
  if (cached !== undefined) return cached;
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
  const candidates = Object.freeze(normalized.map((entry) => Object.freeze({
    id: entry.id,
    primary: entry.label,
    secondary: Object.freeze([
      entry.id,
      entry.description,
      ...(entry.keywords ?? []),
    ].filter((value): value is string => value !== undefined)),
    ...(entry.group === undefined ? {} : { group: entry.group }),
  })));
  indexData.set(index, {
    entries: normalized,
    candidates,
    queryResults: new Map(),
    queryEvaluations: 0,
    candidateEvaluations: 0
  });
  sourceIndexes.set(entries, index);
  return index;
}

export function querySearchPickerIndex<TValue>(
  index: SearchPickerIndex<TValue>,
  query: CollectionQuery = { text: '', mode: 'fuzzy' },
): SearchPickerQueryResult<TValue> {
  const data = dataFor(index);
  const normalizedQuery = normalizeCollectionQuery(query);
  const cacheKey = `${normalizedQuery.mode}:${normalizedQuery.caseSensitive ? '1' : '0'}:${normalizedQuery.text}`;
  const cached = data.queryResults.get(cacheKey);
  if (cached !== undefined) {
    data.queryResults.delete(cacheKey);
    data.queryResults.set(cacheKey, cached);
    return cached;
  }
  data.queryEvaluations += 1;
  data.candidateEvaluations += normalizedQuery.text.length === 0 ? 0 : data.entries.length;
  const matches = queryNormalizedCandidates(data.candidates, normalizedQuery);
  const entriesById = new Map(data.entries.map((entry) => [entry.id, entry] as const));
  const entries = normalizedQuery.text.length === 0
    ? data.entries
    : Object.freeze(matches.flatMap((match) => {
        const entry = entriesById.get(match.id);
        return entry === undefined ? [] : [entry];
      }));
  const result = Object.freeze({
    kind: 'search-picker-query' as const,
    searchPickerIndex: index,
    query: normalizedQuery,
    entries,
    matches,
  });
  data.queryResults.set(cacheKey, result);
  if (data.queryResults.size > queryCacheLimit) {
    const oldest = data.queryResults.keys().next().value;
    if (oldest !== undefined) data.queryResults.delete(oldest);
  }
  return result;
}

export function assertSearchPickerIndex(value: unknown): asserts value is SearchPickerIndex<unknown> {
  if (typeof value !== 'object' || value === null || !indexData.has(value)) {
    throw new TypeError('Search picker indexes must be created with prepareSearchPickerIndex().');
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
  if (data === undefined) throw new TypeError('Search picker indexes must be created with prepareSearchPickerIndex().');
  return data;
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}
