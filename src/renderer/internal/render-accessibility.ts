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
import { renderNodeFactoryName } from './render-tree/node.ts';
import type { AccessibilityOptions, AccessibleNode } from '../../accessibility/index.ts';
import type { TerminalTheme } from '../../theme/index.ts';
import type { RenderNode } from './render-tree/index.ts';
import type { FocusPath } from './focus.ts';
import type { LayoutNode } from '../contracts.ts';
import type { TextWidthProfile } from '../../text/index.ts';
import { intersectRects } from './rect.ts';
import { isDecorativeAccessibility } from './decorative.ts';
import { assertComponentAccessibilityFocus } from './component-output.ts';
import type { RenderBudget } from '../render-budget.ts';

export function accessibleNode(
  renderNode: RenderNode,
  node: LayoutNode,
  parentPath: FocusPath,
  focusPath: FocusPath | undefined,
  theme: TerminalTheme,
  widthProfile: TextWidthProfile,
  clippedByViewport = false,
  accessibleNodes = new Map<RenderNode, AccessibleNode>(),
  budget?: RenderBudget,
  depth = 0,
): AccessibleNode | undefined {
  if (node.inert) return undefined;
  const id = renderNode.id ?? `anonymous:${node.layer.id}`;
  if (!node.visible) return undefined;
  const path = layoutFocusPath(parentPath, node);
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
    accessibleNodes,
    budget,
    depth,
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
      owner: renderNode.id ?? renderNodeFactoryName(renderNode),
      ...(budget === undefined ? {} : {
        maxNodes: budget.limits.accessibilityNodes,
        maxDepth: budget.limits.depth,
      }),
    });
  }
  accessibleNodes.set(renderNode, result);
  return result;
}

function accessibleDescendantIds(children: readonly AccessibleNode[]): ReadonlySet<string> {
  const ids = new Set<string>();
  const pending = [...children];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    ids.add(node.id);
    pending.push(...(node.children ?? []));
  }
  return ids;
}

export function withControlLabelRelationships(
  root: AccessibleNode,
  budget?: RenderBudget,
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
  budget?.addAccessibilityRelationships(labelsByTarget.size);
  return applyControlLabels(root, labelsByTarget);
}

export function accountAccessibleTree(root: AccessibleNode, budget: RenderBudget): void {
  const pending: { readonly node: AccessibleNode; readonly depth: number }[] = [{ node: root, depth: 0 }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    budget.addAccessibilityNode(current.depth, relationshipCount(current.node));
    budget.addAccessibilityStrings(accessibleStringCodeUnits(current.node));
    const children = current.node.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) pending.push({ node: child, depth: current.depth + 1 });
    }
  }
}

function accessibleStringCodeUnits(node: AccessibleNode): number {
  const strings = [
    node.id,
    node.label,
    typeof node.value === 'string' ? node.value : undefined,
    node.description,
    node.controls,
    node.labelledBy,
    node.activeDescendant,
    node.errorMessage,
    node.position?.columnLabel,
    node.position?.group,
    ...(node.describedBy ?? []),
  ];
  return strings.reduce((total, value) => total + (value?.length ?? 0), 0);
}

function relationshipCount(node: AccessibleNode): number {
  return (node.controls === undefined ? 0 : 1)
    + (node.labelledBy === undefined ? 0 : 1)
    + (node.describedBy?.length ?? 0)
    + (node.activeDescendant === undefined ? 0 : 1)
    + (node.errorMessage === undefined ? 0 : 1);
}

export function inertAccessibleRoot(): AccessibleNode {
  return {
    id: 'terminal-ui:inert-root',
    role: 'group'
  };
}

function collectControlLabels(
  root: AccessibleNode
): readonly { readonly labelId: string; readonly targetId: string }[] {
  const labels: { labelId: string; targetId: string }[] = [];
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    if (node.role === 'text' && node.controls !== undefined) {
      labels.push({ labelId: node.id, targetId: node.controls });
    }
    pending.push(...(node.children ?? []));
  }
  return labels;
}

function collectAccessibleNodes(root: AccessibleNode, nodes: Map<string, AccessibleNode>): void {
  const pending = [root];
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    nodes.set(node.id, node);
    pending.push(...(node.children ?? []));
  }
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
  accessibleNodes: Map<RenderNode, AccessibleNode>,
  budget: RenderBudget | undefined,
  depth: number,
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
      accessibleNodes,
      budget,
      depth + 1,
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
