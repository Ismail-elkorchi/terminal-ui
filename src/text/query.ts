import { isNonArrayObject } from '../foundation/validation.ts';
import { finishWork, stableSortWork } from '../foundation/cooperative-work.ts';
import { sanitizeTerminalTextWork } from './sanitize.ts';
import type { CompiledTextSearchQuery, TextSearchIndex, TextSearchTokens } from './search-index.ts';
import {
  compileTextSearchQueryWork,
  createTextSearchIndexWork,
  textSearchOffset,
  textTokenMatchEvents,
  foldTextSearchTokensWork,
} from './search-index.ts';

export type QueryMatchMode = 'contains' | 'prefix' | 'exact' | 'fuzzy';

export interface CollectionQuery {
  readonly text: string;
  readonly mode?: QueryMatchMode;
  readonly caseSensitive?: boolean;
}

export interface CompiledCollectionQuery {
  readonly kind: 'compiled-collection-query';
  readonly text: string;
  readonly mode: QueryMatchMode;
  readonly caseSensitive: boolean;
}

export interface QueryCandidate {
  readonly id: string;
  readonly primary: string;
  readonly secondary?: readonly string[];
  readonly group?: string;
}

export interface IndexedQueryCandidate extends QueryCandidate {
  readonly kind: 'indexed-query-candidate';
}

export interface QueryMatch {
  readonly id: string;
  readonly score: number;
  readonly ranges: readonly QueryMatchRange[];
  readonly group?: string;
}

export interface QueryMatchRange {
  readonly field: 'primary' | 'secondary';
  readonly fieldIndex: number;
  /** UTF-16 offset aligned to a grapheme boundary in the original field. */
  readonly start: number;
  /** Exclusive UTF-16 offset aligned to a grapheme boundary in the original field. */
  readonly end: number;
}

interface QueryIndexOwner {
  readonly id: string;
  readonly group?: string;
}

interface QueryCandidateIndex {
  readonly fields: readonly TextSearchIndex[];
  readonly folded: (TextSearchTokens | undefined)[];
  readonly boundedAscii: boolean;
}

interface CompiledQueryData {
  readonly search: CompiledTextSearchQuery;
}

const queryCandidateIndexes = new WeakMap<object, QueryCandidateIndex>();
const canonicalQueries = new Map<string, CompiledCollectionQuery>();
let canonicalQueryWeight = 0;
const compiledQueries = new WeakMap<object, CompiledQueryData>();

/** Compare owned request descriptors without compiling or walking source content. */
export function sameCollectionQueryRequest(left: CollectionQuery | undefined, right: CollectionQuery | undefined): boolean {
  return (left?.text ?? '') === (right?.text ?? '')
    && (left?.mode ?? 'contains') === (right?.mode ?? 'contains')
    && (left?.caseSensitive === true) === (right?.caseSensitive === true);
}

export function compileCollectionQuery(query: CollectionQuery): CompiledCollectionQuery;
export function compileCollectionQuery(query: unknown): CompiledCollectionQuery {
  return finishWork(compileCollectionQueryWork(query));
}

export function* compileCollectionQueryWork(query: unknown): Generator<void, CompiledCollectionQuery> {
  if (isNonArrayObject(query) && compiledQueries.has(query)) {
    return query as unknown as CompiledCollectionQuery;
  }
  const { text, mode, caseSensitive } = ownCollectionQueryRequest(query);
  const normalizedText = yield* normalizedQueryTextWork(text);
  const sensitive = caseSensitive;
  const key = `${mode}:${sensitive ? '1' : '0'}:${normalizedText}`;
  const cached = canonicalQueries.get(key);
  if (cached !== undefined) return cached;
  const search = yield* compileTextSearchQueryWork(normalizedText, { caseSensitive: sensitive });
  // Another preparer or synchronous reader can admit this key while we yield.
  // Reuse its canonical owner instead of counting replacement storage twice.
  const admitted = canonicalQueries.get(key);
  if (admitted !== undefined) return admitted;
  const indexed = Object.freeze({
    kind: 'compiled-collection-query' as const,
    text: normalizedText,
    mode,
    caseSensitive: sensitive
  });
  compiledQueries.set(indexed, Object.freeze({ search }));
  if (key.length <= 4096) {
    canonicalQueries.set(key, indexed);
    canonicalQueryWeight += key.length * 2 + collectionQueryStorageBytes(indexed);
    while (canonicalQueries.size > 256 || canonicalQueryWeight > 65536) {
      const oldest = canonicalQueries.keys().next().value;
      if (oldest === undefined) break;
      const removed = canonicalQueries.get(oldest);
      canonicalQueries.delete(oldest);
      canonicalQueryWeight -= oldest.length * 2 + (removed === undefined ? 0 : collectionQueryStorageBytes(removed));
    }
  }
  return indexed;
}

