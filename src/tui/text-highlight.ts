import { createTerminalTextIndex, findTextHighlightMatches } from '../text/index.ts';
import type { TextHighlightOptions } from '../text/index.ts';
import type { RenderSpan, TerminalStyle } from './render-primitives.ts';

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
    const start = index.graphemeIndexToCodeUnitOffset(match.startGrapheme);
    const end = index.graphemeIndexToCodeUnitOffset(match.endGrapheme);
    if (start > cursor) spans.push(spanForText(text.slice(cursor, start), options.baseStyle));
    spans.push(spanForText(text.slice(start, end), mergeStyles(options.baseStyle, options.matchStyle), true));
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

function mergeStyles(base: TerminalStyle | undefined, match: TerminalStyle | undefined): TerminalStyle | undefined {
  if (base === undefined) return match;
  if (match === undefined) return base;
  return { ...base, ...match };
}
