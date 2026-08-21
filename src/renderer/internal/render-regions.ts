import { createCompositingFrameBuffer } from './frame-buffer.ts';
import { createDirtyRegionSet } from './dirty-regions.ts';
import type { TerminalSize } from '../../geometry/types.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import type { DirtyRegionSet } from './dirty-regions.ts';
import type { FrameBuffer, FrameBufferSnapshot, FrameBufferSnapshotOptions } from './frame-buffer.ts';
import { frameSnapshotMetadata, registerFrameSnapshotMetadata } from './frame-snapshot.ts';
import type { FrameSnapshotMetadata } from './frame-snapshot.ts';
import type { FrameCell, FrameHitTarget } from '../contracts.ts';
import type { GraphicPlacement } from '../../graphics/index.ts';
import type { FocusPath, LayoutFocusTarget } from './focus.ts';
import type { ResolvedPointerFocusIntent } from '../../interaction/focus.ts';
import type { LayerUnderlay } from '../../element/metadata.ts';
import type { LayoutNode, Rect } from '../contracts.ts';
import type { PointerEventKind, RoutedPointerEvent } from '../../input/pointer.ts';
import type { HitTarget } from '../contracts.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import {
  scrollRouteDescriptor,
  type ScrollRoutable,
} from '../../interaction/scroll-route.ts';

export interface RenderRegionHitTarget<TMessage = unknown> extends FrameHitTarget, ScrollRoutable<TMessage> {
  readonly ownerIdentity: string;
  readonly accepts?: readonly PointerEventKind[];
  message(event: RoutedPointerEvent): MessageResolution<TMessage>;
}

export interface RenderRegion<TMessage = unknown> {
  readonly id: string;
  readonly zIndex: number;
  readonly order: number;
  readonly bounds: Rect;
  readonly underlay: LayerUnderlay;
  readonly backdropBounds?: Rect;
  readonly cells: readonly FrameCell[];
  readonly graphics: readonly GraphicPlacement[];
  readonly metadata: FrameSnapshotMetadata;
  readonly hitTargets: readonly RenderRegionHitTarget<TMessage>[];
  readonly focusTargets: readonly LayoutFocusTarget[];
}

export function toRegionHitTarget<TMessage>(
  hitTarget: HitTarget<TMessage>,
  region: { readonly zIndex: number },
  ownerIdentity: string,
  focus: ResolvedPointerFocusIntent | undefined
): RenderRegionHitTarget<TMessage> {
  return {
    id: hitTarget.id,
    ownerIdentity,
    bounds: hitTarget.bounds,
    ...(hitTarget.accepts === undefined ? {} : { accepts: hitTarget.accepts }),
    ...(focus === undefined ? {} : { focus }),
    message: (event) => hitTarget.message(event),
    ...((hitTarget as ScrollRoutable<TMessage>)[scrollRouteDescriptor] === undefined ? {} : {
      [scrollRouteDescriptor]: (hitTarget as ScrollRoutable<TMessage>)[scrollRouteDescriptor],
    }),
    ...(hitTarget.cursor === undefined ? {} : { cursor: hitTarget.cursor }),
    zIndex: hitTarget.zIndex ?? region.zIndex
  };
}

export function hitTargetOwnerIdentity(path: FocusPath, nodeIdentity: string): string {
  return [...path, nodeIdentity].map((segment) => `${String(segment.length)}:${segment}`).join('');
}

export function regionIdForLayoutNode(node: LayoutNode, path: FocusPath): string {
  const identityPath = path.length === 0 ? [node.identity] : path;
  return `region:${identityPath.map(regionIdSegment).join('/')}:z:${String(node.layer.zIndex)}`;
}

export interface DraftRenderRegion {
  readonly id: string;
  readonly zIndex: number;
  readonly order: number;
  readonly bounds: Rect;
  readonly underlay: LayerUnderlay;
  readonly backdropBounds?: Rect;
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
    readonly terminalSize: TerminalSize;
    readonly bounds: Rect;
    readonly underlay: LayerUnderlay;
    readonly backdropBounds?: Rect;
    readonly widthProfile: TextWidthProfile;
  }
): DraftRenderRegion {
  const { id, zIndex, order, terminalSize, bounds, underlay, backdropBounds, widthProfile } = input;
  const regionBounds = normalizeRegionBounds(terminalSize, bounds);
  return {
    id,
    zIndex,
    order,
    bounds: regionBounds,
    underlay,
    ...(backdropBounds === undefined ? {} : { backdropBounds }),
    buffer: createRegionFrameBuffer(terminalSize, regionBounds, widthProfile)
  };
}

