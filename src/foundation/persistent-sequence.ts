import { finishWork } from './cooperative-work.ts';
import { isNonArrayObject } from './validation.ts';

/** @beta */
export interface PersistentSequenceItem<TValue> {
  readonly id: string;
  readonly value: TValue;
  readonly extent: number;
  readonly enabled?: boolean;
}

declare const persistentSequenceBrand: unique symbol;

/** @beta */
export interface PersistentSequence<TValue> {
  readonly [persistentSequenceBrand]: TValue;
  readonly kind: 'persistent-sequence';
  readonly itemCount: number;
  readonly totalExtent: number;
  readonly enabledCount: number;
}

export interface PersistentSequencePosition<TValue> {
  readonly item: PersistentSequenceItem<TValue>;
  readonly itemIndex: number;
  readonly startExtent: number;
  readonly endExtent: number;
}

interface SequenceNode<TValue> {
  readonly order: bigint;
  readonly item: PersistentSequenceItem<TValue>;
  readonly left?: SequenceNode<TValue>;
  readonly right?: SequenceNode<TValue>;
  readonly height: number;
  readonly itemCount: number;
  readonly totalExtent: number;
  readonly enabledCount: number;
}

interface IdIndexEntry {
  readonly id: string;
  readonly hash: number;
  readonly order: bigint;
}

interface IdIndexLeaf {
  readonly kind: 'leaf';
  readonly entries: readonly IdIndexEntry[];
}

interface IdIndexBranch {
  readonly kind: 'branch';
  readonly bitmap: number;
  readonly children: readonly IdIndexNode[];
}

type IdIndexNode = IdIndexLeaf | IdIndexBranch;

interface PersistentSequenceData<TValue> {
  readonly sequence?: SequenceNode<TValue>;
  readonly ids?: IdIndexNode;
  readonly minimumOrder?: bigint;
  readonly maximumOrder?: bigint;
  readonly reader: PersistentSequenceReader<TValue>;
}

export interface PersistentSequenceReader<TValue> {
  readonly itemCount: number;
  readonly totalExtent: number;
  readonly enabledCount: number;
  readonly itemAt: (index: number) => PersistentSequenceItem<TValue> | undefined;
  readonly enabledItemAt: (index: number) => PersistentSequenceItem<TValue> | undefined;
  readonly enabledRank: (id: string) => number | undefined;
  readonly items: (start?: number, end?: number) => IterableIterator<PersistentSequenceItem<TValue>>;
  readonly itemById: (id: string) => PersistentSequenceItem<TValue> | undefined;
  readonly positionById: (id: string) => PersistentSequencePosition<TValue> | undefined;
  readonly positionAtExtent: (extent: number) => PersistentSequencePosition<TValue> | undefined;
  readonly positionsInExtent: (
    startExtent: number,
    endExtent: number
  ) => readonly PersistentSequencePosition<TValue>[];
}

/** Internal deterministic accounting for an indivisible AVL path operation. */
let operationCount = 0;

const persistentSequences = new WeakMap<PersistentSequence<unknown>, PersistentSequenceData<unknown>>();

/** @beta */
export function createPersistentSequence<TValue>(
  items: readonly PersistentSequenceItem<TValue>[]
): PersistentSequence<TValue> {
  if (!Array.isArray(items)) throw new TypeError('Persistent sequence items must be an array.');
  return finishWork(createPersistentSequenceWork(items));
}

/** Preparation-owned bulk construction seals the same AVL/HAMT representation. */
export function* createPersistentSequenceWork<T>(events: Iterable<PersistentSequenceItem<T> | number>): Generator<number, PersistentSequence<T>> {
  const items: PersistentSequenceItem<T>[] = [];
  const identities: IdIndexEntry[] = [];
  const seen = new Set<string>();
  let totalExtent = 0;
  for (const event of events) {
    if (typeof event === 'number') { yield event; continue; }
    const item = decodeSequenceItem(event, 'Persistent sequence item');
    if (seen.has(item.id)) throw new TypeError('Persistent sequence item ids must be unique.');
    seen.add(item.id);
    const hash = yield* hashIdWork(item.id);
    identities.push(Object.freeze({ id: item.id, hash, order: BigInt(items.length) }));
    items.push(item);
    totalExtent = checkedExtentTotal(totalExtent, item.extent);
    yield 4;
  }
  const sequence = yield* buildSequenceWork(items, 0, items.length);
  const ids = identities.length === 0 ? undefined : yield* buildIdIndexWork(identities, 0);
  return persistentSequenceFromIndexes(sequence, ids);
}
function* hashIdWork(value: string): Generator<number, number> {
  let hash = 0x811c9dc5;
  let operations = 0;
  for (let index = 0; index < value.length; index++) {
    operationCount += 1;
    hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193);
    if (++operations === 256) { yield operations; operations = 0; }
  }
  yield operations;
  return hash >>> 0;
}
interface SequenceBuildFrame<T> {
  start: number;
  end: number;
  phase: 0 | 1 | 2;
  left: SequenceNode<T> | undefined;
}

