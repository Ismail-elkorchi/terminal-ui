import type { TreeNode } from '../types.ts';

export type TreeAction =
  | { readonly kind: 'toggle'; readonly id: string }
  | { readonly kind: 'expand'; readonly id: string }
  | { readonly kind: 'collapse'; readonly id: string }
  | { readonly kind: 'expandAll' }
  | { readonly kind: 'collapseAll' }
  | { readonly kind: 'lazyPending'; readonly id: string; readonly message?: string }
  | { readonly kind: 'lazySuccess'; readonly id: string; readonly children: readonly TreeNode[] }
  | { readonly kind: 'lazyError'; readonly id: string; readonly message: string }
  | { readonly kind: 'rename'; readonly id: string; readonly label: string };

export interface TreeState {
  readonly selected?: string;
  readonly filterQuery?: string;
  readonly rename?: TreeRenameState;
}

export interface TreeRenameState {
  readonly id: string;
  readonly value: string;
}

export type TreeStateAction =
  | { readonly kind: 'select'; readonly id?: string }
  | { readonly kind: 'filter'; readonly query: string }
  | { readonly kind: 'startRename'; readonly id: string; readonly value: string }
  | { readonly kind: 'updateRename'; readonly value: string }
  | { readonly kind: 'commitRename' }
  | { readonly kind: 'cancelRename' };

export function treeReducer(nodes: readonly TreeNode[], action: TreeAction): readonly TreeNode[] {
  return nodes.map((node) => reduceNode(node, action));
}

export function treeStateReducer(state: TreeState, action: TreeStateAction): TreeState {
  switch (action.kind) {
    case 'select':
      return action.id === undefined ? withoutSelected(state) : { ...state, selected: action.id };
    case 'filter':
      return action.query.length === 0 ? withoutFilter(state) : { ...state, filterQuery: action.query };
    case 'startRename':
      return { ...state, rename: { id: action.id, value: action.value } };
    case 'updateRename':
      return state.rename === undefined ? state : { ...state, rename: { ...state.rename, value: action.value } };
    case 'commitRename':
    case 'cancelRename':
      return withoutRename(state);
  }
}

export function treeNodeMatches(node: TreeNode, query: string): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length === 0) return true;
  return [
    node.id,
    node.label,
    node.icon,
    node.lazyMessage,
    ...(node.metadata === undefined
      ? []
      : Object.values(node.metadata).flatMap((value): string[] => typeof value === 'string' ? [value] : []))
  ].filter((value): value is string => value !== undefined)
    .some((value) => value.toLocaleLowerCase().includes(normalized));
}

function reduceNode(node: TreeNode, action: TreeAction): TreeNode {
  const children = node.children?.map((child) => reduceNode(child, action));
  const base = children === undefined ? node : { ...node, children };
  if (action.kind === 'expandAll') return { ...base, expanded: true };
  if (action.kind === 'collapseAll') return { ...base, expanded: false };
  if (node.id !== action.id) return base;
  switch (action.kind) {
    case 'toggle':
      return { ...base, expanded: node.expanded !== true };
    case 'expand':
      return { ...base, expanded: true };
    case 'collapse':
      return { ...base, expanded: false };
    case 'lazyPending':
      return {
        ...base,
        lazy: true,
        expanded: true,
        lazyStatus: 'pending',
        ...(action.message === undefined ? {} : { lazyMessage: action.message })
      };
    case 'lazySuccess':
      return lazySuccessNode(base, action.children);
    case 'lazyError':
      return {
        ...base,
        lazy: true,
        expanded: true,
        lazyStatus: 'error',
        lazyMessage: action.message
      };
    case 'rename':
      return {
        ...base,
        label: action.label
      };
  }
}

function lazySuccessNode(node: TreeNode, children: readonly TreeNode[]): TreeNode {
  return {
    id: node.id,
    label: node.label,
    ...(node.disabled === undefined ? {} : { disabled: node.disabled }),
    ...(node.icon === undefined ? {} : { icon: node.icon }),
    ...(node.metadata === undefined ? {} : { metadata: node.metadata }),
    lazy: false,
    expanded: true,
    ...(children.length === 0 ? { lazyStatus: 'empty' as const } : {}),
    children
  };
}

function withoutSelected(state: TreeState): TreeState {
  return {
    ...(state.filterQuery === undefined ? {} : { filterQuery: state.filterQuery }),
    ...(state.rename === undefined ? {} : { rename: state.rename })
  };
}

function withoutFilter(state: TreeState): TreeState {
  return {
    ...(state.selected === undefined ? {} : { selected: state.selected }),
    ...(state.rename === undefined ? {} : { rename: state.rename })
  };
}

function withoutRename(state: TreeState): TreeState {
  return {
    ...(state.selected === undefined ? {} : { selected: state.selected }),
    ...(state.filterQuery === undefined ? {} : { filterQuery: state.filterQuery })
  };
}
