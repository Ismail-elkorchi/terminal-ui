import { collectLayoutFocusTargets, collectRenderNodeLayoutTargets } from './focus.ts';
import type { LayoutFocusTarget, RenderNodeLayoutTarget } from './focus.ts';
import type { RenderNode } from '../model/index.ts';
import type { LayoutNode, Rect } from '../model/layout.ts';

export interface ProjectionTargetIndex<TMessage> {
  readonly layoutTargets: readonly RenderNodeLayoutTarget<TMessage>[];
  readonly focusTargets: readonly LayoutFocusTarget[];
  layoutTargetsForRegion(zIndex: number, bounds: Rect): readonly RenderNodeLayoutTarget<TMessage>[];
  focusTargetsForRegion(zIndex: number, bounds: Rect): readonly LayoutFocusTarget[];
}

export function createProjectionTargetIndex<TMessage>(
  renderNode: RenderNode<TMessage>,
  layout: LayoutNode
): ProjectionTargetIndex<TMessage> {
  const layoutTargets = collectRenderNodeLayoutTargets(renderNode, layout);
  const focusTargets = collectLayoutFocusTargets(layout);
  const layoutByLayer = groupByLayer(layoutTargets);
  const focusByLayer = groupByLayer(focusTargets);
  return Object.freeze({
    layoutTargets,
    focusTargets,
    layoutTargetsForRegion: (zIndex: number, bounds: Rect) => overlapping(layoutByLayer.get(zIndex), bounds),
    focusTargetsForRegion: (zIndex: number, bounds: Rect) => overlapping(focusByLayer.get(zIndex), bounds)
  });
}

function groupByLayer<TTarget extends { readonly layer: { readonly zIndex: number } }>(
  targets: readonly TTarget[]
): ReadonlyMap<number, readonly TTarget[]> {
  const grouped = new Map<number, TTarget[]>();
  for (const target of targets) {
    const values = grouped.get(target.layer.zIndex) ?? [];
    values.push(target);
    grouped.set(target.layer.zIndex, values);
  }
  return new Map([...grouped].map(([zIndex, values]) => [zIndex, Object.freeze(values)]));
}

function overlapping<TTarget extends { readonly bounds: Rect }>(
  targets: readonly TTarget[] | undefined,
  bounds: Rect
): readonly TTarget[] {
  return targets?.filter((target) => rectsOverlap(target.bounds, bounds)) ?? [];
}

function rectsOverlap(left: Rect, right: Rect): boolean {
  return left.row < right.row + right.height
    && left.row + left.height > right.row
    && left.column < right.column + right.width
    && left.column + left.width > right.column;
}