/** Reuse one frame per depth instead of allocating two generators for every node. */
function* buildSequenceWork<T>(items: readonly PersistentSequenceItem<T>[], start: number, end: number, startOrder = 0n): Generator<number, SequenceNode<T> | undefined> {
  if (start >= end) return undefined;
  const frames: SequenceBuildFrame<T>[] = [{ start, end, phase: 0, left: undefined }];
  let depth = 0;
  let completed: SequenceNode<T> | undefined;
  let operations = 0;
  const descend = (childStart: number, childEnd: number): void => {
    completed = undefined;
    if (childStart >= childEnd) return;
    depth++;
    const frame = frames[depth];
    if (frame === undefined) frames.push({ start: childStart, end: childEnd, phase: 0, left: undefined });
    else { frame.start = childStart; frame.end = childEnd; frame.phase = 0; frame.left = undefined; }
  };
  while (depth >= 0) {
    const frame = frames[depth];
    if (frame === undefined) break;
    const middle = Math.floor((frame.start + frame.end) / 2);
    if (frame.phase === 0) {
      frame.phase = 1;
      descend(frame.start, middle);
    } else if (frame.phase === 1) {
      frame.left = completed;
      frame.phase = 2;
      descend(middle + 1, frame.end);
    } else {
      const item = items[middle];
      completed = item === undefined ? undefined : sequenceNode(startOrder + BigInt(middle), item, frame.left, completed);
      depth--;
    }
    if (++operations === 128) { yield operations; operations = 0; }
  }
  if (operations > 0) yield operations;
  return completed;
}
interface IdIndexBuildFrame {
  parent: IdIndexBuildFrame | undefined;
  depth: number;
  entries: readonly IdIndexEntry[];
  groups: IdIndexEntry[][];
  cursor: number;
  slot: number;
  bitmap: number;
  children: IdIndexNode[];
}

/** The HAMT has at most seven branch levels; retain only their active grouping state. */
function* buildIdIndexWork(entries: readonly IdIndexEntry[], depth: number): Generator<number, IdIndexNode> {
  if (entries.length === 1 || depth >= 7) { yield entries.length; return idIndexLeaf(entries); }
  const frames: IdIndexBuildFrame[] = [];
  const frameFor = (values: readonly IdIndexEntry[], hashDepth: number, parent: IdIndexBuildFrame | undefined): IdIndexBuildFrame => {
    let frame = frames[hashDepth];
    if (frame === undefined) {
      frame = { parent, depth: hashDepth, entries: values, groups: [], cursor: 0, slot: 0, bitmap: 0, children: [] };
      frames[hashDepth] = frame;
    } else { frame.parent = parent; frame.depth = hashDepth; frame.entries = values; frame.cursor = 0; frame.slot = 0; frame.bitmap = 0; frame.children = []; }
    frame.groups = Array.from({ length: 32 }, () => []);
    return frame;
  };
  let frame = frameFor(entries, depth, undefined);
  let operations = 0;
  for (;;) {
    if (frame.cursor < frame.entries.length) {
      const entry = frame.entries[frame.cursor++];
      if (entry !== undefined) frame.groups[(entry.hash >>> (frame.depth * 5)) & 31]?.push(entry);
    } else if (frame.slot < 32) {
      const slot = frame.slot++;
      const group = frame.groups[slot];
      if (group !== undefined && group.length > 0) {
        frame.bitmap = (frame.bitmap | ((1 << slot) >>> 0)) >>> 0;
        if (group.length === 1 || frame.depth + 1 >= 7) {
          frame.children.push(idIndexLeaf(group));
          operations += group.length;
        } else frame = frameFor(group, frame.depth + 1, frame);
      }
    } else {
      const node = idIndexBranch(frame.bitmap, frame.children);
      operations += frame.children.length;
      if (frame.parent === undefined) { yield operations; return node; }
      frame = frame.parent;
      frame.children.push(node);
    }
    if (++operations >= 128) { yield operations; operations = 0; }
  }
}

