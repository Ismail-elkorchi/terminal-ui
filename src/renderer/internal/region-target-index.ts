import { rectsOverlap } from '../../geometry/rect.ts';
import type { Rect } from '../../geometry/types.ts';
import type { LayoutNode, RenderInstrumentation } from '../contracts.ts';
import type { LayoutFocusTarget, RenderNodeLayoutTarget } from './focus.ts';
import { collectLayoutFocusTargets, collectRenderNodeLayoutTargets, layoutFocusPath } from './focus.ts';
import { regionIdForLayoutNode, renderNodeStartsRegion } from './render-regions.ts';
import type { FocusPath } from '../../interaction/focus.ts';
import type { RenderNode } from './render-tree/types.ts';

export interface RegionTargetIndex<TMessage> {
  readonly layoutTargets: readonly RenderNodeLayoutTarget<TMessage>[];
  readonly focusTargets: readonly LayoutFocusTarget[];
  layoutTargetsForRegion(regionId: string, bounds: Rect): readonly RenderNodeLayoutTarget<TMessage>[];
  focusTargetsForRegion(regionId: string, bounds: Rect): readonly LayoutFocusTarget[];
}

const committedRegionIndexes = new WeakMap<LayoutNode, {
  readonly node: RenderNode;
  readonly index: RegionTargetIndex<unknown>;
}>();

export function createRegionTargetIndex<TMessage>(
  renderNode: RenderNode<TMessage>,
  layout: LayoutNode,
  instrumentation?: Pick<RenderInstrumentation, 'recordWork'>,
): RegionTargetIndex<TMessage> {
  const cached = committedRegionIndexes.get(layout);
  if (cached?.node === renderNode) return cached.index as RegionTargetIndex<TMessage>;
  const layoutTargets = collectRenderNodeLayoutTargets(renderNode, layout);
  const focusTargets = collectLayoutFocusTargets(layout, instrumentation);
  instrumentation?.recordWork?.({ kind: 'target_index_entries', count: layoutTargets.length + focusTargets.length });
  const owners = new WeakMap<LayoutNode['layer'], string>();
  const visit = (current: RenderNode, node: LayoutNode, parentPath: FocusPath, parent?: LayoutNode): void => {
    const path = layoutFocusPath(parentPath, node);
    const regionId = parent !== undefined && !renderNodeStartsRegion(current, node, parent.layer.zIndex)
      ? owners.get(parent.layer) : regionIdForLayoutNode(node, path);
    if (regionId !== undefined) owners.set(node.layer, regionId);
    for (const [index, child] of (current.children ?? []).entries()) {
      const childLayout = node.children[index];
      if (childLayout !== undefined) visit(child, childLayout, path, node);
    }
  };
  visit(renderNode, layout, []);
  const layoutByRegion = groupByRegion(layoutTargets, owners);
  const focusByRegion = groupByRegion(focusTargets, owners);
  const index = Object.freeze({
    layoutTargets,
    focusTargets,
    layoutTargetsForRegion: (regionId: string, bounds: Rect) => layoutByRegion.get(regionId)?.query(bounds, instrumentation) ?? [],
    focusTargetsForRegion: (regionId: string, bounds: Rect) => focusByRegion.get(regionId)?.query(bounds, instrumentation) ?? []
  });
  committedRegionIndexes.set(layout, { node: renderNode, index });
  return index;
}

interface IndexedTarget<TTarget> {
  readonly index: number;
  readonly target: TTarget;
}

interface RowIntervalNode<TTarget> {
  readonly center: number;
  readonly byStart: readonly IndexedTarget<TTarget>[];
  readonly byEnd: readonly IndexedTarget<TTarget>[];
  readonly left?: RowIntervalNode<TTarget>;
  readonly right?: RowIntervalNode<TTarget>;
}

export interface RowSpatialIndex<TTarget> {
  query(bounds: Rect, instrumentation?: Pick<RenderInstrumentation, 'recordWork'>): readonly TTarget[];
}

