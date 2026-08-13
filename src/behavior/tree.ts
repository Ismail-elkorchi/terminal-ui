import { collectionInteractionReducer } from '../interaction/collection.ts';
import type { SelectionPolicy } from '../interaction/collection.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import type { CollectionWindow } from '../ui-model/collection.ts';
import { collectionRecordById, completeCollection, windowedCollection } from '../ui-model/collection.ts';
import { assertUniqueRecursiveIds } from '../ui-model/identity.ts';
import type {
  TreeCollection,
  TreeCollectionRecord,
  TreeControlTransition,
  TreeDisclosureTransition,
  TreeLoadState,
  TreeNode,
  TreePresentation,
  TreeTransition,
  TreeVisibleRow,
} from '../ui-model/tree.ts';
import { treeNodeChildren } from '../ui-model/tree.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
import { matchNormalizedCollectionQuery, normalizeCollectionQuery } from '../ui-model/query.ts';
import type { CollectionQuery } from '../ui-model/query.ts';

export interface TreeReducerOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  readonly nodes?: readonly TreeNode<TMetadata>[];
  readonly collection?: TreeCollection<TMetadata>;
  readonly selection: SelectionPolicy;
  readonly navigation?: NavigationPolicy;
  readonly pageSize?: number;
}

export function treeReducer<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreePresentation & { readonly scroll: NonNullable<TreePresentation['scroll']> },
  action: TreeTransition,
  options: TreeReducerOptions<TMetadata>,
): TreePresentation & { readonly scroll: NonNullable<TreePresentation['scroll']> };
export function treeReducer<TMetadata extends Readonly<Record<string, unknown>>>(
  state: Omit<TreePresentation, 'scroll'> & { readonly scroll?: never },
  action: TreeControlTransition,
  options: TreeReducerOptions<TMetadata>,
): Omit<TreePresentation, 'scroll'> & { readonly scroll?: never };
export function treeReducer<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreePresentation,
  action: TreeTransition,
  options: TreeReducerOptions<TMetadata>,
): TreePresentation {
  if (action.kind === 'scroll') {
    return state.scroll === undefined ? state : { ...state, scroll: applyScrollEvent(state.scroll, action.event) };
  }
  if (action.kind === 'setQuery') {
    const query = normalizeCollectionQuery(action.query);
    return query.text.length === 0 ? withoutQuery(state) : { ...state, query };
  }
  if (isDisclosure(action)) return reduceDisclosure(state, action, options.nodes);
  const collection = treeCollectionFor(state, options);
  const interaction = collectionInteractionReducer(state, action, {
    enabledIds: collection.records
      .filter((record) => record.row.node.disabled !== true && record.row.lazyPlaceholder !== true)
      .map((record) => record.id),
    selection: options.selection,
    ...(options.navigation === undefined ? {} : { navigation: options.navigation }),
  });
  const itemIndex = interaction.activeId === undefined
    ? undefined
    : collectionRecordById(collection, interaction.activeId)?.itemIndex;
  const scroll = state.scroll === undefined || itemIndex === undefined
    ? state.scroll
    : scrollReducer(state.scroll, {
      kind: 'itemIntoView',
      itemIndex,
      alignment: 'nearest',
    }, {
      contentRows: collection.totalCount,
      contentColumns: 0,
      viewportRows: Math.max(1, options.pageSize ?? 1),
      viewportColumns: 0,
    });
  return {
    ...state,
    ...interaction,
    ...(scroll === undefined ? {} : { scroll }),
  };
}

export function visibleTreeRows<TMetadata extends Readonly<Record<string, unknown>>>(
  nodes: readonly TreeNode<TMetadata>[],
  presentation: Pick<TreePresentation, 'expandedIds' | 'query' | 'loadStates'>,
): readonly TreeVisibleRow<TMetadata>[] {
  assertUniqueRecursiveIds(nodes, (node) => ({ id: node.id, children: treeNodeChildren(node) }), 'tree');
  const expanded = new Set(presentation.expandedIds);
  const query = normalizeCollectionQuery(presentation.query ?? { text: '', mode: 'contains' });
  const rows: TreeVisibleRow<TMetadata>[] = [];
  for (const node of nodes) collectRows(rows, node, 0, [], query, expanded, presentation.loadStates ?? {});
  return Object.freeze(rows);
}

export function treeNodeMatches<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>,
  query: CollectionQuery,
): boolean {
  return treeNodeMatchesNormalized(node, normalizeCollectionQuery(query));
}

function treeNodeMatchesNormalized<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>,
  query: Required<CollectionQuery>,
): boolean {
  return matchNormalizedCollectionQuery({
    id: node.id,
    primary: node.label,
    secondary: [node.id, node.description, node.icon]
      .filter((value): value is string => value !== undefined),
  }, query) !== undefined;
}

export function prepareTreeCollection<TMetadata extends Readonly<Record<string, unknown>>>(
  nodes: readonly TreeNode<TMetadata>[],
  presentation: Pick<TreePresentation, 'expandedIds' | 'query' | 'loadStates'>,
): TreeCollection<TMetadata> {
  return prepareTreeRows(visibleTreeRows(nodes, presentation));
}

export function prepareTreeRows<TMetadata extends Readonly<Record<string, unknown>>>(
  rows: readonly TreeVisibleRow<TMetadata>[],
  window?: CollectionWindow,
): TreeCollection<TMetadata> {
  const startIndex = window?.startIndex ?? 0;
  const records = rows.map((row, offset): TreeCollectionRecord<TMetadata> => ({
    id: row.node.id,
    itemIndex: startIndex + offset,
    row: snapshotRow(row),
  }));
  return window === undefined ? completeCollection(records) : windowedCollection({ records, window });
}

