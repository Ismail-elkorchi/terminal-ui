import { measureTextCells } from '../../text/index.ts';
import type { Rect } from '../../geometry/types.ts';
import type { RenderBlock, RenderLine, RenderSpan } from '../../visual/render.ts';
import {
  frameCellSource
} from '../../visual/source.ts';
import type { FrameCellSource } from '../../visual/source.ts';
import { normalizeTerminalStyle } from '../../visual/terminal-style.ts';
import type { RenderTarget, RenderTargetCell } from '../contracts.ts';
import { intersectRects } from './rect.ts';

/** Creates the bounded, write-only target exposed to component definitions. */
export function createLocalComponentRenderTarget(
  target: RenderTarget,
  bounds: Rect,
  viewport: Rect,
  owner: ScopedRenderOwner
): RenderTarget {
  const absolute = createBoundedRenderTarget(target, bounds, viewport, owner);
  const toAbsoluteRect = (rect: Rect): Rect => ({
    row: bounds.row + rect.row,
    column: bounds.column + rect.column,
    width: rect.width,
    height: rect.height
  });
  return Object.freeze({
    width: bounds.width,
    height: bounds.height,
    widthProfile: target.widthProfile,
    write: (row, column, spans) => { absolute.write(bounds.row + row, bounds.column + column, spans); },
    writeLine: (row, column, line) => { absolute.writeLine(bounds.row + row, bounds.column + column, line); },
    writeBlock: (row, column, block) => { absolute.writeBlock(bounds.row + row, bounds.column + column, block); },
    writeCell: (cell) => { absolute.writeCell({
      ...cell,
      row: bounds.row + cell.row,
      column: bounds.column + cell.column
    }); },
    clear: (rect) => { absolute.clear(rect === undefined ? undefined : toAbsoluteRect(rect)); }
  } satisfies RenderTarget);
}

export function createClippedRenderTarget(
  target: RenderTarget,
  bounds: Rect,
  viewport: Rect
): RenderTarget {
  return createBoundedRenderTarget(target, bounds, viewport);
}

function createBoundedRenderTarget(
  target: RenderTarget,
  bounds: Rect,
  viewport: Rect,
  owner?: ScopedRenderOwner
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

export interface ScopedRenderOwner {
  readonly id?: string;
  readonly name: string;
  readonly rendererFamily?: string;
}

export function scopedFrameSource(
  owner: ScopedRenderOwner,
  source?: FrameCellSource
): FrameCellSource {
  return frameCellSource({
    ...source,
    ...(owner.id === undefined ? {} : { elementId: owner.id }),
    elementKind: owner.name,
    rendererFamily: owner.rendererFamily ?? 'component',
    cellRole: source?.cellRole ?? 'content'
  });
}

function writeClippedSpans(
  target: RenderTarget,
  bounds: Rect,
  row: number,
  column: number,
  spans: readonly RenderSpan[],
  owner: ScopedRenderOwner | undefined
): void {
  let nextColumn = Math.floor(column);
  const right = bounds.column + bounds.width;
  for (const span of spans) {
    const measured = measureTextCells(span.text, { widthProfile: target.widthProfile });
    const style = span.style === undefined || owner === undefined
      ? span.style
      : normalizeTerminalStyle(
          span.style,
          `Component "${owner.name}" render span style`
        );
    const metadata = {
      ...(style === undefined ? {} : { style }),
      ...(span.link === undefined ? {} : { link: span.link }),
      ...(owner === undefined
        ? span.source === undefined ? {} : { source: span.source }
        : { source: scopedFrameSource(owner, span.source) })
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
