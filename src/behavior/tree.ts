import type { TreeAction, TreeDisclosureAction, TreeNode } from '../components/tree.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
import type { ScrollState } from './scroll.ts';

export interface TreeState<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>
> {
  readonly nodes: readonly TreeNode<TMetadata>[];
  readonly selected?: string;
  readonly filterQuery?: string;
  readonly rename?: TreeRenameState;
  readonly scroll?: ScrollState;
}

export interface TreeRenameState {
  readonly id: string;
  readonly value: string;
}

export interface TreeVisibleRow<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>
> {
  readonly node: TreeNode<TMetadata>;
  readonly depth: number;
  readonly path: readonly string[];
  readonly lazyPlaceholder?: boolean;
}

export interface TreeVisibleRowsOptions {
  readonly filterQuery?: string;
}

export interface TreePresentation<TMetadata extends Readonly<Record<string, unknown>>> {
  readonly nodes: readonly TreeNode<TMetadata>[];
  readonly selected?: string;
  readonly filterQuery?: string;
  readonly scroll?: ScrollState;
}

export function treeReducer<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreeState<TMetadata>,
  action: TreeAction<TMetadata>
): TreeState<TMetadata> {
  switch (action.kind) {
    case 'select':
      return selectTreeNode(state, action.id);
    case 'move':
      return moveTreeSelection(state, action.delta);
    case 'activate':
      return state;
    case 'filter':
      return action.query.length === 0
        ? withoutFilter(state)
        : { ...state, filterQuery: action.query };
    case 'startRename':
      return { ...state, rename: { id: action.id, value: action.value } };
    case 'updateRename':
      return state.rename === undefined
        ? state
        : { ...state, rename: { ...state.rename, value: action.value } };
    case 'commitRename':
      return commitTreeRename(state);
    case 'cancelRename':
      return withoutRename(state);
    case 'scroll':
      return state.scroll === undefined
        ? state
        : { ...state, scroll: applyScrollEvent(state.scroll, action.event) };
    default: {
      const nodes = reduceTreeNodes(state.nodes, action);
      return nodes === state.nodes ? state : { ...state, nodes };
    }
  }
}

export function treePresentation<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreeState<TMetadata>
): TreePresentation<TMetadata> {
  return {
    nodes: state.nodes,
    ...(state.selected === undefined ? {} : { selected: state.selected }),
    ...(state.filterQuery === undefined ? {} : { filterQuery: state.filterQuery }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll })
  };
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
  const selectedIndex = selectable.findIndex((row) => row.node.id === selected);
  const current = selectedIndex < 0 ? 0 : selectedIndex;
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

function selectTreeNode<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreeState<TMetadata>,
  id: string | undefined
): TreeState<TMetadata> {
  if (id === undefined) return withoutSelection(state);
  if (state.selected === id) return state;
  const rows = visibleTreeRows(state.nodes, state.filterQuery === undefined ? {} : { filterQuery: state.filterQuery });
  const rowIndex = rows.findIndex((row) => row.node.id === id && row.node.disabled !== true && row.lazyPlaceholder !== true);
  if (rowIndex < 0) return state;
  const scroll = state.scroll === undefined
    ? undefined
    : scrollReducer(state.scroll, { kind: 'itemIntoView', index: rowIndex });
  return { ...state, selected: id, ...(scroll === undefined ? {} : { scroll }) };
}

function moveTreeSelection<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreeState<TMetadata>,
  delta: number
): TreeState<TMetadata> {
  const rows = visibleTreeRows(state.nodes, state.filterQuery === undefined ? {} : { filterQuery: state.filterQuery });
  return selectTreeNode(state, nextTreeRowId(rows, state.selected, delta));
}

function commitTreeRename<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreeState<TMetadata>
): TreeState<TMetadata> {
  if (state.rename === undefined) return state;
  const nodes = renameTreeNode(state.nodes, state.rename.id, state.rename.value);
  const withoutRename = withoutRenameState(state);
  return nodes === state.nodes ? withoutRename : { ...withoutRename, nodes };
}

function reduceTreeNodes<TMetadata extends Readonly<Record<string, unknown>>>(
  nodes: readonly TreeNode<TMetadata>[],
  action: Exclude<TreeAction<TMetadata>,
    | { readonly kind: 'select' | 'move' | 'activate' | 'filter' | 'startRename' | 'updateRename' | 'commitRename' | 'cancelRename' | 'scroll' }
  >
): readonly TreeNode<TMetadata>[] {
  const next = nodes.map((node) => {
    const reduced = reduceTreeNode(node, action);
    return reduced;
  });
  return next.some((node, index) => node !== nodes[index]) ? next : nodes;
}

function reduceTreeNode<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>,
  action: Exclude<TreeAction<TMetadata>,
    | { readonly kind: 'select' | 'move' | 'activate' | 'filter' | 'startRename' | 'updateRename' | 'commitRename' | 'cancelRename' | 'scroll' }
  >
): TreeNode<TMetadata> {
  const base: TreeNode<TMetadata> = node.children === undefined
    ? node
    : (() => {
        const children = reduceTreeNodes(node.children, action);
        return children === node.children ? node : { ...node, children };
      })();
  if (action.kind === 'expandAll') return base.expanded === true ? base : { ...base, expanded: true };
  if (action.kind === 'collapseAll') return base.expanded === false ? base : { ...base, expanded: false };
  if (node.id !== action.id) return base;
  switch (action.kind) {
    case 'toggle':
      return { ...base, expanded: node.expanded !== true };
    case 'expand':
      return node.expanded === true ? base : { ...base, expanded: true };
    case 'collapse':
      return node.expanded === false ? base : { ...base, expanded: false };
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
      return { ...base, lazy: true, expanded: true, lazyStatus: 'error', lazyMessage: action.message };
  }
}

function renameTreeNode<TMetadata extends Readonly<Record<string, unknown>>>(
  nodes: readonly TreeNode<TMetadata>[],
  id: string,
  label: string
): readonly TreeNode<TMetadata>[] {
  const next = nodes.map((node): TreeNode<TMetadata> => {
    const children = node.children === undefined ? undefined : renameTreeNode(node.children, id, label);
    const renamed = node.id === id && node.label !== label ? { ...node, label } : node;
    const result = children === undefined || children === node.children ? renamed : { ...renamed, children };
    return result;
  });
  return next.some((node, index) => node !== nodes[index]) ? next : nodes;
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

function withoutSelection<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreeState<TMetadata>
): TreeState<TMetadata> {
  if (state.selected === undefined) return state;
  return treeStateWithout(state, 'selected');
}

function withoutFilter<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreeState<TMetadata>
): TreeState<TMetadata> {
  if (state.filterQuery === undefined) return state;
  return treeStateWithout(state, 'filterQuery');
}

function withoutRename<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreeState<TMetadata>
): TreeState<TMetadata> {
  return withoutRenameState(state);
}

function withoutRenameState<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreeState<TMetadata>
): TreeState<TMetadata> {
  if (state.rename === undefined) return state;
  return treeStateWithout(state, 'rename');
}

function treeStateWithout<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreeState<TMetadata>,
  field: 'selected' | 'filterQuery' | 'rename'
): TreeState<TMetadata> {
  return {
    nodes: state.nodes,
    ...(field === 'selected' || state.selected === undefined ? {} : { selected: state.selected }),
    ...(field === 'filterQuery' || state.filterQuery === undefined ? {} : { filterQuery: state.filterQuery }),
    ...(field === 'rename' || state.rename === undefined ? {} : { rename: state.rename }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll })
  };
}

function wrapIndex(index: number, length: number): number {
  return ((index % length) + length) % length;
}
