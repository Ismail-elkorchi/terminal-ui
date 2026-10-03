import { finishWork } from '../foundation/cooperative-work.ts';
import { isBoundedPrintableAscii } from './printable-ascii.ts';
import { sourceBoundaries } from './source-boundaries.ts';
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
export type TextSearchTokens = string | readonly string[];

export interface TextSearchIndex {
  readonly graphemes: TextSearchTokens;
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
): Generator<number, TextSearchIndex> {
  // A capped native scan avoids per-character and assembly overhead for ordinary
  // fields. Long strings still take the checkpointed path below; source width
  // never changes grapheme boundaries.
  if (isBoundedPrintableAscii(text)) {
    const graphemes = foldedSearchText(text, options);
    yield text.length * 2; // ASCII examination plus normalization/copying.
    return Object.freeze({ graphemes });
  }
  if (text.length <= 2048) yield text.length; // A failed bounded scan still consumes work.
  let ascii = true;
  let operations = 0;
  for (let i = 0; i < text.length; i += 1) {
    const code = text.charCodeAt(i);
    if (code < 32 || code > 126) ascii = false;
    if (++operations === 256) { yield operations; operations = 0; }
  }
  if (operations !== 0) yield operations;
  if (ascii) {
    const pieces: string[] = [];
    for (let i = 0; i < text.length; i += 2048) {
      const part = text.slice(i, i + 2048);
      pieces.push(foldedSearchText(part, options));
      yield part.length;
    }
    // Native join is indivisible; its copied units are charged before publication.
    const graphemes = pieces.join('');
    yield graphemes.length;
    return Object.freeze({ graphemes });
  }
  const tokens: string[] = [];
  const offsets: number[] = [];
  operations = 0;
  for (const part of sourceBoundaries(text).segmentEvents()) {
    if (typeof part === 'number') { yield part; continue; }
    tokens.push(normalizedSearchText(part.segment, options));
    offsets.push(part.index);
    operations += part.segment.length + 2;
    if (operations >= 256) { yield operations; operations = 0; }
  }
  offsets.push(text.length);
  const ownedOffsets = new Uint32Array(offsets.length);
  yield operations + offsets.length;
  operations = 0;
  for (let i = 0; i < offsets.length; i += 1) {
    ownedOffsets[i] = offsets[i] ?? 0;
    if (++operations === 256) { yield operations; operations = 0; }
  }
  if (operations !== 0) yield operations;
  return Object.freeze({ graphemes: Object.freeze(tokens), offsets: ownedOffsets });
}

/** Fold the original tokens without resegmenting or allocating another offset table. */
export function* foldTextSearchTokensWork(index: TextSearchIndex): Generator<number, TextSearchTokens> {
  const original = index.graphemes;
  if (typeof original === 'string') {
    if (original.length <= 2048) {
      const folded = original.toLowerCase();
      yield original.length;
      return folded;
    }
    const pieces: string[] = [];
    for (let start = 0; start < original.length; start += 2048) {
      const part = original.slice(start, start + 2048);
      pieces.push(part.toLowerCase());
      yield part.length;
    }
    const folded = pieces.join('');
    yield original.length;
    return folded;
  }
  const folded: string[] = [];
  let operations = 0;
  for (const token of original) {
    folded.push(token.toLowerCase());
    operations += token.length + 1;
    if (operations >= 256) { yield operations; operations = 0; }
  }
  if (operations !== 0) yield operations;
  return Object.freeze(folded);
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
): Generator<number, CompiledTextSearchQuery> {
  const { graphemes } = yield* createTextSearchIndexWork(query, options);
  const failure = new Uint32Array(graphemes.length);
  yield graphemes.length;
  let operations = 0;
  for (let i = 1, prefix = 0; i < graphemes.length; i += 1) {
    while (prefix > 0 && graphemes[i] !== graphemes[prefix]) {
      prefix = failure[prefix - 1] ?? 0;
      if (++operations === 256) { yield operations; operations = 0; }
    }
    if (graphemes[i] === graphemes[prefix]) prefix += 1;
    failure[i] = prefix;
    operations += 2;
    if (operations >= 256) { yield operations; operations = 0; }
  }
  if (operations !== 0) yield operations;
  return Object.freeze({ graphemes, failure });
}

/** Linear token matching; native string search handles bounded ASCII spans. */
export function* textMatchStarts(
  index: TextSearchIndex,
  query: CompiledTextSearchQuery,
): Generator<number, void> {
  for (const event of textMatchEvents(index, query)) if (event >= 0) yield event;
}

/** Negative events charge work; nonnegative events are non-overlapping match offsets. */
export function* textMatchEvents(
  index: TextSearchIndex, query: CompiledTextSearchQuery,
): Generator<number, void> {
  yield* textTokenMatchEvents(index.graphemes, query);
}

export function* textTokenMatchEvents(
  text: TextSearchTokens, query: CompiledTextSearchQuery,
): Generator<number, void> {
  const needle = query.graphemes;
  if (needle.length === 0) return;
  if (typeof text === 'string' && typeof needle === 'string' && text.length <= 2048 && needle.length <= 2048) {
    let cursor = 0;
    while (cursor <= text.length - needle.length) {
      const start = text.indexOf(needle, cursor);
      const inspected = start < 0 ? text.length - cursor : start - cursor + needle.length;
      if (inspected > 0) yield -inspected;
      if (start < 0) return;
      yield start;
      cursor = start + needle.length;
    }
    return;
  }
  let operations = 0;
  let nonempty = false;
  for (const part of needle) {
    if (part.length !== 0) nonempty = true;
    if (++operations === 256) { yield -operations; operations = 0; }
  }
  if (!nonempty) { if (operations !== 0) yield -operations; return; }
  let matched = 0;
  for (let i = 0; i < text.length; i += 1) {
    while (matched > 0 && text[i] !== needle[matched]) {
      matched = query.failure[matched - 1] ?? 0;
      if (++operations === 256) { yield -operations; operations = 0; }
    }
    if (text[i] === needle[matched]) matched += 1;
    if (++operations === 256) { yield -operations; operations = 0; }
    if (matched === needle.length) {
      if (operations !== 0) { yield -operations; operations = 0; }
      yield i - matched + 1;
      matched = 0;
    }
  }
  if (operations !== 0) yield -operations;
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
  return foldedSearchText(accentNormalized, options);
}

/** Printable ASCII is already NFC/NFD and has no combining marks. */
function foldedSearchText(text: string, options: TextHighlightOptions): string {
  return options.caseSensitive === true
    ? text
    : options.locale === undefined
      ? text.toLowerCase()
      : text.toLocaleLowerCase(options.locale);
}
