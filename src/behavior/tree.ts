import { collectionInteractionReducer, prepareCollectionInteractionIndex } from '../interaction/collection.ts';
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
  ScrollableTreePresentation,
  TreeTransition,
  TreeVisibleRow,
  UnscrolledTreePresentation,
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
  state: ScrollableTreePresentation,
  action: TreeTransition,
  options: TreeReducerOptions<TMetadata>,
): ScrollableTreePresentation;
export function treeReducer<TMetadata extends Readonly<Record<string, unknown>>>(
  state: UnscrolledTreePresentation,
  action: TreeControlTransition,
  options: TreeReducerOptions<TMetadata>,
): UnscrolledTreePresentation;
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
    index: prepareCollectionInteractionIndex(collection.records
      .filter((record) => record.row.node.disabled !== true && record.row.lazyPlaceholder !== true)
      .map((record) => record.id)),
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
  return query.text.length === 0
    ? visibleExpandedRows(nodes, expanded, presentation.loadStates ?? {})
    : visibleMatchedRows(nodes, query, presentation.loadStates ?? {});
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

function visibleExpandedRows<TMetadata extends Readonly<Record<string, unknown>>>(
  nodes: readonly TreeNode<TMetadata>[],
  expanded: ReadonlySet<string>,
  loadStates: Readonly<Record<string, TreeLoadState>>,
): readonly TreeVisibleRow<TMetadata>[] {
  const rows: TreeVisibleRow<TMetadata>[] = [];
  const pending = nodes.toReversed().map((node) => ({ node, depth: 0, path: Object.freeze([node.id]) }));
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    const isExpanded = current.node.kind !== 'leaf' && expanded.has(current.node.id);
    const loadState = current.node.kind === 'lazy'
      ? loadStates[current.node.id] ?? { kind: 'idle' as const }
      : undefined;
    rows.push({
      node: current.node,
      depth: current.depth,
      path: current.path,
      expanded: isExpanded,
      ...(loadState === undefined ? {} : { loadState }),
    });
    if (isExpanded && current.node.kind === 'lazy') {
      rows.push(lazyStatusRow(
        current.node,
        current.depth,
        current.path,
        loadState ?? { kind: 'idle' },
      ));
    }
    if (isExpanded && current.node.kind === 'branch') {
      for (let index = current.node.children.length - 1; index >= 0; index -= 1) {
        const child = current.node.children[index];
        if (child !== undefined) pending.push({
          node: child,
          depth: current.depth + 1,
          path: Object.freeze([...current.path, child.id]),
        });
      }
    }
  }
  return Object.freeze(rows);
}

function visibleMatchedRows<TMetadata extends Readonly<Record<string, unknown>>>(
  nodes: readonly TreeNode<TMetadata>[],
  query: Required<CollectionQuery>,
  loadStates: Readonly<Record<string, TreeLoadState>>,
): readonly TreeVisibleRow<TMetadata>[] {
  const matched = new WeakSet<object>();
  const traversal: { readonly node: TreeNode<TMetadata>; readonly visited: boolean }[] = nodes
    .toReversed()
    .map((node) => ({ node, visited: false }));
  while (traversal.length > 0) {
    const current = traversal.pop();
    if (current === undefined) continue;
    if (!current.visited) {
      traversal.push({ node: current.node, visited: true });
      for (let index = treeNodeChildren(current.node).length - 1; index >= 0; index -= 1) {
        const child = treeNodeChildren(current.node)[index];
        if (child !== undefined) traversal.push({ node: child, visited: false });
      }
      continue;
    }
    if (treeNodeMatchesNormalized(current.node, query)
      || treeNodeChildren(current.node).some((child) => matched.has(child))) {
      matched.add(current.node);
    }
  }
  const rows: TreeVisibleRow<TMetadata>[] = [];
  const pending = nodes.toReversed().map((node) => ({ node, depth: 0, path: Object.freeze([node.id]) }));
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined || !matched.has(current.node)) continue;
    const loadState = current.node.kind === 'lazy'
      ? loadStates[current.node.id] ?? { kind: 'idle' as const }
      : undefined;
    rows.push({
      node: current.node,
      depth: current.depth,
      path: current.path,
      expanded: current.node.kind !== 'leaf',
      ...(loadState === undefined ? {} : { loadState }),
    });
    const children = treeNodeChildren(current.node);
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const child = children[index];
      if (child !== undefined) pending.push({
        node: child,
        depth: current.depth + 1,
        path: Object.freeze([...current.path, child.id]),
      });
    }
  }
  return Object.freeze(rows);
}

function lazyStatusRow<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata> & { readonly kind: 'lazy' },
  depth: number,
  path: readonly string[],
  loadState: TreeLoadState,
): TreeVisibleRow<TMetadata> {
  return {
    node: { id: `${node.id}:status`, label: loadLabel(loadState), disabled: true, kind: 'leaf' },
    depth: depth + 1,
    path: Object.freeze([...path, 'status']),
    expanded: false,
    lazyPlaceholder: true,
  };
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
  const pending = nodes.toReversed();
  while (pending.length > 0) {
    const item = pending.pop();
    if (item === undefined) continue;
    if (item.kind !== 'leaf') ids.add(item.id);
    pending.push(...treeNodeChildren(item).toReversed());
  }
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
