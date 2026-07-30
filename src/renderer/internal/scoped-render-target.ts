import { measureTextCells } from '../../text/index.ts';
import type { Rect } from '../../geometry/types.ts';
import type { RenderBlock, RenderLine, RenderSpan } from '../../visual/render.ts';
import type { RenderTarget, RenderTargetCell } from '../contracts.ts';
import { normalizeCustomTerminalStyle } from './extension-output.ts';
import { intersectRects } from './rect.ts';

export function createScopedRenderTarget(
  target: RenderTarget,
  bounds: Rect,
  viewport: Rect,
  owner: string
): RenderTarget {
  const writableBounds = intersectRects(bounds, viewport);
  const write = (row: number, column: number, spans: readonly RenderSpan[]): void => {
    if (writableBounds === undefined || !rowInside(row, writableBounds)) return;
    writeClippedSpans(target, writableBounds, row, column, spans, owner);
  };
  return Object.freeze({
    width: target.width,
    height: target.height,
    widthProfile: target.widthProfile,
    write,
    writeLine(row: number, column: number, line: RenderLine): void {
      if (writableBounds === undefined || !rowInside(row, writableBounds)) return;
      writeClippedSpans(target, writableBounds, row, column, line.spans, owner);
    },
    writeBlock(row: number, column: number, block: RenderBlock): void {
      if (writableBounds === undefined) return;
      for (const [offset, line] of block.lines.entries()) {
        const targetRow = row + offset;
        if (rowInside(targetRow, writableBounds)) {
          writeClippedSpans(target, writableBounds, targetRow, column, line.spans, owner);
        }
      }
    },
    writeCell(cell: RenderTargetCell): void {
      if (cell.continuation === true) return;
      write(cell.row, cell.column, [{
        text: cell.text,
        ...(cell.style === undefined ? {} : { style: cell.style }),
        ...(cell.link === undefined ? {} : { link: cell.link }),
        ...(cell.source === undefined ? {} : { source: cell.source })
      }]);
    },
    clear(rect?: Rect): void {
      if (writableBounds === undefined) return;
      const requested = rect === undefined ? writableBounds : validRect(rect);
      if (requested === undefined) return;
      const clipped = intersectRects(writableBounds, requested);
      if (clipped !== undefined) target.clear(clipped);
    }
  } satisfies RenderTarget);
}

function writeClippedSpans(
  target: RenderTarget,
  bounds: Rect,
  row: number,
  column: number,
  spans: readonly RenderSpan[],
  owner: string
): void {
  let nextColumn = Math.floor(column);
  const right = bounds.column + bounds.width;
  for (const span of spans) {
    const measured = measureTextCells(span.text, { widthProfile: target.widthProfile });
    const style = span.style === undefined
      ? undefined
      : normalizeCustomTerminalStyle(span.style, `Custom renderer "${owner}" render span style`);
    const metadata = {
      ...(style === undefined ? {} : { style }),
      ...(span.link === undefined ? {} : { link: span.link }),
      ...(span.source === undefined ? {} : { source: span.source })
    };
    for (const grapheme of measured.graphemes) {
      const endColumn = nextColumn + grapheme.cells;
      const fullyInside = grapheme.cells === 0
        ? nextColumn > bounds.column && nextColumn <= right
        : nextColumn >= bounds.column && endColumn <= right;
      if (fullyInside) {
        target.write(row, nextColumn, [{ text: grapheme.text, ...metadata }]);
      }
      nextColumn = endColumn;
    }
  }
}

function rowInside(row: number, bounds: Rect): boolean {
  return Number.isSafeInteger(row) && row >= bounds.row && row < bounds.row + bounds.height;
}

function validRect(rect: Rect): Rect | undefined {
  return Number.isSafeInteger(rect.row)
    && Number.isSafeInteger(rect.column)
    && Number.isSafeInteger(rect.width)
    && rect.width >= 0
    && Number.isSafeInteger(rect.height)
    && rect.height >= 0
    ? rect
    : undefined;
}
