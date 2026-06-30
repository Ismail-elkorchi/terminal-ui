import { createFrameBuffer } from './frame.ts';
import { createDirtyRegionSet } from './dirty-regions.ts';
import type { TerminalViewport } from '../host/index.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
import type { FrameBuffer, FrameBufferSnapshot, FrameBufferSnapshotMetadata, FrameBufferSnapshotOptions, FrameCell, FrameHitTarget } from './frame.ts';
import type { FocusPath, LayoutFocusTarget } from './focus.ts';
import type { LayoutNode, Rect, RegionOpacity } from './layout.ts';
import type { HitTarget } from './widget-renderer.ts';

export interface RenderRegionHitTarget<TMessage = unknown> extends FrameHitTarget {
  readonly message: TMessage;
}

export interface RenderRegion<TMessage = unknown> {
  readonly id: string;
  readonly zIndex: number;
  readonly order: number;
  readonly bounds: Rect;
  readonly opacity: RegionOpacity;
  readonly cells: readonly FrameCell[];
  readonly metadata: FrameBufferSnapshotMetadata;
  readonly hitTargets: readonly RenderRegionHitTarget<TMessage>[];
  readonly focusTargets: readonly LayoutFocusTarget[];
}

export function toRegionHitTarget<TMessage>(
  hitTarget: HitTarget<TMessage>,
  region: { readonly zIndex: number }
): RenderRegionHitTarget<TMessage> {
  return {
    id: hitTarget.id,
    bounds: hitTarget.bounds,
    message: hitTarget.message,
    ...(hitTarget.cursor === undefined ? {} : { cursor: hitTarget.cursor }),
    zIndex: hitTarget.zIndex ?? region.zIndex
  };
}

export function regionIdForLayoutNode(node: LayoutNode, path: FocusPath): string {
  const semanticPath = path.length === 0 ? [node.id ?? node.layer.id] : path;
  return `region:${semanticPath.map(regionIdSegment).join('/')}:z:${String(node.layer.zIndex)}`;
}

export interface DraftRenderRegion {
  readonly id: string;
  readonly zIndex: number;
  readonly order: number;
  readonly bounds: Rect;
  readonly opacity: RegionOpacity;
  readonly buffer: FrameBuffer;
}

function regionIdSegment(value: string): string {
  return value
    .replaceAll('%', '%25')
    .replaceAll('/', '%2f')
    .replaceAll(':', '%3a');
}

export function createDraftRenderRegion(
  input: {
    readonly id: string;
    readonly zIndex: number;
    readonly order: number;
    readonly viewport: TerminalViewport;
    readonly bounds: Rect;
    readonly opacity: RegionOpacity;
  }
): DraftRenderRegion {
  const { id, zIndex, order, viewport, bounds, opacity } = input;
  const regionBounds = normalizeRegionBounds(viewport, bounds);
  return {
    id,
    zIndex,
    order,
    bounds: regionBounds,
    opacity,
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
    snapshot(options?: FrameBufferSnapshotOptions): FrameBufferSnapshot {
      const frame = local.snapshot(options);
      return {
        ...frame,
        width: viewport.columns,
        height: viewport.rows,
        cells: frame.cells.map((cell) => toViewportCell(bounds, cell)),
        metadata: translateSnapshotMetadata(bounds, frame.metadata)
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

function translateSnapshotMetadata(bounds: Rect, metadata: FrameBufferSnapshotMetadata): FrameBufferSnapshotMetadata {
  return {
    writtenBounds: translateDirtyRegionSet(bounds, metadata.writtenBounds),
    clearedBounds: translateDirtyRegionSet(bounds, metadata.clearedBounds),
    rowFingerprints: metadata.rowFingerprints,
    fingerprint: metadata.fingerprint
  };
}

function translateDirtyRegionSet(bounds: Rect, dirtyRegions: DirtyRegionSet): DirtyRegionSet {
  return createDirtyRegionSet(dirtyRegions.rects.map((rect) => ({
    row: rect.row + bounds.row - 1,
    column: rect.column + bounds.column - 1,
    width: rect.width,
    height: rect.height
  })));
}