/** @beta */
export function appendSequenceItems<TValue>(
  collection: PersistentSequence<TValue>,
  items: readonly PersistentSequenceItem<TValue>[]
): PersistentSequence<TValue> {
  return finishWork(appendSequenceItemsWork(collection, items));
}

export function* appendSequenceItemsWork<TValue>(
  collection: PersistentSequence<TValue>,
  items: readonly PersistentSequenceItem<TValue>[]
): Generator<number, PersistentSequence<TValue>> {
  const data = persistentSequenceData(collection);
  const startOrder = (data.maximumOrder ?? -1n) + 1n;
  const batch = yield* decodeSequenceItemsWork(items, data.ids, startOrder);
  if (batch.items.length === 0) return collection;
  assertTotalExtent(collection.totalExtent, batch.totalExtent);
  const appended = yield* buildSequenceWork(batch.items, 0, batch.items.length, startOrder);
  const started = operationCount;
  const result = persistentSequenceFromIndexes(joinSequences(data.sequence, appended), batch.ids);
  yield operationCount - started;
  return result;
}

/** @beta */
export function prependSequenceItems<TValue>(
  collection: PersistentSequence<TValue>,
  items: readonly PersistentSequenceItem<TValue>[]
): PersistentSequence<TValue> {
  return finishWork(prependSequenceItemsWork(collection, items));
}

export function* prependSequenceItemsWork<TValue>(
  collection: PersistentSequence<TValue>,
  items: readonly PersistentSequenceItem<TValue>[]
): Generator<number, PersistentSequence<TValue>> {
  const data = persistentSequenceData(collection);
  assertSequenceItems(items);
  const startOrder = (data.minimumOrder ?? BigInt(items.length)) - BigInt(items.length);
  const batch = yield* decodeSequenceItemsWork(items, data.ids, startOrder);
  if (batch.items.length === 0) return collection;
  assertTotalExtent(collection.totalExtent, batch.totalExtent);
  const prepended = yield* buildSequenceWork(batch.items, 0, batch.items.length, startOrder);
  const started = operationCount;
  const result = persistentSequenceFromIndexes(joinSequences(prepended, data.sequence), batch.ids);
  yield operationCount - started;
  return result;
}

/** @beta */
export function replaceSequenceValue<TValue>(
  collection: PersistentSequence<TValue>,
  item: PersistentSequenceItem<TValue>
): PersistentSequence<TValue> {
  return finishWork(replaceSequenceValueWork(collection, item));
}

// Measurement acceptance owns a new receipt even when the estimated height was exact.
export function replaceSequenceItemIdentity<TValue>(
  collection: PersistentSequence<TValue>,
  item: PersistentSequenceItem<TValue>,
): PersistentSequence<TValue> {
  return finishWork(replaceSequenceValueWork(collection, item, true));
}

export function* replaceSequenceValueWork<TValue>(
  collection: PersistentSequence<TValue>,
  item: PersistentSequenceItem<TValue>,
  replaceIdentity = false,
): Generator<number, PersistentSequence<TValue>> {
  const data = persistentSequenceData(collection);
  const replacement = decodeSequenceItem(item, 'Persistent sequence replacement item');
  const order = yield* idIndexGetWork(data.ids, replacement.id);
  if (order === undefined) {
    throw new RangeError('Persistent sequence does not contain the replacement item id.');
  }
  const started = operationCount;
  const current = sequencePositionByOrder(data.sequence, order);
  if (current === undefined) {
    throw new Error('Persistent sequence indexes are inconsistent.');
  }
  if (!replaceIdentity && current.item.extent === replacement.extent && current.item.enabled === replacement.enabled && Object.is(current.item.value, replacement.value)) {
    yield operationCount - started;
    return collection;
  }
  assertTotalExtent(collection.totalExtent - current.item.extent, replacement.extent);
  const result = persistentSequenceFromIndexes(
    replaceSequenceItem(data.sequence, order, replacement),
    data.ids
  );
  yield operationCount - started;
  return result;
}

/** @beta */
export function removeSequenceItems<TValue>(
  collection: PersistentSequence<TValue>,
  ids: readonly string[]
): PersistentSequence<TValue> {
  return finishWork(removeSequenceItemsWork(collection, ids));
}

