import { assertUniqueRecursiveIds } from '../collection/identity.ts';
import type { CollectionWindow } from '../collection/snapshot.ts';
import {
  collectionItemById,
  createCompleteCollection,
  createCompleteCollectionWork,
  createWindowedCollection,
} from '../collection/snapshot.ts';
import { finishWork, prepareWork, stableSortWork, type CooperativeWorkContext } from '../foundation/cooperative-work.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import {
  collectionInteractionReducer,
  createCollectionInteractionIndexWork,
} from '../interaction/collection-interaction.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import type { CollectionQuery, CompiledCollectionQuery } from '../text/query.ts';
import {
  compileCollectionQuery,
  indexQueryCandidate,
  matchCompiledCollectionQuery,
} from '../text/query.ts';
import { sanitizeTerminalText } from '../text/sanitize.ts';
import { applyScrollRequest, scrollReducer } from './scroll.ts';
import type {
  ScrollableTreeState,
  TreeCollection,
  TreeCollectionRow,
  TreeControlTransition,
  TreeDisclosureTransition,
  TreeLoadStatus,
  TreeNode,
  TreeSource,
  TreeState,
  TreeTransition,
  TreeView,
  TreeVisibleRow,
  UnscrolledTreeState,
} from './tree.ts';
import { treeNodeChildren } from './tree.ts';

export interface TreeReducerOptions<
  TMetadata extends Readonly<Record<string, unknown>> = Readonly<Record<string, unknown>>,
> {
  readonly source: TreeSource<TMetadata>;
  /** Prepared projection; null keeps navigation idle while a new projection is pending. */
  readonly view: TreeView<TMetadata> | null;
  readonly navigation?: NavigationPolicy;
  readonly pageSize?: number;
}

interface TreeEntry<TMetadata extends Readonly<Record<string, unknown>>> {
  readonly node: TreeNode<TMetadata>;
  readonly parent: number;
  readonly depth: number;
  end: number;
}

interface TreeSourceData<TMetadata extends Readonly<Record<string, unknown>>> {
  readonly entries: readonly TreeEntry<TMetadata>[];
  readonly expandableIds: ReadonlySet<string>;
}

const treeSources = new WeakMap<TreeSource, TreeSourceData<Readonly<Record<string, unknown>>>>();
const treeViews = new WeakSet<TreeView>();
const treeViewKeys = new WeakMap<TreeView, string>();
const retainedTreeViews = new WeakMap<TreeSource, Map<string, TreeView>>();

export function createTreeSource<
  TMetadata extends Readonly<Record<string, unknown>>,
>(nodes: readonly TreeNode<TMetadata>[]): TreeSource<TMetadata> {
  if (!Array.isArray(nodes)) throw new TypeError('Tree source nodes must be an array.');
  const owned: readonly TreeNode<TMetadata>[] = ownTreeNodes<TMetadata>(nodes, 'tree nodes');
  assertUniqueRecursiveIds(owned, (node) => ({ id: node.id, children: treeNodeChildren(node) }), 'tree');
  const entries: TreeEntry<TMetadata>[] = [];
  const expandable = new Set<string>();
  const frames = [{ nodes: owned, offset: 0, parent: -1, depth: 0 }];
  while (frames.length > 0) {
    const frame = frames.at(-1);
    if (frame === undefined) break;
    const node = frame.nodes[frame.offset++];
    if (node === undefined) {
      frames.pop();
      const parent = entries[frame.parent];
      if (parent !== undefined) parent.end = entries.length;
      continue;
    }
    const index = entries.length;
    entries.push({ node, parent: frame.parent, depth: frame.depth, end: index + 1 });
    if (node.kind !== 'leaf') expandable.add(node.id);
    if (node.kind === 'branch') frames.push({ nodes: node.children, offset: 0, parent: index, depth: frame.depth + 1 });
  }
  const source = Object.freeze({
    kind: 'tree-source' as const,
    nodeCount: entries.length,
  }) as TreeSource<TMetadata>;
  treeSources.set(
    source,
    Object.freeze({ entries: Object.freeze(entries), expandableIds: expandable }),
  );
  return source;
}