function createRegionFrameBuffer(terminalSize: TerminalSize, bounds: Rect, widthProfile: TextWidthProfile): FrameBuffer {
  const local = createCompositingFrameBuffer(bounds.width, bounds.height, { widthProfile });
  return {
    width: terminalSize.columns,
    height: terminalSize.rows,
    widthProfile: local.widthProfile,
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
    placeGraphic(placement) {
      local.placeGraphic({
        ...placement,
        bounds: toLocalRect(bounds, placement.bounds),
        ...(placement.clip === undefined ? {} : { clip: toLocalRect(bounds, placement.clip) })
      });
    },
    readCell(row, column) {
      const cell = local.readCell(toLocalRow(bounds, row), toLocalColumn(bounds, column));
      return cell === undefined ? undefined : toTerminalCell(bounds, cell);
    },
    occludeGraphics(rect) {
      const occlusion = intersectRects(bounds, rect);
      if (occlusion !== undefined) local.occludeGraphics(toLocalRect(bounds, occlusion));
    },
    removeGraphic(id) {
      local.removeGraphic(id);
    },
    clear(rect) {
      const clearBounds = rect === undefined ? bounds : intersectRects(bounds, rect);
      if (clearBounds === undefined) return;
      local.clear(toLocalRect(bounds, clearBounds));
    },
    snapshot(options?: FrameBufferSnapshotOptions): FrameBufferSnapshot {
      const frame = local.snapshot(options);
      const metadata = frameSnapshotMetadata(frame);
      if (metadata === undefined) throw new Error('Framework frame snapshot metadata is unavailable.');
      const translated = Object.freeze({
        ...frame,
        width: terminalSize.columns,
        height: terminalSize.rows,
        cells: Object.freeze(frame.cells.map((cell) => toTerminalCell(bounds, cell))),
        graphics: Object.freeze(frame.graphics.map((placement) => Object.freeze({
          ...placement,
          bounds: toTerminalRect(bounds, placement.bounds),
          clip: toTerminalRect(bounds, placement.clip)
        }))),
      }) as FrameBufferSnapshot;
      return registerFrameSnapshotMetadata(translated, translateSnapshotMetadata(bounds, metadata));
    }
  };
}

function toTerminalRect(bounds: Rect, rect: Rect): Rect {
  return {
    row: rect.row + bounds.row - 1,
    column: rect.column + bounds.column - 1,
    width: rect.width,
    height: rect.height
  };
}

function normalizeRegionBounds(terminalSize: TerminalSize, bounds: Rect): Rect {
  const terminalBounds = { row: 1, column: 1, width: terminalSize.columns, height: terminalSize.rows };
  return intersectRects(terminalBounds, bounds) ?? {
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

function toTerminalCell(bounds: Rect, cell: FrameCell): FrameCell {
  return {
    ...cell,
    row: cell.row + bounds.row - 1,
    column: cell.column + bounds.column - 1
  };
}

function translateSnapshotMetadata(bounds: Rect, metadata: FrameSnapshotMetadata): FrameSnapshotMetadata {
  return Object.freeze({
    writtenBounds: translateDirtyRegionSet(bounds, metadata.writtenBounds),
    clearedBounds: translateDirtyRegionSet(bounds, metadata.clearedBounds),
    rowFingerprints: Object.freeze(metadata.rowFingerprints.map((entry) => Object.freeze({
      row: entry.row + bounds.row - 1,
      fingerprint: entry.fingerprint,
      terminalFingerprint: entry.terminalFingerprint,
    }))),
    rowIndexes: Object.freeze(metadata.rowIndexes.map((entry) => {
      const cells = new Map<number, FrameCell>();
      for (const cell of entry.cells.values()) {
        const translated = toTerminalCell(bounds, cell);
        cells.set(translated.column, translated);
      }
      return Object.freeze({
        row: entry.row + bounds.row - 1,
        cells,
        renderable: Object.freeze(entry.renderable.map((cell) => toTerminalCell(bounds, cell))),
        fingerprint: entry.fingerprint,
        terminalFingerprint: entry.terminalFingerprint,
      });
    })),
    fingerprint: metadata.fingerprint,
    terminalFingerprint: metadata.terminalFingerprint,
  });
}

function translateDirtyRegionSet(bounds: Rect, dirtyRegions: DirtyRegionSet): DirtyRegionSet {
  return createDirtyRegionSet(dirtyRegions.rects.map((rect) => ({
    row: rect.row + bounds.row - 1,
    column: rect.column + bounds.column - 1,
    width: rect.width,
    height: rect.height
  })));
}
