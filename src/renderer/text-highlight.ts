import { findTextHighlightMatches } from '../text/search-highlight.ts';
import type { TextHighlightOptions } from '../text/search-index.ts';
import { createTerminalTextIndex } from '../text/terminal-text-index.ts';
import type { RenderSpan, TerminalStyle } from '../visual/render-content.ts';
import { mergeTerminalStyles } from '../visual/terminal-style.ts';

export interface HighlightRenderSpansOptions extends TextHighlightOptions {
  readonly baseStyle?: TerminalStyle;
  readonly matchStyle?: TerminalStyle;
}

export interface HighlightRenderSpan extends RenderSpan {
  readonly matched?: boolean;
}

export function highlightRenderSpans(
  text: string,
  query: string,
  options: HighlightRenderSpansOptions = {}
): readonly HighlightRenderSpan[] {
  const matches = findTextHighlightMatches(text, query, options);
  if (matches.length === 0) return [spanForText(text, options.baseStyle)];

  const index = createTerminalTextIndex(text, options);
  const spans: HighlightRenderSpan[] = [];
  let cursor = 0;
  for (const match of matches) {
    const start = index.graphemeIndexToCodeUnitOffset(match.startGraphemeIndex);
    const end = index.graphemeIndexToCodeUnitOffset(match.endGraphemeIndexExclusive);
    if (start > cursor) spans.push(spanForText(text.slice(cursor, start), options.baseStyle));
    spans.push(spanForText(text.slice(start, end), mergeTerminalStyles(options.baseStyle, options.matchStyle), true));
    cursor = end;
  }
  if (cursor < text.length) spans.push(spanForText(text.slice(cursor), options.baseStyle));
  return Object.freeze(spans.filter((span) => span.text.length > 0));
}

function spanForText(text: string, style: TerminalStyle | undefined, matched?: true): HighlightRenderSpan {
  return {
    text,
    ...(style === undefined ? {} : { style }),
    ...(matched === undefined ? {} : { matched })
  };
}
