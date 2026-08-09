import {
  focusPathIncludes,
  focusedTargetIdForLayoutNode,
  layoutFocusPath,
  renderFocusRelation
} from './focus.ts';
import {
  accessibilityForRenderNode,
  renderNodeClipsChildren
} from './render-node-behavior.ts';
import { renderNodeFactoryName } from '../model/node.ts';
import type { AccessibilityOptions, AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { RenderNode } from '../model/index.ts';
import type { FocusPath } from './focus.ts';
import type { LayoutNode } from '../contracts.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import { intersectRects } from './rect.ts';
import { isDecorativeAccessibility } from './decorative.ts';
import { assertComponentAccessibilityFocus } from './component-output.ts';

export function accessibleNode(
  renderNode: RenderNode,
  node: LayoutNode,
  parentPath: FocusPath,
  focusPath: FocusPath | undefined,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  clippedByViewport = false,
  accessibleNodes = new Map<RenderNode, AccessibleNode>()
): AccessibleNode | undefined {
  if (node.inert) return undefined;
  if (!node.visible) {
    const result = {
      id: renderNode.id ?? `${renderNode.kind}-${String(node.bounds.row)}-${String(node.bounds.column)}`,
      role: 'text' as const,
      label: renderNode.id ?? renderNode.kind
    };
    accessibleNodes.set(renderNode, result);
    return result;
  }
  const path = layoutFocusPath(parentPath, node);
  const id = renderNode.id ?? `${renderNode.kind}-${String(node.bounds.row)}-${String(node.bounds.column)}`;
  if (isDecorativeAccessibility(renderNode.accessibility)) {
    const result = decorativeRootNode(id, renderNode.accessibility);
    accessibleNodes.set(renderNode, result);
    return result;
  }
  const renderedChildren = accessibleChildren(
    renderNode,
    node,
    path,
    focusPath,
    theme,
    widthProfile,
    clippedByViewport,
    accessibleNodes
  ) ?? [];
  const focus = renderFocusRelation(focusPath, path);
  const focusedTargetId = focusedTargetIdForLayoutNode(node, path, focusPath);
  const base = accessibilityForRenderNode(
    renderNode,
    node,
    id,
    focusPathIncludes(focusPath, path),
    focus,
    focusedTargetId,
    renderedChildren,
    accessibleNodes,
    theme,
    widthProfile
  );
  const children = base.children ?? (renderedChildren.length === 0 ? undefined : renderedChildren);
  const result = mergeAccessibleNode(withScope(base, renderNode), renderNode.accessibility, children);
  if (renderNode.kind === 'component') {
    assertComponentAccessibilityFocus(result, {
      runtimeFocused: focus === 'self' || focusedTargetId !== undefined,
      focusedTargetId,
      focusTargetIds: node.focusTargets.map((target) => target.id),
      excludedSubtreeIds: accessibleDescendantIds(renderedChildren),
      owner: renderNode.id ?? renderNodeFactoryName(renderNode)
    });
  }
  accessibleNodes.set(renderNode, result);
  return result;
}

function accessibleDescendantIds(children: readonly AccessibleNode[]): ReadonlySet<string> {
  const ids = new Set<string>();
  const visit = (node: AccessibleNode): void => {
    ids.add(node.id);
    for (const child of node.children ?? []) visit(child);
  };
  for (const child of children) visit(child);
  return ids;
}

export function withControlLabelRelationships(
  root: AccessibleNode
): AccessibleNode {
  const accessibleNodes = new Map<string, AccessibleNode>();
  collectAccessibleNodes(root, accessibleNodes);
  const labels = collectControlLabels(root);
  if (labels.length === 0) return root;
  const labelsByTarget = new Map<string, string>();
  for (const { labelId, targetId } of labels) {
    if (!accessibleNodes.has(labelId)) {
      throw new Error(`Control label "${labelId}" is not present in the accessibility tree.`);
    }
    const target = accessibleNodes.get(targetId);
    if (target === undefined) {
      throw new Error(`Control label "${labelId}" targets missing accessible control "${targetId}".`);
    }
    if (targetId === labelId) {
      throw new Error(`Control label "${labelId}" cannot label itself.`);
    }
    if (target.labelledBy !== undefined && target.labelledBy !== labelId) {
      throw new Error(
        `Accessible control "${targetId}" already has labelledBy "${target.labelledBy}".`
      );
    }
    const existing = labelsByTarget.get(targetId);
    if (existing !== undefined) {
      throw new Error(`Accessible control "${targetId}" has multiple labels: "${existing}" and "${labelId}".`);
    }
    labelsByTarget.set(targetId, labelId);
  }
  return applyControlLabels(root, labelsByTarget);
}

export function inertAccessibleRoot(): AccessibleNode {
  return {
    id: 'terminal-ui:inert-root',
    role: 'group'
  };
}

function collectControlLabels(
  node: AccessibleNode
): readonly { readonly labelId: string; readonly targetId: string }[] {
  const labels = node.role === 'text' && node.controls !== undefined
    ? [{
        labelId: node.id,
        targetId: node.controls
      }]
    : [];
  return [
    ...labels,
    ...(node.children ?? []).flatMap(collectControlLabels)
  ];
}

function collectAccessibleNodes(node: AccessibleNode, nodes: Map<string, AccessibleNode>): void {
  nodes.set(node.id, node);
  for (const child of node.children ?? []) collectAccessibleNodes(child, nodes);
}

function applyControlLabels(
  node: AccessibleNode,
  labelsByTarget: ReadonlyMap<string, string>
): AccessibleNode {
  const labelledBy = labelsByTarget.get(node.id);
  const children = node.children?.map((child) => applyControlLabels(child, labelsByTarget));
  return {
    ...node,
    ...(labelledBy === undefined ? {} : { labelledBy }),
    ...(children === undefined ? {} : { children })
  };
}

function accessibleChildren(
  renderNode: RenderNode,
  node: LayoutNode,
  path: FocusPath,
  focusPath: FocusPath | undefined,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  clippedByViewport: boolean,
  accessibleNodes: Map<RenderNode, AccessibleNode>
): readonly AccessibleNode[] | undefined {
  const children = renderNode.children ?? [];
  if (children.length === 0) return undefined;
  const clipsDescendants = clippedByViewport || renderNodeClipsChildren(renderNode);
  const rendered = orderedAccessibleChildren(renderNode, node).flatMap(({ child, childNode }) => {
    if (!childNode.visible) return [];
    if (clipsDescendants && intersectRects(childNode.bounds, childNode.viewport) === undefined) return [];
    if (isDecorativeAccessibility(child.accessibility)) return [];
    const accessible = accessibleNode(
      child,
      childNode,
      path,
      focusPath,
      theme,
      widthProfile,
      clipsDescendants,
      accessibleNodes
    );
    return accessible === undefined ? [] : [accessible];
  });
  return rendered.length === 0 ? undefined : rendered;
}

function orderedAccessibleChildren(
  renderNode: RenderNode,
  node: LayoutNode
): readonly { readonly child: RenderNode; readonly childNode: LayoutNode }[] {
  const pairs = (renderNode.children ?? [])
    .map((child, index) => ({ child, childNode: node.children[index], index }))
    .filter((item): item is { readonly child: RenderNode; readonly childNode: LayoutNode; readonly index: number } =>
      item.childNode !== undefined
    );
  if (renderNode.kind !== 'overlay') return pairs;
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

function withScope(base: AccessibleNode, renderNode: RenderNode): AccessibleNode {
  if (base.scope !== undefined) return base;
  if (renderNode.kind === 'overlay') {
    return {
      ...base,
      scope: {
        kind: 'popover',
        ...(renderNode.focus?.scope?.kind === 'contain' ? { trapsFocus: true } : {})
      }
    };
  }
  if (renderNode.focus?.scope?.kind === 'contain') {
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

function decorativeRootNode(id: string, options: AccessibilityOptions): AccessibleNode {
  return {
    id,
    role: 'text',
    ...(options.label === undefined ? {} : { label: options.label }),
    ...(options.description === undefined ? {} : { description: options.description })
  };
}
