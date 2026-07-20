import {
  findPreparedTextMatches,
  prepareTextSearchIndex,
  prepareTextSearchQuery
} from './search-index.ts';
import type { TextHighlightMatch, TextHighlightOptions } from './search-index.ts';

export function findTextHighlightMatches(
  text: string,
  query: string,
  options: TextHighlightOptions = {}
): readonly TextHighlightMatch[] {
  return findPreparedTextMatches(
    prepareTextSearchIndex(text, options),
    prepareTextSearchQuery(query, options)
  );
}