function* normalizedQueryTextWork(text: string): Generator<void, string> {
  const sanitized = (yield* sanitizeTerminalTextWork(text)).text;
  let start = 0;
  let end = sanitized.length;
  while (start < end && /\s/u.test(sanitized[start] ?? '')) {
    start += 1;
    if (start % 2048 === 0) yield;
  }
  while (end > start && /\s/u.test(sanitized[end - 1] ?? '')) {
    end -= 1;
    if ((sanitized.length - end) % 2048 === 0) yield;
  }
  return sanitized.slice(start, end);
}

/** Shared compiled text representation for domain query adapters. */
export function collectionQuerySearch(query: CompiledCollectionQuery): CompiledTextSearchQuery {
  const data = compiledQueries.get(query);
  if (data === undefined) throw new TypeError('query must be created by compileCollectionQuery().');
  return data.search;
}

/** Conservative retained storage units, including compiled tokens and failure indexes. */
export function collectionQueryStorageBytes(query: CompiledCollectionQuery): number {
  const search = collectionQuerySearch(query);
  // Three UTF-16 units per source unit also covers expanding lowercase mappings.
  // Charge token slots conservatively even when the compact ASCII string is used.
  return 64 + query.text.length * 8 + search.graphemes.length * 8 + search.failure.byteLength;
}

export function indexQueryCandidate(candidate: QueryCandidate): IndexedQueryCandidate;
export function indexQueryCandidate(candidate: unknown): IndexedQueryCandidate {
  return finishWork(indexQueryCandidateWork(candidate));
}

export function* indexQueryCandidateWork(candidate: unknown): Generator<void, IndexedQueryCandidate> {
  if (isIndexedQueryCandidate(candidate)) return candidate;
  assertQueryCandidate(candidate);
  const secondary = candidate.secondary === undefined ? undefined : Object.freeze([...candidate.secondary]);
  const indexed = Object.freeze({
    kind: 'indexed-query-candidate' as const, id: candidate.id, primary: candidate.primary,
    ...(secondary === undefined ? {} : { secondary }),
    ...(candidate.group === undefined ? {} : { group: candidate.group }),
  });
  yield* indexQueryFieldsWork(indexed, [indexed.primary, ...(indexed.secondary ?? [])]);
  return indexed;
}

/** Register fields on the existing domain owner, without a second candidate descriptor. */
export function* indexQueryFieldsWork(owner: QueryIndexOwner, fields: Iterable<string>): Generator<void, void> {
  const indexes: TextSearchIndex[] = [];
  let boundedAscii = true;
  for (const text of fields) {
    if (typeof text !== 'string') throw new TypeError('query candidate fields must be strings.');
    const index = yield* createTextSearchIndexWork(text, { caseSensitive: true });
    indexes.push(index);
    boundedAscii &&= typeof index.graphemes === 'string' && text.length <= 256;
    if (indexes.length % 256 === 0) yield;
  }
  queryCandidateIndexes.set(owner, { fields: Object.freeze(indexes), folded: [],
    boundedAscii: boundedAscii && indexes.length <= 8 });
}

export function matchCollectionQuery(
  candidate: QueryCandidate,
  query: CollectionQuery,
): QueryMatch | undefined {
  return matchCompiledCollectionQuery(
    indexQueryCandidate(candidate),
    compileCollectionQuery(query)
  );
}

export function matchCompiledCollectionQuery(
  candidate: IndexedQueryCandidate,
  query: CompiledCollectionQuery,
): QueryMatch | undefined {
  return finishWork(matchCompiledCollectionQueryWork(candidate, query));
}

