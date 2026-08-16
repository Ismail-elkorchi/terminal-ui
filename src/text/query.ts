import { segmentGraphemes } from './graphemes.ts';
import { sanitizeTerminalText } from './sanitize.ts';

export type QueryMatchMode = 'contains' | 'prefix' | 'exact' | 'fuzzy';

export interface CollectionQuery {
  readonly text: string;
  readonly mode?: QueryMatchMode;
  readonly caseSensitive?: boolean;
}

export interface PreparedCollectionQuery {
  readonly kind: 'prepared-collection-query';
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

export interface PreparedQueryCandidate extends QueryCandidate {
  readonly kind: 'prepared-query-candidate';
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

interface PreparedField {
  readonly text: string;
  readonly graphemes: readonly PreparedGrapheme[];
}

interface PreparedGrapheme {
  readonly folded: string;
  readonly original: string;
  readonly start: number;
  readonly end: number;
}

interface PreparedCandidateData {
  readonly fields: readonly PreparedField[];
}

interface PreparedQueryData {
  readonly graphemes: readonly string[];
}

const preparedCandidates = new WeakMap<object, PreparedCandidateData>();
const preparedQueries = new WeakMap<object, PreparedQueryData>();

function isNonArrayObject(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function prepareCollectionQuery(query: CollectionQuery): PreparedCollectionQuery;
export function prepareCollectionQuery(query: unknown): PreparedCollectionQuery {
  if (isNonArrayObject(query) && preparedQueries.has(query)) {
    return query as unknown as PreparedCollectionQuery;
  }
  if (!isNonArrayObject(query)) throw new TypeError('collection query must be an object.');
  const text = query['text'];
  const mode = query['mode'];
  const caseSensitive = query['caseSensitive'];
  if (typeof text !== 'string') throw new TypeError('query text must be a string.');
  if (mode !== undefined && mode !== 'contains' && mode !== 'prefix' && mode !== 'exact' && mode !== 'fuzzy') {
    throw new TypeError('query mode is invalid.');
  }
  if (caseSensitive !== undefined && typeof caseSensitive !== 'boolean') {
    throw new TypeError('query caseSensitive must be a boolean.');
  }
  const normalizedText = sanitizeTerminalText(text).text.trim();
  const sensitive = caseSensitive === true;
  const prepared = Object.freeze({
    kind: 'prepared-collection-query' as const,
    text: normalizedText,
    mode: mode ?? 'contains',
    caseSensitive: sensitive
  });
  preparedQueries.set(prepared, Object.freeze({
    graphemes: Object.freeze(segmentGraphemes(normalizedText).map((part) =>
      normalizeGrapheme(part.text, sensitive)))
  }));
  return prepared;
}

export function prepareQueryCandidate(candidate: QueryCandidate): PreparedQueryCandidate;
export function prepareQueryCandidate(candidate: unknown): PreparedQueryCandidate {
  if (isPreparedQueryCandidate(candidate)) return candidate;
  assertQueryCandidate(candidate);
  const secondary = candidate.secondary === undefined
    ? undefined
    : Object.freeze([...candidate.secondary]);
  const prepared = Object.freeze({
    kind: 'prepared-query-candidate' as const,
    id: candidate.id,
    primary: candidate.primary,
    ...(secondary === undefined ? {} : { secondary }),
    ...(candidate.group === undefined ? {} : { group: candidate.group })
  });
  preparedCandidates.set(prepared, Object.freeze({
    fields: Object.freeze([
      prepareField(prepared.primary),
      ...(prepared.secondary ?? []).map(prepareField)
    ])
  }));
  return prepared;
}

export function matchCollectionQuery(
  candidate: QueryCandidate,
  query: CollectionQuery,
): QueryMatch | undefined {
  return matchPreparedCollectionQuery(
    prepareQueryCandidate(candidate),
    prepareCollectionQuery(query)
  );
}

export function matchPreparedCollectionQuery(
  candidate: PreparedQueryCandidate,
  query: PreparedCollectionQuery,
): QueryMatch | undefined {
  const candidateData = preparedCandidates.get(candidate);
  if (candidateData === undefined) throw new TypeError('candidate must be created by prepareQueryCandidate().');
  const queryData = preparedQueries.get(query);
  if (queryData === undefined) throw new TypeError('query must be created by prepareCollectionQuery().');
  if (queryData.graphemes.length === 0) return queryMatch(candidate, 0, []);

  let best: { readonly score: number; readonly indexes: readonly number[]; readonly fieldIndex: number } | undefined;
  for (const [fieldIndex, field] of candidateData.fields.entries()) {
    const haystack = field.graphemes.map((part) => query.caseSensitive ? part.original : part.folded);
    const match = matchGraphemes(haystack, queryData.graphemes, query.mode);
    if (match !== undefined && (best === undefined || match.score > best.score)) {
      best = { ...match, fieldIndex };
    }
  }
  if (best === undefined) return undefined;
  return queryMatch(
    candidate,
    best.score,
    rangesForIndexes(candidateData.fields[best.fieldIndex], best.fieldIndex, best.indexes)
  );
}

export function queryCandidates(
  candidates: readonly QueryCandidate[],
  query: CollectionQuery,
): readonly QueryMatch[] {
  if (!Array.isArray(candidates)) throw new TypeError('query candidates must be an array.');
  const prepared = candidates.map((candidate, index) => {
    assertQueryCandidate(candidate, index);
    return prepareQueryCandidate(candidate);
  });
  return queryPreparedCandidates(prepared, prepareCollectionQuery(query));
}

export function queryPreparedCandidates(
  candidates: readonly PreparedQueryCandidate[],
  query: PreparedCollectionQuery,
): readonly QueryMatch[] {
  return Object.freeze(candidates.flatMap((candidate) => {
    const match = matchPreparedCollectionQuery(candidate, query);
    return match === undefined ? [] : [match];
  }).sort((left, right) => right.score - left.score));
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

function isPreparedQueryCandidate(value: unknown): value is PreparedQueryCandidate {
  return isNonArrayObject(value) && preparedCandidates.has(value);
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

function prepareField(text: string): PreparedField {
  return Object.freeze({
    text,
    graphemes: Object.freeze(segmentGraphemes(text).map((part) => Object.freeze({
      original: part.text.normalize('NFC'),
      folded: normalizeGrapheme(part.text, false),
      start: part.startOffset,
      end: part.endOffsetExclusive
    })))
  });
}

function normalizeGrapheme(value: string, caseSensitive: boolean): string {
  const canonical = value.normalize('NFC');
  return (caseSensitive ? canonical : canonical.toLowerCase()).normalize('NFC');
}

function matchGraphemes(
  text: readonly string[],
  needle: readonly string[],
  mode: QueryMatchMode,
): { readonly score: number; readonly indexes: readonly number[] } | undefined {
  if (mode === 'exact') {
    return sequencesEqual(text, needle)
      ? { score: 1000, indexes: indexesFrom(0, needle.length) }
      : undefined;
  }
  if (mode === 'prefix') {
    return sequenceMatchesAt(text, needle, 0)
      ? { score: 800 - text.length, indexes: indexesFrom(0, needle.length) }
      : undefined;
  }
  if (mode === 'contains') {
    const start = sequenceIndexOf(text, needle);
    return start < 0
      ? undefined
      : { score: 600 - start, indexes: indexesFrom(start, needle.length) };
  }
  const indexes: number[] = [];
  let cursor = 0;
  for (const grapheme of needle) {
    const index = text.indexOf(grapheme, cursor);
    if (index < 0) return undefined;
    indexes.push(index);
    cursor = index + 1;
  }
  const first = indexes[0] ?? 0;
  const last = indexes.at(-1) ?? first;
  return { score: 400 - (last - first), indexes: Object.freeze(indexes) };
}

function rangesForIndexes(
  field: PreparedField | undefined,
  fieldIndex: number,
  indexes: readonly number[]
): readonly QueryMatchRange[] {
  if (field === undefined || indexes.length === 0) return Object.freeze([]);
  const ranges: QueryMatchRange[] = [];
  let runStart = indexes[0] ?? 0;
  let previous = runStart;
  for (let cursor = 1; cursor <= indexes.length; cursor += 1) {
    const current = indexes[cursor];
    if (current === previous + 1) {
      previous = current;
      continue;
    }
    const first = field.graphemes[runStart];
    const last = field.graphemes[previous];
    if (first !== undefined && last !== undefined) {
      ranges.push(Object.freeze({
        field: fieldIndex === 0 ? 'primary' : 'secondary',
        fieldIndex: fieldIndex === 0 ? 0 : fieldIndex - 1,
        start: first.start,
        end: last.end
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
  candidate: PreparedQueryCandidate,
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

function sequenceIndexOf(text: readonly string[], needle: readonly string[]): number {
  for (let start = 0; start <= text.length - needle.length; start += 1) {
    if (sequenceMatchesAt(text, needle, start)) return start;
  }
  return -1;
}

function sequenceMatchesAt(text: readonly string[], needle: readonly string[], start: number): boolean {
  if (start < 0 || start + needle.length > text.length) return false;
  for (let offset = 0; offset < needle.length; offset += 1) {
    if (text[start + offset] !== needle[offset]) return false;
  }
  return true;
}

function sequencesEqual(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && sequenceMatchesAt(left, right, 0);
}

function indexesFrom(start: number, length: number): readonly number[] {
  return Object.freeze(Array.from({ length }, (_, index) => start + index));
}
