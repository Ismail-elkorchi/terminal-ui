import { clipRenderSpans } from '../../render-primitives.ts';
import type { FrameBuffer, RenderBlock, RenderLine } from '../../frame.ts';
import type { Rect } from '../../layout.ts';

export function writeBlock(buffer: FrameBuffer, bounds: Rect, text: string): void {
  writeRenderBlock(buffer, bounds, {
    lines: text.split('\n').map((lineText) => ({ spans: [{ text: lineText }] }))
  });
}

export function writeRenderBlock(buffer: FrameBuffer, bounds: Rect, block: RenderBlock): void {
  if (bounds.width <= 0 || bounds.height <= 0) return;
  const lines = block.lines.slice(0, bounds.height);
  for (let offset = 0; offset < lines.length; offset += 1) {
    const clipped = clipRenderLine(lines[offset] ?? { spans: [] }, bounds.width);
    buffer.writeLine(bounds.row + offset, bounds.column, clipped);
  }
}

function clipRenderLine(renderLine: RenderLine, maxCells: number): RenderLine {
  return { spans: clipRenderSpans(renderLine.spans, Math.max(0, maxCells)) };
}
