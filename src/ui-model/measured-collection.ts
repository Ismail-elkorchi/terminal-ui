import { isNonArrayObject } from '../foundation/validation.ts';

export interface MeasuredCollectionItem<TValue> {
  readonly id: string;
  readonly value: TValue;
  readonly rows: number;
}

declare const measuredCollectionBrand: unique symbol;

export interface MeasuredCollection<TValue> {
  readonly [measuredCollectionBrand]: TValue;
  readonly kind: 'measured-collection';
  readonly itemCount: number;
  readonly totalRows: number;
}

export interface MeasuredCollectionPosition<TValue> {
  readonly item: MeasuredCollectionItem<TValue>;
  readonly itemIndex: number;
  readonly startRowIndex: number;
  readonly endRowIndexExclusive: number;
}

interface SequenceNode<TValue> {
  readonly order: bigint;
  readonly item: MeasuredCollectionItem<TValue>;
  readonly left?: SequenceNode<TValue>;
  readonly right?: SequenceNode<TValue>;
  readonly height: number;
  readonly itemCount: number;
  readonly totalRows: number;
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

interface MeasuredCollectionData<TValue> {
  readonly sequence?: SequenceNode<TValue>;
  readonly ids?: IdIndexNode;
  readonly minimumOrder?: bigint;
  readonly maximumOrder?: bigint;
  readonly reader: MeasuredCollectionReader<TValue>;
}

export interface MeasuredCollectionReader<TValue> {
  readonly itemCount: number;
  readonly totalRows: number;
  readonly itemById: (id: string) => MeasuredCollectionItem<TValue> | undefined;
  readonly positionById: (id: string) => MeasuredCollectionPosition<TValue> | undefined;
  readonly positionAtRow: (rowIndex: number) => MeasuredCollectionPosition<TValue> | undefined;
  readonly positionsInRows: (
    startRowIndex: number,
    endRowIndexExclusive: number
  ) => readonly MeasuredCollectionPosition<TValue>[];
}

const measuredCollections = new WeakMap<MeasuredCollection<unknown>, MeasuredCollectionData<unknown>>();

export function prepareMeasuredCollection<TValue>(
  items: readonly MeasuredCollectionItem<TValue>[]
): MeasuredCollection<TValue> {
  const prepared = prepareItems(items, undefined);
  return createMeasuredCollection(
    buildSequence(prepared.items, 0, prepared.items.length, 0n),
    prepared.ids
  );
}

export function appendMeasuredItems<TValue>(
  collection: MeasuredCollection<TValue>,
  items: readonly MeasuredCollectionItem<TValue>[]
): MeasuredCollection<TValue> {
  const data: MeasuredCollectionData<TValue> = measuredCollectionData(collection);
  const startOrder = (data.maximumOrder ?? -1n) + 1n;
  const prepared = prepareItems<TValue>(items, data.ids, startOrder);
  if (prepared.items.length === 0) return collection;
  assertTotalRows(collection.totalRows, prepared.totalRows);
  const appended = buildSequence(prepared.items, 0, prepared.items.length, startOrder);
  return createMeasuredCollection(joinSequences(data.sequence, appended), prepared.ids);
}

export function prependMeasuredItems<TValue>(
  collection: MeasuredCollection<TValue>,
  items: readonly MeasuredCollectionItem<TValue>[]
): MeasuredCollection<TValue> {
  const data: MeasuredCollectionData<TValue> = measuredCollectionData(collection);
  assertMeasuredItems(items);
  const startOrder = (data.minimumOrder ?? BigInt(items.length)) - BigInt(items.length);
  const prepared = prepareKnownItems(items, data.ids, startOrder);
  if (prepared.items.length === 0) return collection;
  assertTotalRows(collection.totalRows, prepared.totalRows);
  const prepended = buildSequence(prepared.items, 0, prepared.items.length, startOrder);
  return createMeasuredCollection(joinSequences(prepended, data.sequence), prepared.ids);
}

export function replaceMeasuredItem<TValue>(
  collection: MeasuredCollection<TValue>,
  item: MeasuredCollectionItem<TValue>
): MeasuredCollection<TValue> {
  const data = measuredCollectionData(collection);
  const prepared = prepareItem(item, 'Measured collection replacement item');
  const order = idIndexGet(data.ids, prepared.id);
  if (order === undefined) {
    throw new RangeError('Measured collection does not contain the replacement item id.');
  }
  const current = sequencePositionByOrder(data.sequence, order);
  if (current === undefined) {
    throw new Error('Measured collection indexes are inconsistent.');
  }
  if (current.item.rows === prepared.rows && Object.is(current.item.value, prepared.value)) {
    return collection;
  }
  assertTotalRows(collection.totalRows - current.item.rows, prepared.rows);
  return createMeasuredCollection(
    replaceSequenceItem(data.sequence, order, prepared),
    data.ids
  );
}

export function removeMeasuredItems<TValue>(
  collection: MeasuredCollection<TValue>,
  ids: readonly string[]
): MeasuredCollection<TValue> {
  const data = measuredCollectionData(collection);
  if (!Array.isArray(ids)) throw new TypeError('Measured collection removal ids must be an array.');
  let sequence = data.sequence;
  let idIndex = data.ids;
  let changed = false;
  const visited = new Set<string>();
  for (const suppliedId of ids) {
    const id = measuredItemId(suppliedId, 'Measured collection removal id');
    if (visited.has(id)) continue;
    visited.add(id);
    const order = idIndexGet(idIndex, id);
    if (order === undefined) continue;
    sequence = removeSequenceItem(sequence, order);
    idIndex = idIndexDelete(idIndex, id, hashId(id), 0);
    changed = true;
  }
  return changed ? createMeasuredCollection(sequence, idIndex) : collection;
}

export function measuredCollectionItemById<TValue>(
  collection: MeasuredCollection<TValue>,
  id: string
): MeasuredCollectionItem<TValue> | undefined {
  const reader = readMeasuredCollection(collection);
  if (typeof id !== 'string') return undefined;
  return reader.itemById(id);
}

export function readMeasuredCollection<TValue>(
  collection: MeasuredCollection<TValue>,
): MeasuredCollectionReader<TValue> {
  return measuredCollectionData(collection).reader;
}

function prepareItems<TValue>(
  supplied: readonly MeasuredCollectionItem<TValue>[],
  existingIds: IdIndexNode | undefined,
  startOrder = 0n
): ReturnType<typeof prepareKnownItems<TValue>> {
  assertMeasuredItems(supplied);
  return prepareKnownItems(supplied, existingIds, startOrder);
}

function assertMeasuredItems(value: unknown): void {
  if (!Array.isArray(value)) throw new TypeError('Measured collection items must be an array.');
}

function prepareKnownItems<TValue>(
  supplied: readonly MeasuredCollectionItem<TValue>[],
  existingIds: IdIndexNode | undefined,
  startOrder = 0n
): {
  readonly items: readonly MeasuredCollectionItem<TValue>[];
  readonly ids?: IdIndexNode;
  readonly totalRows: number;
} {
  const items: MeasuredCollectionItem<TValue>[] = [];
  let ids = existingIds;
  let totalRows = 0;
  for (const [index, item] of supplied.entries()) {
    const prepared = prepareItem<TValue>(item, `Measured collection items[${String(index)}]`);
    if (idIndexGet(ids, prepared.id) !== undefined) {
      throw new TypeError('Measured collection item ids must be unique.');
    }
    totalRows = checkedRowTotal(totalRows, prepared.rows);
    const order = startOrder + BigInt(index);
    ids = idIndexSet(ids, Object.freeze({ id: prepared.id, hash: hashId(prepared.id), order }), 0);
    items.push(prepared);
  }
  return Object.freeze({
    items: Object.freeze(items),
    ...(ids === undefined ? {} : { ids }),
    totalRows
  });
}

function prepareItem<TValue>(value: MeasuredCollectionItem<TValue>, subject: string): MeasuredCollectionItem<TValue> {
  if (!isNonArrayObject(value)) throw new TypeError(`${subject} must be an object.`);
  const id = measuredItemId(value.id, `${subject}.id`);
  const rows = value.rows;
  if (!Number.isSafeInteger(rows) || rows < 1) {
    throw new RangeError(`${subject}.rows must be a positive safe integer.`);
  }
  return Object.freeze({ id, value: value.value, rows });
}

function measuredItemId(value: unknown, subject: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new TypeError(`${subject} must be a non-empty string.`);
  }
  return value;
}

