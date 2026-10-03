import { snapshotArray } from '../foundation/array-snapshot.ts';
import { orderedItemByIdWork, createOrderedSource, createOrderedSourceWork, appendOrderedItemsWork, replaceOrderedItemWork, removeOrderedItemsWork, type OrderedSource } from '../foundation/ordered-source.ts';
import type { CollectionWindow } from '../collection/snapshot.ts';
import {
  createCompleteCollection,
  createWindowedCollection,
} from '../collection/snapshot.ts';
import { finishWork, prepareWork, stableSortWork, type CooperativeWorkContext } from '../foundation/cooperative-work.ts';
import { isNonArrayObject } from '../foundation/validation.ts';
import {
  collectionInteractionReducer,
  createCollectionInteractionIndexFromSource,
} from '../interaction/collection-interaction.ts';
import type { NavigationPolicy } from '../interaction/navigation.ts';
import type { CollectionQuery, CompiledCollectionQuery, QueryMatchRange } from '../text/query.ts';
import {
  compileCollectionQuery,
  compileCollectionQueryWork,
  sameCollectionQueryRequest,
  indexQueryFieldsWork,
  matchCompiledCollectionQueryWork,
  matchCompiledCollectionQueryFieldWork,
} from '../text/query.ts';
import { sanitizeTerminalTextWork } from '../text/sanitize.ts';
import { applyScrollRequest, scrollReducer } from './scroll.ts';
import type {
  ScrollableTreeState,
  TreeCollection,
  TreeCollectionRow,
  TreeControlTransition,
  TreeDisclosureTransition,
  TreeLoadStatus,
  TreeNode,
  TreeNodeDescriptor,
  TreeSourceEntry,
  TreeSourceChange,
  TreeSource,
  TreeState,
  TreeTransition,
  TreeView,
  TreeVisibleRow,
  UnscrolledTreeState,
} from './tree.ts';

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
  readonly id: string;
  readonly node: TreeNodeDescriptor<TMetadata>;
  readonly parentId?: string;
  readonly children: OrderedSource<{ readonly id: string }>;
}
interface TreeSourceData<TMetadata extends Readonly<Record<string, unknown>>> {
  readonly entries: OrderedSource<TreeEntry<TMetadata>>;
  readonly roots: OrderedSource<{ readonly id: string }>;
}

const ownedTreeNodes = new WeakSet<object>();
const treeSources = new WeakMap<TreeSource, TreeSourceData<Readonly<Record<string, unknown>>>>();
const treeViews = new WeakSet<TreeView>();
const treeRequests = new WeakMap<TreeView, { readonly expandedIds: readonly string[]; readonly loadStatusById: TreeState['loadStatusById']; readonly query: CollectionQuery | undefined; readonly preparedQuery: CompiledCollectionQuery; readonly labelMatches: ReadonlyMap<string, QueryMatchRange> }>();
const retainedTreeViews = new WeakMap<TreeSource, Map<string, TreeView>>();

export function createTreeSource<TMetadata extends Readonly<Record<string, unknown>>>(nodes: readonly TreeNode<TMetadata>[]): TreeSource<TMetadata> {
  return finishWork(treeSourceChangesWork(undefined, eagerTreeEntries(nodes)));
}

