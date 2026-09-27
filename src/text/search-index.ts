import { graphemeSegments } from './graphemes.ts';
import type { TextMeasurementOptions } from './types.ts';

export interface TextHighlightMatch {
  readonly startGraphemeIndex: number;
  readonly endGraphemeIndexExclusive: number;
}

export interface TextHighlightOptions extends TextMeasurementOptions {
  readonly caseSensitive?: boolean;
  readonly accentSensitive?: boolean;
  readonly locale?: string;
}

/** ASCII tokens are represented by the string itself. Unicode keeps original boundaries. */
export interface TextSearchIndex {
  readonly graphemes: string | readonly string[];
  readonly offsets?: Uint32Array;
}

export interface CompiledTextSearchQuery {
  readonly graphemes: string | readonly string[];
  readonly failure: Uint32Array;
}

export function createTextSearchIndex(
  text: string,
  options: TextHighlightOptions = {}
): TextSearchIndex {
  if (/^[\x20-\x7e]*$/u.test(text)) {
    return Object.freeze({ graphemes: normalizedSearchText(text, options) });
  }
  const tokens: string[] = [];
  const offsets: number[] = [];
  for (const part of graphemeSegments(text)) {
    tokens.push(normalizedSearchText(part.segment, options));
    offsets.push(part.index);
  }
  offsets.push(text.length);
  return Object.freeze({ graphemes: Object.freeze(tokens), offsets: Uint32Array.from(offsets) });
}

export function textSearchOffset(index: TextSearchIndex, position: number): number {
  return index.offsets?.[position] ?? position;
}

export function compileTextSearchQuery(
  query: string,
  options: TextHighlightOptions = {}
): CompiledTextSearchQuery {
  const { graphemes } = createTextSearchIndex(query, options);
  const failure = new Uint32Array(graphemes.length);
  for (let i = 1, prefix = 0; i < graphemes.length; i += 1) {
    while (prefix > 0 && graphemes[i] !== graphemes[prefix]) prefix = failure[prefix - 1] ?? 0;
    if (graphemes[i] === graphemes[prefix]) prefix += 1;
    failure[i] = prefix;
  }
  return Object.freeze({ graphemes, failure });
}

/** Linear token matching; native string search handles the common ASCII representation. */
export function* textMatchStarts(
  index: TextSearchIndex,
  query: CompiledTextSearchQuery,
): Generator<number, void> {
  const text = index.graphemes;
  const needle = query.graphemes;
  if (needle.length === 0 || (typeof needle !== 'string' && needle.every(part => part.length === 0))) return;
  if (typeof text === 'string' && typeof needle === 'string') {
    for (let start = text.indexOf(needle); start >= 0; start = text.indexOf(needle, start + needle.length)) {
      yield start;
    }
    return;
  }
  let matched = 0;
  for (let i = 0; i < text.length; i += 1) {
    while (matched > 0 && text[i] !== needle[matched]) matched = query.failure[matched - 1] ?? 0;
    if (text[i] === needle[matched]) matched += 1;
    if (matched === needle.length) {
      yield i - matched + 1;
      matched = 0;
    }
  }
}

export function findTextMatches(
  index: TextSearchIndex,
  query: CompiledTextSearchQuery
): readonly TextHighlightMatch[] {
  return Object.freeze(Array.from(textMatchStarts(index, query), start => ({
    startGraphemeIndex: start,
    endGraphemeIndexExclusive: start + query.graphemes.length,
  })));
}

function normalizedSearchText(text: string, options: TextHighlightOptions): string {
  const accentNormalized = options.accentSensitive === false
    ? text.normalize('NFD').replace(/\p{Mark}/gu, '')
    : text.normalize('NFC');
  return options.caseSensitive === true
    ? accentNormalized
    : options.locale === undefined
      ? accentNormalized.toLowerCase()
      : accentNormalized.toLocaleLowerCase(options.locale);
}
