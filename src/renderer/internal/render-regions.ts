import type { TextPresentation } from '../../text/presentation.ts';
import type { LayerUnderlay } from '../../element/metadata.ts';
import { intersectRects } from '../../geometry/rect.ts';
import type { Rect, TerminalSize } from '../../geometry/types.ts';
import type { GraphicPlacement } from '../../graphics/types.ts';
import type { PointerEventKind, RoutedPointerEvent } from '../../input/pointer.ts';
import type { FocusPath, ResolvedPointerFocusIntent } from '../../interaction/focus.ts';
import type { MessageResolution } from '../../interaction/message.ts';
import { scrollRouteDescriptor, type ScrollRoutable } from '../../interaction/scroll-route.ts';
import type { TextWidthProfile } from '../../text/types.ts';
import type {
  FrameCell,
  FrameHitTarget,
  HitTarget,
  LayoutNode,
  RenderInstrumentation,
} from '../contracts.ts';
import type { FrameBuffer } from '../frame-buffer.ts';
import { createRegionFrameBuffer, seedFrameBufferRows } from '../frame-buffer.ts';
import type { LayoutFocusTarget } from './focus.ts';
import type { FrameSnapshotMetadata } from './frame-snapshot.ts';
import type { RenderNode } from './render-tree/types.ts';

export interface RenderRegionHitTarget<TMessage = unknown> extends FrameHitTarget, ScrollRoutable<TMessage> {
  readonly ownerIdentity: string;
  readonly sensitiveOrigin: boolean;
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
  focus: ResolvedPointerFocusIntent | undefined,
  sensitiveOrigin: boolean,
): RenderRegionHitTarget<TMessage> {
  return {
    id: hitTarget.id,
    ownerIdentity,
    sensitiveOrigin,
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

/** A portal owns storage even when its layer equals its clipped ancestor's. */
export function renderNodeStartsRegion(renderNode: RenderNode, node: LayoutNode, parentZIndex?: number): boolean {
  return renderNode.kind === 'portal' || node.layer.zIndex !== parentZIndex;
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
    readonly textPresentation?: TextPresentation | undefined;
    readonly instrumentation?: Pick<RenderInstrumentation, 'recordWork'>;
    readonly previous?: FrameSnapshotMetadata;
  }
): DraftRenderRegion {
  const { id, zIndex, order, terminalSize, bounds, underlay, backdropBounds, widthProfile, instrumentation } = input;
  const regionBounds = normalizeRegionBounds(terminalSize, bounds);
  return {
    id,
    zIndex,
    order,
    bounds: regionBounds,
    underlay,
    ...(backdropBounds === undefined ? {} : { backdropBounds }),
    buffer: regionBuffer(terminalSize, regionBounds, widthProfile, instrumentation, input.previous, input.textPresentation)
  };
}

function regionBuffer(
  terminalSize: TerminalSize, bounds: Rect, widthProfile: TextWidthProfile,
  instrumentation?: Pick<RenderInstrumentation, 'recordWork'>, previous?: FrameSnapshotMetadata,
  textPresentation?: TextPresentation,
): FrameBuffer {
  const buffer = createRegionFrameBuffer(terminalSize.columns, terminalSize.rows, bounds, {
    widthProfile, textPresentation, ...(instrumentation === undefined ? {} : { instrumentation }),
  });
  if (previous !== undefined) seedFrameBufferRows(buffer, previous.rowIndexes);
  return buffer;
}

function normalizeRegionBounds(terminalSize: TerminalSize, bounds: Rect): Rect {
  const terminalBounds = { row: 1, column: 1, width: terminalSize.columns, height: terminalSize.rows };
  return intersectRects(terminalBounds, bounds) ?? {
    row: Math.max(1, Math.floor(bounds.row)), column: Math.max(1, Math.floor(bounds.column)),
    width: 0, height: 0,
  };
}
