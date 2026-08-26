import { collectionInteractionReducer, createCollectionInteractionIndex } from '../interaction/collection-interaction.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import type { CollectionWindow } from '../collection/snapshot.ts';
import { collectionItemById, createCompleteCollection, createWindowedCollection } from '../collection/snapshot.ts';
import { assertUniqueRecursiveIds } from '../collection/identity.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import { sanitizeTerminalText } from '../text/index.ts';
import type {
  TreeCollection,
  TreeCollectionRow,
  TreeControlTransition,
  TreeDisclosureTransition,
  TreeLoadStatus,
  TreeNode,
  TreeSource,
  TreeView,
  TreeState,
  ScrollableTreeState,
  TreeTransition,
  TreeVisibleRow,
  UnscrolledTreeState,
} from './tree.ts';
import { treeNodeChildren } from './tree.ts';
import { applyScrollRequest, scrollReducer } from './scroll.ts';
import { matchCompiledCollectionQuery, compileCollectionQuery, indexQueryCandidate } from '../text/query.ts';
import type { CollectionQuery, CompiledCollectionQuery } from '../text/query.ts';

export interface TreeReducerOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  readonly view: TreeView<TMetadata>;
  readonly navigation?: NavigationPolicy;
  readonly pageSize?: number;
}

interface TreeSourceData<TMetadata extends Readonly<Record<string, unknown>>> {
  readonly nodes: readonly TreeNode<TMetadata>[];
  readonly nodesById: ReadonlyMap<string, TreeNode<TMetadata>>;
  readonly expandableIds: ReadonlySet<string>;
}

const treeSources = new WeakMap<TreeSource, TreeSourceData<Readonly<Record<string, unknown>>>>();
const treeViews = new WeakSet<TreeView>();

export function createTreeSource<
  TMetadata extends Readonly<Record<string, unknown>>,
>(nodes: readonly TreeNode<TMetadata>[]): TreeSource<TMetadata> {
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
    kind: 'tree-source' as const,
    nodeCount: nodesById.size,
  }) as TreeSource<TMetadata>;
  treeSources.set(
    source,
    Object.freeze({ nodes: owned, nodesById, expandableIds: expandable }),
  );
  return source;
}

export function createTreeView<
  TMetadata extends Readonly<Record<string, unknown>>,
>(
  source: TreeSource<TMetadata>,
  state: TreeState,
): TreeView<TMetadata> {
  const rows = visibleTreeRows(source, state);
  const collection = createTreeCollectionFromRows(rows);
  const interactionIndex = createCollectionInteractionIndex(collection.items
    .filter((item) => item.row.node.disabled !== true && item.row.lazyPlaceholder !== true)
    .map((item) => item.id));
  const view = Object.freeze({
    kind: 'tree-view' as const,
    source,
    collection,
    interactionIndex,
  });
  treeViews.add(view);
  return view;
}

export function isTreeView(value: unknown): value is TreeView {
  return value !== null && (typeof value === 'object' || typeof value === 'function')
    && treeViews.has(value as TreeView);
}

export function treeReducer<TMetadata extends Readonly<Record<string, unknown>>>(
  state: ScrollableTreeState,
  transition: TreeTransition,
  options: TreeReducerOptions<TMetadata>,
): ScrollableTreeState;
export function treeReducer<TMetadata extends Readonly<Record<string, unknown>>>(
  state: UnscrolledTreeState,
  transition: TreeControlTransition,
  options: TreeReducerOptions<TMetadata>,
): UnscrolledTreeState;
export function treeReducer<TMetadata extends Readonly<Record<string, unknown>>>(
  state: TreeState,
  transition: TreeTransition,
  options: TreeReducerOptions<TMetadata>,
): TreeState {
  if (transition.kind === 'scroll') {
    if (state.scroll === undefined) return state;
    const scroll = applyScrollRequest(state.scroll, transition.request);
    return scroll === state.scroll ? state : { ...state, scroll };
  }
  if (transition.kind === 'setQuery') {
    const query = compileCollectionQuery(transition.query);
    return query.text.length === 0 ? withoutQuery(state) : { ...state, query };
  }
  if (!isTreeView(options.view)) {
    throw new TypeError('treeReducer view must be created with createTreeView().');
  }
  if (isDisclosure(transition)) return reduceDisclosure(state, transition, options.view.source);
  const collection = options.view.collection;
  const interaction = collectionInteractionReducer(state, transition, {
    index: options.view.interactionIndex,
    ...(options.navigation === undefined ? {} : { navigation: options.navigation }),
  });
  const itemIndex = interaction.activeId === undefined
    ? undefined
    : collectionItemById(collection, interaction.activeId)?.itemIndex;
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
  source: TreeSource<TMetadata>,
  state: Pick<TreeState, 'expandedIds' | 'query' | 'loadStatusById'>,
): readonly TreeVisibleRow<TMetadata>[] {
  const nodes = treeSourceData(source).nodes;
  const expanded = new Set(state.expandedIds);
  const query = compileCollectionQuery(state.query ?? { text: '', mode: 'contains' });
  return query.text.length === 0
    ? visibleExpandedRows(nodes, expanded, state.loadStatusById ?? {})
    : visibleMatchedRows(nodes, query, state.loadStatusById ?? {});
}

export function treeNodeMatches<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>,
  query: CollectionQuery,
): boolean {
  return treeNodeMatchesNormalized(node, compileCollectionQuery(query));
}

function treeNodeMatchesNormalized<TMetadata extends Readonly<Record<string, unknown>>>(
  node: TreeNode<TMetadata>,
  query: CompiledCollectionQuery,
): boolean {
  return matchCompiledCollectionQuery(indexQueryCandidate({
    id: node.id,
    primary: node.label,
    secondary: [node.id, node.description, node.icon]
      .filter((value): value is string => value !== undefined),
  }), query) !== undefined;
}

