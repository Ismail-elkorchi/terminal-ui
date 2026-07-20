import { createTerminalTextIndex } from './terminal-text-index.ts';
import type { TerminalTextIndex, TextMeasurementOptions } from './types.ts';

export interface TextHighlightMatch {
  readonly startGrapheme: number;
  readonly endGrapheme: number;
}

export interface TextHighlightOptions extends TextMeasurementOptions {
  readonly caseSensitive?: boolean;
  readonly accentSensitive?: boolean;
  readonly locale?: string;
}

export interface PreparedTextSearchIndex {
  readonly textIndex: TerminalTextIndex;
  readonly graphemes: readonly string[];
}

export interface PreparedTextSearchQuery {
  readonly graphemes: readonly string[];
}

export function prepareTextSearchIndex(
  text: string,
  options: TextHighlightOptions = {}
): PreparedTextSearchIndex {
  const textIndex = createTerminalTextIndex(text, options);
  return Object.freeze({
    textIndex,
    graphemes: normalizedGraphemes(textIndex, options)
  });
}

export function prepareTextSearchQuery(
  query: string,
  options: TextHighlightOptions = {}
): PreparedTextSearchQuery {
  return Object.freeze({
    graphemes: normalizedGraphemes(createTerminalTextIndex(query, options), options)
  });
}

export function findPreparedTextMatches(
  index: PreparedTextSearchIndex,
  query: PreparedTextSearchQuery
): readonly TextHighlightMatch[] {
  if (query.graphemes.length === 0 || query.graphemes.every((grapheme) => grapheme.length === 0)) return [];
  const matches: TextHighlightMatch[] = [];
  for (let start = 0; start <= index.graphemes.length - query.graphemes.length;) {
    if (matchesAt(index.graphemes, query.graphemes, start)) {
      matches.push({ startGrapheme: start, endGrapheme: start + query.graphemes.length });
      start += query.graphemes.length;
    } else {
      start += 1;
    }
  }
  return Object.freeze(matches);
}

function normalizedGraphemes(
  index: TerminalTextIndex,
  options: TextHighlightOptions
): readonly string[] {
  return Object.freeze(index.graphemes.map((grapheme) => normalizedSearchText(grapheme.text, options)));
}

function matchesAt(text: readonly string[], query: readonly string[], start: number): boolean {
  for (let offset = 0; offset < query.length; offset += 1) {
    if (text[start + offset] !== query[offset]) return false;
  }
  return true;
}

function normalizedSearchText(text: string, options: TextHighlightOptions): string {
  const accentNormalized = options.accentSensitive === false
    ? text.normalize('NFD').replace(/\p{Mark}/gu, '')
    : text.normalize('NFC');
  return options.caseSensitive === true
    ? accentNormalized
    : accentNormalized.toLocaleLowerCase(options.locale);
}
