import { finishWork } from '../foundation/cooperative-work.ts';
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
  return finishWork(createTextSearchIndexWork(text, options));
}

/** Shared construction; segmentation and native normalization of one grapheme are indivisible. */
export function* createTextSearchIndexWork(
  text: string, options: TextHighlightOptions = {},
): Generator<void, TextSearchIndex> {
  if (text.length <= 2048 && /^[\x20-\x7e]*$/u.test(text)) {
    return Object.freeze({ graphemes: normalizedSearchText(text, options) });
  }
  let ascii = true;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 || code > 126) ascii = false;
    if ((i + 1) % 2048 === 0) yield;
  }
  if (ascii) {
    const pieces: string[] = [];
    for (let i = 0; i < text.length; i += 2048) {
      pieces.push(normalizedSearchText(text.slice(i, i + 2048), options));
      if (i + 2048 <= text.length) yield;
    }
    return Object.freeze({ graphemes: pieces.join('') });
  }
  const tokens: string[] = [];
  const offsets: number[] = [];
  let work = 0;
  for (const part of graphemeSegments(text)) {
    tokens.push(normalizedSearchText(part.segment, options));
    offsets.push(part.index);
    work += part.segment.length;
    if (work >= 2048) { work = 0; yield; }
  }
  offsets.push(text.length);
  const ownedOffsets = new Uint32Array(offsets.length);
  for (let i = 0; i < offsets.length; i += 1) {
    ownedOffsets[i] = offsets[i] ?? 0;
    if ((i + 1) % 2048 === 0) yield;
  }
  return Object.freeze({ graphemes: Object.freeze(tokens), offsets: ownedOffsets });
}

export function textSearchOffset(index: TextSearchIndex, position: number): number {
  return index.offsets?.[position] ?? position;
}

export function compileTextSearchQuery(
  query: string,
  options: TextHighlightOptions = {}
): CompiledTextSearchQuery {
  return finishWork(compileTextSearchQueryWork(query, options));
}

export function* compileTextSearchQueryWork(
  query: string, options: TextHighlightOptions = {},
): Generator<void, CompiledTextSearchQuery> {
  const { graphemes } = yield* createTextSearchIndexWork(query, options);
  const failure = new Uint32Array(graphemes.length);
  for (let i = 1, prefix = 0; i < graphemes.length; i += 1) {
    while (prefix > 0 && graphemes[i] !== graphemes[prefix]) prefix = failure[prefix - 1] ?? 0;
    if (graphemes[i] === graphemes[prefix]) prefix += 1;
    failure[i] = prefix;
    if (i % 2048 === 0) yield;
  }
  return Object.freeze({ graphemes, failure });
}

/** Linear token matching; native string search handles the common ASCII representation. */
export function* textMatchStarts(
  index: TextSearchIndex,
  query: CompiledTextSearchQuery,
): Generator<number, void> {
  for (const event of textMatchEvents(index, query)) if (event !== undefined) yield event;
}

/** Undefined events are cooperative checkpoints; numbers are accepted non-overlapping matches. */
export function* textMatchEvents(
  index: TextSearchIndex, query: CompiledTextSearchQuery,
): Generator<number | undefined, void> {
  const text = index.graphemes;
  const needle = query.graphemes;
  if (needle.length === 0) return;
  if (typeof text === 'string' && typeof needle === 'string' && text.length <= 2048 && needle.length <= 2048) {
    for (let start = text.indexOf(needle); start >= 0; start = text.indexOf(needle, start + needle.length)) yield start;
    return;
  }
  let operations = 0;
  let nonempty = false;
  for (const part of needle) {
    if (part.length !== 0) nonempty = true;
    if (++operations % 2048 === 0) yield undefined;
  }
  if (!nonempty) return;
  let matched = 0;
  for (let i = 0; i < text.length; i += 1) {
    while (matched > 0 && text[i] !== needle[matched]) {
      matched = query.failure[matched - 1] ?? 0;
      if (++operations % 2048 === 0) yield undefined;
    }
    if (text[i] === needle[matched]) matched += 1;
    if (++operations % 2048 === 0) yield undefined;
    if (matched === needle.length) { yield i - matched + 1; matched = 0; }
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