export function selectableTreeRows<TMetadata extends Readonly<Record<string, unknown>>>(
  rows: readonly TreeVisibleRow<TMetadata>[],
): readonly TreeVisibleRow<TMetadata>[] {
  return rows.filter((row) => row.node.disabled !== true && row.lazyPlaceholder !== true);
}

export function treeDisclosureTransition(
  node: TreeNode,
  expanded: boolean,
  intent: 'toggle' | 'expand' | 'collapse',
): TreeDisclosureTransition | undefined {
  if (node.kind === 'leaf') return undefined;
  if (intent === 'expand' && expanded) return undefined;
  if (intent === 'collapse' && !expanded) return undefined;
  return { kind: intent, id: node.id };
}

function treeCollectionFor<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreePresentation,
  options: TreeReducerOptions<TMetadata>,
): TreeCollection<TMetadata> {
  if (options.collection !== undefined) return options.collection;
  if (options.nodes === undefined) throw new TypeError('treeReducer requires nodes or collection.');
  return prepareTreeCollection(options.nodes, state);
}

function reduceDisclosure<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreePresentation,
  action: TreeDisclosureTransition,
  nodes: readonly TreeNode<TMetadata>[] | undefined,
): TreePresentation {
  const expandable = nodes === undefined ? undefined : expandableIds(nodes);
  const current = new Set(state.expandedIds);
  if (action.kind === 'expandAll') {
    if (expandable === undefined) return state;
    return { ...state, expandedIds: Object.freeze([...expandable]) };
  }
  if (action.kind === 'collapseAll') return { ...state, expandedIds: Object.freeze([]) };
  if (expandable !== undefined && !expandable.has(action.id)) return state;
  if (action.kind === 'collapse' || action.kind === 'toggle' && current.has(action.id)) current.delete(action.id);
  else current.add(action.id);
  return { ...state, expandedIds: Object.freeze([...current]) };
}

function collectRows<TMetadata extends Readonly<Record<string, unknown>>>(
  rows: TreeVisibleRow<TMetadata>[],
  node: TreeNode<TMetadata>,
  depth: number,
  parentPath: readonly string[],
  query: Required<CollectionQuery>,
  expanded: ReadonlySet<string>,
  loadStates: Readonly<Record<string, TreeLoadState>>,
): boolean {
  const path = [...parentPath, node.id];
  const descendants: TreeVisibleRow<TMetadata>[] = [];
  let descendantMatches = false;
  for (const child of treeNodeChildren(node)) {
    descendantMatches = collectRows(
      descendants, child, depth + 1, path, query, expanded, loadStates,
    ) || descendantMatches;
  }
  const selfMatches = query.text.length === 0 || treeNodeMatchesNormalized(node, query);
  if (!selfMatches && !descendantMatches) return false;
  const isExpanded = node.kind !== 'leaf' && expanded.has(node.id);
  const loadState = node.kind === 'lazy' ? loadStates[node.id] ?? { kind: 'idle' as const } : undefined;
  rows.push({
    node,
    depth,
    path: Object.freeze(path),
    expanded: isExpanded,
    ...(loadState === undefined ? {} : { loadState }),
  });
  if (query.text.length > 0 || isExpanded && node.kind === 'branch') rows.push(...descendants);
  if (isExpanded && node.kind === 'lazy') {
    rows.push({
      node: { id: `${node.id}:status`, label: loadLabel(loadState), disabled: true, kind: 'leaf' },
      depth: depth + 1,
      path: Object.freeze([...path, 'status']),
      expanded: false,
      lazyPlaceholder: true,
    });
  }
  return true;
}

function loadLabel(state: TreeLoadState | undefined): string {
  if (state?.kind === 'pending') return state.message ?? 'Loading…';
  if (state?.kind === 'error') return state.message;
  if (state?.kind === 'empty') return state.message ?? 'No children';
  return 'Not loaded';
}

function snapshotRow<TMetadata extends Readonly<Record<string, unknown>>>(
  row: TreeVisibleRow<TMetadata>,
): TreeVisibleRow<TMetadata> {
  return Object.freeze({
    ...row,
    node: Object.freeze({
      ...row.node,
      ...(row.node.kind === 'branch' ? { children: Object.freeze([...row.node.children]) } : {}),
      ...(row.node.metadata === undefined ? {} : { metadata: Object.freeze({ ...row.node.metadata }) }),
    }),
    path: Object.freeze([...row.path]),
    ...(row.loadState === undefined ? {} : { loadState: Object.freeze({ ...row.loadState }) }),
  });
}

function expandableIds(nodes: readonly TreeNode[]): ReadonlySet<string> {
  const ids = new Set<string>();
  const visit = (items: readonly TreeNode[]): void => {
    for (const item of items) {
      if (item.kind !== 'leaf') ids.add(item.id);
      visit(treeNodeChildren(item));
    }
  };
  visit(nodes);
  return ids;
}

function isDisclosure(action: TreeTransition): action is TreeDisclosureTransition {
  return ['toggle', 'expand', 'collapse', 'expandAll', 'collapseAll'].includes(action.kind);
}

function withoutQuery(state: TreePresentation): TreePresentation {
  return {
    expandedIds: state.expandedIds,
    selection: state.selection,
    ...(state.activeId === undefined ? {} : { activeId: state.activeId }),
    ...(state.loadStates === undefined ? {} : { loadStates: state.loadStates }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll }),
  };
}