export function* matchCompiledCollectionQueryWork(
  candidate: QueryIndexOwner, query: CompiledCollectionQuery,
): Generator<void, QueryMatch | undefined> {
  const candidateData = queryCandidateIndexes.get(candidate);
  if (candidateData === undefined) throw new TypeError('candidate must be created by indexQueryCandidate().');
  const queryData = compiledQueries.get(query);
  if (queryData === undefined) throw new TypeError('query must be created by compileCollectionQuery().');
  const bounded = boundedCandidateMatch(candidate, candidateData, query, queryData.search);
  if (bounded !== unboundedMatch) return bounded;
  if (queryData.search.graphemes.length === 0) return queryMatch(candidate, 0, []);

  const maximumScore = query.mode === 'exact' ? 1000 : query.mode === 'contains' ? 600
    : query.mode === 'prefix' ? 800 - queryData.search.graphemes.length
      : 400 - Math.max(0, queryData.search.graphemes.length - 1);
  let best: { readonly score: number; readonly indexes: readonly number[]; readonly fieldIndex: number } | undefined;
  for (const [fieldIndex, field] of candidateData.fields.entries()) {
    const haystack = query.caseSensitive ? field.graphemes
      : candidateData.folded[fieldIndex] ??= yield* foldTextSearchTokensWork(field);
    const match = typeof haystack === 'string' && typeof queryData.search.graphemes === 'string'
      && haystack.length <= 2048 && queryData.search.graphemes.length <= 32
      ? matchBoundedAscii(haystack, queryData.search.graphemes, query.mode)
      : yield* matchGraphemesWork(haystack, queryData.search, query.mode);
    if (match !== undefined && (best === undefined || match.score > best.score)) {
      best = { ...match, fieldIndex };
      if (best.score >= maximumScore) break;
    }
  }
  if (best === undefined) return undefined;
  return queryMatch(
    candidate,
    best.score,
    yield* rangesForIndexesWork(candidateData.fields[best.fieldIndex], best.fieldIndex, best.indexes)
  );
}

export function queryCandidates(
  candidates: readonly QueryCandidate[],
  query: CollectionQuery,
): readonly QueryMatch[] {
  if (!Array.isArray(candidates)) throw new TypeError('query candidates must be an array.');
  const indexed = candidates.map((candidate, index) => {
    assertQueryCandidate(candidate, index);
    return indexQueryCandidate(candidate);
  });
  return queryIndexedCandidates(indexed, compileCollectionQuery(query));
}

export function queryIndexedCandidates(
  candidates: readonly IndexedQueryCandidate[],
  query: CompiledCollectionQuery,
): readonly QueryMatch[] {
  const work = queryIndexedCandidatesWork(candidates, query);
  let step = work.next();
  while (!step.done) step = work.next();
  return step.value;
}

/** Cooperative scan and stable merge sort; no full-result native sort. */
export function* queryIndexedCandidatesWork(
  candidates: readonly QueryIndexOwner[],
  query: CompiledCollectionQuery,
): Generator<void, readonly QueryMatch[]> {
  const matches: QueryMatch[] = [];
  let ordered = true;
  let previousScore = Number.POSITIVE_INFINITY;
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    if (candidate !== undefined) {
      const data = queryCandidateIndexes.get(candidate);
      const search = compiledQueries.get(query)?.search;
      if (data === undefined || search === undefined) throw new TypeError('Candidate and query must be indexed.');
      const bounded = boundedCandidateMatch(candidate, data, query, search);
      const match = bounded === unboundedMatch ? yield* matchCompiledCollectionQueryWork(candidate, query) : bounded;
      if (match !== undefined) {
        if (match.score > previousScore) ordered = false;
        previousScore = match.score;
        matches.push(match);
      }
    }
    if ((index + 1) % 256 === 0) yield;
  }
  if (ordered) return Object.freeze(matches);
  return Object.freeze(yield* stableSortWork(matches, (left, right) => right.score - left.score));
}

