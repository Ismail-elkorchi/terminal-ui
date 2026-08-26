import type { RenderNode } from './render-tree/index.ts';
import { focusPathsEqual } from '../../interaction/focus.ts';
import { hasTransparentFocusIdentity } from './focus-identity.ts';
import type { FocusPath, InitialFocusSelector } from '../../interaction/focus.ts';
import type { CursorPosition } from '../contracts.ts';
import type { RenderFocusRelation } from '../contracts.ts';
import type { Layer, LayoutFocusRegion, LayoutNode, Rect } from '../contracts.ts';

export type { FocusPath } from '../../interaction/focus.ts';

const paintOrderedFocusLayouts = new WeakSet<LayoutNode>();
const focusRevealLayouts = new WeakSet<LayoutNode>();
const logicalFocusBounds = new WeakMap<LayoutFocusRegion, Rect>();

export function markPaintOrderedFocusChildren(layout: LayoutNode): LayoutNode {
  paintOrderedFocusLayouts.add(layout);
  return layout;
}

export function markFocusRevealLayout(layout: LayoutNode): LayoutNode {
  focusRevealLayouts.add(layout);
  return layout;
}

export function markLogicalFocusBounds(region: LayoutFocusRegion, bounds: Rect): LayoutFocusRegion {
  logicalFocusBounds.set(region, bounds);
  return region;
}

export interface LayoutFocusTarget {
  readonly path: FocusPath;
  readonly elementId?: string;
  readonly targetId: string;
  readonly bounds: Rect;
  readonly logicalBounds: Rect;
  readonly layer: Layer;
  readonly focusable: boolean;
  readonly revealable: boolean;
  readonly disabled: boolean;
  readonly order?: number;
  readonly scopeId?: string;
  readonly cursor?: CursorPosition;
}

export interface RenderNodeFocusTarget<TMessage> extends LayoutFocusTarget {
  readonly renderNode: RenderNode<TMessage>;
}

export interface RenderNodeLayoutTarget<TMessage> extends LayoutFocusTarget {
  readonly renderNode: RenderNode<TMessage>;
  readonly layoutNode: LayoutNode;
}

export function collectLayoutFocusTargets(layout: LayoutNode): readonly LayoutFocusTarget[] {
  return collectLayoutTargets(layout, []);
}

export function collectRenderNodeFocusTargets<TMessage>(
  renderNode: RenderNode<TMessage>,
  layout: LayoutNode
): readonly RenderNodeFocusTarget<TMessage>[] {
  return collectRenderNodeFocusRegionTargets(renderNode, layout, []).filter((target) => target.focusable);
}

export function collectRenderNodeLayoutTargets<TMessage>(
  renderNode: RenderNode<TMessage>,
  layout: LayoutNode
): readonly RenderNodeLayoutTarget<TMessage>[] {
  return collectRenderNodeLayoutTargetsRecursive(renderNode, layout, []);
}

export function resolveFocusPath(layout: LayoutNode, requested: FocusPath | undefined): FocusPath | undefined {
  const targets = scopedFocusTargets(layout, collectLayoutFocusTargets(layout));
  if (targets.length === 0) return undefined;
  if (requested !== undefined && targets.some((target) => focusPathsEqual(target.path, requested))) {
    return requested;
  }
  return targets[0]?.path;
}

export type InitialFocusResolution =
  | { readonly kind: 'matched'; readonly path: FocusPath }
  | { readonly kind: 'missing' }
  | { readonly kind: 'ambiguous'; readonly paths: readonly FocusPath[] };

export function resolveInitialFocusSelector(
  layout: LayoutNode,
  selector: InitialFocusSelector
): InitialFocusResolution {
  const matches = scopedFocusTargets(layout, collectLayoutFocusTargets(layout))
    .filter((target) => matchesInitialFocus(target, selector));
  if (matches.length === 0) return { kind: 'missing' };
  if (matches.length > 1) return { kind: 'ambiguous', paths: matches.map((target) => target.path) };
  return { kind: 'matched', path: matches[0]?.path ?? [] };
}

