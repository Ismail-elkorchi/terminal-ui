import {
  treeNodeChildren,
  treeNodeExpanded
} from '../ui-model/tree.ts';
import type {
  PassiveTreeAction,
  TreeAction,
  TreeCollection,
  TreeCollectionRecord,
  TreeDisclosureAction,
  TreeNode,
  TreeVisibleRow
} from '../ui-model/tree.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
import type { ScrollState } from '../interaction/scroll.ts';
import { collectionRecordById, completeCollection, windowedCollection } from '../ui-model/collection.ts';
import type { CollectionWindow } from '../ui-model/collection.ts';
import { assertUniqueRecursiveIds } from '../ui-model/identity.ts';
import { cyclicIndex } from '../foundation/cyclic-index.ts';

interface TreeStateBase<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>
> {
  readonly nodes: readonly TreeNode<TMetadata>[];
  readonly selected?: string;
  readonly filterQuery?: string;
  readonly rename?: TreeRenameState;
}

export interface PassiveTreeState<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>
> extends TreeStateBase<TMetadata> {
  readonly scroll?: never;
}

export interface ScrollableTreeState<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>
> extends TreeStateBase<TMetadata> {
  readonly scroll: ScrollState;
}

export type TreeState<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>
> = PassiveTreeState<TMetadata> | ScrollableTreeState<TMetadata>;

export interface TreeRenameState {
  readonly id: string;
  readonly value: string;
}

export interface TreeVisibleRowsOptions {
  readonly filterQuery?: string;
}

export interface TreeReducerOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>
> {
  readonly collection?: TreeCollection<TMetadata>;
}

interface TreeSelectionIndex<TMetadata extends Readonly<Record<string, unknown>>> {
  readonly records: readonly TreeCollectionRecord<TMetadata>[];
  readonly positions: ReadonlyMap<string, number>;
}

const treeSelectionIndexes = new WeakMap<object, TreeSelectionIndex<Readonly<Record<string, unknown>>>>();

export function treeReducer<TMetadata extends Readonly<Record<string, unknown>>>(
  state: ScrollableTreeState<TMetadata>,
  action: TreeAction<TMetadata>,
  options?: TreeReducerOptions<TMetadata>
): ScrollableTreeState<TMetadata>;
export function treeReducer<TMetadata extends Readonly<Record<string, unknown>>>(
  state: PassiveTreeState<TMetadata>,
  action: PassiveTreeAction<TMetadata>,
  options?: TreeReducerOptions<TMetadata>
): PassiveTreeState<TMetadata>;
export function treeReducer<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreeState<TMetadata>,
  action: TreeAction<TMetadata>,
  options: TreeReducerOptions<TMetadata> = {}
): TreeState<TMetadata> {
  switch (action.kind) {
    case 'select':
      return selectTreeNode(state, action.id, options.collection);
    case 'move':
      return moveTreeSelection(state, action.delta, options.collection);
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
    node.kind === 'lazy' && node.loading.kind !== 'idle' ? node.loading.message : undefined,
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

export function prepareTreeCollection<TMetadata extends Readonly<Record<string, unknown>>>(
  nodes: readonly TreeNode<TMetadata>[],
  options: TreeVisibleRowsOptions = {}
): TreeCollection<TMetadata> {
  assertUniqueRecursiveIds(nodes, (node) => ({ id: node.id, children: treeNodeChildren(node) }), 'tree');
  return prepareTreeRows(visibleTreeRows(nodes, options));
}

export function prepareTreeRows<TMetadata extends Readonly<Record<string, unknown>>>(
  rows: readonly TreeVisibleRow<TMetadata>[],
  window?: CollectionWindow
): TreeCollection<TMetadata> {
  const startIndex = window?.startIndex ?? 0;
  const records = rows.map((row, offset): TreeCollectionRecord<TMetadata> => ({
    id: row.node.id,
    itemIndex: startIndex + offset,
    row: Object.freeze({
      ...row,
      node: snapshotVisibleTreeNode(row.node),
      path: Object.freeze([...row.path])
    })
  }));
  return window === undefined
    ? completeCollection(records)
    : windowedCollection({ records, window });
}

function snapshotVisibleTreeNode<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>
): TreeNode<TMetadata> {
  const shared = {
    id: node.id,
    label: node.label,
    ...(node.description === undefined ? {} : { description: node.description }),
    ...(node.disabled === undefined ? {} : { disabled: node.disabled }),
    ...(node.icon === undefined ? {} : { icon: node.icon }),
    ...(node.metadata === undefined ? {} : { metadata: Object.freeze({ ...node.metadata }) })
  };
  if (node.kind === 'leaf') return Object.freeze({ ...shared, kind: node.kind });
  if (node.kind === 'branch') {
    return Object.freeze({
      ...shared,
      kind: node.kind,
      expanded: node.expanded,
      children: Object.freeze([...node.children])
    });
  }
  return Object.freeze({
    ...shared,
    kind: node.kind,
    expanded: node.expanded,
    loading: Object.freeze({ ...node.loading })
  });
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
  if (selectedIndex < 0) {
    return (delta < 0 ? selectable.at(-1) : selectable[0])?.node.id;
  }
  const current = selectedIndex;
  return selectable[cyclicIndex(current + delta, selectable.length)]?.node.id;
}

export function treeDisclosureAction<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>,
  intent: 'toggle' | 'expand' | 'collapse'
): TreeDisclosureAction | undefined {
  if (!treeNodeCanDisclose(node)) return undefined;
  if (intent === 'expand' && treeNodeExpanded(node)) return undefined;
  if (intent === 'collapse' && !treeNodeExpanded(node)) return undefined;
  return { kind: intent, id: node.id };
}

