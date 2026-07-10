import type { TreeDisclosureAction, TreeNode } from '../components/options/content.ts';

export type TreeAction<TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>> =
  | TreeDisclosureAction
  | { readonly kind: 'expandAll' }
  | { readonly kind: 'collapseAll' }
  | { readonly kind: 'lazyPending'; readonly id: string; readonly message?: string }
  | { readonly kind: 'lazySuccess'; readonly id: string; readonly children: readonly TreeNode<TMetadata>[] }
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

export interface TreeVisibleRow<TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>> {
  readonly node: TreeNode<TMetadata>;
  readonly depth: number;
  readonly path: readonly string[];
  readonly lazyPlaceholder?: boolean;
}

export interface TreeVisibleRowsOptions {
  readonly filterQuery?: string;
}

export type TreeStateAction =
  | { readonly kind: 'select'; readonly id?: string }
  | { readonly kind: 'filter'; readonly query: string }
  | { readonly kind: 'startRename'; readonly id: string; readonly value: string }
  | { readonly kind: 'updateRename'; readonly value: string }
  | { readonly kind: 'commitRename' }
  | { readonly kind: 'cancelRename' };

export function treeReducer<TMetadata extends Readonly<Record<string, unknown>>>(
  nodes: readonly TreeNode<TMetadata>[],
  action: TreeAction<TMetadata>
): readonly TreeNode<TMetadata>[] {
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

export function treeNodeMatches<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>,
  query: string
): boolean {
  const normalized = query.trim().toLocaleLowerCase();
  if (normalized.length === 0) return true;
  return [
    node.id,
    node.label,
    node.description,
    node.icon,
    node.lazyMessage,
    ...(node.metadata === undefined
      ? []
      : Object.values(node.metadata).flatMap((value): string[] => typeof value === 'string' ? [value] : []))
  ].filter((value): value is string => value !== undefined)
    .some((value) => value.toLocaleLowerCase().includes(normalized));
}

export function visibleTreeRows<TMetadata extends Readonly<Record<string, unknown>>>(
  nodes: readonly TreeNode<TMetadata>[],
  options: TreeVisibleRowsOptions = {}
): readonly TreeVisibleRow<TMetadata>[] {
  const query = (options.filterQuery ?? '').trim().toLocaleLowerCase();
  const rows: TreeVisibleRow<TMetadata>[] = [];
  for (const node of nodes) collectVisibleTreeRow(rows, node, 0, [], query);
  return rows;
}

export function selectableTreeRows<TMetadata extends Readonly<Record<string, unknown>>>(
  rows: readonly TreeVisibleRow<TMetadata>[]
): readonly TreeVisibleRow<TMetadata>[] {
  return rows.filter((row) => row.node.disabled !== true && row.lazyPlaceholder !== true);
}

export function nextTreeRowId(
  rows: readonly TreeVisibleRow[],
  selected: string | undefined,
  delta: number
): string | undefined {
  const selectable = selectableTreeRows(rows);
  if (selectable.length === 0) return undefined;
  const current = Math.max(0, selectable.findIndex((row) => row.node.id === selected));
  return selectable[wrapIndex(current + delta, selectable.length)]?.node.id;
}

export function treeDisclosureAction<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>,
  intent: 'toggle' | 'expand' | 'collapse'
): TreeDisclosureAction | undefined {
  if (!treeNodeCanDisclose(node)) return undefined;
  if (intent === 'expand' && node.expanded === true) return undefined;
  if (intent === 'collapse' && node.expanded !== true) return undefined;
  return { kind: intent, id: node.id };
}

export function treeNodeCanDisclose<TMetadata extends Readonly<Record<string, unknown>>>(node: TreeNode<TMetadata>): boolean {
  return node.lazy === true || (node.children?.length ?? 0) > 0;
}

function reduceNode<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>,
  action: TreeAction<TMetadata>
): TreeNode<TMetadata> {
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

function collectVisibleTreeRow<TMetadata extends Readonly<Record<string, unknown>>>(
  rows: TreeVisibleRow<TMetadata>[],
  node: TreeNode<TMetadata>,
  depth: number,
  parentPath: readonly string[],
  query: string
): boolean {
  const path = [...parentPath, node.id];
  const selfMatches = query.length === 0 || treeNodeMatches(node, query);
  const descendantRows: TreeVisibleRow<TMetadata>[] = [];
  let descendantMatches = false;
  for (const child of node.children ?? []) {
    descendantMatches = collectVisibleTreeRow(descendantRows, child, depth + 1, path, query) || descendantMatches;
  }
  if (!selfMatches && !descendantMatches) return false;
  rows.push({ node, depth, path });
  if (query.length > 0) {
    rows.push(...descendantRows);
  } else if (node.expanded === true) {
    if (node.lazy === true && (node.children === undefined || node.children.length === 0)) {
      rows.push({
        node: {
          id: `${node.id}:lazy`,
          label: lazyPlaceholderLabel(node),
          disabled: true,
          ...(node.lazyStatus === undefined ? {} : { lazyStatus: node.lazyStatus })
        },
        depth: depth + 1,
        path: [...path, 'lazy'],
        lazyPlaceholder: true
      });
    } else {
      rows.push(...descendantRows);
    }
  }
  return true;
}

function lazyPlaceholderLabel(node: TreeNode): string {
  if (node.lazyStatus === 'error') return node.lazyMessage ?? 'Load failed';
  if (node.lazyStatus === 'empty') return node.lazyMessage ?? 'No children';
  return node.lazyMessage ?? 'Loading…';
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}

function lazySuccessNode<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>,
  children: readonly TreeNode<TMetadata>[]
): TreeNode<TMetadata> {
  return {
    id: node.id,
    label: node.label,
    ...(node.description === undefined ? {} : { description: node.description }),
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