/** Topologically ordered batches own at most 256 flat descriptors. Parents precede children. */
export function prepareTreeSource<TMetadata extends Readonly<Record<string, unknown>>>(
  batches: Iterable<readonly TreeSourceEntry<TMetadata>[]>, context: CooperativeWorkContext,
): Promise<TreeSource<TMetadata>> {
  return prepareWork(treeSourceChangesWork(undefined, ownTreeEntryBatches(batches)), context);
}
export function updateTreeSource<TMetadata extends Readonly<Record<string, unknown>>>(source: TreeSource<TMetadata>, changes: readonly TreeSourceChange<TMetadata>[]): TreeSource<TMetadata> {
  return finishWork(treeSourceChangesWork(source, snapshotArray(changes).map(ownTreeChange<TMetadata>)));
}
export function prepareTreeSourceUpdate<TMetadata extends Readonly<Record<string, unknown>>>(source: TreeSource<TMetadata>, batches: Iterable<readonly TreeSourceChange<TMetadata>[]>, context: CooperativeWorkContext): Promise<TreeSource<TMetadata>> {
  return prepareWork(treeSourceChangesWork(source, ownTreeChangeBatches(batches)), context);
}
function* eagerTreeEntries<TMetadata extends Readonly<Record<string, unknown>>>(nodes: readonly TreeNode<TMetadata>[]): IterableIterator<TreeSourceChange<TMetadata>> {
  if (!Array.isArray(nodes)) throw new TypeError('Tree source nodes must be an array.');
  const frames: { nodes: readonly TreeNode<TMetadata>[]; index: number; parentId?: string }[] = [{ nodes: snapshotArray(nodes), index: 0 }];
  while (frames.length > 0) {
    const frame = frames.at(-1);
    if (frame === undefined) break;
    if (frame.index >= frame.nodes.length) { frames.pop(); continue; }
    const node = frame.nodes[frame.index++];
    if (node === undefined) throw new TypeError('Tree nodes must be objects.');
    yield { kind: 'append', entry: { node, ...(frame.parentId === undefined ? {} : { parentId: frame.parentId }) } };
    if (node.kind === 'branch') {
      if (!Array.isArray(node.children)) throw new TypeError('Tree branch children must be an array.');
      frames.push({ nodes: snapshotArray(node.children), index: 0, parentId: node.id });
    }
  }
}
function ownTreeDescriptor<TMetadata extends Readonly<Record<string, unknown>>>(value: TreeNodeDescriptor<TMetadata>): TreeNodeDescriptor<TMetadata> {
  if (!isNonArrayObject(value)) throw new TypeError('Tree node must be an object.');
  if (!['leaf', 'branch', 'lazy'].includes(value.kind)) throw new TypeError('Tree node kind is invalid.');
  for (const text of [value.id, value.label]) if (typeof text !== 'string') throw new TypeError('Tree id and label must be strings.');
  for (const text of [value.description, value.icon]) if (text !== undefined && typeof text !== 'string') throw new TypeError('Tree text fields must be strings.');
  if (value.disabled !== undefined && typeof value.disabled !== 'boolean') throw new TypeError('Tree disabled must be boolean.');
  if (value.metadata !== undefined && !isNonArrayObject(value.metadata)) throw new TypeError('Tree metadata must be an object.');
  return Object.freeze({ id: value.id, label: value.label, kind: value.kind,
    ...(value.description === undefined ? {} : { description: value.description }),
    ...(value.icon === undefined ? {} : { icon: value.icon }),
    ...(value.disabled === undefined ? {} : { disabled: value.disabled }),
    ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
  });
}
function ownTreeChange<TMetadata extends Readonly<Record<string, unknown>>>(change: TreeSourceChange<TMetadata>): TreeSourceChange<TMetadata> {
  if (!isNonArrayObject(change)) throw new TypeError('Tree change must be an object.');
  if (change.kind === 'remove') {
    if (typeof change.id !== 'string') throw new TypeError('Tree removal id must be a string.');
    return Object.freeze({ kind: 'remove', id: change.id });
  }
  if (change.kind === 'replace') return Object.freeze({ kind: 'replace', node: ownTreeDescriptor(change.node) });
  if (!isNonArrayObject(change.entry)) throw new TypeError('Tree append requires an entry.');
  const { node, parentId } = change.entry;
  if (parentId !== undefined && typeof parentId !== 'string') throw new TypeError('Tree parentId must be a string.');
  return Object.freeze({ kind: 'append', entry: Object.freeze({ node: ownTreeDescriptor(node), ...(parentId === undefined ? {} : { parentId }) }) });
}
function* ownTreeEntryBatches<TMetadata extends Readonly<Record<string, unknown>>>(batches: Iterable<readonly TreeSourceEntry<TMetadata>[]>): IterableIterator<TreeSourceChange<TMetadata> | undefined> {
  for (const batch of batches) {
    if (!Array.isArray(batch)) throw new TypeError('Tree batches must contain at most 256 entries.');
    const length = batch.length;
    if (length > 256) throw new TypeError('Tree batches must contain at most 256 entries.');
    const owned = snapshotArray<TreeSourceEntry<TMetadata>>(batch, length).map(entry => ownTreeChange<TMetadata>({ kind: 'append', entry }));
    yield* owned; yield undefined;
  }
}
function* ownTreeChangeBatches<TMetadata extends Readonly<Record<string, unknown>>>(batches: Iterable<readonly TreeSourceChange<TMetadata>[]>): IterableIterator<TreeSourceChange<TMetadata> | undefined> {
  for (const batch of batches) {
    if (!Array.isArray(batch)) throw new TypeError('Tree batches must contain at most 256 changes.');
    const length = batch.length;
    if (length > 256) throw new TypeError('Tree batches must contain at most 256 changes.');
    const owned = snapshotArray(batch, length).map(ownTreeChange<TMetadata>);
    yield* owned; yield undefined;
  }
}
function* treeSourceChangesWork<TMetadata extends Readonly<Record<string, unknown>>>(source: TreeSource<TMetadata> | undefined, changes: Iterable<TreeSourceChange<TMetadata> | undefined>): Generator<number, TreeSource<TMetadata>> {
  const previous = source === undefined ? emptyTreeSourceData<TMetadata>() : treeSourceData(source);
  let entries = previous.entries;
  let roots = previous.roots;
  for (const supplied of changes) {
    if (supplied === undefined) { yield 1; continue; }
    const change = ownTreeChange(supplied);
    if (change.kind === 'remove') {
      const current = yield* orderedItemByIdWork(entries, change.id);
      if (current === undefined) throw new TypeError('Tree removal id must identify an existing node.');
      entries = yield* removeTreeSubtreeWork(entries, current);
      if (current.parentId === undefined) roots = yield* removeOrderedItemsWork(roots, [current.id]);
      else {
        const parent = yield* orderedItemByIdWork(entries, current.parentId);
        if (parent !== undefined) entries = yield* replaceOrderedItemWork(entries, { id: parent.id, value: Object.freeze({ ...parent, children: yield* removeOrderedItemsWork(parent.children, [current.id]) }) });
      }
    } else {
      const raw = change.kind === 'append' ? change.entry.node : change.node;
      const node = yield* ownTreeNodeWork(raw, 'tree node');
      const current = yield* orderedItemByIdWork(entries, node.id);
      if (change.kind === 'replace') {
        if (current === undefined) throw new TypeError('Tree replacement id must identify an existing node.');
        if (node.kind !== 'branch' && current.children.count > 0) throw new TypeError('Remove branch children before changing its kind.');
        entries = yield* replaceOrderedItemWork(entries, { id: node.id, value: Object.freeze({ ...current, node }) });
      } else {
        if (current !== undefined) throw new TypeError(`tree item ids must be unique; duplicate id: ${node.id}`);
        const parentId = change.entry.parentId === undefined ? undefined : yield* ownedTreeTextWork(change.entry.parentId, 'tree parentId', true);
        const entry = Object.freeze({ id: node.id, node, children: createOrderedSource<{ readonly id: string }>(), ...(parentId === undefined ? {} : { parentId }) });
        const reference = { id: node.id, value: Object.freeze({ id: node.id }) };
        if (parentId === undefined) roots = yield* appendOrderedItemsWork(roots, [reference]);
        else {
          const parent = yield* orderedItemByIdWork(entries, parentId);
          if (parent?.node.kind !== 'branch') throw new TypeError('Tree parentId must identify an existing branch.');
          entries = yield* replaceOrderedItemWork(entries, { id: parent.id, value: Object.freeze({ ...parent, children: yield* appendOrderedItemsWork(parent.children, [reference]) }) });
        }
        entries = yield* appendOrderedItemsWork(entries, [{ id: entry.id, value: entry }]);
      }
    }
    yield 1;
  }
  if (source !== undefined && entries === previous.entries) return source;
  const result = Object.freeze({ kind: 'tree-source', nodeCount: entries.count }) as TreeSource<TMetadata>;
  treeSources.set(result, Object.freeze({ entries, roots }));
  return result;
}
function* removeTreeSubtreeWork<TMetadata extends Readonly<Record<string, unknown>>>(entries: OrderedSource<TreeEntry<TMetadata>>, current: TreeEntry<TMetadata>): Generator<number, OrderedSource<TreeEntry<TMetadata>>> {
  const frames: IterableIterator<{ readonly id: string }>[] = [current.children.values()];
  entries = yield* removeOrderedItemsWork(entries, [current.id]);
  while (frames.length > 0) {
    const frame = frames.at(-1);
    if (frame === undefined) break;
    const child = frame.next();
    if (child.done) { frames.pop(); continue; }
    const entry = yield* orderedItemByIdWork(entries, child.value.id);
    if (entry !== undefined) {
      frames.push(entry.children.values());
      entries = yield* removeOrderedItemsWork(entries, [entry.id]);
    }
    yield 1;
  }
  return entries;
}