export function* removeSequenceItemsWork<TValue>(
  collection: PersistentSequence<TValue>,
  ids: readonly string[]
): Generator<number, PersistentSequence<TValue>> {
  const data = persistentSequenceData(collection);
  if (!Array.isArray(ids)) throw new TypeError('Persistent sequence removal ids must be an array.');
  let sequence = data.sequence;
  let idIndex = data.ids;
  let changed = false;
  const visited = new Set<string>();
  for (const suppliedId of ids) {
    const id = sequenceItemId(suppliedId, 'Persistent sequence removal id');
    if (visited.has(id)) { yield 1; continue; }
    visited.add(id);
    const hash = yield* hashIdWork(id);
    const order = yield* idIndexGetWork(idIndex, id, hash);
    if (order === undefined) continue;
    const started = operationCount;
    sequence = removeSequenceItem(sequence, order);
    yield operationCount - started;
    idIndex = yield* idIndexDeleteWork(idIndex, id, hash, 0);
    changed = true;
  }
  return changed ? persistentSequenceFromIndexes(sequence, idIndex) : collection;
}

/** Cooperative lookup for framework-owned preparation; public readers stay synchronous. */
export function* persistentSequenceItemByIdWork<TValue>(
  collection: PersistentSequence<TValue>, id: string,
): Generator<number, PersistentSequenceItem<TValue> | undefined> {
  const data = persistentSequenceData(collection);
  const order = yield* idIndexGetWork(data.ids, id);
  const started = operationCount;
  const item = order === undefined ? undefined : sequencePositionByOrder(data.sequence, order)?.item;
  yield operationCount - started;
  return item;
}

/** @beta */
export function persistentSequenceItemById<TValue>(
  collection: PersistentSequence<TValue>,
  id: string
): PersistentSequenceItem<TValue> | undefined {
  const reader = readPersistentSequence(collection);
  if (typeof id !== 'string') return undefined;
  return reader.itemById(id);
}

export function readPersistentSequence<TValue>(
  collection: PersistentSequence<TValue>,
): PersistentSequenceReader<TValue> {
  return persistentSequenceData(collection).reader;
}

function assertSequenceItems(value: unknown): void {
  if (!Array.isArray(value)) throw new TypeError('Persistent sequence items must be an array.');
}

function* decodeSequenceItemsWork<TValue>(
  supplied: readonly PersistentSequenceItem<TValue>[],
  existingIds: IdIndexNode | undefined,
  startOrder = 0n
): Generator<number, {
  readonly items: readonly PersistentSequenceItem<TValue>[];
  readonly ids?: IdIndexNode;
  readonly totalExtent: number;
}> {
  assertSequenceItems(supplied);
  const items: PersistentSequenceItem<TValue>[] = [];
  let ids = existingIds;
  let totalExtent = 0;
  for (const [index, item] of supplied.entries()) {
    const decodedItem = decodeSequenceItem<TValue>(item, `Persistent sequence items[${String(index)}]`);
    const hash = yield* hashIdWork(decodedItem.id);
    if ((yield* idIndexGetWork(ids, decodedItem.id, hash)) !== undefined) {
      throw new TypeError('Persistent sequence item ids must be unique.');
    }
    totalExtent = checkedExtentTotal(totalExtent, decodedItem.extent);
    const order = startOrder + BigInt(index);
    ids = yield* idIndexSetWork(ids, Object.freeze({ id: decodedItem.id, hash, order }), 0);
    items.push(decodedItem);
    yield 1;
  }
  return Object.freeze({
    items: Object.freeze(items),
    ...(ids === undefined ? {} : { ids }),
    totalExtent
  });
}

function decodeSequenceItem<TValue>(value: PersistentSequenceItem<TValue>, subject: string): PersistentSequenceItem<TValue> {
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const id = sequenceItemId(value.id, `${subject}.id`);
  const extent = value.extent;
  if (!Number.isSafeInteger(extent) || extent < 1) {
    throw new RangeError(`${subject}.extent must be a positive safe integer.`);
  }
  return Object.freeze({ id, value: value.value, extent, ...(value.enabled === undefined ? {} : { enabled: value.enabled }) });
}

