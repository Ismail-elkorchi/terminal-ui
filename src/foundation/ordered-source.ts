import {
  createPersistentSequenceWork, appendSequenceItemsWork, replaceSequenceValueWork,
  removeSequenceItemsWork, persistentSequenceItemByIdWork, readPersistentSequence, type PersistentSequence,
} from './persistent-sequence.ts';

import { finishWork } from './cooperative-work.ts';
import type { CollectionOrderReader } from './order-reader.ts';
export type OrderedSource<T> = CollectionOrderReader<T>;

export interface OrderedItem<T> { readonly id: string; readonly value: T; readonly disabled?: boolean }
const sequences = new WeakMap<object, PersistentSequence<unknown>>();
export function createOrderedSource<T>(items: readonly OrderedItem<T>[] = []): OrderedSource<T> {
  return finishWork(createOrderedSourceWork(items));
}
/** Initial construction avoids replaying persistent update paths for each item. */
export function* createOrderedSourceWork<T>(events: Iterable<OrderedItem<T> | number>): Generator<number, OrderedSource<T>> {
  function* items() {
    for (const event of events) {
      if (typeof event === 'number') yield event;
      else yield { id: event.id, value: event.value, extent: 1, enabled: event.disabled !== true };
    }
  }
  const sequence = yield* createPersistentSequenceWork(items());
  return wrap(sequence);
}
export function appendOrderedItems<T>(source: OrderedSource<T>, items: readonly OrderedItem<T>[]): OrderedSource<T> {
  return finishWork(appendOrderedItemsWork(source, items));
}
export function* appendOrderedItemsWork<T>(source: OrderedSource<T>, items: readonly OrderedItem<T>[]): Generator<number, OrderedSource<T>> {
  const sequence = sequenceFor(source);
  const next = yield* appendSequenceItemsWork(sequence, items.map(item => ({ ...item, extent: 1, enabled: item.disabled !== true })));
  return next === sequence ? source : wrap(next);
}
export function* replaceOrderedItemWork<T>(source: OrderedSource<T>, item: OrderedItem<T>): Generator<number, OrderedSource<T>> {
  const sequence = sequenceFor(source);
  const next = yield* replaceSequenceValueWork(sequence, { ...item, extent: 1, enabled: item.disabled !== true });
  return next === sequence ? source : wrap(next);
}
export function* removeOrderedItemsWork<T>(source: OrderedSource<T>, ids: readonly string[]): Generator<number, OrderedSource<T>> {
  const sequence = sequenceFor(source);
  const next = yield* removeSequenceItemsWork(sequence, ids);
  return next === sequence ? source : wrap(next);
}
/** Preparation-owned identity lookups share the sequence's cooperative hashing. */
export function* orderedItemByIdWork<T>(source: OrderedSource<T>, id: string): Generator<number, T | undefined> {
  return (yield* persistentSequenceItemByIdWork(sequenceFor(source), id))?.value;
}
function sequenceFor<T>(source: OrderedSource<T>): PersistentSequence<T> {
  const sequence = sequences.get(source);
  if (sequence === undefined) throw new TypeError('Ordered sources must be created by terminal-ui.');
  return sequence as PersistentSequence<T>;
}
function wrap<T>(sequence: PersistentSequence<T>): OrderedSource<T> {
  const reader = readPersistentSequence(sequence);
  const values = function* (start = 0, end = sequence.itemCount): IterableIterator<T> {
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end)) throw new RangeError('Collection window bounds must be safe integer ranks.');
    for (const item of reader.items(start, end)) yield item.value;
  };
  const source = Object.freeze({
    kind: 'ordered-source' as const, count: sequence.itemCount, enabledCount: sequence.enabledCount,
    itemAt: (rank: number) => reader.itemAt(rank)?.value,
    itemById: (id: string) => reader.itemById(id)?.value,
    rank: (id: string) => reader.positionById(id)?.itemIndex,
    enabledAt: (rank: number) => reader.enabledItemAt(rank)?.value,
    enabledRank: reader.enabledRank,
    window: (start: number, end: number) => Object.freeze(Array.from(values(start, end))), values,
  }) as OrderedSource<T>;
  sequences.set(source, sequence);
  return source;
}

export function assertOrderedSource(value: unknown): asserts value is OrderedSource<unknown> {
  if (!sequences.has(value as object)) throw new TypeError('Ordered sources must be created by terminal-ui.');
}
