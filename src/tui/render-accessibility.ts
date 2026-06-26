import { focusPathIncludes } from './focus.ts';
import {
  widgetAccessibleBaseNode,
  widgetAccessibleChildren
} from './widget-behavior.ts';
import type { AccessibleNode } from '../accessibility/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { FocusPath } from './focus.ts';
import type { LayoutNode } from './layout.ts';

export function accessibleNode(
  widget: Widget,
  node: LayoutNode,
  parentPath: FocusPath,
  focusPath: FocusPath | undefined
): AccessibleNode {
  const path = [...parentPath, node.id ?? `${node.kind}:${String(node.bounds.row)}:${String(node.bounds.column)}`];
  const id = widget.id ?? `${widget.kind}-${String(node.bounds.row)}-${String(node.bounds.column)}`;
  const base = widgetAccessibleBaseNode(widget, node, id, focusPathIncludes(focusPath, path));
  const behaviorChildren = widgetAccessibleChildren(widget, node);
  const children = behaviorChildren ?? accessibleChildren(widget, node, path, focusPath);
  return mergeAccessibleNode(base, widget.accessibility, children);
}

function accessibleChildren(
  widget: Widget,
  node: LayoutNode,
  path: FocusPath,
  focusPath: FocusPath | undefined
): readonly AccessibleNode[] | undefined {
  const children = widget.children ?? [];
  if (children.length === 0) return undefined;
  return children.map((child, index) => accessibleNode(child, node.children[index] ?? node, path, focusPath));
}

function mergeAccessibleNode(
  base: AccessibleNode,
  override: AccessibleNode | undefined,
  children: readonly AccessibleNode[] | undefined
): AccessibleNode {
  const merged = override === undefined ? base : { ...base, ...override };
  return {
    ...merged,
    ...(children === undefined ? {} : { children }),
    ...(base.focused === true ? { focused: true } : override?.focused === true ? { focused: true } : {})
  };
}
