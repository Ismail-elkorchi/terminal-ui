import {
  findTextMatches,
  createTextSearchIndex,
  compileTextSearchQuery
} from './search-index.ts';
import type { TextHighlightMatch, TextHighlightOptions } from './search-index.ts';

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
