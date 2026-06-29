import { createFrameBuffer } from './frame.ts';
import type { TerminalViewport } from '../host/index.ts';
import type { FrameBuffer, FrameBufferSnapshotOptions, FrameCell, FrameHitTarget } from './frame.ts';
import type { LayoutFocusTarget } from './focus.ts';
import type { Rect } from './layout.ts';

export interface RenderRegion {
  readonly id: string;
  readonly zIndex: number;
  readonly order: number;
  readonly bounds: Rect;
  readonly opacity: 'opaque' | 'transparent' | 'inheritBackground';
  readonly cells: readonly FrameCell[];
  readonly hitTargets: readonly FrameHitTarget[];
  readonly focusTargets: readonly LayoutFocusTarget[];
}

export interface DraftRenderRegion {
  readonly id: string;
  readonly zIndex: number;
  readonly order: number;
  readonly bounds: Rect;
  readonly buffer: FrameBuffer;
}

export function createDraftRenderRegion(
  input: {
    readonly id: string;
    readonly zIndex: number;
    readonly order: number;
    readonly viewport: TerminalViewport;
    readonly bounds: Rect;
  }
): DraftRenderRegion {
  const { id, zIndex, order, viewport, bounds } = input;
  const regionBounds = normalizeRegionBounds(viewport, bounds);
  return {
    id,
    zIndex,
    order,
    bounds: regionBounds,
    buffer: createRegionFrameBuffer(viewport, regionBounds)
  };
}

function createRegionFrameBuffer(viewport: TerminalViewport, bounds: Rect): FrameBuffer {
  const local = createFrameBuffer(bounds.width, bounds.height);
  return {
    width: viewport.columns,
    height: viewport.rows,
    write(row, column, spans) {
      local.write(toLocalRow(bounds, row), toLocalColumn(bounds, column), spans);
    },
    writeLine(row, column, line) {
      local.writeLine(toLocalRow(bounds, row), toLocalColumn(bounds, column), line);
    },
    writeBlock(row, column, block) {
      local.writeBlock(toLocalRow(bounds, row), toLocalColumn(bounds, column), block);
    },
    writeCell(cell) {
      if (!cellInside(cell, bounds)) return;
      local.writeCell(toLocalCell(bounds, cell));
    },
    clear(rect) {
      const clearBounds = rect === undefined ? bounds : intersectRects(bounds, rect);
      if (clearBounds === undefined) return;
      local.clear(toLocalRect(bounds, clearBounds));
    },
    snapshot(options?: FrameBufferSnapshotOptions) {
      const frame = local.snapshot(options);
      return {
        ...frame,
        width: viewport.columns,
        height: viewport.rows,
        cells: frame.cells.map((cell) => toViewportCell(bounds, cell))
      };
    }
  };
}

function normalizeRegionBounds(viewport: TerminalViewport, bounds: Rect): Rect {
  const viewportBounds = { row: 1, column: 1, width: viewport.columns, height: viewport.rows };
  return intersectRects(viewportBounds, bounds) ?? {
    row: Math.max(1, Math.floor(bounds.row)),
    column: Math.max(1, Math.floor(bounds.column)),
    width: 0,
    height: 0
  };
}

function intersectRects(left: Rect, right: Rect): Rect | undefined {
  const row = Math.max(left.row, right.row);
  const column = Math.max(left.column, right.column);
  const bottom = Math.min(left.row + left.height, right.row + right.height);
  const rightEdge = Math.min(left.column + left.width, right.column + right.width);
  const width = Math.max(0, rightEdge - column);
  const height = Math.max(0, bottom - row);
  return width === 0 || height === 0 ? undefined : { row, column, width, height };
}

function cellInside(cell: FrameCell, bounds: Rect): boolean {
  return cell.row >= bounds.row
    && cell.row < bounds.row + bounds.height
    && cell.column >= bounds.column
    && cell.column < bounds.column + bounds.width;
}

function toLocalRow(bounds: Rect, row: number): number {
  return row - bounds.row + 1;
}

function toLocalColumn(bounds: Rect, column: number): number {
  return column - bounds.column + 1;
}

function toLocalRect(bounds: Rect, rect: Rect): Rect {
  return {
    row: toLocalRow(bounds, rect.row),
    column: toLocalColumn(bounds, rect.column),
    width: rect.width,
    height: rect.height
  };
}

function toLocalCell(bounds: Rect, cell: FrameCell): FrameCell {
  return {
    ...cell,
    row: toLocalRow(bounds, cell.row),
    column: toLocalColumn(bounds, cell.column)
  };
}

function toViewportCell(bounds: Rect, cell: FrameCell): FrameCell {
  return {
    ...cell,
    row: cell.row + bounds.row - 1,
    column: cell.column + bounds.column - 1
  };
}
