import { span } from '../../component/index.ts';
import type { FrameCellSource } from '../../visual/frame-source.ts';
import type { RenderSpan, TerminalStyle } from '../../visual/render-content.ts';
import type { QueryMatchRange } from '../../text/query.ts';

export function queryLabelSpans(
  label: string,
  ranges: readonly QueryMatchRange[],
  baseStyle: TerminalStyle | undefined,
  matchStyle: TerminalStyle | undefined,
  source: (matched: boolean) => FrameCellSource,
): RenderSpan[] {
  if (ranges.length === 0) {
    return [span(label, {
      ...(baseStyle === undefined ? {} : { style: baseStyle }),
      source: source(false),
    })];
  }
  const spans: RenderSpan[] = [];
  let cursor = 0;
  for (const range of ranges) {
    if (range.start > cursor) {
      spans.push(span(label.slice(cursor, range.start), {
        ...(baseStyle === undefined ? {} : { style: baseStyle }),
        source: source(false),
      }));
    }
    if (range.end > range.start) {
      spans.push(span(label.slice(range.start, range.end), {
        ...(matchStyle === undefined ? {} : { style: matchStyle }),
        source: source(true),
      }));
    }
    cursor = Math.max(cursor, range.end);
  }
  if (cursor < label.length) {
    spans.push(span(label.slice(cursor), {
      ...(baseStyle === undefined ? {} : { style: baseStyle }),
      source: source(false),
    }));
  }
  return spans;
}
