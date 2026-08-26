import { isNonArrayObject } from '../../foundation/validation.ts';
import type { ElementAccessibility } from '../../element/metadata.ts';
import type { AccessibilityOptions } from '../../accessibility/index.ts';
import type { LayoutNode } from '../contracts.ts';
import type { RenderNode } from './render-tree/index.ts';

export function isDecorativeAccessibility(
  value: ElementAccessibility | undefined
): value is AccessibilityOptions & { readonly decorative: true } {
  return isNonArrayObject(value) && value['decorative'] === true && !('role' in value);
}

export function decorativeSubtreeNodes(
  renderNode: RenderNode,
  layoutNode: LayoutNode
): ReadonlySet<RenderNode> {
  const nodes = new Set<RenderNode>();
  collectDecorativeSubtreeNodes(renderNode, layoutNode, false, nodes);
  return nodes;
}

export function assertDecorativeNodeHasNoHitTargets(
  renderNode: RenderNode,
  targets: readonly unknown[],
  decorativeNodes: ReadonlySet<RenderNode>
): void {
  if (decorativeNodes.has(renderNode) && targets.length > 0) {
    throw new Error(
      `Decorative renderNode "${renderNode.id ?? renderNode.kind}" cannot expose pointer interaction.`
    );
  }
}

function collectDecorativeSubtreeNodes(
  renderNode: RenderNode,
  layoutNode: LayoutNode,
  insideDecorativeSubtree: boolean,
  nodes: Set<RenderNode>
): void {
  const decorative = insideDecorativeSubtree || isDecorativeAccessibility(renderNode.accessibility);
  if (decorative) {
    nodes.add(renderNode);
    assertNoStaticInteraction(renderNode, layoutNode);
  }
  for (const [index, child] of (renderNode.children ?? []).entries()) {
    const childLayout = layoutNode.children[index];
    if (childLayout !== undefined) {
      collectDecorativeSubtreeNodes(child, childLayout, decorative, nodes);
    }
  }
}

function assertNoStaticInteraction(renderNode: RenderNode, layoutNode: LayoutNode): void {
  const owner = renderNode.id ?? renderNode.kind;
  if (renderNode.keyMap !== undefined && Object.keys(renderNode.keyMap).length > 0) {
    throw new Error(`Decorative renderNode "${owner}" cannot define keyboard interaction.`);
  }
  if (renderNode.inputMap?.text !== undefined || renderNode.inputMap?.paste !== undefined) {
    throw new Error(`Decorative renderNode "${owner}" cannot define text input interaction.`);
  }
  if (layoutNode.focusTargets.length > 0) {
    throw new Error(`Decorative renderNode "${owner}" cannot expose focus targets.`);
  }
}
