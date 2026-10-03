import { isNonArrayObject } from '../foundation/validation.ts';
import { finishWork, stableSortWork, stableSortAlignedWork, type CollectionScanCursor } from '../foundation/cooperative-work.ts';
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
  readonly maximumSecondaryLength: number;
  readonly fields: readonly TextSearchIndex[];
  readonly folded: (TextSearchIndex | string | undefined)[];
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

export function* compileCollectionQueryWork(query: unknown): Generator<number, CompiledCollectionQuery> {
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

function* normalizedQueryTextWork(text: string): Generator<number, string> {
  const sanitized = (yield* sanitizeTerminalTextWork(text)).text;
  let start = 0;
  let end = sanitized.length;
  let operations = 0;
  while (start < end && /\s/u.test(sanitized[start] ?? '')) {
    start += 1;
    if (++operations === 256) { yield operations; operations = 0; }
  }
  while (end > start && /\s/u.test(sanitized[end - 1] ?? '')) {
    end -= 1;
    if (++operations === 256) { yield operations; operations = 0; }
  }
  const normalized = sanitized.slice(start, end);
  yield operations + 2;
  return normalized;
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

export function* indexQueryCandidateWork(candidate: unknown): Generator<number, IndexedQueryCandidate> {
  if (isIndexedQueryCandidate(candidate)) return candidate;
  if (!isNonArrayObject(candidate)) throw new TypeError('query candidate must be an object.');
  const { id, primary, secondary, group } = candidate;
  if (typeof id !== 'string' || typeof primary !== 'string') throw new TypeError('query candidate id and primary must be strings.');
  if (group !== undefined && typeof group !== 'string') throw new TypeError('query candidate group must be a string.');
  if (secondary !== undefined && !Array.isArray(secondary)) throw new TypeError('query candidate secondary must be an array of strings.');
  const ownedSecondary: string[] = [];
  let operations = 4;
  if (secondary !== undefined) {
    for (const field of secondary) {
      if (typeof field !== 'string') throw new TypeError('query candidate secondary must be an array of strings.');
      ownedSecondary.push(field);
      if (++operations >= 256) { yield operations; operations = 0; }
    }
  }
  yield operations;
  const indexed = Object.freeze({
    kind: 'indexed-query-candidate' as const, id, primary,
    ...(secondary === undefined ? {} : { secondary: Object.freeze(ownedSecondary) }),
    ...(group === undefined ? {} : { group }),
  });
  function* fields(): Generator<string> { yield primary as string; yield* ownedSecondary; }
  yield* indexQueryFieldsWork(indexed, fields());
  return indexed;
}

/** Register fields on the existing domain owner, without a second candidate descriptor. */
export function* indexQueryFieldsWork(owner: QueryIndexOwner, fields: Iterable<string>): Generator<number, void> {
  if (queryCandidateIndexes.has(owner)) return;
  const indexes: TextSearchIndex[] = [];
  let maximumSecondaryLength = 0;
  for (const text of fields) {
    if (typeof text !== 'string') throw new TypeError('query candidate fields must be strings.');
    const index = yield* createTextSearchIndexWork(text, { caseSensitive: true });
    if (indexes.length > 0) maximumSecondaryLength = Math.max(maximumSecondaryLength, index.graphemes.length);
    indexes.push(index);
    yield 1;
  }
  queryCandidateIndexes.set(owner, { maximumSecondaryLength, fields: Object.freeze(indexes), folded: [] });
}

/** List-style combined search text, sharing the primary field's prepared tokens. */
export function* indexJoinedQueryFieldsWork(owner: QueryIndexOwner, fields: Iterable<string>): Generator<number, void> {
  if (queryCandidateIndexes.has(owner)) return;
  let primary: TextSearchIndex | undefined;
  const parts: { readonly index: TextSearchIndex; readonly start: number }[] = [];
  let total = 0;
  let ascii = true;
  for (const text of fields) {
    if (typeof text !== 'string') throw new TypeError('query candidate fields must be strings.');
    const index = yield* createTextSearchIndexWork(text, { caseSensitive: true });
    primary ??= index;
    if (text.length === 0) continue;
    if (parts.length > 0) total += 1;
    parts.push({ index, start: total });
    total += text.length;
    if (typeof index.graphemes !== 'string') ascii = false;
    yield 1;
  }
  primary ??= Object.freeze({ graphemes: '' });
  if (parts.length <= 1) {
    const only = parts[0]?.index;
    queryCandidateIndexes.set(owner, { maximumSecondaryLength: only === undefined || only === primary ? 0 : only.graphemes.length, fields: Object.freeze(only === undefined || only === primary ? [primary] : [primary, only]), folded: [] });
    return;
  }
  const joined = yield* joinSearchFieldsWork(parts, total, ascii);
  queryCandidateIndexes.set(owner, { maximumSecondaryLength: joined.graphemes.length, fields: Object.freeze([primary, joined]), folded: [] });
}
function* joinSearchFieldsWork(parts: readonly { readonly index: TextSearchIndex; readonly start: number }[], total: number, ascii: boolean): Generator<number, TextSearchIndex> {
  if (ascii) {
    const pieces: string[] = [];
    for (const part of parts) { pieces.push(part.index.graphemes as string); yield 1; }
    const graphemes = pieces.join(' ');
    yield graphemes.length;
    return Object.freeze({ graphemes });
  }
  const graphemes: string[] = [];
  const offsets: number[] = [];
  for (const part of parts) {
    if (graphemes.length > 0) { graphemes.push(' '); offsets.push(part.start - 1); }
    for (let position = 0; position < part.index.graphemes.length; position++) {
      const token = part.index.graphemes[position];
      if (token === undefined) continue;
      graphemes.push(token); offsets.push(part.start + textSearchOffset(part.index, position));
      yield 2;
    }
  }
  offsets.push(total);
  const ownedOffsets = new Uint32Array(offsets.length);
  yield offsets.length;
  for (let position = 0; position < offsets.length; position++) { ownedOffsets[position] = offsets[position] ?? 0; yield 1; }
  return Object.freeze({ graphemes: Object.freeze(graphemes), offsets: ownedOffsets });
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
): Generator<number, QueryMatch | undefined> {
  const candidateData = queryCandidateIndexes.get(candidate);
  if (candidateData === undefined) throw new TypeError('candidate must be created by indexQueryCandidate().');
  const queryData = compiledQueries.get(query);
  if (queryData === undefined) throw new TypeError('query must be created by compileCollectionQuery().');
  return yield* matchCandidateWork(candidate, candidateData, query, queryData.search);
}

/** Match one already indexed field, preserving its original field identity. */
export function* matchCompiledCollectionQueryFieldWork(
  candidate: QueryIndexOwner, query: CompiledCollectionQuery, fieldIndex: number,
): Generator<number, QueryMatch | undefined> {
  const data = queryCandidateIndexes.get(candidate);
  if (data === undefined) throw new TypeError('candidate must be created by indexQueryCandidate().');
  const search = compiledQueries.get(query)?.search;
  if (search === undefined) throw new TypeError('query must be created by compileCollectionQuery().');
  if (!Number.isSafeInteger(fieldIndex) || fieldIndex < 0 || fieldIndex >= data.fields.length) throw new RangeError('query field index is out of range.');
  return yield* matchCandidateWork(candidate, data, query, search, fieldIndex);
}

/** Share an owner's raw/folded search view and original offset table across adapters. */
export function* queryFieldSearchIndexWork(
  candidate: QueryIndexOwner, fieldIndex: number, caseSensitive: boolean,
): Generator<number, TextSearchIndex> {
  const data = queryCandidateIndexes.get(candidate);
  if (data === undefined) throw new TypeError('candidate must be created by indexQueryCandidate().');
  return yield* fieldSearchIndexWork(data, fieldIndex, caseSensitive);
}

function* fieldSearchIndexWork(data: QueryCandidateIndex, fieldIndex: number, caseSensitive: boolean): Generator<number, TextSearchIndex> {
  const field = data.fields[fieldIndex];
  if (field === undefined) throw new RangeError('query field index is out of range.');
  if (caseSensitive) return field;
  const cached = data.folded[fieldIndex];
  if (cached !== undefined) return foldedFieldIndex(data, fieldIndex, field, cached);
  const graphemes = yield* foldTextSearchTokensWork(field);
  return foldedFieldIndex(data, fieldIndex, field, data.folded[fieldIndex] ?? { graphemes,
    ...(field.offsets === undefined ? {} : { offsets: field.offsets }),
  });
}

/** A domain adapter promotes a compact ASCII slot in place; there is only one cache. */
function foldedFieldIndex(
  data: QueryCandidateIndex, fieldIndex: number, field: TextSearchIndex, cached: TextSearchIndex | string,
): TextSearchIndex {
  if (typeof cached !== 'string') {
    data.folded[fieldIndex] ??= Object.freeze(cached);
    return cached;
  }
  return data.folded[fieldIndex] = Object.freeze({ graphemes: cached,
    ...(field.offsets === undefined ? {} : { offsets: field.offsets }),
  });
}

/** Single-owner adapter over the same reusable cursor used by collection scans. */
function* matchCandidateWork(
  candidate: QueryIndexOwner, data: QueryCandidateIndex,
  query: CompiledCollectionQuery, search: CompiledTextSearchQuery, onlyField?: number,
): Generator<number, QueryMatch | undefined> {
  const cursor = createMatchCursor(query, search);
  try {
    do { yield advanceCandidateMatch(candidate, data, query, search, cursor, onlyField); } while (!cursor.done);
    return cursor.match;
  } finally { closeCandidateMatch(cursor); }
}

export function queryCandidates(
  candidates: readonly QueryCandidate[],
  query: CollectionQuery,
): readonly QueryMatch[] {
  if (!Array.isArray(candidates)) throw new TypeError('query candidates must be an array.');
  const source: readonly QueryCandidate[] = candidates;
  const indexed = source.map(candidate => indexQueryCandidate(candidate));
  return queryIndexedCandidates(indexed, compileCollectionQuery(query));
}

export function queryIndexedCandidates(
  candidates: readonly IndexedQueryCandidate[],
  query: CompiledCollectionQuery,
): readonly QueryMatch[] {
  return finishWork(queryIndexedCandidatesWork(candidates, query));
}

/** Native iterable scan and stable merge sort share the charged matcher. */
export function* queryIndexedCandidatesWork<T extends QueryIndexOwner>(
  candidates: Iterable<T | undefined>,
  query: CompiledCollectionQuery,
  ownerTracking?: QueryOwnerTracking<T>,
): Generator<number, readonly QueryMatch[]> {
  const search = compiledQueries.get(query)?.search;
  if (search === undefined) throw new TypeError('query must be created by compileCollectionQuery().');
  const matches: QueryMatch[] = [];
  const cursor = createMatchCursor(query, search);
  let operations = 0;
  let ordered = true;
  let previousScore = Number.POSITIVE_INFINITY;
  try {
    for (const candidate of candidates) {
      if (candidate !== undefined) {
        const data = queryCandidateIndexes.get(candidate);
        if (data === undefined) throw new TypeError('candidate must be created by indexQueryCandidate().');
        do {
          operations += advanceCandidateMatch(candidate, data, query, search, cursor);
          if (!cursor.done || operations >= 1024) { yield operations; operations = 0; }
        } while (!cursor.done);
        const match = cursor.match;
        if (match !== undefined) {
          if (match.score > previousScore) ordered = false;
          previousScore = match.score;
          matches.push(match);
          if (ownerTracking !== undefined) { ownerTracking.owners.push(candidate); operations += 1; }
        }
      }
      if (++operations >= 1024) { yield operations; operations = 0; }
    }
    if (operations !== 0) yield operations;
  } finally { closeCandidateMatch(cursor); }
  if (ordered) {
    if (ownerTracking !== undefined) { yield ownerTracking.owners.length; Object.freeze(ownerTracking.owners); }
    return Object.freeze(matches);
  }
  if (ownerTracking !== undefined) {
    const sorted = yield* stableSortAlignedWork(matches, ownerTracking.owners, (left, right) => right.score - left.score);
    yield sorted.companions.length;
    ownerTracking.ordered = Object.freeze(sorted.companions);
    return Object.freeze(sorted.values);
  }
  return Object.freeze(yield* stableSortWork(matches, (left, right) => right.score - left.score));
}

interface QueryOwnerTracking<T> {
  readonly owners: T[];
  ordered: readonly T[];
}

/** Keep only winning source references beside unchanged public match records. */
export function* queryIndexedOwnedScanWork<T extends QueryIndexOwner>(
  createScan: () => CollectionScanCursor<T>, query: CompiledCollectionQuery,
): Generator<number, { readonly matches: readonly QueryMatch[]; readonly owners: readonly T[] }> {
  const owners: T[] = [];
  const tracking: QueryOwnerTracking<T> = { owners, ordered: owners };
  const matches = yield* queryIndexedCandidatesWork(ownedQueryCandidates(createScan), query, tracking);
  return Object.freeze({ matches, owners: tracking.ordered });
}

function ownedQueryCandidates<T extends QueryIndexOwner>(createScan: () => CollectionScanCursor<T>): Iterable<T | undefined> {
  return { [Symbol.iterator]: () => new QueryScanIterator(createScan()) };
}

/** One private reusable result per scan; public values() never exposes it. */
class QueryScanIterator<T extends QueryIndexOwner> implements Iterator<T | undefined> {
  private readonly source: CollectionScanCursor<T>;
  private readonly result = { value: undefined as T | undefined, done: false };

  constructor(source: CollectionScanCursor<T>) { this.source = source; }

  next(): IteratorResult<T | undefined> {
    if (!this.source.advance()) return this.return();
    this.result.value = this.source.value;
    return this.result;
  }

  return(): IteratorResult<T | undefined> {
    this.result.done = true;
    this.result.value = undefined;
    this.source.close();
    return this.result;
  }
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

const emptyRanges: readonly QueryMatchRange[] = Object.freeze([]);

interface MatchCursor {
  operations: number;
  readonly maximumScore: number;
  fieldIndex: number;
  indexed: TextSearchTokens | undefined;
  fieldWork: Generator<number, TextSearchIndex> | undefined;
  scoreWork: Generator<number, number | undefined> | undefined;
  bestScore: number | undefined;
  bestField: number;
  bestText: TextSearchTokens;
  ranges: QueryMatchRange[] | undefined;
  rangeToken: number;
  rangeCursor: number;
  rangeStart: number;
  rangePrevious: number;
  done: boolean;
  match: QueryMatch | undefined;
}

/** One query-local cursor; bounded records need no per-record generators or step results. */
function createMatchCursor(query: CompiledCollectionQuery, search: CompiledTextSearchQuery): MatchCursor {
  return {
    operations: 0,
    maximumScore: scoreForSpan(query.mode, 0, search.graphemes.length - 1, search.graphemes.length),
    fieldIndex: 0, indexed: undefined, fieldWork: undefined, scoreWork: undefined,
    bestScore: undefined, bestField: -1, bestText: '', ranges: undefined,
    rangeToken: 0, rangeCursor: 0, rangeStart: -1, rangePrevious: -1, done: true, match: undefined,
  };
}

function closeCandidateMatch(cursor: MatchCursor): void {
  cursor.fieldWork?.return(undefined as unknown as TextSearchIndex);
  cursor.scoreWork?.return(undefined);
}

/** Token counts survive folding, so whole groups of too-short fields need no scan. */
function candidateFieldEnd(data: QueryCandidateIndex, length: number, onlyField: number | undefined): number {
  const end = onlyField === undefined ? data.fields.length : onlyField + 1;
  return length > data.maximumSecondaryLength ? Math.min(1, end) : end;
}

function candidateFieldFits(field: TextSearchIndex | undefined, length: number, mode: QueryMatchMode): field is TextSearchIndex {
  return field !== undefined && length <= field.graphemes.length
    && (mode !== 'exact' || length === field.graphemes.length);
}

/** Scalar selection and winner-only ranges, with bounded checkpoints across fields. */
function advanceCandidateMatch(
  candidate: QueryIndexOwner, data: QueryCandidateIndex, query: CompiledCollectionQuery,
  search: CompiledTextSearchQuery, cursor: MatchCursor, onlyField?: number,
): number {
  cursor.operations = 1;
  if (search.graphemes.length === 0) {
    cursor.match = queryMatch(candidate, 0, emptyRanges);
    cursor.done = true;
    return cursor.operations;
  }
  const end = candidateFieldEnd(data, search.graphemes.length, onlyField);
  let fieldIndex = cursor.done ? onlyField ?? 0 : cursor.fieldIndex;
  let bestScore = cursor.done ? undefined : cursor.bestScore;
  if (cursor.done) cursor.ranges = undefined;
  let bestField = cursor.bestField;
  let bestText = cursor.bestText;
  while (fieldIndex < end && cursor.operations < 256) {
    const field = data.fields[fieldIndex];
    if (!candidateFieldFits(field, search.graphemes.length, query.mode)) {
      fieldIndex += 1; cursor.operations += 1; continue;
    }
    const indexed = advanceCandidateFieldIndex(data, field, fieldIndex, query.caseSensitive, cursor);
    if (indexed === undefined || cursor.operations >= 256) break;
    const text = indexed;
    let score: number | undefined;
    if (typeof text === 'string' && typeof search.graphemes === 'string'
      && text.length <= 2048 && search.graphemes.length <= 32) {
      score = boundedAsciiScore(text, search.graphemes, query.mode, cursor);
    } else {
      cursor.scoreWork ??= matchScoreWork(text, search, query.mode);
      const step = cursor.scoreWork.next();
      if (!step.done) { cursor.operations += step.value; break; }
      score = step.value;
      cursor.scoreWork = undefined;
    }
    if (score !== undefined && (bestScore === undefined || score > bestScore)) {
      bestScore = score;
      bestField = fieldIndex;
      bestText = text;
      if (score >= cursor.maximumScore) fieldIndex = end;
    }
    fieldIndex += 1;
    cursor.indexed = undefined;
    cursor.operations += 1;
  }
  if (fieldIndex >= end && bestScore === undefined) {
    cursor.match = undefined;
    cursor.done = true;
    return cursor.operations;
  }
  cursor.done = false;
  cursor.fieldIndex = fieldIndex;
  cursor.bestScore = bestScore;
  cursor.bestField = bestField;
  cursor.bestText = bestText;
  if (fieldIndex < end) return cursor.operations;
  return finishCandidateMatch(candidate, data, query, search, cursor);
}

/** Finalize only the winner; misses need no further continuation after the last field. */
function finishCandidateMatch(
  candidate: QueryIndexOwner, data: QueryCandidateIndex, query: CompiledCollectionQuery,
  search: CompiledTextSearchQuery, cursor: MatchCursor,
): number {
  const field = data.fields[cursor.bestField];
  if (cursor.bestScore === undefined || field === undefined) {
    cursor.done = true;
    return cursor.operations;
  }
  let ranges: readonly QueryMatchRange[];
  if (query.mode === 'fuzzy') {
    if (cursor.ranges === undefined) {
      cursor.ranges = [];
      cursor.rangeToken = 0;
      cursor.rangeCursor = 0;
      cursor.rangeStart = -1;
      cursor.rangePrevious = -1;
    }
    if (!advanceFuzzyRanges(field, search.graphemes, cursor)) return cursor.operations;
    ranges = Object.freeze(cursor.ranges);
  } else {
    const start = query.mode === 'contains' ? 600 - cursor.bestScore : 0;
    ranges = Object.freeze([matchRange(field, cursor.bestField, start, start + search.graphemes.length)]);
  }
  cursor.match = queryMatch(candidate, cursor.bestScore, ranges);
  cursor.done = true;
  return cursor.operations + 1;
}

/** Resume an in-flight fold before observing another reader's newly admitted cache. */
function advanceCandidateFieldIndex(
  data: QueryCandidateIndex, field: TextSearchIndex, fieldIndex: number, caseSensitive: boolean, cursor: MatchCursor,
): TextSearchTokens | undefined {
  if (cursor.indexed !== undefined) return cursor.indexed;
  let indexed = cursor.fieldWork === undefined ? caseSensitive ? field : data.folded[fieldIndex] : undefined;
  if (indexed === undefined) {
    if (typeof field.graphemes === 'string' && field.graphemes.length <= 2048) {
      indexed = data.folded[fieldIndex] = field.graphemes.toLowerCase();
      cursor.operations += field.graphemes.length;
    } else {
      cursor.fieldWork ??= fieldSearchIndexWork(data, fieldIndex, caseSensitive);
      const step = cursor.fieldWork.next();
      if (!step.done) { cursor.operations += step.value; return undefined; }
      indexed = step.value;
      cursor.fieldWork = undefined;
    }
  }
  return cursor.indexed = typeof indexed === 'string' ? indexed : indexed.graphemes;
}

/** One bounded native specialization; its scalar output feeds the same winner/range path. */
function boundedAsciiScore(text: string, needle: string, mode: QueryMatchMode, scratch: MatchCursor): number | undefined {
  scratch.operations += 1;
  if (mode !== 'fuzzy') {
    const start = mode === 'contains' ? text.indexOf(needle) : text.startsWith(needle) ? 0 : -1;
    scratch.operations += mode === 'contains' ? start < 0 ? text.length : start + needle.length : needle.length;
    return start < 0 ? undefined : scoreForSpan(mode, start, start + needle.length - 1, text.length);
  }
  let cursor = 0;
  let first = -1;
  let last = -1;
  for (let index = 0; index < needle.length; index += 1) {
    const found = text.indexOf(needle.charAt(index), cursor);
    scratch.operations += found < 0 ? text.length - cursor : found - cursor + 1;
    if (found < 0) return undefined;
    if (first < 0) first = found;
    last = found;
    cursor = found + 1;
  }
  return scoreForSpan(mode, first, last, text.length);
}

function scoreForSpan(mode: QueryMatchMode, first: number, last: number, length: number): number {
  return mode === 'contains' ? 600 - first : mode === 'prefix' ? 800 - length
    : mode === 'exact' ? 1000 : 400 - (last - first);
}

/** ASCII and Unicode share scoring and winner selection, including stable ties. */
function* matchScoreWork(
  text: TextSearchTokens, query: CompiledTextSearchQuery, mode: QueryMatchMode,
): Generator<number, number | undefined> {
  const needle = query.graphemes;
  if (mode === 'contains') {
    for (const event of textTokenMatchEvents(text, query)) {
      if (event < 0) { yield -event; continue; }
      return scoreForSpan(mode, event, event + needle.length - 1, text.length);
    }
    return undefined;
  }
  let operations = 0;
  if (mode === 'exact' || mode === 'prefix') {
    for (let i = 0; i < needle.length; i += 1) {
      operations += 1;
      if (text[i] !== needle[i]) { yield operations; return undefined; }
      if (operations === 256) { yield operations; operations = 0; }
    }
    if (operations !== 0) yield operations;
    return scoreForSpan(mode, 0, needle.length - 1, text.length);
  }
  let cursor = 0;
  let first = -1;
  let last = -1;
  for (const token of needle) {
    let found = -1;
    if (text.length - cursor <= 2048) {
      found = text.indexOf(token, cursor);
      operations += found < 0 ? text.length - cursor : found - cursor + 1;
    } else {
      while (cursor < text.length) {
        operations += 1;
        if (text[cursor] === token) { found = cursor; break; }
        cursor += 1;
        if (operations >= 256) { yield operations; operations = 0; }
      }
    }
    if (operations >= 256) { yield operations; operations = 0; }
    if (found < 0) { if (operations !== 0) yield operations; return undefined; }
    if (first < 0) first = found;
    last = found;
    cursor = found + 1;
  }
  if (operations !== 0) yield operations;
  return scoreForSpan(mode, first, last, text.length);
}

/** Reconstruct only the winner directly into final ranges using the same bounded cursor. */
function advanceFuzzyRanges(field: TextSearchIndex, needle: TextSearchTokens, cursor: MatchCursor): boolean {
  const ranges = cursor.ranges;
  if (ranges === undefined) return false;
  while (cursor.rangeToken < needle.length) {
    if (cursor.operations >= 256) return false;
    const token = needle[cursor.rangeToken];
    while (cursor.rangeCursor < cursor.bestText.length && cursor.bestText[cursor.rangeCursor] !== token) {
      cursor.rangeCursor += 1;
      if (++cursor.operations >= 256) return false;
    }
    if (cursor.rangeStart < 0) cursor.rangeStart = cursor.rangeCursor;
    else if (cursor.rangeCursor !== cursor.rangePrevious + 1) {
      ranges.push(matchRange(field, cursor.bestField, cursor.rangeStart, cursor.rangePrevious + 1));
      cursor.rangeStart = cursor.rangeCursor;
    }
    cursor.rangePrevious = cursor.rangeCursor++;
    cursor.rangeToken += 1;
    cursor.operations += 1;
  }
  if (cursor.rangeStart >= 0) ranges.push(matchRange(field, cursor.bestField, cursor.rangeStart, cursor.rangePrevious + 1));
  return true;
}

function matchRange(field: TextSearchIndex, fieldIndex: number, start: number, end: number): QueryMatchRange {
  return Object.freeze({
    field: fieldIndex === 0 ? 'primary' : 'secondary',
    fieldIndex: fieldIndex === 0 ? 0 : fieldIndex - 1,
    start: textSearchOffset(field, start),
    end: textSearchOffset(field, end),
  });
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
