import { clipRenderSpans } from '../render-primitives.ts';
import type { RenderSpan } from '../render-primitives.ts';

export interface TooltipLine {
  readonly spans: readonly RenderSpan[];
}

export function tooltipLines(
  title: readonly RenderSpan[],
  body: readonly (readonly RenderSpan[])[],
  maxCells: number
): readonly TooltipLine[] {
  const lines: TooltipLine[] = [];
  if (title.length > 0) lines.push({ spans: clipRenderSpans(title, maxCells) });
  for (const current of body) {
    lines.push({ spans: clipRenderSpans(current, maxCells) });
  }
  return lines;
}