export function createTreeView<
  TMetadata extends Readonly<Record<string, unknown>>,
>(
  source: TreeSource<TMetadata>,
  state: TreeState,
): TreeView<TMetadata> {
  return finishWork(createTreeViewWork(source, state));
}

/** Prepare all tree matching, projection, identity and navigation work cooperatively. */
export async function prepareTreeView<TMetadata extends Readonly<Record<string, unknown>>>(
  source: TreeSource<TMetadata>,
  state: TreeState,
  context: CooperativeWorkContext,
): Promise<TreeView<TMetadata>> {
  context.signal.throwIfAborted();
  const snapshot: TreeState = {
    ...state,
    expandedIds: Object.freeze([...state.expandedIds]),
    ...(state.loadStatusById === undefined ? {} : {
      loadStatusById: Object.freeze(Object.fromEntries(Object.entries(state.loadStatusById)
        .map(([id, status]) => [id, Object.freeze({ ...status })]))),
    }),
  };
  return await prepareWork(createTreeViewWork(source, snapshot), context);
}

function* createTreeViewWork<TMetadata extends Readonly<Record<string, unknown>>>(
  source: TreeSource<TMetadata>,
  state: TreeState,
): Generator<void, TreeView<TMetadata>, unknown> {
  const query = compileCollectionQuery(state.query ?? { text: '', mode: 'contains' });
  const key = yield* treeProjectionKeyWork(state, query);
  const cached = retainedTreeViews.get(source)?.get(key) as TreeView<TMetadata> | undefined;
  if (cached !== undefined) return cached;
  const rows = yield* visibleTreeRowsWork(source, state, query);
  const items: TreeCollectionRow<TMetadata>[] = [];
  const selectableIds: string[] = [];
  for (const row of rows) {
    items.push({ id: row.node.id, itemIndex: items.length, row });
    if (row.node.disabled !== true && row.lazyPlaceholder !== true) selectableIds.push(row.node.id);
    if (items.length % 256 === 0) yield;
  }
  const collection = yield* createCompleteCollectionWork(items);
  const interactionIndex = yield* createCollectionInteractionIndexWork(selectableIds);
  const view = Object.freeze({ kind: 'tree-view' as const, source, collection, interactionIndex });
  // Publication is atomic: aborted preparations never install partial projections.
  treeViews.add(view);
  treeViewKeys.set(view, key);
  let byState = retainedTreeViews.get(source);
  if (byState === undefined) {
    byState = new Map();
    retainedTreeViews.set(source, byState);
  }
  byState.set(key, view);
  let retainedRows = [...byState.values()].reduce((count, retained) => count + retained.collection.items.length, 0);
  while (byState.size > 1 && (byState.size > 8 || retainedRows > 8_192)) {
    const oldest = byState.entries().next().value;
    if (oldest === undefined) break;
    byState.delete(oldest[0]);
    retainedRows -= oldest[1].collection.items.length;
  }
  return view;
}

/** Validate prepared data without rebuilding a missing projection. */
export function matchingTreeView<TMetadata extends Readonly<Record<string, unknown>>>(
  source: TreeSource<TMetadata>, state: TreeState, view: TreeView<TMetadata> | null,
): TreeView<TMetadata> | undefined {
  treeSourceData(source);
  if (view === null) return undefined;
  if (!treeViews.has(view)) throw new TypeError('Prepared tree view must be created by terminal-ui.');
  return view.source === source && treeViewKeys.get(view) === treeProjectionKey(
    state, compileCollectionQuery(state.query ?? { text: '', mode: 'contains' }),
  ) ? view : undefined;
}

function treeProjectionKey(state: TreeState, query: CompiledCollectionQuery): string {
  return finishWork(treeProjectionKeyWork(state, query));
}

