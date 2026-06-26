import type { TreeNode } from '../widgets/index.ts';

export type TreeAction =
  | { readonly kind: 'toggle'; readonly id: string }
  | { readonly kind: 'expand'; readonly id: string }
  | { readonly kind: 'collapse'; readonly id: string }
  | { readonly kind: 'expandAll' }
  | { readonly kind: 'collapseAll' };

export function treeReducer(nodes: readonly TreeNode[], action: TreeAction): readonly TreeNode[] {
  return nodes.map((node) => reduceNode(node, action));
}

function reduceNode(node: TreeNode, action: TreeAction): TreeNode {
  const children = node.children?.map((child) => reduceNode(child, action));
  const base = children === undefined ? node : { ...node, children };
  if (action.kind === 'expandAll') return { ...base, expanded: true };
  if (action.kind === 'collapseAll') return { ...base, expanded: false };
  if (node.id !== action.id) return base;
  if (action.kind === 'toggle') return { ...base, expanded: node.expanded !== true };
  if (action.kind === 'expand') return { ...base, expanded: true };
  return { ...base, expanded: false };
}