export function nextFocusPath(layout: LayoutNode, current: FocusPath | undefined): FocusPath | undefined {
  const targets = scopedFocusTargets(layout, collectLayoutFocusTargets(layout), true);
  if (targets.length === 0) return undefined;
  if (current === undefined) return targets[0]?.path;
  const index = targets.findIndex((target) => focusPathsEqual(target.path, current));
  const group = focusNavigationGroupForPath(layout, current);
  const groupEnd = group === undefined
    ? index
    : targets.findLastIndex((target) => pathStartsWith(target.path, group.path));
  return targets[(groupEnd + 1 + targets.length) % targets.length]?.path;
}

export function previousFocusPath(layout: LayoutNode, current: FocusPath | undefined): FocusPath | undefined {
  const targets = scopedFocusTargets(layout, collectLayoutFocusTargets(layout), true);
  if (targets.length === 0) return undefined;
  if (current === undefined) return targets.at(-1)?.path;
  const index = targets.findIndex((target) => focusPathsEqual(target.path, current));
  const group = focusNavigationGroupForPath(layout, current);
  const groupStart = group === undefined
    ? index
    : targets.findIndex((target) => pathStartsWith(target.path, group.path));
  return targets[(groupStart - 1 + targets.length) % targets.length]?.path;
}

export function focusNavigationPath(
  layout: LayoutNode,
  current: FocusPath | undefined,
  key: 'arrowLeft' | 'arrowRight' | 'arrowUp' | 'arrowDown' | 'home' | 'end',
): FocusPath | undefined {
  if (current === undefined) return undefined;
  const group = focusNavigationGroupForPath(layout, current);
  if (group === undefined) return undefined;
  const targets = scopedFocusTargets(layout, collectLayoutFocusTargets(layout), true)
    .filter((target) => pathStartsWith(target.path, group.path));
  if (targets.length === 0) return undefined;
  if (key === 'home') return targets[0]?.path;
  if (key === 'end') return targets.at(-1)?.path;
  const delta = group.orientation === 'horizontal'
    ? key === 'arrowRight' ? 1 : key === 'arrowLeft' ? -1 : 0
    : key === 'arrowDown' ? 1 : key === 'arrowUp' ? -1 : 0;
  if (delta === 0) return undefined;
  const index = targets.findIndex((target) => focusPathsEqual(target.path, current));
  if (index < 0) return delta > 0 ? targets[0]?.path : targets.at(-1)?.path;
  return targets[(index + delta + targets.length) % targets.length]?.path;
}

export function findAnyLayoutFocusTarget(
  layout: LayoutNode,
  path: FocusPath | undefined
): LayoutFocusTarget | undefined {
  if (path === undefined) return undefined;
  return collectLayoutFocusTargets(layout)
    .find((target) => target.focusable && focusPathsEqual(target.path, path));
}

export function findRenderNodeFocusTarget<TMessage>(
  renderNode: RenderNode<TMessage>,
  layout: LayoutNode,
  path: FocusPath | undefined
): RenderNodeFocusTarget<TMessage> | undefined {
  if (path === undefined) return undefined;
  return scopedFocusTargets(layout, collectRenderNodeFocusTargets(renderNode, layout))
    .find((target) => focusPathsEqual(target.path, path));
}

export function renderNodeKeyChainForFocus<TMessage>(
  renderNode: RenderNode<TMessage>,
  layout: LayoutNode,
  path: FocusPath | undefined
): readonly RenderNode<TMessage>[] {
  const focused = findRenderNodeFocusTarget(renderNode, layout, path);
  if (focused === undefined || path === undefined) return [];
  const ancestors = collectRenderNodeLayoutTargets(renderNode, layout)
    .filter((target) => pathStartsWith(path, target.path))
    .toSorted((left, right) => right.path.length - left.path.length)
    .map((target) => target.renderNode);
  return uniqueRenderNodes([focused.renderNode, ...ancestors]);
}

