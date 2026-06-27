import { focusPathIncludes } from './focus.ts';
import { widgetAccessibleNode, widgetFocusTargets } from './widget-behavior.ts';
import type { AccessibilityOptions, AccessibleNode } from '../accessibility/index.ts';
import type { TerminalTheme } from '../theme/index.ts';
import type { Widget } from '../widgets/index.ts';
import type { FocusPath } from './focus.ts';
import type { LayoutNode } from './layout.ts';

export function accessibleNode(
  widget: Widget,
  node: LayoutNode,
  parentPath: FocusPath,
  focusPath: FocusPath | undefined,
  theme: TerminalTheme
): AccessibleNode {
  if (!node.visible) {
    return {
      id: widget.id ?? `${widget.kind}-${String(node.bounds.row)}-${String(node.bounds.column)}`,
      role: 'text',
      label: widget.id ?? widget.kind
    };
  }
  const path = [...parentPath, node.id ?? `${node.kind}:${String(node.bounds.row)}:${String(node.bounds.column)}`];
  const id = widget.id ?? `${widget.kind}-${String(node.bounds.row)}-${String(node.bounds.column)}`;
  if (isDecorative(widget.accessibility)) {
    assertDecorativeWidgetIsNotInteractive(widget, node, theme);
    return decorativeRootNode(id, widget.accessibility);
  }
  const base = widgetAccessibleNode(widget, node, id, focusPathIncludes(focusPath, path), theme);
  const children = base.children ?? accessibleChildren(widget, node, path, focusPath, theme);
  return mergeAccessibleNode(base, widget.accessibility, children);
}

function accessibleChildren(
  widget: Widget,
  node: LayoutNode,
  path: FocusPath,
  focusPath: FocusPath | undefined,
  theme: TerminalTheme
): readonly AccessibleNode[] | undefined {
  const children = widget.children ?? [];
  if (children.length === 0) return undefined;
  const rendered = children.flatMap((child, index) => {
    const childNode = node.children[index];
    if (childNode?.visible !== true) return [];
    if (isDecorative(child.accessibility)) {
      assertDecorativeWidgetIsNotInteractive(child, childNode, theme);
      return [];
    }
    return [accessibleNode(child, childNode, path, focusPath, theme)];
  });
  return rendered.length === 0 ? undefined : rendered;
}

function mergeAccessibleNode(
  base: AccessibleNode,
  override: AccessibilityOptions | AccessibleNode | undefined,
  children: readonly AccessibleNode[] | undefined
): AccessibleNode {
  const options = accessibilityOptions(override);
  const nodeOverride = accessibleNodeOverride(override);
  const merged = nodeOverride === undefined ? base : { ...base, ...nodeOverride };
  return {
    ...merged,
    ...(options?.label === undefined ? {} : { label: options.label }),
    ...(options?.description === undefined ? {} : { description: options.description }),
    ...(children === undefined ? {} : { children }),
    ...(base.focused === true ? { focused: true } : nodeOverride?.focused === true ? { focused: true } : {})
  };
}

function isDecorative(value: AccessibilityOptions | AccessibleNode | undefined): value is AccessibilityOptions & {
  readonly decorative: true;
} {
  return accessibilityOptions(value)?.decorative === true;
}

function accessibilityOptions(value: AccessibilityOptions | AccessibleNode | undefined): AccessibilityOptions | undefined {
  if (value === undefined || isAccessibleNode(value)) return undefined;
  return value;
}

function accessibleNodeOverride(value: AccessibilityOptions | AccessibleNode | undefined): AccessibleNode | undefined {
  return value !== undefined && isAccessibleNode(value) ? value : undefined;
}

function isAccessibleNode(value: AccessibilityOptions | AccessibleNode): value is AccessibleNode {
  return 'role' in value;
}

function assertDecorativeWidgetIsNotInteractive(widget: Widget, node: LayoutNode, theme: TerminalTheme): void {
  if (widget.keyMap !== undefined && Object.keys(widget.keyMap).length > 0) {
    throw new Error(`Decorative widget "${widget.id ?? widget.kind}" cannot define keyboard messages.`);
  }
  if (widget.inputMap?.text !== undefined || widget.inputMap?.paste !== undefined) {
    throw new Error(`Decorative widget "${widget.id ?? widget.kind}" cannot define text input messages.`);
  }
  if (widget.mouseMap !== undefined && Object.keys(widget.mouseMap).length > 0) {
    throw new Error(`Decorative widget "${widget.id ?? widget.kind}" cannot define mouse messages.`);
  }
  if (widget.custom?.renderer.hitTargets !== undefined || widgetFocusTargets(widget, node.bounds, theme).some((target) => !target.disabled)) {
    throw new Error(`Decorative widget "${widget.id ?? widget.kind}" cannot expose focus or hit targets.`);
  }
}

function decorativeRootNode(id: string, options: AccessibilityOptions): AccessibleNode {
  return {
    id,
    role: 'text',
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(options.description === undefined ? {} : { description: options.description })
  };
}