export function createTreeCollection<TMetadata extends Readonly<Record<string, unknown>>>(
  source: TreeSource<TMetadata>,
  state: Pick<TreeState, 'expandedIds' | 'query' | 'loadStatusById'>,
): TreeCollection<TMetadata> {
  return createTreeCollectionFromRows(visibleTreeRows(source, state));
}

export function createTreeCollectionFromRows<TMetadata extends Readonly<Record<string, unknown>>>(
  rows: readonly TreeVisibleRow<TMetadata>[],
): import('../behavior/tree.ts').CompleteTreeCollection<TMetadata>;
export function createTreeCollectionFromRows<TMetadata extends Readonly<Record<string, unknown>>>(
  rows: readonly TreeVisibleRow<TMetadata>[],
  window: CollectionWindow,
): import('../behavior/tree.ts').WindowedTreeCollection<TMetadata>;
export function createTreeCollectionFromRows<TMetadata extends Readonly<Record<string, unknown>>>(
  rows: readonly TreeVisibleRow<TMetadata>[],
  window?: CollectionWindow,
): TreeCollection<TMetadata> {
  const startIndex = window?.startIndex ?? 0;
  const items = rows.map((row, offset): TreeCollectionRow<TMetadata> => ({
    id: row.node.id,
    itemIndex: startIndex + offset,
    row: snapshotRow(row),
  }));
  return window === undefined ? createCompleteCollection(items) : createWindowedCollection({ items, window });
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
  state: TreeState,
  transition: TreeDisclosureTransition,
  source: TreeSource<TMetadata>,
): TreeState {
  const expandable = treeSourceData(source).expandableIds;
  const current = new Set(state.expandedIds);
  if (transition.kind === 'expandAll') {
    if (current.size === expandable.size && [...expandable].every((id) => current.has(id))) return state;
    return { ...state, expandedIds: Object.freeze([...expandable]) };
  }
  if (transition.kind === 'collapseAll') {
    return current.size === 0 ? state : { ...state, expandedIds: Object.freeze([]) };
  }
  if (!expandable.has(transition.id)) return state;
  const expanded = current.has(transition.id);
  if (transition.kind === 'collapse') {
    if (!expanded) return state;
    current.delete(transition.id);
  } else if (transition.kind === 'expand') {
    if (expanded) return state;
    current.add(transition.id);
  } else if (expanded) current.delete(transition.id);
  else current.add(transition.id);
  return { ...state, expandedIds: Object.freeze([...current]) };
}

function visibleExpandedRows<TMetadata extends Readonly<Record<string, unknown>>>(
  nodes: readonly TreeNode<TMetadata>[],
  expanded: ReadonlySet<string>,
  loadStatusById: Readonly<Record<string, TreeLoadStatus>>,
): readonly TreeVisibleRow<TMetadata>[] {
  const rows: TreeVisibleRow<TMetadata>[] = [];
  const pending = nodes.toReversed().map((node) => ({ node, depth: 0, path: Object.freeze([node.id]) }));
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) continue;
    const isExpanded = current.node.kind !== 'leaf' && expanded.has(current.node.id);
    const loadStatus = current.node.kind === 'lazy'
      ? loadStatusById[current.node.id] ?? { kind: 'idle' as const }
      : undefined;
    rows.push({
      node: current.node,
      depth: current.depth,
      path: current.path,
      expanded: isExpanded,
      ...(loadStatus === undefined ? {} : { loadStatus }),
    });
    if (isExpanded && current.node.kind === 'lazy') {
      rows.push(lazyStatusRow(
        current.node,
        current.depth,
        current.path,
        loadStatus ?? { kind: 'idle' },
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
  query: CompiledCollectionQuery,
  loadStatusById: Readonly<Record<string, TreeLoadStatus>>,
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
    const loadStatus = current.node.kind === 'lazy'
      ? loadStatusById[current.node.id] ?? { kind: 'idle' as const }
      : undefined;
    rows.push({
      node: current.node,
      depth: current.depth,
      path: current.path,
      expanded: current.node.kind !== 'leaf',
      ...(loadStatus === undefined ? {} : { loadStatus }),
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
  loadStatus: TreeLoadStatus,
): TreeVisibleRow<TMetadata> {
  return {
    node: { id: `${node.id}:status`, label: loadLabel(loadStatus), disabled: true, kind: 'leaf' },
    depth: depth + 1,
    path: Object.freeze([...path, 'status']),
    expanded: false,
    lazyPlaceholder: true,
  };
}

function loadLabel(state: TreeLoadStatus | undefined): string {
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
    ...(row.loadStatus === undefined ? {} : { loadStatus: Object.freeze({ ...row.loadStatus }) }),
  });
}

function treeSourceData<TMetadata extends Readonly<Record<string, unknown>>>(
  source: TreeSource<TMetadata>,
): TreeSourceData<TMetadata> {
  const data = treeSources.get(source);
  if (data === undefined) {
    throw new TypeError('Tree source must be created with createTreeSource().');
  }
  return data as TreeSourceData<TMetadata>;
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

function isDisclosure(transition: TreeTransition): transition is TreeDisclosureTransition {
  return ['toggle', 'expand', 'collapse', 'expandAll', 'collapseAll'].includes(transition.kind);
}

function withoutQuery(state: TreeState): TreeState {
  return {
    expandedIds: state.expandedIds,
    selection: state.selection,
    ...(state.activeId === undefined ? {} : { activeId: state.activeId }),
    ...(state.loadStatusById === undefined ? {} : { loadStatusById: state.loadStatusById }),
    ...(state.scroll === undefined ? {} : { scroll: state.scroll }),
  };
}