function createMeasuredCollection<TValue>(
  sequence: SequenceNode<TValue> | undefined,
  ids: IdIndexNode | undefined
): MeasuredCollection<TValue> {
  const collection = Object.freeze({
    kind: 'measured-collection' as const,
    itemCount: sequence?.itemCount ?? 0,
    totalRows: sequence?.totalRows ?? 0
  }) as MeasuredCollection<TValue>;
  const data = Object.freeze({
    sequence,
    ids,
    minimumOrder: minimumSequenceOrder(sequence),
    maximumOrder: maximumSequenceOrder(sequence),
    reader: createMeasuredCollectionReader(sequence, ids)
  });
  measuredCollections.set(
    collection,
    data as MeasuredCollectionData<unknown>
  );
  return collection;
}

function createMeasuredCollectionReader<TValue>(
  sequence: SequenceNode<TValue> | undefined,
  ids: IdIndexNode | undefined
): MeasuredCollectionReader<TValue> {
  const itemCount = sequence?.itemCount ?? 0;
  const totalRows = sequence?.totalRows ?? 0;
  const positionById = (id: string): MeasuredCollectionPosition<TValue> | undefined => {
    const order = idIndexGet(ids, id);
    return order === undefined ? undefined : sequencePositionByOrder(sequence, order);
  };
  return Object.freeze({
    itemCount,
    totalRows,
    itemById: (id: string) => positionById(id)?.item,
    positionById,
    positionAtRow: (rowIndex: number) => (
      rowIndex < 0 || rowIndex >= totalRows
        ? undefined
        : sequencePositionAtRow(sequence, rowIndex, 0, 0)
    ),
    positionsInRows: (startRowIndex: number, endRowIndexExclusive: number) => {
      const positions: MeasuredCollectionPosition<TValue>[] = [];
      collectSequencePositions(
        sequence,
        0,
        0,
        startRowIndex,
        Math.min(endRowIndexExclusive, totalRows),
        positions
      );
      return Object.freeze(positions);
    }
  });
}

