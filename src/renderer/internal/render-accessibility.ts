import { adoptedAccessibleNode } from '../../accessibility/validate.ts';
import type { AccessibilityOptions, AccessibleNode } from '../../accessibility/types.ts';
import { intersectRects, sameRect } from '../../geometry/rect.ts';
import type { FocusPath } from '../../interaction/focus.ts';
import type { TextWidthProfile } from '../../text/types.ts';
import type { TerminalTheme } from '../../theme/theme.ts';
import type { LayoutNode, RenderInstrumentation } from '../contracts.ts';
import type { RenderBudget } from '../render-budget.ts';
import { assertComponentAccessibilityFocus } from './component-output.ts';
import { isDecorativeAccessibility } from './decorative.ts';
import {
  focusPathIncludes,
  focusedTargetIdForLayoutNode,
  layoutFocusPath,
  renderFocusRelation,
} from './focus.ts';
import { accessibilityForRenderNode, renderNodeClipsChildren } from './render-node-behavior.ts';
import { previousLayoutNode } from './render-tree-layout.ts';
import { sameNodePhase } from './retained-dependencies.ts';
import { renderNodeFactoryName } from './render-tree/node.ts';
import type { RenderNode } from './render-tree/types.ts';

interface RetainedAccessibility {
  readonly node: RenderNode;
  readonly layout: LayoutNode;
  readonly theme: TerminalTheme;
  readonly widthProfile: TextWidthProfile;
  readonly focus: ReturnType<typeof renderFocusRelation>;
  readonly focusedTargetId: string | undefined;
  readonly children: readonly AccessibleNode[];
  readonly result: AccessibleNode;
}
const retainedAccessibility = new WeakMap<LayoutNode, RetainedAccessibility>();
const pendingAccessibility = new WeakMap<AccessibleNode, RetainedAccessibility>();

/** Publish retention only after the entire snapshot passed global validation. */
export function commitAccessibleRetention(nodes: ReadonlyMap<RenderNode, AccessibleNode>): void {
  for (const raw of nodes.values()) {
    const pending = pendingAccessibility.get(raw);
    const result = adoptedAccessibleNode(raw);
    if (pending === undefined || result === undefined) continue;
    const children = pending.children.map((child) => adoptedAccessibleNode(child) ?? child);
    retainedAccessibility.set(pending.layout, { ...pending, children, result });
  }
}

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
  instrumentation?: Pick<RenderInstrumentation, 'recordWork'>,
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
    instrumentation,
  ) ?? [];
  const focus = renderFocusRelation(focusPath, path);
  const focusedTargetId = focusedTargetIdForLayoutNode(node, path, focusPath);
  const predecessor = previousLayoutNode(node);
  const previous = retainedAccessibility.get(node)
    ?? (predecessor === undefined ? undefined : retainedAccessibility.get(predecessor));
  if (previous !== undefined && sameAccessibilityDependencies(previous, {
    node: renderNode, layout: node, theme, widthProfile, focus, focusedTargetId, children: renderedChildren,
  })) {
    if (renderNode.kind === 'component') {
      assertComponentAccessibilityFocus(previous.result, {
        runtimeFocused: focus === 'self' || focusedTargetId !== undefined,
        focusedTargetId,
        focusTargetIds: node.focusTargets.map((target) => target.id),
        excludedSubtreeIds: accessibleDescendantIds(renderedChildren),
        owner: renderNode.id ?? renderNodeFactoryName(renderNode),
        ...(budget === undefined ? {} : { maxNodes: budget.limits.accessibilityNodes, maxDepth: budget.limits.depth }),
      });
    }
    accessibleNodes.set(renderNode, previous.result);
    // Publish the current frame's descriptor only after global validation.
    pendingAccessibility.set(previous.result, {
      node: renderNode, layout: node, theme, widthProfile, focus, focusedTargetId,
      children: renderedChildren, result: previous.result,
    });
    return previous.result;
  }
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
    widthProfile,
    instrumentation,
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
  pendingAccessibility.set(result, {
    node: renderNode, layout: node, theme, widthProfile, focus, focusedTargetId,
    children: renderedChildren, result,
  });
  accessibleNodes.set(renderNode, result);
  return result;
}

export function accessibleSourceForTarget(
  root: AccessibleNode,
  rendered: ReadonlyMap<RenderNode, AccessibleNode>,
  target: string | undefined,
): string | undefined {
  if (target === undefined) return undefined;
  const owners = new Map<string, { readonly name: string; readonly id: string }>();
  for (const [renderNode, node] of rendered) {
    if (renderNode.kind === 'component') {
      owners.set(node.id, { name: renderNodeFactoryName(renderNode), id: renderNode.id ?? node.id });
    }
  }
  const pending = [{ node: root, owner: undefined as { readonly name: string; readonly id: string } | undefined }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    const owner = owners.get(current.node.id) ?? current.owner;
    if (current.node.id === target) {
      return owner === undefined ? undefined
        : `component ${JSON.stringify(owner.name)} (instance ${JSON.stringify(owner.id)})`;
    }
    for (const child of current.node.children ?? []) pending.push({ node: child, owner });
  }
  return undefined;
}

