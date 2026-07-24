import { sanitizeTerminalText } from '../text/index.ts';
import type { SearchEntry } from './contracts.ts';

const searchPickerIndexBrand: unique symbol = Symbol('terminal-ui.search-picker-index');
const queryCacheLimit = 32;

export interface SearchPickerIndex<TValue = string> {
  readonly [searchPickerIndexBrand]: TValue;
  readonly kind: 'search-picker-index';
  readonly size: number;
}

export interface SearchPickerQueryProjection<TValue = string> {
  readonly kind: 'search-picker-query';
  readonly searchPickerIndex: SearchPickerIndex<TValue>;
  readonly query: string;
  readonly entries: readonly SearchEntry<TValue>[];
}

interface SearchPickerIndexData<TValue> {
  readonly entries: readonly SearchEntry<TValue>[];
  readonly searchable: readonly (readonly string[])[];
  readonly projections: Map<string, SearchPickerQueryProjection<TValue>>;
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
  const searchable = Object.freeze(normalized.map((entry) => Object.freeze([
    entry.label,
    entry.id,
    entry.description,
    ...(entry.keywords ?? [])
  ].filter((value): value is string => value !== undefined).map((value) => value.toLocaleLowerCase()))));
  indexData.set(index, {
    entries: normalized,
    searchable,
    projections: new Map(),
    queryEvaluations: 0,
    candidateEvaluations: 0
  });
  sourceIndexes.set(entries, index);
  return index;
}

export function projectSearchPickerQuery<TValue>(
  index: SearchPickerIndex<TValue>,
  query = ''
): SearchPickerQueryProjection<TValue> {
  const data = dataFor(index);
  const normalizedQuery = clean(query).trim().toLocaleLowerCase();
  const cached = data.projections.get(normalizedQuery);
  if (cached !== undefined) {
    data.projections.delete(normalizedQuery);
    data.projections.set(normalizedQuery, cached);
    return cached;
  }
  data.queryEvaluations += 1;
  data.candidateEvaluations += normalizedQuery.length === 0 ? 0 : data.entries.length;
  const entries = normalizedQuery.length === 0
    ? data.entries
    : Object.freeze(data.entries
        .map((entry, sourceIndex) => ({
          entry,
          sourceIndex,
          score: entryScore(data.searchable[sourceIndex] ?? [], normalizedQuery)
        }))
        .filter((result): result is typeof result & { readonly score: number } => result.score !== undefined)
        .sort((left, right) => left.score - right.score || left.sourceIndex - right.sourceIndex)
        .map((result) => result.entry));
  const projection = Object.freeze({
    kind: 'search-picker-query' as const,
    searchPickerIndex: index,
    query: normalizedQuery,
    entries
  });
  data.projections.set(normalizedQuery, projection);
  if (data.projections.size > queryCacheLimit) {
    const oldest = data.projections.keys().next().value;
    if (oldest !== undefined) data.projections.delete(oldest);
  }
  return projection;
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
    cachedQueries: data.projections.size,
    queryEvaluations: data.queryEvaluations,
    candidateEvaluations: data.candidateEvaluations
  });
}

function dataFor<TValue>(index: SearchPickerIndex<TValue>): SearchPickerIndexData<TValue> {
  const data = indexData.get(index) as SearchPickerIndexData<TValue> | undefined;
  if (data === undefined) throw new TypeError('Search picker indexes must be created with prepareSearchPickerIndex().');
  return data;
}

function entryScore(haystacks: readonly string[], query: string): number | undefined {
  let best: number | undefined;
  for (const haystack of haystacks) {
    const score = textScore(haystack, query);
    if (score !== undefined && (best === undefined || score < best)) best = score;
  }
  return best;
}

function textScore(text: string, query: string): number | undefined {
  if (text === query) return 0;
  if (text.startsWith(query)) return 1;
  const includes = text.indexOf(query);
  if (includes !== -1) return 10 + includes;
  let offset = 0;
  let score = 100;
  for (const character of query) {
    const found = text.indexOf(character, offset);
    if (found === -1) return undefined;
    score += found - offset;
    offset = found + 1;
  }
  return score;
}

function clean(value: string): string {
  return sanitizeTerminalText(value).text.replace(/\s*\n\s*/gu, ' ');
}