export function treeNodeCanDisclose<TMetadata extends Readonly<Record<string, unknown>>>(node: TreeNode<TMetadata>): boolean {
  return node.kind !== 'leaf';
}

function selectTreeNode<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreeState<TMetadata>,
  id: string | undefined,
  collection?: TreeCollection<TMetadata>
): TreeState<TMetadata> {
  if (id === undefined) return withoutSelection(state);
  if (state.selected === id) return state;
  const rows = treeRowsForState(state, collection);
  const selectedRecord = collectionRecordById(rows, id);
  if (selectedRecord?.row.node.disabled === true || selectedRecord?.row.lazyPlaceholder === true) return state;
  if (selectedRecord === undefined) return state;
  const scroll = state.scroll === undefined
    ? undefined
    : scrollReducer(state.scroll, { kind: 'itemIntoView', itemIndex: selectedRecord.itemIndex });
  return { ...state, selected: id, ...(scroll === undefined ? {} : { scroll }) };
}

function moveTreeSelection<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreeState<TMetadata>,
  delta: number,
  collection?: TreeCollection<TMetadata>
): TreeState<TMetadata> {
  const records = treeRowsForState(state, collection);
  const selection = treeSelectionIndex(records);
  if (selection.records.length === 0) return withoutSelection(state);
  const current = state.selected === undefined ? undefined : selection.positions.get(state.selected);
  const next = current === undefined
    ? (delta < 0 ? selection.records.at(-1) : selection.records[0])
    : selection.records[cyclicIndex(current + delta, selection.records.length)];
  return selectTreeNode(state, next?.id, records);
}

function treeRowsForState<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreeState<TMetadata>,
  collection: TreeCollection<TMetadata> | undefined
): TreeCollection<TMetadata> {
  return collection ?? prepareTreeCollection(
    state.nodes,
    state.filterQuery === undefined ? {} : { filterQuery: state.filterQuery }
  );
}