/** Locale-independent ordering for built-in collection behavior. */
export function compareCollectionText(
  left: string,
  right: string,
  options: { readonly numeric?: boolean } = {},
): number {
  if (typeof left !== 'string' || typeof right !== 'string') {
    throw new TypeError('collection text comparison requires strings.');
  }
  if (options.numeric !== true) return codeUnitComparison(left, right);
  const leftParts = left.match(/\d+|\D+/gu) ?? [];
  const rightParts = right.match(/\d+|\D+/gu) ?? [];
  for (let index = 0; index < Math.max(leftParts.length, rightParts.length); index += 1) {
    const leftPart = leftParts[index];
    const rightPart = rightParts[index];
    if (leftPart === undefined || rightPart === undefined) return leftPart === rightPart ? 0 : leftPart === undefined ? -1 : 1;
    if (/^\d+$/u.test(leftPart) && /^\d+$/u.test(rightPart)) {
      const leftSignificant = leftPart.replace(/^0+(?=\d)/u, '');
      const rightSignificant = rightPart.replace(/^0+(?=\d)/u, '');
      if (leftSignificant.length !== rightSignificant.length) {
        return leftSignificant.length < rightSignificant.length ? -1 : 1;
      }
      const numeric = codeUnitComparison(leftSignificant, rightSignificant);
      if (numeric !== 0) return numeric;
    }
    const lexical = codeUnitComparison(leftPart, rightPart);
    if (lexical !== 0) return lexical;
  }
  return 0;
}