function measuredCollectionData<TValue>(
  collection: MeasuredCollection<TValue>
): MeasuredCollectionData<TValue> {
  const data = measuredCollections.get(collection);
  if (data === undefined) {
    throw new TypeError('Measured collection must be created with prepareMeasuredCollection().');
  }
  return data as MeasuredCollectionData<TValue>;
}

function assertTotalRows(current: number, added: number): void {
  checkedRowTotal(current, added);
}

function checkedRowTotal(current: number, added: number): number {
  const total = current + added;
  if (!Number.isSafeInteger(total)) {
    throw new RangeError('Measured collection total rows must remain a safe integer.');
  }
  return total;
}

function buildSequence<TValue>(
  items: readonly MeasuredCollectionItem<TValue>[],
  start: number,
  end: number,
  startOrder: bigint
): SequenceNode<TValue> | undefined {
  if (start >= end) return undefined;
  const middle = Math.floor((start + end) / 2);
  const item = items[middle];
  if (item === undefined) return undefined;
  return sequenceNode(
    startOrder + BigInt(middle),
    item,
    buildSequence(items, start, middle, startOrder),
    buildSequence(items, middle + 1, end, startOrder)
  );
}

function sequenceNode<TValue>(
  order: bigint,
  item: MeasuredCollectionItem<TValue>,
  left?: SequenceNode<TValue>,
  right?: SequenceNode<TValue>
): SequenceNode<TValue> {
  return Object.freeze({
    order,
    item,
    ...(left === undefined ? {} : { left }),
    ...(right === undefined ? {} : { right }),
    height: Math.max(sequenceHeight(left), sequenceHeight(right)) + 1,
    itemCount: sequenceCount(left) + sequenceCount(right) + 1,
    totalRows: sequenceRows(left) + item.rows + sequenceRows(right)
  });
}

