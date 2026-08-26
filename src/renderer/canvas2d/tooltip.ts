import { clipRenderSpans } from '../../visual/render-content.ts';
import type { RenderSpan } from '../../visual/render-content.ts';
import type { TextWidthProfile } from '../../text/index.ts';

export interface TooltipLine {
  readonly spans: readonly RenderSpan[];
}

export function tooltipLines(
  title: readonly RenderSpan[],
  body: readonly (readonly RenderSpan[])[],
  maxCells: number,
  widthProfile: TextWidthProfile
): readonly TooltipLine[] {
  const lines: TooltipLine[] = [];
  if (title.length > 0) lines.push({ spans: clipRenderSpans(title, maxCells, { widthProfile }) });
  for (const current of body) {
    lines.push({ spans: clipRenderSpans(current, maxCells, { widthProfile }) });
  }
  return lines;
}
