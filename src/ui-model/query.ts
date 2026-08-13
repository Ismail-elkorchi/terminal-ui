import { sanitizeTerminalText } from '../text/index.ts';
import { isNonArrayObject } from '../foundation/validation.ts';

export type QueryMatchMode = 'contains' | 'prefix' | 'exact' | 'fuzzy';

export interface CollectionQuery {
  readonly text: string;
  readonly mode?: QueryMatchMode;
  readonly caseSensitive?: boolean;
}

export interface QueryCandidate {
  readonly id: string;
  readonly primary: string;
  readonly secondary?: readonly string[];
  readonly group?: string;
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
  readonly start: number;
  readonly end: number;
}

interface PreparedQueryCandidate extends QueryCandidate {
  readonly normalizedPrimary: string;
  readonly normalizedSecondary: readonly string[];
}

export function prepareQueryCandidate(candidate: QueryCandidate): QueryCandidate {
  assertQueryCandidate(candidate);
  return Object.freeze({
    ...candidate,
    normalizedPrimary: candidate.primary.toLocaleLowerCase(),
    normalizedSecondary: Object.freeze((candidate.secondary ?? []).map((value) => value.toLocaleLowerCase())),
  } satisfies PreparedQueryCandidate);
}

export function normalizeCollectionQuery(query: CollectionQuery): Required<CollectionQuery> {
  if (typeof query.text !== 'string') throw new TypeError('query text must be a string.');
  if (query.mode !== undefined && !['contains', 'prefix', 'exact', 'fuzzy'].includes(query.mode)) {
    throw new TypeError('query mode is invalid.');
  }
  if (query.caseSensitive !== undefined && typeof query.caseSensitive !== 'boolean') {
    throw new TypeError('query caseSensitive must be a boolean.');
  }
  return Object.freeze({
    text: sanitizeTerminalText(query.text).text.trim(),
    mode: query.mode ?? 'contains',
    caseSensitive: query.caseSensitive === true,
  });
}

export function matchCollectionQuery(
  candidate: QueryCandidate,
  query: CollectionQuery,
): QueryMatch | undefined {
  const normalized = normalizeCollectionQuery(query);
  assertQueryCandidate(candidate);
  return matchNormalizedCollectionQuery(candidate, normalized);
}

/** Internal trusted path for callers that already adopted both inputs. */
export function matchNormalizedCollectionQuery(
  candidate: QueryCandidate,
  normalized: Required<CollectionQuery>,
): QueryMatch | undefined {
  if (normalized.text.length === 0) return Object.freeze({ id: candidate.id, score: 0, ranges: [] });
  const prepared = candidate as Partial<PreparedQueryCandidate>;
  const fields = normalized.caseSensitive
    ? [candidate.primary, ...(candidate.secondary ?? [])]
    : [prepared.normalizedPrimary ?? candidate.primary.toLocaleLowerCase(),
        ...(prepared.normalizedSecondary ?? candidate.secondary?.map((value) => value.toLocaleLowerCase()) ?? [])];
  const needle = normalized.caseSensitive ? normalized.text : normalized.text.toLocaleLowerCase();
  let best: {
    readonly score: number;
    readonly start: number;
    readonly end: number;
    readonly fieldIndex: number;
  } | undefined;
  for (const [fieldIndex, raw] of fields.entries()) {
    const match = matchText(raw, needle, normalized.mode);
    if (match !== undefined && (best === undefined || match.score > best.score)) {
      best = { ...match, fieldIndex };
    }
  }
  return best === undefined ? undefined : Object.freeze({
    id: candidate.id,
    score: best.score,
    ranges: Object.freeze([{
      field: best.fieldIndex === 0 ? 'primary' as const : 'secondary' as const,
      fieldIndex: best.fieldIndex === 0 ? 0 : best.fieldIndex - 1,
      start: best.start,
      end: best.end,
    }]),
    ...(candidate.group === undefined ? {} : { group: candidate.group }),
  });
}

export function queryCandidates(
  candidates: readonly QueryCandidate[],
  query: CollectionQuery,
): readonly QueryMatch[] {
  if (!Array.isArray(candidates)) throw new TypeError('query candidates must be an array.');
  candidates.forEach(assertQueryCandidate);
  return queryNormalizedCandidates(candidates, normalizeCollectionQuery(query));
}

/** Internal trusted path for callers that already adopted both inputs. */
export function queryNormalizedCandidates(
  candidates: readonly QueryCandidate[],
  query: Required<CollectionQuery>,
): readonly QueryMatch[] {
  return Object.freeze(candidates.flatMap((candidate) => {
    const match = matchNormalizedCollectionQuery(candidate, query);
    return match === undefined ? [] : [match];
  }).sort((left, right) => right.score - left.score));
}

function assertQueryCandidate(candidate: unknown, index?: number): asserts candidate is QueryCandidate {
  const label = index === undefined ? 'query candidate' : `query candidate ${String(index)}`;
  if (!isNonArrayObject(candidate)) {
    throw new TypeError(`${label} must be an object.`);
  }
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

function matchText(
  text: string,
  needle: string,
  mode: QueryMatchMode,
): { readonly score: number; readonly start: number; readonly end: number } | undefined {
  if (mode === 'exact') return text === needle ? { score: 1000, start: 0, end: text.length } : undefined;
  if (mode === 'prefix') return text.startsWith(needle)
    ? { score: 800 - text.length, start: 0, end: needle.length }
    : undefined;
  if (mode === 'contains') {
    const start = text.indexOf(needle);
    return start < 0 ? undefined : { score: 600 - start, start, end: start + needle.length };
  }
  let first = -1;
  let last = -1;
  let cursor = 0;
  for (const character of needle) {
    const index = text.indexOf(character, cursor);
    if (index < 0) return undefined;
    if (first < 0) first = index;
    last = index;
    cursor = index + 1;
  }
  return { score: 400 - (last - first), start: first, end: last + 1 };
}