function* treeProjectionKeyWork(
  state: TreeState,
  query: CompiledCollectionQuery,
): Generator<void, string, unknown> {
  const expanded = yield* stableSortWork(state.expandedIds, compareIds);
  const statuses = yield* stableSortWork(Object.keys(state.loadStatusById ?? {}), compareIds);
  const pieces = [JSON.stringify([query.text, query.mode, query.caseSensitive])];
  let operations = 0;
  for (const id of expanded) {
    pieces.push(JSON.stringify(id));
    if (++operations % 256 === 0) yield;
  }
  pieces.push('|');
  for (const id of statuses) {
    const status = state.loadStatusById?.[id];
    if (status !== undefined) pieces.push(JSON.stringify([id, status.kind, 'message' in status ? status.message : undefined]));
    if (++operations % 256 === 0) yield;
  }
  return pieces.join('\n');
}

function compareIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
  if (isDisclosure(transition)) return reduceDisclosure(state, transition, options.source);
  const view = matchingTreeView(options.source, state, options.view);
  if (view === undefined) return state;
  const collection = view.collection;
  const interaction = collectionInteractionReducer(state, transition, {
    index: view.interactionIndex,
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
  return finishWork(visibleTreeRowsWork(source, state,
    compileCollectionQuery(state.query ?? { text: '', mode: 'contains' })));
}

function* visibleTreeRowsWork<TMetadata extends Readonly<Record<string, unknown>>>(
  source: TreeSource<TMetadata>,
  state: Pick<TreeState, 'expandedIds' | 'query' | 'loadStatusById'>,
  query: CompiledCollectionQuery,
): Generator<void, readonly TreeVisibleRow<TMetadata>[], unknown> {
  const entries = treeSourceData(source).entries;
  const filtering = query.text.length > 0;
  const matched = filtering ? yield* matchedTreeEntriesWork(entries, query) : undefined;
  let operations = 0;
  const expanded = new Set<string>();
  for (const id of state.expandedIds) {
    expanded.add(id);
    if (++operations % 256 === 0) yield;
  }
  const rows: TreeVisibleRow<TMetadata>[] = [];
  const paths: (readonly string[])[] = [];
  for (let index = 0; index < entries.length;) {
    const entry = entries[index];
    if (entry === undefined) break;
    if (matched !== undefined && !matched.has(index)) {
      index = entry.end;
      if (++operations % 256 === 0) yield;
      continue;
    }
    const node = entry.node;
    const path = Object.freeze([...(paths[entry.depth - 1] ?? []), node.id]);
    paths[entry.depth] = path;
    const isExpanded = node.kind !== 'leaf' && (filtering || expanded.has(node.id));
    const loadStatus = node.kind === 'lazy'
      ? Object.freeze({ ...(state.loadStatusById?.[node.id] ?? { kind: 'idle' as const }) })
      : undefined;
    rows.push(Object.freeze({ node, depth: entry.depth, path, expanded: isExpanded,
      ...(loadStatus === undefined ? {} : { loadStatus }) }));
    if (!filtering && isExpanded && node.kind === 'lazy') {
      rows.push(snapshotRow(lazyStatusRow(node, entry.depth, path, loadStatus ?? { kind: 'idle' })));
    }
    index = isExpanded ? index + 1 : entry.end;
    if (++operations % 256 === 0) yield;
  }
  return Object.freeze(rows);
}

function* matchedTreeEntriesWork<TMetadata extends Readonly<Record<string, unknown>>>(
  entries: readonly TreeEntry<TMetadata>[],
  query: CompiledCollectionQuery,
): Generator<void, ReadonlySet<number>, unknown> {
  const matched = new Set<number>();
  let operations = 0;
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry === undefined) continue;
    if (matched.has(index) || treeNodeMatchesNormalized(entry.node, query)) {
      matched.add(index);
      if (entry.parent >= 0) matched.add(entry.parent);
    }
    if (++operations % 256 === 0) yield;
  }
  return matched;
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