function treeSelectionIndex<TMetadata extends Readonly<Record<string, unknown>>>(
  collection: TreeCollection<TMetadata>
): TreeSelectionIndex<TMetadata> {
  const cached = treeSelectionIndexes.get(collection) as TreeSelectionIndex<TMetadata> | undefined;
  if (cached !== undefined) return cached;
  const records = Object.freeze(collection.records.filter((record) =>
    record.row.node.disabled !== true && record.row.lazyPlaceholder !== true
  ));
  const positions = new Map(records.map((record, index) => [record.id, index]));
  const index = Object.freeze({ records, positions });
  treeSelectionIndexes.set(
    collection,
    index
  );
  return index;
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
  const base: TreeNode<TMetadata> = node.kind !== 'branch'
    ? node
    : (() => {
        const children = reduceTreeNodes(node.children, action);
        return children === node.children ? node : { ...node, children };
      })();
  if (action.kind === 'expandAll') return setTreeNodeExpanded(base, true);
  if (action.kind === 'collapseAll') return setTreeNodeExpanded(base, false);
  if (node.id !== action.id) return base;
  switch (action.kind) {
    case 'toggle':
      return setTreeNodeExpanded(base, !treeNodeExpanded(base));
    case 'expand':
      return setTreeNodeExpanded(base, true);
    case 'collapse':
      return setTreeNodeExpanded(base, false);
    case 'lazyPending':
      return base.kind !== 'lazy' ? base : {
        ...base,
        expanded: true,
        loading: { kind: 'pending', ...(action.message === undefined ? {} : { message: action.message }) }
      };
    case 'lazySuccess':
      return lazySuccessNode(base, action.children);
    case 'lazyError':
      return base.kind !== 'lazy' ? base : {
        ...base,
        expanded: true,
        loading: { kind: 'error', message: action.message }
      };
  }
}

function renameTreeNode<TMetadata extends Readonly<Record<string, unknown>>>(
  nodes: readonly TreeNode<TMetadata>[],
  id: string,
  label: string
): readonly TreeNode<TMetadata>[] {
  const next = nodes.map((node): TreeNode<TMetadata> => {
    const children = node.kind === 'branch' ? renameTreeNode(node.children, id, label) : undefined;
    const renamed = node.id === id && node.label !== label ? { ...node, label } : node;
    const result = node.kind !== 'branch' || children === undefined || children === node.children
      ? renamed
      : { ...renamed, children };
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
  for (const child of treeNodeChildren(node)) {
    descendantMatches = collectVisibleTreeRow(descendantRows, child, depth + 1, path, query) || descendantMatches;
  }
  if (!selfMatches && !descendantMatches) return false;
  rows.push({ node, depth, path });
  if (query.length > 0) {
    rows.push(...descendantRows);
  } else if (treeNodeExpanded(node)) {
    if (node.kind === 'lazy') {
      rows.push({
        node: {
          id: `${node.id}:lazy`,
          label: lazyPlaceholderLabel(node),
          disabled: true,
          kind: 'leaf'
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

function lazyPlaceholderLabel(node: Extract<TreeNode, { readonly kind: 'lazy' }>): string {
  if (node.loading.kind === 'error') return node.loading.message;
  if (node.loading.kind === 'empty') return node.loading.message ?? 'No children';
  if (node.loading.kind === 'pending') return node.loading.message ?? 'Loading…';
  return 'Not loaded';
}

function lazySuccessNode<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>,
  children: readonly TreeNode<TMetadata>[]
): TreeNode<TMetadata> {
  const identity = treeNodeIdentity(node);
  return children.length === 0
    ? { ...identity, kind: 'lazy', expanded: true, loading: { kind: 'empty' } }
    : { ...identity, kind: 'branch', expanded: true, children };
}

function setTreeNodeExpanded<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>,
  expanded: boolean
): TreeNode<TMetadata> {
  return node.kind === 'leaf' || node.expanded === expanded ? node : { ...node, expanded };
}

function treeNodeIdentity<TMetadata extends Readonly<Record<string, unknown>>>(node: TreeNode<TMetadata>) {
  return {
    id: node.id,
    label: node.label,
    ...(node.description === undefined ? {} : { description: node.description }),
    ...(node.disabled === undefined ? {} : { disabled: node.disabled }),
    ...(node.icon === undefined ? {} : { icon: node.icon }),
    ...(node.metadata === undefined ? {} : { metadata: node.metadata })
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
