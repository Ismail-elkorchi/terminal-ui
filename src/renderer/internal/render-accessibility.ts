import { focusPathIncludes } from './focus.ts';
import { accessibilityForRenderNode, focusTargetsForRenderNode } from './render-node-behavior.ts';
import type { AccessibilityOptions, AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { RenderNode } from '../model/index.ts';
import type { FocusPath } from './focus.ts';
import type { LayoutNode } from '../model/layout.ts';
import type { TextWidthProfile } from '../../text/index.ts';

export function accessibleNode(
  widget: RenderNode,
  node: LayoutNode,
  parentPath: FocusPath,
  focusPath: FocusPath | undefined,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): AccessibleNode {
  if (!node.visible) {
    return {
      id: widget.id ?? `${widget.kind}-${String(node.bounds.row)}-${String(node.bounds.column)}`,
      role: 'text',
      label: widget.id ?? widget.kind
    };
  }
  const path = [...parentPath, node.identity];
  const id = widget.id ?? `${widget.kind}-${String(node.bounds.row)}-${String(node.bounds.column)}`;
  if (isDecorative(widget.accessibility)) {
    assertDecorativeRenderNodeIsNotInteractive(widget, node, theme, widthProfile);
    return decorativeRootNode(id, widget.accessibility);
  }
  const base = accessibilityForRenderNode(widget, node, id, focusPathIncludes(focusPath, path), theme, widthProfile);
  const children = base.children ?? accessibleChildren(widget, node, path, focusPath, theme, widthProfile);
  return mergeAccessibleNode(withScope(base, widget), widget.accessibility, children);
}

function accessibleChildren(
  widget: RenderNode,
  node: LayoutNode,
  path: FocusPath,
  focusPath: FocusPath | undefined,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): readonly AccessibleNode[] | undefined {
  const children = widget.children ?? [];
  if (children.length === 0) return undefined;
  const rendered = orderedAccessibleChildren(widget, node).flatMap(({ child, childNode }) => {
    if (!childNode.visible) return [];
    if (isDecorative(child.accessibility)) {
      assertDecorativeRenderNodeIsNotInteractive(child, childNode, theme, widthProfile);
      return [];
    }
    return [accessibleNode(child, childNode, path, focusPath, theme, widthProfile)];
  });
  return rendered.length === 0 ? undefined : rendered;
}

function orderedAccessibleChildren(
  widget: RenderNode,
  node: LayoutNode
): readonly { readonly child: RenderNode; readonly childNode: LayoutNode }[] {
  const pairs = (widget.children ?? [])
    .map((child, index) => ({ child, childNode: node.children[index], index }))
    .filter((item): item is { readonly child: RenderNode; readonly childNode: LayoutNode; readonly index: number } =>
      item.childNode !== undefined
    );
  if (widget.kind !== 'overlay') return pairs;
  return pairs.toSorted((left, right) =>
    right.childNode.layer.zIndex - left.childNode.layer.zIndex
    || right.index - left.index
  );
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

function withScope(base: AccessibleNode, widget: RenderNode): AccessibleNode {
  if (base.scope !== undefined) return base;
  if (widget.kind === 'overlay') {
    return {
      ...base,
      scope: {
        kind: 'popover',
        ...(widget.focus?.scope?.kind === 'contain' ? { trapsFocus: true } : {})
      }
    };
  }
  if (widget.focus?.scope?.kind === 'contain') {
    return {
      ...base,
      scope: {
        kind: 'popover',
        trapsFocus: true
      }
    };
  }
  return base;
}

function assertDecorativeRenderNodeIsNotInteractive(
  widget: RenderNode,
  node: LayoutNode,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile
): void {
  if (widget.keyMap !== undefined && Object.keys(widget.keyMap).length > 0) {
    throw new Error(`Decorative widget "${widget.id ?? widget.kind}" cannot define keyboard messages.`);
  }
  if (widget.inputMap?.text !== undefined || widget.inputMap?.paste !== undefined) {
    throw new Error(`Decorative widget "${widget.id ?? widget.kind}" cannot define text input messages.`);
  }
  if (
    widget.custom?.renderer.hitTargets !== undefined
    || focusTargetsForRenderNode(widget, node.bounds, theme, widthProfile).some((target) => !target.disabled)
  ) {
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
