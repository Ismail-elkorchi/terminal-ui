import type { Widget } from '../widgets/index.ts';
import type { Layer, LayoutNode, Rect } from './layout.ts';

export type FocusPath = readonly string[];

export interface LayoutFocusTarget {
  readonly path: FocusPath;
  readonly bounds: Rect;
  readonly layer: Layer;
  readonly kind: LayoutNode['kind'];
  readonly focusable: boolean;
  readonly disabled: boolean;
  readonly order?: number;
  readonly cursor?: {
    readonly row: number;
    readonly column: number;
  };
}

export interface WidgetFocusTarget<TMessage> extends LayoutFocusTarget {
  readonly widget: Widget<TMessage>;
}

export interface WidgetLayoutTarget<TMessage> extends LayoutFocusTarget {
  readonly widget: Widget<TMessage>;
}

export function collectLayoutFocusTargets(layout: LayoutNode): readonly LayoutFocusTarget[] {
  return collectLayoutTargets(layout, []);
}

export function collectWidgetFocusTargets<TMessage>(
  widget: Widget<TMessage>,
  layout: LayoutNode
): readonly WidgetFocusTarget<TMessage>[] {
  return collectWidgetFocusRegionTargets(widget, layout, []).filter((target) => target.focusable);
}

export function collectWidgetLayoutTargets<TMessage>(
  widget: Widget<TMessage>,
  layout: LayoutNode
): readonly WidgetLayoutTarget<TMessage>[] {
  return collectWidgetLayoutNodeTargets(widget, layout, []);
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

export function findWidgetFocusTarget<TMessage>(
  widget: Widget<TMessage>,
  layout: LayoutNode,
  path: FocusPath | undefined
): WidgetFocusTarget<TMessage> | undefined {
  if (path === undefined) return undefined;
  return scopedFocusTargets(layout, collectWidgetFocusTargets(widget, layout)).find((target) => samePath(target.path, path));
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
      ...(target.order === undefined ? {} : { order: target.order })
    };
  });
  return [
    ...current,
    ...layout.children.flatMap((child) => collectLayoutTargets(child, path))
  ];
}

function collectWidgetFocusRegionTargets<TMessage>(
  widget: Widget<TMessage>,
  layout: LayoutNode,
  parentPath: FocusPath
): readonly WidgetLayoutTarget<TMessage>[] {
  if (!layout.visible) return [];
  const path = [...parentPath, focusSegment(layout)];
  const current = layout.focusTargets.map((target, index): WidgetLayoutTarget<TMessage> => {
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
      widget
    };
  });
  const children = widget.children ?? [];
  return [
    ...current,
    ...children.flatMap((child, index) => {
      const childLayout = layout.children[index];
      return childLayout === undefined ? [] : collectWidgetFocusRegionTargets(child, childLayout, path);
    })
  ];
}

function collectWidgetLayoutNodeTargets<TMessage>(
  widget: Widget<TMessage>,
  layout: LayoutNode,
  parentPath: FocusPath
): readonly WidgetLayoutTarget<TMessage>[] {
  if (!layout.visible) return [];
  const path = [...parentPath, focusSegment(layout)];
  const current: WidgetLayoutTarget<TMessage> = {
    path,
    bounds: layout.bounds,
    layer: layout.layer,
    kind: layout.kind,
    focusable: layout.focusable,
    disabled: false,
    widget
  };
  const children = widget.children ?? [];
  return [
    current,
    ...children.flatMap((child, index) => {
      const childLayout = layout.children[index];
      return childLayout === undefined ? [] : collectWidgetLayoutNodeTargets(child, childLayout, path);
    })
  ];
}

function focusSegment(layout: LayoutNode): string {
  return layout.id ?? `${layout.kind}:${String(layout.bounds.row)}:${String(layout.bounds.column)}`;
}

function targetPath(basePath: FocusPath, id: string | undefined, index: number, count: number): FocusPath {
  if (id !== undefined) return [...basePath, id];
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
