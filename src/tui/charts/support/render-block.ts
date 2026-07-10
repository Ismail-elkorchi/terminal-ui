import { createFrameBuffer } from '../../frame-buffer.ts';
import { clipRenderSpans } from '../../render-primitives.ts';
import type { RenderBlock, RenderSpan } from '../../render-primitives.ts';

export function frameBufferBlock(
  buffer: ReturnType<typeof createFrameBuffer>,
  width: number,
  height: number
): RenderBlock {
  const rows = Array.from({ length: height }, (): RenderSpan[] =>
    Array.from({ length: width }, (): RenderSpan => ({ text: ' ' }))
  );
  for (const cell of buffer.snapshot().cells) {
    const row = rows[cell.row - 1];
    if (row === undefined || cell.column < 1 || cell.column > width) continue;
    row[cell.column - 1] = {
      text: cell.text,
      ...(cell.style === undefined ? {} : { style: cell.style }),
      ...(cell.link === undefined ? {} : { link: cell.link }),
      ...(cell.source === undefined ? {} : { source: cell.source })
    };
  }
  return {
    lines: rows.map((row) => ({ spans: trimTrailingPlainSpaces(row) }))
  };
}

export function clipLineSpans(spans: readonly RenderSpan[], width: number): readonly RenderSpan[] {
  return clipRenderSpans(spans, width);
}

function trimTrailingPlainSpaces(spans: readonly RenderSpan[]): readonly RenderSpan[] {
  let end = spans.length;
  while (end > 0) {
    const current = spans[end - 1];
    if (
      current?.text !== ' '
      || current.style !== undefined
      || current.link !== undefined
      || current.source !== undefined
    ) break;
    end -= 1;
  }
  return spans.slice(0, end);
}