export function renderNodeLayoutKeyChainForFocus<TMessage>(
  renderNode: RenderNode<TMessage>,
  layout: LayoutNode,
  path: FocusPath | undefined
): readonly RenderNodeLayoutTarget<TMessage>[] {
  if (path === undefined || findRenderNodeFocusTarget(renderNode, layout, path) === undefined) return [];
  const seen = new Set<RenderNode<TMessage>>();
  return collectRenderNodeLayoutTargets(renderNode, layout)
    .filter((target) => pathStartsWith(path, target.path))
    .toSorted((left, right) => right.path.length - left.path.length)
    .filter((target) => {
      if (seen.has(target.renderNode)) return false;
      seen.add(target.renderNode);
      return true;
    });
}

export function focusPathIncludes(left: FocusPath | undefined, right: FocusPath): boolean {
  return left !== undefined && focusPathsEqual(left, right);
}

export function renderFocusRelation(
  activePath: FocusPath | undefined,
  renderNodePath: FocusPath
): RenderFocusRelation {
  if (activePath === undefined || !pathStartsWith(activePath, renderNodePath)) return 'none';
  return focusPathsEqual(activePath, renderNodePath) ? 'self' : 'descendant';
}

export function focusedTargetIdForLayoutNode(
  layout: LayoutNode,
  renderNodePath: FocusPath,
  activePath: FocusPath | undefined
): string | undefined {
  if (activePath === undefined) return undefined;
  return layout.focusTargets.find((target, index) =>
    focusPathsEqual(activePath, targetPath(renderNodePath, target.id, index, layout.focusTargets.length))
  )?.id;
}

export function focusPathForLayoutTarget(
  target: RenderNodeLayoutTarget<unknown>,
  targetId: string
): FocusPath | undefined {
  const index = target.layoutNode.focusTargets.findIndex((item) => item.id === targetId);
  const focusTarget = target.layoutNode.focusTargets[index];
  if (index < 0 || focusTarget === undefined || focusTarget.disabled) return undefined;
  if (focusTarget.bounds.width <= 0 || focusTarget.bounds.height <= 0) return undefined;
  return targetPath(target.path, focusTarget.id, index, target.layoutNode.focusTargets.length);
}

function collectLayoutTargets(
  layout: LayoutNode,
  parentPath: FocusPath,
  revealableAncestor = false,
): readonly LayoutFocusTarget[] {
  if (!layout.visible) return [];
  const path = layoutFocusPath(parentPath, layout);
  const current = layout.focusTargets.map((target, index): LayoutFocusTarget => {
    const logicalBounds = logicalFocusBounds.get(target) ?? target.bounds;
    const focusable = !target.disabled && target.bounds.width > 0 && target.bounds.height > 0;
    const revealable = !target.disabled
      && revealableAncestor
      && logicalBounds.width > 0
      && logicalBounds.height > 0;
    return {
      path: targetPath(path, target.id, index, layout.focusTargets.length),
      ...(layout.id === undefined ? {} : { elementId: layout.id }),
      targetId: target.id,
      bounds: target.bounds,
      logicalBounds,
      layer: layout.layer,
      focusable,
      revealable,
      disabled: target.disabled,
      ...(target.cursor === undefined ? {} : { cursor: target.cursor }),
      ...(target.order === undefined ? {} : { order: target.order }),
      ...(target.scopeId === undefined ? {} : { scopeId: target.scopeId })
    };
  });
  return [
    ...current,
    ...orderedFocusChildren(layout).flatMap((child) =>
      collectLayoutTargets(child, path, revealableAncestor || focusRevealLayouts.has(layout)))
  ];
}

function collectRenderNodeFocusRegionTargets<TMessage>(
  renderNode: RenderNode<TMessage>,
  layout: LayoutNode,
  parentPath: FocusPath
): readonly RenderNodeFocusTarget<TMessage>[] {
  if (!layout.visible) return [];
  const path = layoutFocusPath(parentPath, layout);
  const current = layout.focusTargets.map((target, index): RenderNodeFocusTarget<TMessage> => {
    const focusable = !target.disabled && target.bounds.width > 0 && target.bounds.height > 0;
    return {
      path: targetPath(path, target.id, index, layout.focusTargets.length),
      ...(layout.id === undefined ? {} : { elementId: layout.id }),
      targetId: target.id,
      bounds: target.bounds,
      logicalBounds: logicalFocusBounds.get(target) ?? target.bounds,
      layer: layout.layer,
      focusable,
      revealable: false,
      disabled: target.disabled,
      ...(target.cursor === undefined ? {} : { cursor: target.cursor }),
      ...(target.order === undefined ? {} : { order: target.order }),
      ...(target.scopeId === undefined ? {} : { scopeId: target.scopeId }),
      renderNode: renderNode
    };
  });
  const children = renderNode.children ?? [];
  return [
    ...current,
    ...orderedRenderNodeFocusChildren(children, layout).flatMap(({ child, childLayout }) =>
      collectRenderNodeFocusRegionTargets(child, childLayout, path)
    )
  ];
}

