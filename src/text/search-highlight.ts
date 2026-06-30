import { createTerminalTextIndex } from './terminal-text-index.ts';
import type { TextMeasurementOptions } from './types.ts';

export interface TextHighlightMatch {
  readonly startGrapheme: number;
  readonly endGrapheme: number;
}

export interface TextHighlightOptions extends TextMeasurementOptions {
  readonly caseSensitive?: boolean;
  readonly accentSensitive?: boolean;
  readonly locale?: string;
}

export function findTextHighlightMatches(
  text: string,
  query: string,
  options: TextHighlightOptions = {}
): readonly TextHighlightMatch[] {
  const textIndex = createTerminalTextIndex(text, options);
  const queryIndex = createTerminalTextIndex(query, options);
  if (queryIndex.graphemes.length === 0) return [];

  const textGraphemes = textIndex.graphemes.map((grapheme) => normalizedSearchText(grapheme.text, options));
  const queryGraphemes = queryIndex.graphemes.map((grapheme) => normalizedSearchText(grapheme.text, options));
  if (queryGraphemes.every((grapheme) => grapheme.length === 0)) return [];

  const matches: TextHighlightMatch[] = [];
  for (let start = 0; start <= textGraphemes.length - queryGraphemes.length;) {
    if (matchesAt(textGraphemes, queryGraphemes, start)) {
      matches.push({ startGrapheme: start, endGrapheme: start + queryGraphemes.length });
      start += queryGraphemes.length;
      continue;
    }
    start += 1;
  }
  return Object.freeze(matches);
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