function sequenceHeight<TValue>(node: SequenceNode<TValue> | undefined): number {
  return node?.height ?? 0;
}

function sequenceCount<TValue>(node: SequenceNode<TValue> | undefined): number {
  return node?.itemCount ?? 0;
}

function sequenceRows<TValue>(node: SequenceNode<TValue> | undefined): number {
  return node?.totalRows ?? 0;
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
  item: MeasuredCollectionItem<TValue>
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
  readonly item: MeasuredCollectionItem<TValue>;
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
    const preparedLeft = sequenceHeight(left.left) < sequenceHeight(left.right)
      ? rotateSequenceLeft(left)
      : left;
    return rotateSequenceRight(sequenceNode(node.order, node.item, preparedLeft, node.right));
  }
  if (balance < -1) {
    const right = node.right;
    if (right === undefined) return node;
    const preparedRight = sequenceHeight(right.right) < sequenceHeight(right.left)
      ? rotateSequenceRight(right)
      : right;
    return rotateSequenceLeft(sequenceNode(node.order, node.item, node.left, preparedRight));
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
): MeasuredCollectionPosition<TValue> | undefined {
  let node = root;
  let precedingItems = 0;
  let precedingRows = 0;
  while (node !== undefined) {
    if (order < node.order) {
      node = node.left;
      continue;
    }
    const leftItems = sequenceCount(node.left);
    const leftRows = sequenceRows(node.left);
    if (order > node.order) {
      precedingItems += leftItems + 1;
      precedingRows += leftRows + node.item.rows;
      node = node.right;
      continue;
    }
    const startRowIndex = precedingRows + leftRows;
    return Object.freeze({
      item: node.item,
      itemIndex: precedingItems + leftItems,
      startRowIndex,
      endRowIndexExclusive: startRowIndex + node.item.rows
    });
  }
  return undefined;
}

function sequencePositionAtRow<TValue>(
  node: SequenceNode<TValue> | undefined,
  rowIndex: number,
  precedingItems: number,
  precedingRows: number
): MeasuredCollectionPosition<TValue> | undefined {
  if (node === undefined) return undefined;
  const leftRows = sequenceRows(node.left);
  const leftItems = sequenceCount(node.left);
  const startRowIndex = precedingRows + leftRows;
  if (rowIndex < startRowIndex) {
    return sequencePositionAtRow(node.left, rowIndex, precedingItems, precedingRows);
  }
  const endRowIndexExclusive = startRowIndex + node.item.rows;
  if (rowIndex < endRowIndexExclusive) {
    return Object.freeze({
      item: node.item,
      itemIndex: precedingItems + leftItems,
      startRowIndex,
      endRowIndexExclusive
    });
  }
  return sequencePositionAtRow(
    node.right,
    rowIndex,
    precedingItems + leftItems + 1,
    endRowIndexExclusive
  );
}