function collectRenderNodeLayoutTargetsRecursive<TMessage>(
  renderNode: RenderNode<TMessage>,
  layout: LayoutNode,
  parentPath: FocusPath
): readonly RenderNodeLayoutTarget<TMessage>[] {
  if (!layout.visible) return [];
  const path = layoutFocusPath(parentPath, layout);
  const current: RenderNodeLayoutTarget<TMessage> = {
    path,
    ...(layout.id === undefined ? {} : { elementId: layout.id }),
    targetId: 'self',
    bounds: layout.bounds,
    logicalBounds: layout.bounds,
    layer: layout.layer,
    focusable: layout.focusable,
    revealable: false,
    disabled: false,
    renderNode,
    layoutNode: layout
  };
  const children = renderNode.children ?? [];
  return [
    current,
    ...children.flatMap((child, index) => {
      const childLayout = layout.children[index];
      return childLayout === undefined ? [] : collectRenderNodeLayoutTargetsRecursive(child, childLayout, path);
    })
  ];
}

function orderedFocusChildren(layout: LayoutNode): readonly LayoutNode[] {
  if (!paintOrderedFocusLayouts.has(layout)) return layout.children;
  return layout.children
    .map((child, index) => ({ child, index }))
    .toSorted((left, right) =>
      right.child.layer.zIndex - left.child.layer.zIndex
      || right.index - left.index
    )
    .map((item) => item.child);
}

function orderedRenderNodeFocusChildren<TMessage>(
  children: readonly RenderNode<TMessage>[],
  layout: LayoutNode
): readonly { readonly child: RenderNode<TMessage>; readonly childLayout: LayoutNode }[] {
  const pairs = children
    .map((child, index) => ({ child, childLayout: layout.children[index], index }))
    .filter((item): item is { readonly child: RenderNode<TMessage>; readonly childLayout: LayoutNode; readonly index: number } =>
      item.childLayout !== undefined
    );
  if (!paintOrderedFocusLayouts.has(layout)) return pairs;
  return pairs.toSorted((left, right) =>
    right.childLayout.layer.zIndex - left.childLayout.layer.zIndex
    || right.index - left.index
  );
}

export function layoutFocusPath(parentPath: FocusPath, layout: LayoutNode): FocusPath {
  return hasTransparentFocusIdentity(layout)
    ? parentPath
    : [...parentPath, layout.identity];
}

function targetPath(basePath: FocusPath, id: string, index: number, count: number): FocusPath {
  if (id === 'self' && count === 1) return basePath;
  if (id !== '') return [...basePath, id];
  return count > 1 ? [...basePath, `focus:${String(index)}`] : basePath;
}

interface FocusScope {
  readonly path: FocusPath;
  readonly layer: Layer;
  readonly sequence: number;
  readonly initialFocus?: InitialFocusSelector;
  readonly restoreFocus: boolean;
}

interface FocusNavigationGroup {
  readonly path: FocusPath;
  readonly orientation: 'horizontal' | 'vertical';
}

function focusNavigationGroupForPath(
  layout: LayoutNode,
  path: FocusPath,
): FocusNavigationGroup | undefined {
  return collectFocusNavigationGroups(layout)
    .filter((group) => pathStartsWith(path, group.path))
    .toSorted((left, right) => right.path.length - left.path.length)
    .at(0);
}

