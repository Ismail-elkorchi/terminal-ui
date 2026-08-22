import { collectionInteractionReducer, prepareCollectionInteractionIndex } from '../interaction/collection.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import type { CollectionWindow } from '../ui-model/collection.ts';
import { collectionRecordById, completeCollection, windowedCollection } from '../ui-model/collection.ts';
import { assertUniqueRecursiveIds } from '../ui-model/identity.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import type {
  TreeCollection,
  TreeCollectionRecord,
  TreeControlTransition,
  TreeDisclosureTransition,
  TreeLoadState,
  TreeNode,
  PreparedTreeSource,
  PreparedTreeView,
  TreePresentation,
  ScrollableTreePresentation,
  TreeTransition,
  TreeVisibleRow,
  UnscrolledTreePresentation,
} from '../ui-model/tree.ts';
import { treeNodeChildren } from '../ui-model/tree.ts';
import { applyScrollEvent, scrollReducer } from './scroll.ts';
import { matchPreparedCollectionQuery, prepareCollectionQuery, prepareQueryCandidate } from '../text/query.ts';
import type { CollectionQuery, PreparedCollectionQuery } from '../text/query.ts';

export interface TreeReducerOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  readonly view: PreparedTreeView<TMetadata>;
  readonly navigation?: NavigationPolicy;
  readonly pageSize?: number;
}

interface PreparedTreeSourceData<TMetadata extends Readonly<Record<string, unknown>>> {
  readonly nodes: readonly TreeNode<TMetadata>[];
  readonly nodesById: ReadonlyMap<string, TreeNode<TMetadata>>;
  readonly expandableIds: ReadonlySet<string>;
}

const preparedTreeSources = new WeakMap<PreparedTreeSource, PreparedTreeSourceData<Readonly<Record<string, unknown>>>>();
const preparedTreeViews = new WeakSet<PreparedTreeView>();

export function prepareTreeSource<
  TMetadata extends Readonly<Record<string, unknown>>,
>(nodes: readonly TreeNode<TMetadata>[]): PreparedTreeSource<TMetadata> {
  if (!Array.isArray(nodes)) throw new TypeError('Tree source nodes must be an array.');
  const owned: readonly TreeNode<TMetadata>[] = ownTreeNodes<TMetadata>(nodes, 'tree nodes');
  assertUniqueRecursiveIds(owned, (node) => ({ id: node.id, children: treeNodeChildren(node) }), 'tree');
  const nodesById = new Map<string, TreeNode<TMetadata>>();
  const expandable = new Set<string>();
  const pending: TreeNode<TMetadata>[] = [...owned].reverse();
  while (pending.length > 0) {
    const node = pending.pop();
    if (node === undefined) continue;
    nodesById.set(node.id, node);
    if (node.kind !== 'leaf') expandable.add(node.id);
    pending.push(...treeNodeChildren(node).toReversed());
  }
  const source = Object.freeze({
    kind: 'prepared-tree-source' as const,
    nodeCount: nodesById.size,
  }) as PreparedTreeSource<TMetadata>;
  preparedTreeSources.set(
    source,
    Object.freeze({ nodes: owned, nodesById, expandableIds: expandable }),
  );
  return source;
}

export function prepareTreeView<
  TMetadata extends Readonly<Record<string, unknown>>,
>(
  source: PreparedTreeSource<TMetadata>,
  presentation: TreePresentation,
): PreparedTreeView<TMetadata> {
  const rows = visibleTreeRows(source, presentation);
  const collection = prepareTreeRows(rows);
  const interactionIndex = prepareCollectionInteractionIndex(collection.records
    .filter((record) => record.row.node.disabled !== true && record.row.lazyPlaceholder !== true)
    .map((record) => record.id));
  const view = Object.freeze({
    kind: 'prepared-tree-view' as const,
    source,
    collection,
    interactionIndex,
  });
  preparedTreeViews.add(view);
  return view;
}

export function isPreparedTreeView(value: unknown): value is PreparedTreeView {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
    && preparedTreeViews.has(value as PreparedTreeView);
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
    if (state.scroll === undefined) return state;
    const scroll = applyScrollEvent(state.scroll, action.event);
    return scroll === state.scroll ? state : { ...state, scroll };
  }
  if (action.kind === 'setQuery') {
    const query = prepareCollectionQuery(action.query);
    return query.text.length === 0 ? withoutQuery(state) : { ...state, query };
  }
  if (!isPreparedTreeView(options.view)) {
    throw new TypeError('treeReducer view must be created with prepareTreeView().');
  }
  if (isDisclosure(action)) return reduceDisclosure(state, action, options.view.source);
  const collection = options.view.collection;
  const interaction = collectionInteractionReducer(state, action, {
    index: options.view.interactionIndex,
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
  if (interaction === state && scroll === state.scroll) return state;
  return {
    ...state,
    ...interaction,
    ...(scroll === undefined ? {} : { scroll }),
  };
}

export function visibleTreeRows<TMetadata extends Readonly<Record<string, unknown>>>(
  source: PreparedTreeSource<TMetadata>,
  presentation: Pick<TreePresentation, 'expandedIds' | 'query' | 'loadStates'>,
): readonly TreeVisibleRow<TMetadata>[] {
  const nodes = treeSourceData(source).nodes;
  const expanded = new Set(presentation.expandedIds);
  const query = prepareCollectionQuery(presentation.query ?? { text: '', mode: 'contains' });
  return query.text.length === 0
    ? visibleExpandedRows(nodes, expanded, presentation.loadStates ?? {})
    : visibleMatchedRows(nodes, query, presentation.loadStates ?? {});
}

export function treeNodeMatches<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>,
  query: CollectionQuery,
): boolean {
  return treeNodeMatchesNormalized(node, prepareCollectionQuery(query));
}

