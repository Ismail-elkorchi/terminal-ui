import type { RenderNode } from '../model/index.ts';
import type { FocusPath } from '../../interaction/focus.ts';
import type { CursorPosition } from '../model/cursor.ts';
import type { Layer, LayoutNode, Rect } from '../model/layout.ts';

export type { FocusPath } from '../../interaction/focus.ts';

export interface LayoutFocusTarget {
  readonly path: FocusPath;
  readonly bounds: Rect;
  readonly layer: Layer;
  readonly kind: LayoutNode['kind'];
  readonly focusable: boolean;
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
  widget: RenderNode<TMessage>,
  layout: LayoutNode
): readonly RenderNodeFocusTarget<TMessage>[] {
  return collectRenderNodeFocusRegionTargets(widget, layout, []).filter((target) => target.focusable);
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
  if (requested !== undefined && targets.some((target) => samePath(target.path, requested))) {
    return requested;
  }
  return targets[0]?.path;
}

export function nextFocusPath(layout: LayoutNode, current: FocusPath | undefined): FocusPath | undefined {
  const targets = scopedFocusTargets(layout, collectLayoutFocusTargets(layout));
  if (targets.length === 0) return undefined;
  if (current === undefined) return targets[0]?.path;
  const index = targets.findIndex((target) => samePath(target.path, current));
  return targets[(index + 1 + targets.length) % targets.length]?.path;
}

export function previousFocusPath(layout: LayoutNode, current: FocusPath | undefined): FocusPath | undefined {
  const targets = scopedFocusTargets(layout, collectLayoutFocusTargets(layout));
  if (targets.length === 0) return undefined;
  if (current === undefined) return targets.at(-1)?.path;
  const index = targets.findIndex((target) => samePath(target.path, current));
  return targets[(index - 1 + targets.length) % targets.length]?.path;
}

export function findLayoutFocusTarget(
  layout: LayoutNode,
  path: FocusPath | undefined
): LayoutFocusTarget | undefined {
  if (path === undefined) return undefined;
  return scopedFocusTargets(layout, collectLayoutFocusTargets(layout)).find((target) => samePath(target.path, path));
}

export function findAnyLayoutFocusTarget(
  layout: LayoutNode,
  path: FocusPath | undefined
): LayoutFocusTarget | undefined {
  if (path === undefined) return undefined;
  return collectLayoutFocusTargets(layout).find((target) => target.focusable && samePath(target.path, path));
}

export function findRenderNodeFocusTarget<TMessage>(
  widget: RenderNode<TMessage>,
  layout: LayoutNode,
  path: FocusPath | undefined
): RenderNodeFocusTarget<TMessage> | undefined {
  if (path === undefined) return undefined;
  return scopedFocusTargets(layout, collectRenderNodeFocusTargets(widget, layout)).find((target) => samePath(target.path, path));
}

export function focusPathIncludes(left: FocusPath | undefined, right: FocusPath): boolean {
  return left !== undefined && samePath(left, right);
}

function collectLayoutTargets(layout: LayoutNode, parentPath: FocusPath): readonly LayoutFocusTarget[] {
  if (!layout.visible) return [];
  const path = [...parentPath, focusSegment(layout)];
  const current = layout.focusTargets.map((target, index): LayoutFocusTarget => {
    const focusable = !target.disabled && target.bounds.width > 0 && target.bounds.height > 0;
    return {
      path: targetPath(path, target.id, index, layout.focusTargets.length),
      bounds: target.bounds,
      layer: layout.layer,
      kind: layout.kind,
      focusable,
      disabled: target.disabled,
      ...(target.cursor === undefined ? {} : { cursor: target.cursor }),
      ...(target.order === undefined ? {} : { order: target.order }),
      ...(target.scopeId === undefined ? {} : { scopeId: target.scopeId })
    };
  });
  return [
    ...current,
    ...orderedFocusChildren(layout).flatMap((child) => collectLayoutTargets(child, path))
  ];
}

function collectRenderNodeFocusRegionTargets<TMessage>(
  widget: RenderNode<TMessage>,
  layout: LayoutNode,
  parentPath: FocusPath
): readonly RenderNodeFocusTarget<TMessage>[] {
  if (!layout.visible) return [];
  const path = [...parentPath, focusSegment(layout)];
  const current = layout.focusTargets.map((target, index): RenderNodeFocusTarget<TMessage> => {
    const focusable = !target.disabled && target.bounds.width > 0 && target.bounds.height > 0;
    return {
      path: targetPath(path, target.id, index, layout.focusTargets.length),
      bounds: target.bounds,
      layer: layout.layer,
      kind: layout.kind,
      focusable,
      disabled: target.disabled,
      ...(target.cursor === undefined ? {} : { cursor: target.cursor }),
      ...(target.order === undefined ? {} : { order: target.order }),
      ...(target.scopeId === undefined ? {} : { scopeId: target.scopeId }),
      renderNode: widget
    };
  });
  const children = widget.children ?? [];
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
  const path = [...parentPath, focusSegment(layout)];
  const current: RenderNodeLayoutTarget<TMessage> = {
    path,
    bounds: layout.bounds,
    layer: layout.layer,
    kind: layout.kind,
    focusable: layout.focusable,
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
  if (layout.kind !== 'overlay') return layout.children;
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
  if (layout.kind !== 'overlay') return pairs;
  return pairs.toSorted((left, right) =>
    right.childLayout.layer.zIndex - left.childLayout.layer.zIndex
    || right.index - left.index
  );
}

function focusSegment(layout: LayoutNode): string {
  return layout.identity;
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
}

function scopedFocusTargets<TTarget extends LayoutFocusTarget>(
  layout: LayoutNode,
  targets: readonly TTarget[]
): readonly TTarget[] {
  const enabled = targets.filter((target) => target.focusable);
  if (enabled.length === 0) return [];
  const activeScope = activeFocusScope(collectFocusScopes(layout));
  const scoped = activeScope === undefined
    ? enabled
    : enabled.filter((target) => pathStartsWith(target.path, activeScope.path));
  if (scoped.length === 0) return [];
  const activeLayer = activeScope?.layer.zIndex ?? Math.max(...scoped.map((target) => target.layer.zIndex));
  const layered = scoped.filter((target) => target.layer.zIndex === activeLayer);
  return orderedFocusTargets(layered);
}

function collectFocusScopes(layout: LayoutNode, parentPath: FocusPath = [], sequence = { value: 0 }): readonly FocusScope[] {
  if (!layout.visible) return [];
  const path = [...parentPath, focusSegment(layout)];
  const current = layout.focusScope === 'contain'
    ? [{ path, layer: layout.layer, sequence: sequence.value }]
    : [];
  sequence.value += 1;
  return [
    ...current,
    ...layout.children.flatMap((child) => collectFocusScopes(child, path, sequence))
  ];
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

function samePath(left: FocusPath, right: FocusPath): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}