function collectFocusNavigationGroups(
  layout: LayoutNode,
  parentPath: FocusPath = [],
): readonly FocusNavigationGroup[] {
  if (!layout.visible) return [];
  const path = layoutFocusPath(parentPath, layout);
  return [
    ...(layout.focusNavigation === undefined ? [] : [{
      path,
      orientation: layout.focusNavigation.orientation,
    }]),
    ...layout.children.flatMap((child) => collectFocusNavigationGroups(child, path)),
  ];
}

function scopedFocusTargets<TTarget extends LayoutFocusTarget>(
  layout: LayoutNode,
  targets: readonly TTarget[],
  includeRevealable = false,
): readonly TTarget[] {
  const enabled = targets.filter((target) => target.focusable || (includeRevealable && target.revealable));
  if (enabled.length === 0) return [];
  const activeScope = activeFocusScope(collectFocusScopes(layout));
  const scoped = activeScope === undefined
    ? enabled
    : enabled.filter((target) => pathStartsWith(target.path, activeScope.path));
  if (scoped.length === 0) return [];
  const activeLayer = Math.max(...scoped.map((target) => target.layer.zIndex));
  const layered = scoped.filter((target) => target.layer.zIndex === activeLayer);
  const ordered = orderedFocusTargets(layered);
  const initialFocus = activeScope?.initialFocus;
  if (initialFocus === undefined) return ordered;
  const preferred = ordered.findIndex((target) => matchesInitialFocus(target, initialFocus));
  const preferredTarget = ordered[preferred];
  return preferred <= 0 || preferredTarget === undefined
    ? ordered
    : [preferredTarget, ...ordered.slice(0, preferred), ...ordered.slice(preferred + 1)];
}

export function activeFocusScopeRestores(layout: LayoutNode): boolean {
  return activeFocusScope(collectFocusScopes(layout))?.restoreFocus ?? true;
}

function collectFocusScopes(layout: LayoutNode, parentPath: FocusPath = [], sequence = { value: 0 }): readonly FocusScope[] {
  if (!layout.visible) return [];
  const path = layoutFocusPath(parentPath, layout);
  const current = layout.focusScope?.kind === 'contain'
    ? [{
        path,
        layer: layout.layer,
        sequence: sequence.value,
        ...(layout.focusScope.initialFocus === undefined ? {} : { initialFocus: layout.focusScope.initialFocus }),
        restoreFocus: layout.focusScope.restoreFocus !== false
      }]
    : [];
  sequence.value += 1;
  return [
    ...current,
    ...layout.children.flatMap((child) => collectFocusScopes(child, path, sequence))
  ];
}

function matchesInitialFocus(target: LayoutFocusTarget, selector: InitialFocusSelector): boolean {
  if (selector.kind === 'path') return focusPathsEqual(target.path, selector.path);
  if (selector.kind === 'element') return target.elementId === selector.elementId;
  return target.elementId === selector.elementId && target.targetId === selector.targetId;
}

function activeFocusScope(scopes: readonly FocusScope[]): FocusScope | undefined {
  return scopes
    .toSorted((left, right) => right.layer.zIndex - left.layer.zIndex || right.sequence - left.sequence)
    .at(0);
}

function orderedFocusTargets<TTarget extends LayoutFocusTarget>(targets: readonly TTarget[]): readonly TTarget[] {
  return targets
    .map((target, sequence) => ({ target, sequence }))
    .toSorted((left, right) => focusOrder(left.target, left.sequence) - focusOrder(right.target, right.sequence))
    .map((item) => item.target);
}

function focusOrder(target: LayoutFocusTarget, sequence: number): number {
  return target.order === undefined || !Number.isFinite(target.order) ? sequence : target.order;
}

function pathStartsWith(path: FocusPath, prefix: FocusPath): boolean {
  return path.length >= prefix.length && prefix.every((segment, index) => path[index] === segment);
}

function uniqueRenderNodes<TMessage>(nodes: readonly RenderNode<TMessage>[]): readonly RenderNode<TMessage>[] {
  const seen = new Set<RenderNode<TMessage>>();
  return nodes.filter((node) => {
    if (seen.has(node)) return false;
    seen.add(node);
    return true;
  });
}