function sequenceItemId(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${subject} must be a non-empty string.`);
  }
  return value;
}

function persistentSequenceFromIndexes<TValue>(
  sequence: SequenceNode<TValue> | undefined,
  ids: IdIndexNode | undefined
): PersistentSequence<TValue> {
  const collection = Object.freeze({
    kind: 'persistent-sequence' as const,
    itemCount: sequence?.itemCount ?? 0,
    totalExtent: sequence?.totalExtent ?? 0,
    enabledCount: sequence?.enabledCount ?? 0
  }) as PersistentSequence<TValue>;
  const data = Object.freeze({
    sequence,
    ids,
    minimumOrder: minimumSequenceOrder(sequence),
    maximumOrder: maximumSequenceOrder(sequence),
    reader: createPersistentSequenceReader(sequence, ids)
  });
  persistentSequences.set(
    collection,
    data as PersistentSequenceData<unknown>
  );
  return collection;
}

function createPersistentSequenceReader<TValue>(
  sequence: SequenceNode<TValue> | undefined,
  ids: IdIndexNode | undefined
): PersistentSequenceReader<TValue> {
  const itemCount = sequence?.itemCount ?? 0;
  const totalExtent = sequence?.totalExtent ?? 0;
  const positionById = (id: string): PersistentSequencePosition<TValue> | undefined => {
    const order = idIndexGet(ids, id);
    return order === undefined ? undefined : sequencePositionByOrder(sequence, order);
  };
  return Object.freeze({
    itemCount,
    totalExtent,
    enabledCount: sequence?.enabledCount ?? 0,
    itemAt: (index: number) => sequenceItemAt(sequence, index, false),
    enabledItemAt: (index: number) => sequenceItemAt(sequence, index, true),
    enabledRank: (id: string) => { const order = idIndexGet(ids, id); return order === undefined ? undefined : sequenceEnabledRank(sequence, order); },
    items: (start = 0, end = itemCount) => sequenceItems(sequence, Math.max(0, start), Math.min(itemCount, end)),
    itemById: (id: string) => positionById(id)?.item,
    positionById,
    positionAtExtent: (extent: number) => (
      extent < 0 || extent >= totalExtent
        ? undefined
        : sequencePositionAtRow(sequence, extent, 0, 0)
    ),
    positionsInExtent: (startExtent: number, endExtent: number) => {
      const positions: PersistentSequencePosition<TValue>[] = [];
      collectSequencePositions(
        sequence,
        0,
        0,
        startExtent,
        Math.min(endExtent, totalExtent),
        positions
      );
      return Object.freeze(positions);
    }
  });
}

function persistentSequenceData<TValue>(
  collection: PersistentSequence<TValue>
): PersistentSequenceData<TValue> {
  const data = persistentSequences.get(collection);
  if (data === undefined) {
    throw new TypeError('Persistent sequence must be created with createPersistentSequence().');
  }
  return data as PersistentSequenceData<TValue>;
}

function assertTotalExtent(current: number, added: number): void {
  checkedExtentTotal(current, added);
}

function checkedExtentTotal(current: number, added: number): number {
  const total = current + added;
  if (!Number.isSafeInteger(total)) {
    throw new RangeError('Persistent sequence total extent must remain a safe integer.');
  }
  return total;
}

function sequenceNode<TValue>(
  order: bigint,
  item: PersistentSequenceItem<TValue>,
  left?: SequenceNode<TValue>,
  right?: SequenceNode<TValue>
): SequenceNode<TValue> {
  operationCount += 1;
  return Object.freeze({
    order,
    item,
    ...(left === undefined ? {} : { left }),
    ...(right === undefined ? {} : { right }),
    height: Math.max(sequenceHeight(left), sequenceHeight(right)) + 1,
    itemCount: sequenceCount(left) + sequenceCount(right) + 1,
    totalExtent: sequenceExtent(left) + item.extent + sequenceExtent(right),
    enabledCount: (left?.enabledCount ?? 0) + (item.enabled === false ? 0 : 1) + (right?.enabledCount ?? 0)
  });
}

function sequenceHeight<TValue>(node: SequenceNode<TValue> | undefined): number {
  return node?.height ?? 0;
}

function sequenceCount<TValue>(node: SequenceNode<TValue> | undefined): number {
  return node?.itemCount ?? 0;
}

function sequenceExtent<TValue>(node: SequenceNode<TValue> | undefined): number {
  return node?.totalExtent ?? 0;
}

function joinSequences<TValue>(
  left: SequenceNode<TValue> | undefined,
  right: SequenceNode<TValue> | undefined
): SequenceNode<TValue> | undefined {
  if (left === undefined) return right;
  if (right === undefined) return left;
  if (sequenceHeight(left) > sequenceHeight(right) + 1) {
    return balanceSequence(sequenceNode(
      left.order,
      left.item,
      left.left,
      joinSequences(left.right, right)
    ));
  }
  if (sequenceHeight(right) > sequenceHeight(left) + 1) {
    return balanceSequence(sequenceNode(
      right.order,
      right.item,
      joinSequences(left, right.left),
      right.right
    ));
  }
  const removed = removeMinimumSequence(right);
  return balanceSequence(sequenceNode(removed.order, removed.item, left, removed.sequence));
}

function replaceSequenceItem<TValue>(
  node: SequenceNode<TValue> | undefined,
  order: bigint,
  item: PersistentSequenceItem<TValue>
): SequenceNode<TValue> | undefined {
  if (node === undefined) return undefined;
  if (order < node.order) {
    return sequenceNode(node.order, node.item, replaceSequenceItem(node.left, order, item), node.right);
  }
  if (order > node.order) {
    return sequenceNode(node.order, node.item, node.left, replaceSequenceItem(node.right, order, item));
  }
  return sequenceNode(node.order, item, node.left, node.right);
}

function removeSequenceItem<TValue>(
  node: SequenceNode<TValue> | undefined,
  order: bigint
): SequenceNode<TValue> | undefined {
  if (node === undefined) return undefined;
  if (order < node.order) {
    return balanceSequence(sequenceNode(node.order, node.item, removeSequenceItem(node.left, order), node.right));
  }
  if (order > node.order) {
    return balanceSequence(sequenceNode(node.order, node.item, node.left, removeSequenceItem(node.right, order)));
  }
  return joinSequences(node.left, node.right);
}

function removeMinimumSequence<TValue>(node: SequenceNode<TValue>): {
  readonly order: bigint;
  readonly item: PersistentSequenceItem<TValue>;
  readonly sequence?: SequenceNode<TValue>;
} {
  if (node.left === undefined) {
    return {
      order: node.order,
      item: node.item,
      ...(node.right === undefined ? {} : { sequence: node.right })
    };
  }
  const removed = removeMinimumSequence(node.left);
  return {
    order: removed.order,
    item: removed.item,
    sequence: balanceSequence(sequenceNode(node.order, node.item, removed.sequence, node.right))
  };
}

function balanceSequence<TValue>(node: SequenceNode<TValue>): SequenceNode<TValue> {
  const balance = sequenceHeight(node.left) - sequenceHeight(node.right);
  if (balance > 1) {
    const left = node.left;
    if (left === undefined) return node;
    const balancedLeft = sequenceHeight(left.left) < sequenceHeight(left.right)
      ? rotateSequenceLeft(left)
      : left;
    return rotateSequenceRight(sequenceNode(node.order, node.item, balancedLeft, node.right));
  }
  if (balance < -1) {
    const right = node.right;
    if (right === undefined) return node;
    const balancedRight = sequenceHeight(right.right) < sequenceHeight(right.left)
      ? rotateSequenceRight(right)
      : right;
    return rotateSequenceLeft(sequenceNode(node.order, node.item, node.left, balancedRight));
  }
  return node;
}

function rotateSequenceLeft<TValue>(node: SequenceNode<TValue>): SequenceNode<TValue> {
  const right = node.right;
  if (right === undefined) return node;
  return sequenceNode(
    right.order,
    right.item,
    sequenceNode(node.order, node.item, node.left, right.left),
    right.right
  );
}

function rotateSequenceRight<TValue>(node: SequenceNode<TValue>): SequenceNode<TValue> {
  const left = node.left;
  if (left === undefined) return node;
  return sequenceNode(
    left.order,
    left.item,
    left.left,
    sequenceNode(node.order, node.item, left.right, node.right)
  );
}

function sequencePositionByOrder<TValue>(
  root: SequenceNode<TValue> | undefined,
  order: bigint
): PersistentSequencePosition<TValue> | undefined {
  let node = root;
  let precedingItems = 0;
  let precedingExtent = 0;
  while (node !== undefined) {
    operationCount += 1;
    if (order < node.order) {
      node = node.left;
      continue;
    }
    const leftItems = sequenceCount(node.left);
    const leftExtent = sequenceExtent(node.left);
    if (order > node.order) {
      precedingItems += leftItems + 1;
      precedingExtent += leftExtent + node.item.extent;
      node = node.right;
      continue;
    }
    const startExtent = precedingExtent + leftExtent;
    return Object.freeze({
      item: node.item,
      itemIndex: precedingItems + leftItems,
      startExtent,
      endExtent: startExtent + node.item.extent
    });
  }
  return undefined;
}

function sequencePositionAtRow<TValue>(
  node: SequenceNode<TValue> | undefined,
  extent: number,
  precedingItems: number,
  precedingExtent: number
): PersistentSequencePosition<TValue> | undefined {
  if (node === undefined) return undefined;
  const leftExtent = sequenceExtent(node.left);
  const leftItems = sequenceCount(node.left);
  const startExtent = precedingExtent + leftExtent;
  if (extent < startExtent) {
    return sequencePositionAtRow(node.left, extent, precedingItems, precedingExtent);
  }
  const endExtent = startExtent + node.item.extent;
  if (extent < endExtent) {
    return Object.freeze({
      item: node.item,
      itemIndex: precedingItems + leftItems,
      startExtent,
      endExtent
    });
  }
  return sequencePositionAtRow(
    node.right,
    extent,
    precedingItems + leftItems + 1,
    endExtent
  );
}

function collectSequencePositions<TValue>(
  node: SequenceNode<TValue> | undefined,
  precedingItems: number,
  precedingExtent: number,
  startExtent: number,
  endExtent: number,
  positions: PersistentSequencePosition<TValue>[]
): void {
  if (node === undefined || startExtent >= endExtent) return;
  const leftExtent = sequenceExtent(node.left);
  const leftItems = sequenceCount(node.left);
  const itemStart = precedingExtent + leftExtent;
  const itemEnd = itemStart + node.item.extent;
  if (startExtent < itemStart && endExtent > precedingExtent) {
    collectSequencePositions(
      node.left,
      precedingItems,
      precedingExtent,
      startExtent,
      endExtent,
      positions
    );
  }
  if (startExtent < itemEnd && endExtent > itemStart) {
    positions.push(Object.freeze({
      item: node.item,
      itemIndex: precedingItems + leftItems,
      startExtent: itemStart,
      endExtent: itemEnd
    }));
  }
  const rightEnd = itemEnd + sequenceExtent(node.right);
  if (startExtent < rightEnd && endExtent > itemEnd) {
    collectSequencePositions(
      node.right,
      precedingItems + leftItems + 1,
      itemEnd,
      startExtent,
      endExtent,
      positions
    );
  }
}

function minimumSequenceOrder<TValue>(node: SequenceNode<TValue> | undefined): bigint | undefined {
  if (node === undefined) return undefined;
  let current = node;
  while (current.left !== undefined) current = current.left;
  return current.order;
}

function maximumSequenceOrder<TValue>(node: SequenceNode<TValue> | undefined): bigint | undefined {
  if (node === undefined) return undefined;
  let current = node;
  while (current.right !== undefined) current = current.right;
  return current.order;
}

function idIndexGet(node: IdIndexNode | undefined, id: string): bigint | undefined {
  return finishWork(idIndexGetWork(node, id));
}

function* idIndexGetWork(node: IdIndexNode | undefined, id: string, preparedHash?: number): Generator<number, bigint | undefined> {
  const hash = preparedHash ?? (yield* hashIdWork(id));
  let current = node;
  let depth = 0;
  while (current !== undefined) {
    operationCount += 1;
    if (current.kind === 'leaf') {
      for (const entry of current.entries) {
        const matches = entry.id === id;
        yield 1;
        if (matches) return entry.order;
      }
      return undefined;
    }
    const bit = hashBit(hash, depth);
    yield 1;
    if ((current.bitmap & bit) === 0) return undefined;
    current = current.children[hashChildIndex(current.bitmap, bit)];
    depth += 1;
  }
  return undefined;
}

function* idIndexSetWork(
  node: IdIndexNode | undefined,
  entry: IdIndexEntry,
  depth: number
): Generator<number, IdIndexNode> {
  if (node === undefined) { yield 1; return idIndexLeaf([entry]); }
  if (node.kind === 'leaf') {
    const entries: IdIndexEntry[] = [];
    let replaced = false;
    for (const candidate of node.entries) {
      const matches = candidate.id === entry.id;
      entries.push(matches ? entry : candidate);
      replaced ||= matches;
      yield 1;
    }
    if (!replaced) entries.push(entry);
    return yield* buildIdIndexWork(entries, depth);
  }
  const bit = hashBit(entry.hash, depth);
  const childIndex = hashChildIndex(node.bitmap, bit);
  const children = [...node.children];
  if ((node.bitmap & bit) === 0) {
    children.splice(childIndex, 0, idIndexLeaf([entry]));
    yield children.length + 1;
    return idIndexBranch((node.bitmap | bit) >>> 0, children);
  }
  children[childIndex] = yield* idIndexSetWork(children[childIndex], entry, depth + 1);
  yield children.length;
  return idIndexBranch(node.bitmap, children);
}

function* idIndexDeleteWork(
  node: IdIndexNode | undefined,
  id: string,
  hash: number,
  depth: number
): Generator<number, IdIndexNode | undefined> {
  if (node === undefined) return undefined;
  if (node.kind === 'leaf') {
    const entries: IdIndexEntry[] = [];
    for (const entry of node.entries) { if (entry.id !== id) entries.push(entry); yield 1; }
    return entries.length === node.entries.length
      ? node
      : entries.length === 0 ? undefined : idIndexLeaf(entries);
  }
  const bit = hashBit(hash, depth);
  if ((node.bitmap & bit) === 0) { yield 1; return node; }
  const childIndex = hashChildIndex(node.bitmap, bit);
  const nextChild = yield* idIndexDeleteWork(node.children[childIndex], id, hash, depth + 1);
  if (nextChild === node.children[childIndex]) return node;
  const children = [...node.children];
  if (nextChild === undefined) children.splice(childIndex, 1);
  else children[childIndex] = nextChild;
  yield children.length + 1;
  if (children.length === 0) return undefined;
  if (children.length === 1 && children[0]?.kind === 'leaf') return children[0];
  return idIndexBranch(nextChild === undefined ? (node.bitmap & ~bit) >>> 0 : node.bitmap, children);
}

function idIndexLeaf(entries: readonly IdIndexEntry[]): IdIndexLeaf {
  operationCount += entries.length;
  return Object.freeze({ kind: 'leaf', entries: Object.freeze(entries) });
}

function idIndexBranch(bitmap: number, children: readonly IdIndexNode[]): IdIndexBranch {
  operationCount += children.length;
  return Object.freeze({ kind: 'branch', bitmap: bitmap >>> 0, children: Object.freeze(children) });
}

function hashBit(hash: number, depth: number): number {
  return (1 << ((hash >>> (depth * 5)) & 31)) >>> 0;
}

function hashChildIndex(bitmap: number, bit: number): number {
  return popCount((bitmap & ((bit - 1) >>> 0)) >>> 0);
}

function popCount(value: number): number {
  let current = value >>> 0;
  current -= (current >>> 1) & 0x55555555;
  current = (current & 0x33333333) + ((current >>> 2) & 0x33333333);
  return (((current + (current >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

function sequenceItemAt<T>(root: SequenceNode<T> | undefined, index: number, enabled: boolean): PersistentSequenceItem<T> | undefined {
  if (!Number.isInteger(index) || index < 0) return undefined;
  let node = root;
  let remaining = index;
  while (node !== undefined) {
    operationCount += 1;
    const left = enabled ? node.left?.enabledCount ?? 0 : sequenceCount(node.left);
    const own = enabled && node.item.enabled === false ? 0 : 1;
    if (remaining < left) node = node.left;
    else if (remaining < left + own) return node.item;
    else { remaining -= left + own; node = node.right; }
  }
  return undefined;
}

function sequenceEnabledRank<T>(root: SequenceNode<T> | undefined, order: bigint): number | undefined {
  let node = root;
  let preceding = 0;
  while (node !== undefined) {
    operationCount += 1;
    if (order < node.order) { node = node.left; continue; }
    preceding += node.left?.enabledCount ?? 0;
    if (order === node.order) return node.item.enabled === false ? undefined : preceding;
    preceding += node.item.enabled === false ? 0 : 1;
    node = node.right;
  }
  return undefined;
}

/** One cursor owns at most one AVL path; yielded items allocate no recursive iterators. */
function* sequenceItems<T>(root: SequenceNode<T> | undefined, start: number, end: number): IterableIterator<PersistentSequenceItem<T>> {
  if (root === undefined || !(start < end)) return;
  const stack: SequenceNode<T>[] = [];
  let node: SequenceNode<T> | undefined = root;
  let skip = Math.ceil(start);
  let remaining = Math.ceil(end) - skip;
  // Seek the first requested rank without walking the preceding prefix.
  while (node !== undefined) {
    const left = sequenceCount(node.left);
    if (skip < left) { stack.push(node); node = node.left; }
    else if (skip > left) { skip -= left + 1; node = node.right; }
    else { stack.push(node); break; }
  }
  while (remaining > 0) {
    node = stack.pop();
    if (node === undefined) return;
    yield node.item;
    if (--remaining === 0) return;
    node = node.right;
    while (node !== undefined) { stack.push(node); node = node.left; }
  }
}
