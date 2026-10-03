import {
  createPersistentSequence, appendSequenceItems, prependSequenceItems, replaceSequenceValue,
  replaceSequenceItemIdentity, removeSequenceItems, readPersistentSequence,
  type PersistentSequence, type PersistentSequencePosition,
} from '../foundation/persistent-sequence.ts';

/** @beta */
export interface MeasuredCollectionItem<TValue> {
  readonly id: string;
  readonly value: TValue;
  readonly rows: number;
}

declare const measuredCollectionBrand: unique symbol;
/** @beta */
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
export interface MeasuredCollectionReader<TValue> {
  readonly itemCount: number;
  readonly totalRows: number;
  readonly itemById: (id: string) => MeasuredCollectionItem<TValue> | undefined;
  readonly positionById: (id: string) => MeasuredCollectionPosition<TValue> | undefined;
  readonly positionAtRow: (rowIndex: number) => MeasuredCollectionPosition<TValue> | undefined;
  readonly positionsInRows: (start: number, end: number) => readonly MeasuredCollectionPosition<TValue>[];
}
const sources = new WeakMap<object, PersistentSequence<unknown>>();
const itemCache = new WeakMap<object, MeasuredCollectionItem<unknown>>();
const readers = new WeakMap<object, MeasuredCollectionReader<unknown>>();

/** @beta */
export function createMeasuredCollection<T>(items: readonly MeasuredCollectionItem<T>[]): MeasuredCollection<T> {
  return wrap(createPersistentSequence(ownItems(items)));
}
/** @beta */
export function appendMeasuredItems<T>(collection: MeasuredCollection<T>, items: readonly MeasuredCollectionItem<T>[]): MeasuredCollection<T> {
  const source = sourceFor(collection);
  const next = appendSequenceItems(source, ownItems(items));
  return next === source ? collection : wrap(next);
}
/** @beta */
export function prependMeasuredItems<T>(collection: MeasuredCollection<T>, items: readonly MeasuredCollectionItem<T>[]): MeasuredCollection<T> {
  const source = sourceFor(collection);
  const next = prependSequenceItems(source, ownItems(items));
  return next === source ? collection : wrap(next);
}
/** @beta */
export function replaceMeasuredItem<T>(collection: MeasuredCollection<T>, item: MeasuredCollectionItem<T>): MeasuredCollection<T> {
  const source = sourceFor(collection);
  const next = replaceSequenceValue(source, ownItem(item));
  return next === source ? collection : wrap(next);
}
export function replaceMeasuredItemIdentity<T>(collection: MeasuredCollection<T>, item: MeasuredCollectionItem<T>): MeasuredCollection<T> {
  return wrap(replaceSequenceItemIdentity(sourceFor(collection), ownItem(item)));
}
/** @beta */
export function removeMeasuredItems<T>(collection: MeasuredCollection<T>, ids: readonly string[]): MeasuredCollection<T> {
  const source = sourceFor(collection);
  const next = removeSequenceItems(source, ids);
  return next === source ? collection : wrap(next);
}
/** @beta */
export function measuredCollectionItemById<T>(collection: MeasuredCollection<T>, id: string): MeasuredCollectionItem<T> | undefined {
  return typeof id === 'string' ? readMeasuredCollection(collection).itemById(id) : undefined;
}
export function readMeasuredCollection<T>(collection: MeasuredCollection<T>): MeasuredCollectionReader<T> {
  sourceFor(collection);
  return readers.get(collection) as MeasuredCollectionReader<T>;
}
function sourceFor<T>(collection: MeasuredCollection<T>): PersistentSequence<T> {
  const source = sources.get(collection);
  if (source === undefined) throw new TypeError('Measured collection must be created with createMeasuredCollection().');
  return source as PersistentSequence<T>;
}
function ownItem<T>(item: MeasuredCollectionItem<T>) {
  const candidate: unknown = item;
  if (candidate === null || typeof candidate !== 'object' || Array.isArray(candidate)) throw new TypeError('Measured collection item must be an object.');
  if (typeof item.id !== 'string' || item.id.length === 0) throw new TypeError('Measured collection item id must be a non-empty string.');
  if (!Number.isSafeInteger(item.rows) || item.rows < 1) throw new RangeError('Measured collection item rows must be a positive safe integer.');
  return { id: item.id, value: item.value, extent: item.rows };
}
function ownItems<T>(items: readonly MeasuredCollectionItem<T>[]) {
  if (!Array.isArray(items)) throw new TypeError('Measured collection items must be an array.');
  return Array.from(items, ownItem<T>);
}
function wrap<T>(source: PersistentSequence<T>): MeasuredCollection<T> {
  const collection = Object.freeze({ kind: 'measured-collection', itemCount: source.itemCount, totalRows: source.totalExtent }) as MeasuredCollection<T>;
  const reader = readPersistentSequence(source);

  const item = (value: NonNullable<ReturnType<typeof reader.itemAt>>) => {
    let result = itemCache.get(value) as MeasuredCollectionItem<T> | undefined;
    if (result === undefined) { result = Object.freeze({ id: value.id, value: value.value, rows: value.extent }); itemCache.set(value, result); }
    return result;
  };
  const position = (value: PersistentSequencePosition<T> | undefined): MeasuredCollectionPosition<T> | undefined => value === undefined ? undefined : Object.freeze({
    item: item(value.item), itemIndex: value.itemIndex, startRowIndex: value.startExtent, endRowIndexExclusive: value.endExtent,
  });
  sources.set(collection, source);
  readers.set(collection, Object.freeze({
    itemCount: source.itemCount, totalRows: source.totalExtent,
    itemById: (id: string) => { const value = reader.itemById(id); return value === undefined ? undefined : item(value); },
    positionById: (id: string) => position(reader.positionById(id)),
    positionAtRow: (row: number) => position(reader.positionAtExtent(row)),
    positionsInRows: (start: number, end: number) => Object.freeze(reader.positionsInExtent(start, end).map(value => Object.freeze({ item: item(value.item), itemIndex: value.itemIndex, startRowIndex: value.startExtent, endRowIndexExclusive: value.endExtent }))),
  }));
  return collection;
}