/** O(log n) lookup and bounded sibling reads, independent of visible projection. */
export function treeSourceNodeById<TMetadata extends Readonly<Record<string, unknown>>>(source: TreeSource<TMetadata>, id: string): TreeNodeDescriptor<TMetadata> | undefined {
  return treeSourceData(source).entries.itemById(id)?.node;
}
export function treeSourceChildren<TMetadata extends Readonly<Record<string, unknown>>>(source: TreeSource<TMetadata>, parentId: string | undefined, start = 0, end = source.nodeCount): readonly TreeNodeDescriptor<TMetadata>[] {
  const data = treeSourceData(source);
  const children = parentId === undefined ? data.roots : data.entries.itemById(parentId)?.children;
  const result: TreeNodeDescriptor<TMetadata>[] = [];
  for (const child of children?.values(start, end) ?? []) { const node = data.entries.itemById(child.id)?.node; if (node !== undefined) result.push(node); }
  return Object.freeze(result);
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
  return await prepareWork(createTreeViewWork(source, snapshot, state), context);
}

function* createTreeViewWork<TMetadata extends Readonly<Record<string, unknown>>>(
  source: TreeSource<TMetadata>,
  state: TreeState,
  request: TreeState = state,
): Generator<number, TreeView<TMetadata>, unknown> {
  const query = yield* compileCollectionQueryWork(state.query ?? { text: '', mode: 'contains' });
  const key = yield* treeProjectionKeyWork(state, query);
  const cached = retainedTreeViews.get(source)?.get(key) as TreeView<TMetadata> | undefined;
  if (cached !== undefined && matchingTreeView(source, request, cached) !== undefined) return cached;
  const labelMatches = new Map<string, QueryMatchRange>();
  const rows = visibleTreeRowsWork(source, state, query, labelMatches);
  function* projectedItems() {
    let itemIndex = 0;
    for (const event of rows) {
      if (typeof event === 'number') { yield event; continue; }
      const row = event;
      const item = Object.freeze({ id: row.node.id, itemIndex: itemIndex++, row });
      yield { id: item.id, value: item, disabled: row.node.disabled === true || row.lazyPlaceholder === true };
      yield 1;
    }
  }
  const collection = yield* createOrderedSourceWork(projectedItems());
  const interactionIndex = createCollectionInteractionIndexFromSource(collection);
  const view = Object.freeze({ kind: 'tree-view' as const, source, collection, interactionIndex });
  // Publication is atomic: aborted preparations never install partial projections.
  treeViews.add(view);
  treeRequests.set(view, { expandedIds: request.expandedIds, loadStatusById: request.loadStatusById,
    query: request.query === undefined ? undefined : Object.freeze({ ...request.query }), preparedQuery: query, labelMatches });
  let byState = retainedTreeViews.get(source);
  if (byState === undefined) {
    byState = new Map();
    retainedTreeViews.set(source, byState);
  }
  byState.set(key, view);
  let retainedRows = [...byState.values()].reduce((count, retained) => count + retained.collection.count, 0);
  while (byState.size > 1 && (byState.size > 8 || retainedRows > 8_192)) {
    const oldest = byState.entries().next().value;
    if (oldest === undefined) break;
    byState.delete(oldest[0]);
    retainedRows -= oldest[1].collection.count;
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
  const request = treeRequests.get(view);
  return view.source === source && request !== undefined
    && (request.expandedIds === state.expandedIds || (request.expandedIds.length === 0 && state.expandedIds.length === 0))
    && request.loadStatusById === state.loadStatusById
    && (sameCollectionQueryRequest(request.query, state.query) || sameCollectionQueryRequest(request.preparedQuery, state.query))
    ? view : undefined;
}

/** Private prepared label lookup; no source indexing during paint. */
export function preparedTreeLabelMatch(view: TreeView, id: string): QueryMatchRange | undefined {
  return treeRequests.get(view)?.labelMatches.get(id);
}

function* treeProjectionKeyWork(
  state: TreeState,
  query: CompiledCollectionQuery,
): Generator<number, string, unknown> {
  const expanded = yield* stableSortWork(state.expandedIds, compareIds);
  const statuses = yield* stableSortWork(Object.keys(state.loadStatusById ?? {}), compareIds);
  const pieces = [JSON.stringify([query.text, query.mode, query.caseSensitive])];
  let operations = 0;
  for (const id of expanded) {
    pieces.push(JSON.stringify(id));
    if (++operations % 256 === 0) yield 256;
  }
  pieces.push('|');
  for (const id of statuses) {
    const status = state.loadStatusById?.[id];
    if (status !== undefined) pieces.push(JSON.stringify([id, status.kind, 'message' in status ? status.message : undefined]));
    if (++operations % 256 === 0) yield 256;
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
    : collection.rank(interaction.activeId);
  const scroll = state.scroll === undefined || itemIndex === undefined
    ? state.scroll
    : scrollReducer(state.scroll, {
      kind: 'itemIntoView',
      itemIndex,
      alignment: 'nearest',
    }, {
      contentRows: collection.count,
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
  const rows: TreeVisibleRow<TMetadata>[] = [];
  for (const event of visibleTreeRowsWork(source, state, compileCollectionQuery(state.query ?? { text: '', mode: 'contains' }))) {
    if (typeof event !== 'number') rows.push(event);
  }
  return Object.freeze(rows);
}
function* visibleTreeRowsWork<TMetadata extends Readonly<Record<string, unknown>>>(
  source: TreeSource<TMetadata>, state: Pick<TreeState, 'expandedIds' | 'query' | 'loadStatusById'>,
  query: CompiledCollectionQuery, labelMatches = new Map<string, QueryMatchRange>(),
): Generator<number | TreeVisibleRow<TMetadata>, void> {
  const data = treeSourceData(source);
  const filtering = query.text.length > 0;
  const matched = filtering ? yield* matchedTreeNodesWork(data.entries, query, labelMatches) : undefined;
  const expanded = new Set<string>();
  for (const id of state.expandedIds) { expanded.add(id); yield 1; }
  const frames: { readonly children: IterableIterator<{ readonly id: string }>; readonly path: readonly string[] }[] = [{ children: data.roots.values(), path: Object.freeze([]) }];
  while (frames.length > 0) {
    const frame = frames.at(-1);
    if (frame === undefined) break;
    const next = frame.children.next();
    if (next.done) { frames.pop(); continue; }
    const entry = yield* orderedItemByIdWork(data.entries, next.value.id);
    if (entry === undefined || matched !== undefined && !matched.has(entry.id)) { yield 1; continue; }
    const node = entry.node;
    const path = Object.freeze([...frame.path, node.id]);
    const isExpanded = node.kind !== 'leaf' && (filtering || expanded.has(node.id));
    const loadStatus = node.kind === 'lazy' ? Object.freeze({ ...(state.loadStatusById?.[node.id] ?? { kind: 'idle' as const }) }) : undefined;
    yield Object.freeze({ node, depth: frame.path.length, path, expanded: isExpanded, ...(loadStatus === undefined ? {} : { loadStatus }) });
    if (!filtering && isExpanded && node.kind === 'lazy') yield snapshotRow(lazyStatusRow(node as TreeNodeDescriptor<TMetadata> & { kind: 'lazy' }, frame.path.length, path, loadStatus ?? { kind: 'idle' }));
    if (isExpanded && node.kind === 'branch') frames.push({ children: entry.children.values(), path });
    yield 1;
  }
}
function* matchedTreeNodesWork<TMetadata extends Readonly<Record<string, unknown>>>(entries: OrderedSource<TreeEntry<TMetadata>>, query: CompiledCollectionQuery, labelMatches: Map<string, QueryMatchRange>): Generator<number, ReadonlySet<string>> {
  const matched = new Set<string>();
  for (const entry of entries.values()) {
      const result = yield* matchCompiledCollectionQueryWork(entry.node, query);
      if (result !== undefined) {
        let ancestor: TreeEntry<TMetadata> | undefined = entry;
        while (ancestor !== undefined && !matched.has(ancestor.id)) {
          matched.add(ancestor.id);
          ancestor = ancestor.parentId === undefined ? undefined : yield* orderedItemByIdWork(entries, ancestor.parentId);
          yield 1;
        }
      }
      const primary = (yield* matchCompiledCollectionQueryFieldWork(entry.node, query, 0))?.ranges[0];
      if (primary !== undefined) labelMatches.set(entry.id, primary);
      yield 1;
    }

  return matched;
}
export function treeNodeMatches<TMetadata extends Readonly<Record<string, unknown>>>(node: TreeNodeDescriptor<TMetadata>, query: CollectionQuery): boolean {
  return finishWork(function* (): Generator<number, boolean> {
    const indexed = ownedTreeNodes.has(node) ? node : yield* ownTreeNodeWork(ownTreeDescriptor(node), 'tree node');
    return (yield* matchCompiledCollectionQueryWork(indexed, compileCollectionQuery(query))) !== undefined;
  }());
}
function* treeFields(node: TreeNodeDescriptor): IterableIterator<string> {
  yield node.label; yield node.id;
  if (node.description !== undefined) yield node.description;
  if (node.icon !== undefined) yield node.icon;
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
  const entries = treeSourceData(source).entries;
  const expandable = {
    has: (id: string) => { const node = entries.itemById(id)?.node; return node !== undefined && node.kind !== 'leaf'; },
  };
  const current = new Set(state.expandedIds);
  if (transition.kind === 'expandAll') {
    const ids = Array.from(entries.values()).filter(entry => entry.node.kind !== 'leaf').map(entry => entry.id);
    if (current.size === ids.length && ids.every(id => current.has(id))) return state;
    return { ...state, expandedIds: Object.freeze(ids) };
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
  node: TreeNodeDescriptor<TMetadata> & { readonly kind: 'lazy' },
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
      ...(row.node.metadata === undefined ? {} : { metadata: row.node.metadata }),
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

function* ownTreeNodeWork<TMetadata extends Readonly<Record<string, unknown>>>(
  value: TreeNodeDescriptor<TMetadata>,
  owner: string,
): Generator<number, TreeNodeDescriptor<TMetadata>> {
  const candidate: unknown = value;
  if (!isNonArrayObject(candidate)) throw new TypeError(`${owner} must be an object.`);
  const kind = candidate['kind'];
  if (kind !== 'leaf' && kind !== 'branch' && kind !== 'lazy') {
    throw new TypeError(`${owner}.kind is invalid.`);
  }
  const id = yield* ownedTreeTextWork(value.id, `${owner}.id`, true);
  const label = yield* ownedTreeTextWork(value.label, `${owner}.label`, false);
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
      description: yield* ownedTreeTextWork(value.description, `${owner}.description`, false),
    }),
    ...(value.icon === undefined ? {} : { icon: yield* ownedTreeTextWork(value.icon, `${owner}.icon`, false) }),
    ...(value.disabled === undefined ? {} : { disabled: value.disabled }),
    ...(value.metadata === undefined ? {} : { metadata: value.metadata }),
  };
  const node = Object.freeze({ ...base, kind: value.kind });
  yield* indexQueryFieldsWork(node, treeFields(node));
  ownedTreeNodes.add(node);
  return node;
}

function* ownedTreeTextWork(value: unknown, owner: string, required: boolean): Generator<number, string> {
  if (typeof value !== 'string') throw new TypeError(`${owner} must be a string.`);
  const text = (yield* sanitizeTerminalTextWork(value)).text;
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

function emptyTreeSourceData<TMetadata extends Readonly<Record<string, unknown>>>(): TreeSourceData<TMetadata> {
  return { entries: createOrderedSource<TreeEntry<TMetadata>>(), roots: createOrderedSource<{ readonly id: string }>() };
}