function treeNodeMatchesNormalized<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>,
  query: PreparedCollectionQuery,
): boolean {
  return matchPreparedCollectionQuery(prepareQueryCandidate({
    id: node.id,
    primary: node.label,
    secondary: [node.id, node.description, node.icon]
      .filter((value): value is string => value !== undefined),
  }), query) !== undefined;
}

export function prepareTreeCollection<TMetadata extends Readonly<Record<string, unknown>>>(
  source: PreparedTreeSource<TMetadata>,
  presentation: Pick<TreePresentation, 'expandedIds' | 'query' | 'loadStates'>,
): TreeCollection<TMetadata> {
  return prepareTreeRows(visibleTreeRows(source, presentation));
}

export function prepareTreeRows<TMetadata extends Readonly<Record<string, unknown>>>(
  rows: readonly TreeVisibleRow<TMetadata>[],
): import('../ui-model/tree.ts').CompleteTreeCollection<TMetadata>;
export function prepareTreeRows<TMetadata extends Readonly<Record<string, unknown>>>(
  rows: readonly TreeVisibleRow<TMetadata>[],
  window: CollectionWindow,
): import('../ui-model/tree.ts').WindowedTreeCollection<TMetadata>;
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

function reduceDisclosure<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreePresentation,
  action: TreeDisclosureTransition,
  source: PreparedTreeSource<TMetadata>,
): TreePresentation {
  const expandable = treeSourceData(source).expandableIds;
  const current = new Set(state.expandedIds);
  if (action.kind === 'expandAll') {
    if (current.size === expandable.size && [...expandable].every((id) => current.has(id))) return state;
    return { ...state, expandedIds: Object.freeze([...expandable]) };
  }
  if (action.kind === 'collapseAll') {
    return current.size === 0 ? state : { ...state, expandedIds: Object.freeze([]) };
  }
  if (!expandable.has(action.id)) return state;
  const expanded = current.has(action.id);
  if (action.kind === 'collapse') {
    if (!expanded) return state;
    current.delete(action.id);
  } else if (action.kind === 'expand') {
    if (expanded) return state;
    current.add(action.id);
  } else if (expanded) current.delete(action.id);
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
  query: PreparedCollectionQuery,
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

function treeSourceData<TMetadata extends Readonly<Record<string, unknown>>>(
  source: PreparedTreeSource<TMetadata>,
): PreparedTreeSourceData<TMetadata> {
  const data = preparedTreeSources.get(source);
  if (data === undefined) {
    throw new TypeError('Tree source must be created with prepareTreeSource().');
  }
  return data as PreparedTreeSourceData<TMetadata>;
}

function ownTreeNodes<TMetadata extends Readonly<Record<string, unknown>>>(
  nodes: readonly TreeNode<TMetadata>[],
  owner: string,
): readonly TreeNode<TMetadata>[] {
  return Object.freeze(nodes.map((node, index) => ownTreeNode(node, `${owner}[${String(index)}]`)));
}

function ownTreeNode<TMetadata extends Readonly<Record<string, unknown>>>(
  value: TreeNode<TMetadata>,
  owner: string,
): TreeNode<TMetadata> {
  const candidate: unknown = value;
  if (!isNonArrayObject(candidate)) throw new TypeError(`${owner} must be an object.`);
  const kind = candidate['kind'];
  if (kind !== 'leaf' && kind !== 'branch' && kind !== 'lazy') {
    throw new TypeError(`${owner}.kind is invalid.`);
  }
  const id = ownedTreeText(value.id, `${owner}.id`, true);
  const label = ownedTreeText(value.label, `${owner}.label`, false);
  if (value.disabled !== undefined && typeof value.disabled !== 'boolean') {
    throw new TypeError(`${owner}.disabled must be a boolean.`);
  }
  if (value.metadata !== undefined && !isNonArrayObject(value.metadata)) {
    throw new TypeError(`${owner}.metadata must be an object.`);
  }
  const base = {
    id,
    label,
    ...(value.description === undefined ? {} : {
      description: ownedTreeText(value.description, `${owner}.description`, false),
    }),
    ...(value.icon === undefined ? {} : { icon: ownedTreeText(value.icon, `${owner}.icon`, false) }),
    ...(value.disabled === undefined ? {} : { disabled: value.disabled }),
    ...(value.metadata === undefined ? {} : { metadata: Object.freeze({ ...value.metadata }) }),
  };
  if (value.kind === 'branch') {
    if (!Array.isArray(value.children)) throw new TypeError(`${owner}.children must be an array.`);
    return Object.freeze({ ...base, kind: 'branch' as const, children: ownTreeNodes<TMetadata>(value.children, `${owner}.children`) });
  }
  return Object.freeze({ ...base, kind: value.kind });
}

function ownedTreeText(value: unknown, owner: string, required: boolean): string {
  if (typeof value !== 'string') throw new TypeError(`${owner} must be a string.`);
  const text = sanitizeTerminalText(value).text;
  if (required && text.trim().length === 0) throw new TypeError(`${owner} must not be empty.`);
  return required ? text.trim() : text;
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