export function createRowSpatialIndex<TTarget extends { readonly bounds: Rect }>(
  targets: readonly TTarget[],
): RowSpatialIndex<TTarget> {
  const entries = targets.flatMap((target, index) =>
    target.bounds.width > 0 && target.bounds.height > 0 ? [{ target, index }] : []);
  const root = buildRowIntervalIndex(entries);
  return { query: (bounds, instrumentation) => overlapping(root, bounds, instrumentation) };
}

function groupByRegion<TTarget extends { readonly layer: LayoutNode['layer']; readonly bounds: Rect }>(
  targets: readonly TTarget[],
  owners: WeakMap<LayoutNode['layer'], string>,
): ReadonlyMap<string, RowSpatialIndex<TTarget>> {
  const grouped = new Map<string, TTarget[]>();
  for (const target of targets) {
    const id = owners.get(target.layer);
    if (id === undefined) continue;
    const values = grouped.get(id) ?? [];
    values.push(target);
    grouped.set(id, values);
  }
  return new Map([...grouped].map(([id, values]) => [id, createRowSpatialIndex(values)]));
}

function buildRowIntervalIndex<TTarget extends { readonly bounds: Rect }>(
  entries: readonly IndexedTarget<TTarget>[],
): RowIntervalNode<TTarget> | undefined {
  if (entries.length === 0) return undefined;
  const centers = entries.map(({ target }) => target.bounds.row + target.bounds.height / 2)
    .toSorted((a, b) => a - b);
  const center = centers[Math.floor(centers.length / 2)] ?? 0;
  const crossing: IndexedTarget<TTarget>[] = [];
  const left: IndexedTarget<TTarget>[] = [];
  const right: IndexedTarget<TTarget>[] = [];
  for (const entry of entries) {
    const start = entry.target.bounds.row;
    const end = start + entry.target.bounds.height;
    if (end <= center) left.push(entry);
    else if (start > center) right.push(entry);
    else crossing.push(entry);
  }
  const leftNode = buildRowIntervalIndex(left);
  const rightNode = buildRowIntervalIndex(right);
  return {
    center,
    byStart: crossing.toSorted((a, b) => a.target.bounds.row - b.target.bounds.row),
    byEnd: crossing.toSorted((a, b) =>
      (b.target.bounds.row + b.target.bounds.height) - (a.target.bounds.row + a.target.bounds.height)),
    ...(leftNode === undefined ? {} : { left: leftNode }),
    ...(rightNode === undefined ? {} : { right: rightNode }),
  };
}

function overlapping<TTarget extends { readonly bounds: Rect }>(
  root: RowIntervalNode<TTarget> | undefined,
  bounds: Rect,
  instrumentation?: Pick<RenderInstrumentation, 'recordWork'>,
): readonly TTarget[] {
  if (root === undefined || bounds.width <= 0 || bounds.height <= 0) return [];
  const matches: IndexedTarget<TTarget>[] = [];
  const inspect = (entry: IndexedTarget<TTarget>): void => {
    instrumentation?.recordWork?.({ kind: 'region_target_visits', count: 1 });
    if (rectsOverlap(entry.target.bounds, bounds)) matches.push(entry);
  };
  const visit = (node: RowIntervalNode<TTarget> | undefined): void => {
    if (node === undefined) return;
    if (bounds.row + bounds.height <= node.center) {
      for (const entry of node.byStart) {
        if (entry.target.bounds.row >= bounds.row + bounds.height) break;
        inspect(entry);
      }
      visit(node.left);
    } else if (bounds.row >= node.center) {
      for (const entry of node.byEnd) {
        if (entry.target.bounds.row + entry.target.bounds.height <= bounds.row) break;
        inspect(entry);
      }
      visit(node.right);
    } else {
      for (const entry of node.byStart) inspect(entry);
      visit(node.left);
      visit(node.right);
    }
  };
  visit(root);
  return matches.toSorted((a, b) => a.index - b.index).map(({ target }) => target);
}