function codeUnitComparison(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isIndexedQueryCandidate(value: unknown): value is IndexedQueryCandidate {
  return isNonArrayObject(value) && queryCandidateIndexes.has(value);
}

function assertQueryCandidate(candidate: unknown, index?: number): asserts candidate is QueryCandidate {
  const label = index === undefined ? 'query candidate' : `query candidate ${String(index)}`;
  if (!isNonArrayObject(candidate)) throw new TypeError(`${label} must be an object.`);
  if (typeof candidate['id'] !== 'string' || typeof candidate['primary'] !== 'string') {
    throw new TypeError(`${label} id and primary must be strings.`);
  }
  if (candidate['secondary'] !== undefined && (
    !Array.isArray(candidate['secondary'])
    || candidate['secondary'].some((value) => typeof value !== 'string')
  )) {
    throw new TypeError(`${label} secondary must be an array of strings.`);
  }
  if (candidate['group'] !== undefined && typeof candidate['group'] !== 'string') {
    throw new TypeError(`${label} group must be a string.`);
  }
}

const unboundedMatch = Symbol('unbounded-match');
function boundedCandidateMatch(candidate: QueryIndexOwner, data: QueryCandidateIndex,
  query: CompiledCollectionQuery, search: CompiledTextSearchQuery): QueryMatch | undefined | typeof unboundedMatch {
  if (!data.boundedAscii || typeof search.graphemes !== 'string' || search.graphemes.length > 32) return unboundedMatch;
  if (search.graphemes.length === 0) return queryMatch(candidate, 0, []);
  let best: { readonly score: number; readonly indexes: readonly number[]; readonly fieldIndex: number } | undefined;
  const maximum = query.mode === 'exact' ? 1000 : query.mode === 'contains' ? 600
    : query.mode === 'prefix' ? 800 - search.graphemes.length : 401 - search.graphemes.length;
  for (let fieldIndex = 0; fieldIndex < data.fields.length; fieldIndex += 1) {
    const field = data.fields[fieldIndex];
    if (field === undefined) continue;
    const text = query.caseSensitive ? field.graphemes : data.folded[fieldIndex] ??= (field.graphemes as string).toLowerCase();
    const match = matchBoundedAscii(text as string, search.graphemes, query.mode);
    if (match !== undefined && (best === undefined || match.score > best.score)) {
      best = { ...match, fieldIndex };
      if (best.score >= maximum) break;
    }
  }
  if (best === undefined) return undefined;
  return queryMatch(candidate, best.score, finishWork(rangesForIndexesWork(data.fields[best.fieldIndex], best.fieldIndex, best.indexes)));
}

/** Native ASCII specialization within the same computation, capped by both input dimensions. */
function matchBoundedAscii(text: string, needle: string, mode: QueryMatchMode): { readonly score: number; readonly indexes: readonly number[] } | undefined {
  if (mode === 'fuzzy') {
    const indexes: number[] = [];
    let cursor = 0;
    for (const character of needle) {
      const found = text.indexOf(character, cursor);
      if (found < 0) return undefined;
      indexes.push(found);
      cursor = found + 1;
    }
    return { score: 400 - ((indexes.at(-1) ?? 0) - (indexes[0] ?? 0)), indexes };
  }
  const start = mode === 'contains' ? text.indexOf(needle)
    : mode === 'prefix' ? (text.startsWith(needle) ? 0 : -1)
      : text === needle ? 0 : -1;
  if (start < 0) return undefined;
  const score = mode === 'contains' ? 600 - start : mode === 'prefix' ? 800 - text.length : 1000;
  return { score, indexes: Array.from({ length: needle.length }, (_, index) => start + index) };
}

function* matchGraphemesWork(
  text: TextSearchTokens, query: CompiledTextSearchQuery, mode: QueryMatchMode,
): Generator<void, { readonly score: number; readonly indexes: readonly number[] } | undefined> {
  const needle = query.graphemes;
  const indexes: number[] = [];
  let operations = 0;
  if (needle.length > text.length || (mode === 'exact' && text.length !== needle.length)) return undefined;
  if (mode === 'exact' || mode === 'prefix') {
    for (let i = 0; i < needle.length; i += 1) {
      if (text[i] !== needle[i]) return undefined;
      indexes.push(i);
      if (++operations % 2048 === 0) yield;
    }
    return { score: mode === 'exact' ? 1000 : 800 - text.length, indexes };
  }
  if (mode === 'contains') {
    for (const start of textTokenMatchEvents(text, query)) {
      if (start === undefined) { yield; continue; }
      for (let n = 0; n < needle.length; n += 1) {
        indexes.push(start + n);
        if (++operations % 2048 === 0) yield;
      }
      return { score: 600 - start, indexes };
    }
    return undefined;
  }
  let cursor = 0;
  for (const grapheme of needle) {
    if (text.length - cursor <= 2048) {
      const found = text.indexOf(grapheme, cursor);
      if (found < 0) return undefined;
      operations += found - cursor + 1;
      cursor = found;
    } else {
      while (cursor < text.length && text[cursor] !== grapheme) {
        cursor += 1;
        if (++operations % 2048 === 0) yield;
      }
    }
    if (cursor >= text.length) return undefined;
    indexes.push(cursor++);
    if (operations >= 2048) { operations = 0; yield; }
  }
  return { score: 400 - ((indexes.at(-1) ?? 0) - (indexes[0] ?? 0)), indexes };
}

function* rangesForIndexesWork(
  field: TextSearchIndex | undefined,
  fieldIndex: number,
  indexes: readonly number[]
): Generator<void, readonly QueryMatchRange[]> {
  if (field === undefined || indexes.length === 0) return Object.freeze([]);
  const ranges: QueryMatchRange[] = [];
  let runStart = indexes[0] ?? 0;
  let previous = runStart;
  for (let cursor = 1; cursor <= indexes.length; cursor += 1) {
    if (cursor % 2048 === 0) yield;
    const current = indexes[cursor];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    const first = textSearchOffset(field, runStart);
    const last = textSearchOffset(field, previous + 1);
    if (runStart < field.graphemes.length) {
      ranges.push(Object.freeze({
        field: fieldIndex === 0 ? 'primary' : 'secondary',
        fieldIndex: fieldIndex === 0 ? 0 : fieldIndex - 1,
        start: first,
        end: last
      }));
    }
    if (current !== undefined) {
      runStart = current;
      previous = current;
    }
  }
  return Object.freeze(ranges);
}

function queryMatch(
  candidate: QueryIndexOwner,
  score: number,
  ranges: readonly QueryMatchRange[]
): QueryMatch {
  return Object.freeze({
    id: candidate.id,
    score,
    ranges,
    ...(candidate.group === undefined ? {} : { group: candidate.group })
  });
}

/** Validate request fields without normalizing text or constructing search indexes. */
export function ownCollectionQueryRequest(value: unknown): Required<CollectionQuery> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new TypeError('collection query must be an object.');
  const { text, mode = 'contains', caseSensitive = false } = value as Record<string, unknown>;
  if (typeof text !== 'string') throw new TypeError('query text must be a string.');
  if (mode !== 'contains' && mode !== 'prefix' && mode !== 'exact' && mode !== 'fuzzy') throw new TypeError('query mode is invalid.');
  if (typeof caseSensitive !== 'boolean') throw new TypeError('query caseSensitive must be a boolean.');
  return Object.freeze({ text, mode, caseSensitive });
}
