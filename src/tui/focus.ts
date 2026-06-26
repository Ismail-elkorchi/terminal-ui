import type { Widget } from '../widgets/index.ts';
import type { LayoutNode, Rect } from './layout.ts';

export type FocusPath = readonly string[];

export interface LayoutFocusTarget {
  readonly path: FocusPath;
  readonly bounds: Rect;
  readonly kind: LayoutNode['kind'];
  readonly focusable: boolean;
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
  return collectWidgetTargets(widget, layout, []).filter((target) => target.focusable);
}

export function collectWidgetLayoutTargets<TMessage>(
  widget: Widget<TMessage>,
  layout: LayoutNode
): readonly WidgetLayoutTarget<TMessage>[] {
  return collectWidgetTargets(widget, layout, []);
}

export function resolveFocusPath(layout: LayoutNode, requested: FocusPath | undefined): FocusPath | undefined {
  const targets = collectLayoutFocusTargets(layout);
  if (targets.length === 0) return undefined;
  if (requested !== undefined && targets.some((target) => samePath(target.path, requested))) {
    return requested;
  }
  return targets[0]?.path;
}

export function nextFocusPath(layout: LayoutNode, current: FocusPath | undefined): FocusPath | undefined {
  const targets = collectLayoutFocusTargets(layout);
  if (targets.length === 0) return undefined;
  if (current === undefined) return targets[0]?.path;
  const index = targets.findIndex((target) => samePath(target.path, current));
  return targets[(index + 1 + targets.length) % targets.length]?.path;
}

export function previousFocusPath(layout: LayoutNode, current: FocusPath | undefined): FocusPath | undefined {
  const targets = collectLayoutFocusTargets(layout);
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
  return collectLayoutFocusTargets(layout).find((target) => samePath(target.path, path));
}

export function findWidgetFocusTarget<TMessage>(
  widget: Widget<TMessage>,
  layout: LayoutNode,
  path: FocusPath | undefined
): WidgetFocusTarget<TMessage> | undefined {
  if (path === undefined) return undefined;
  return collectWidgetFocusTargets(widget, layout).find((target) => samePath(target.path, path));
}

export function focusPathIncludes(left: FocusPath | undefined, right: FocusPath): boolean {
  return left !== undefined && samePath(left, right);
}

function collectLayoutTargets(layout: LayoutNode, parentPath: FocusPath): readonly LayoutFocusTarget[] {
  const path = [...parentPath, focusSegment(layout)];
  const current = layout.focusable
    ? [{ path, bounds: layout.bounds, kind: layout.kind, focusable: layout.focusable }]
    : [];
  return [
    ...current,
    ...layout.children.flatMap((child) => collectLayoutTargets(child, path))
  ];
}

function collectWidgetTargets<TMessage>(
  widget: Widget<TMessage>,
  layout: LayoutNode,
  parentPath: FocusPath
): readonly WidgetLayoutTarget<TMessage>[] {
  const path = [...parentPath, focusSegment(layout)];
  const current = [{ path, bounds: layout.bounds, kind: layout.kind, focusable: layout.focusable, widget }];
  const children = widget.children ?? [];
  return [
    ...current,
    ...children.flatMap((child, index) => {
      const childLayout = layout.children[index];
      return childLayout === undefined ? [] : collectWidgetTargets(child, childLayout, path);
    })
  ];
}

function focusSegment(layout: LayoutNode): string {
  return layout.id ?? `${layout.kind}:${String(layout.bounds.row)}:${String(layout.bounds.column)}`;
}

function samePath(left: FocusPath, right: FocusPath): boolean {
  return left.length === right.length && left.every((segment, index) => segment === right[index]);
}