function collectSequencePositions<TValue>(
  node: SequenceNode<TValue> | undefined,
  precedingItems: number,
  precedingRows: number,
  startRowIndex: number,
  endRowIndexExclusive: number,
  positions: MeasuredCollectionPosition<TValue>[]
): void {
  if (node === undefined || startRowIndex >= endRowIndexExclusive) return;
  const leftRows = sequenceRows(node.left);
  const leftItems = sequenceCount(node.left);
  const itemStart = precedingRows + leftRows;
  const itemEnd = itemStart + node.item.rows;
  if (startRowIndex < itemStart && endRowIndexExclusive > precedingRows) {
    collectSequencePositions(
      node.left,
      precedingItems,
      precedingRows,
      startRowIndex,
      endRowIndexExclusive,
      positions
    );
  }
  if (startRowIndex < itemEnd && endRowIndexExclusive > itemStart) {
    positions.push(Object.freeze({
      item: node.item,
      itemIndex: precedingItems + leftItems,
      startRowIndex: itemStart,
      endRowIndexExclusive: itemEnd
    }));
  }
  const rightEnd = itemEnd + sequenceRows(node.right);
  if (startRowIndex < rightEnd && endRowIndexExclusive > itemEnd) {
    collectSequencePositions(
      node.right,
      precedingItems + leftItems + 1,
      itemEnd,
      startRowIndex,
      endRowIndexExclusive,
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
  const hash = hashId(id);
  let current = node;
  let depth = 0;
  while (current !== undefined) {
    if (current.kind === 'leaf') return current.entries.find((entry) => entry.id === id)?.order;
    const bit = hashBit(hash, depth);
    if ((current.bitmap & bit) === 0) return undefined;
    current = current.children[hashChildIndex(current.bitmap, bit)];
    depth += 1;
  }
  return undefined;
}

function idIndexSet(
  node: IdIndexNode | undefined,
  entry: IdIndexEntry,
  depth: number
): IdIndexNode {
  if (node === undefined) return idIndexLeaf([entry]);
  if (node.kind === 'leaf') {
    const existingIndex = node.entries.findIndex((candidate) => candidate.id === entry.id);
    if (existingIndex >= 0) {
      const entries = [...node.entries];
      entries[existingIndex] = entry;
      return idIndexLeaf(entries);
    }
    if (depth >= 7 || node.entries.every((candidate) => candidate.hash === entry.hash)) {
      return idIndexLeaf([...node.entries, entry]);
    }
    return idIndexFromEntries([...node.entries, entry], depth);
  }
  const bit = hashBit(entry.hash, depth);
  const childIndex = hashChildIndex(node.bitmap, bit);
  const children = [...node.children];
  if ((node.bitmap & bit) === 0) {
    children.splice(childIndex, 0, idIndexLeaf([entry]));
    return idIndexBranch((node.bitmap | bit) >>> 0, children);
  }
  children[childIndex] = idIndexSet(children[childIndex], entry, depth + 1);
  return idIndexBranch(node.bitmap, children);
}

function idIndexFromEntries(entries: readonly IdIndexEntry[], depth: number): IdIndexNode {
  if (depth >= 7 || entries.every((entry) => entry.hash === entries[0]?.hash)) {
    return idIndexLeaf(entries);
  }
  const groups: IdIndexEntry[][] = Array.from({ length: 32 }, () => []);
  for (const entry of entries) {
    groups[(entry.hash >>> (depth * 5)) & 31]?.push(entry);
  }
  let bitmap = 0;
  const children: IdIndexNode[] = [];
  for (const [slot, group] of groups.entries()) {
    if (group.length === 0) continue;
    bitmap = (bitmap | ((1 << slot) >>> 0)) >>> 0;
    children.push(group.length === 1
      ? idIndexLeaf(group)
      : idIndexFromEntries(group, depth + 1));
  }
  return idIndexBranch(bitmap, children);
}

function idIndexDelete(
  node: IdIndexNode | undefined,
  id: string,
  hash: number,
  depth: number
): IdIndexNode | undefined {
  if (node === undefined) return undefined;
  if (node.kind === 'leaf') {
    const entries = node.entries.filter((entry) => entry.id !== id);
    return entries.length === node.entries.length
      ? node
      : entries.length === 0 ? undefined : idIndexLeaf(entries);
  }
  const bit = hashBit(hash, depth);
  if ((node.bitmap & bit) === 0) return node;
  const childIndex = hashChildIndex(node.bitmap, bit);
  const nextChild = idIndexDelete(node.children[childIndex], id, hash, depth + 1);
  if (nextChild === node.children[childIndex]) return node;
  const children = [...node.children];
  if (nextChild === undefined) children.splice(childIndex, 1);
  else children[childIndex] = nextChild;
  if (children.length === 0) return undefined;
  if (children.length === 1 && children[0]?.kind === 'leaf') return children[0];
  return idIndexBranch(nextChild === undefined ? (node.bitmap & ~bit) >>> 0 : node.bitmap, children);
}

function idIndexLeaf(entries: readonly IdIndexEntry[]): IdIndexLeaf {
  return Object.freeze({ kind: 'leaf', entries: Object.freeze(entries) });
}

function idIndexBranch(bitmap: number, children: readonly IdIndexNode[]): IdIndexBranch {
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

function hashId(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}
