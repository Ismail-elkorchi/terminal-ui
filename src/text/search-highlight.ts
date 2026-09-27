import type { TextHighlightMatch, TextHighlightOptions } from './search-index.ts';
import { compileTextSearchQuery, createTextSearchIndex, findTextMatches } from './search-index.ts';

export function findTextHighlightMatches(
  text: string,
  query: string,
  options: TextHighlightOptions = {}
): readonly TextHighlightMatch[] {
  return findTextMatches(
    createTextSearchIndex(text, options),
    compileTextSearchQuery(query, options)
  );
}