export class AccessibleRelationshipError extends Error {
  readonly target: string;

  constructor(message: string, target: string) {
    super(message);
    this.target = target;
  }
}

function relationshipError(root: AccessibleNode, target: string, message: string): AccessibleRelationshipError {
  const pending = [{ node: root, path: [root.id] }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    if (current.node.id === target) {
      return new AccessibleRelationshipError(
        `${message} Node ${JSON.stringify(target)} at ${current.path.map((id) => JSON.stringify(id)).join(' / ')}.`,
        target,
      );
    }
    for (const child of current.node.children ?? []) {
      pending.push({ node: child, path: [...current.path, child.id] });
    }
  }
  return new AccessibleRelationshipError(message, target);
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
      throw relationshipError(root, labelId, `Control label "${labelId}" is not present in the accessibility tree.`);
    }
    const target = accessibleNodes.get(targetId);
    if (target === undefined) {
      throw relationshipError(root, labelId, `Control label "${labelId}" targets missing accessible control "${targetId}".`);
    }
    if (targetId === labelId) {
      throw relationshipError(root, labelId, `Control label "${labelId}" cannot label itself.`);
    }
    if (target.labelledBy !== undefined && target.labelledBy !== labelId) {
      throw relationshipError(root, targetId,
        `Accessible control "${targetId}" already has labelledBy "${target.labelledBy}".`
      );
    }
    const existing = labelsByTarget.get(targetId);
    if (existing !== undefined) {
      throw relationshipError(root, targetId,
        `Accessible control "${targetId}" has multiple labels: "${existing}" and "${labelId}".`);
    }
    labelsByTarget.set(targetId, labelId);
  }
  budget?.addAccessibilityRelationships(labelsByTarget.size);
  return applyControlLabels(root, labelsByTarget);
}

const accessibleNodeCosts = new WeakMap<AccessibleNode, { readonly relationships: number; readonly strings: number }>();

export function accountAccessibleTree(root: AccessibleNode, budget: RenderBudget): void {
  const pending: { readonly node: AccessibleNode; readonly depth: number }[] = [{ node: root, depth: 0 }];
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    const costs = accessibleCosts(current.node);
    budget.addAccessibilityNode(current.depth, costs.relationships);
    budget.addAccessibilityStrings(costs.strings);
    const children = current.node.children ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) pending.push({ node: child, depth: current.depth + 1 });
    }
  }
}

function accessibleCosts(node: AccessibleNode): { readonly relationships: number; readonly strings: number } {
  const previous = accessibleNodeCosts.get(node);
  if (previous !== undefined) return previous;
  const costs = { relationships: relationshipCount(node), strings: accessibleStringCodeUnits(node) };
  if (adoptedAccessibleNode(node) === node) accessibleNodeCosts.set(node, costs);
  return costs;
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
  if ((labelledBy === undefined || labelledBy === node.labelledBy)
    && (children === undefined || children.every((child, index) => child === node.children?.[index]))) return node;
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
  instrumentation?: Pick<RenderInstrumentation, 'recordWork'>,
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
      instrumentation,
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

function sameAccessibilityDependencies(
  a: RetainedAccessibility,
  b: Omit<RetainedAccessibility, 'result'>,
): boolean {
  return sameNodePhase(b.node, a.node, 'accessibility')
    && a.theme === b.theme && a.widthProfile.emoji === b.widthProfile.emoji
    && a.widthProfile.ambiguous === b.widthProfile.ambiguous
    && a.focus === b.focus && a.focusedTargetId === b.focusedTargetId
    && a.layout.layer.id === b.layout.layer.id
    && sameFocusTargets(a.layout.focusTargets, b.layout.focusTargets)
    && sameRect(a.layout.bounds, b.layout.bounds) && sameRect(a.layout.viewport, b.layout.viewport)
    && a.children.length === b.children.length
    && a.children.every((child, index) => child === b.children[index]);
}

function sameFocusTargets(a: LayoutNode['focusTargets'], b: LayoutNode['focusTargets']): boolean {
  return a.length === b.length && a.every((target, index) => {
    const other = b[index];
    return target.id === other?.id && target.disabled === other.disabled
      && target.order === other.order && target.scopeId === other.scopeId
      && sameRect(target.bounds, other.bounds)
      && (target.cursor === other.cursor || target.cursor !== undefined && target.cursor.row === other.cursor?.row && target.cursor.column === other.cursor.column
        && target.cursor.style === other.cursor.style && target.cursor.source === other.cursor.source);
  });
}
